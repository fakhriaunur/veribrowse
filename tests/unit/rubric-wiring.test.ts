import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { scoreWebsitePure, buildTrustScore, type FetchMeta } from "@/lib/score";
import { loadActiveRubric, resetRubricCache } from "@/lib/rubric";
import { _resetBreakerForTest } from "@/lib/fetchWithRetry";
import { GET as scoreGet } from "@/app/api/score/route";
import { GET as checkGet } from "@/app/api/check/route";

// Rubric wiring (m11-rubric-wiring): SCORING_PRESET actually affects scoring
// WITHOUT changing the frozen default. scoreWebsitePure / buildTrustScore
// take the rubric weights as an OPTIONAL param (default = balanced = frozen
// constants); routes resolve the active rubric via lib/rubric.ts and pass it
// through. Default/untouched-env output stays byte-identical to pre-wiring
// goldens (balanced regression + replay stay green).

function meta(over: Partial<FetchMeta> = {}): FetchMeta {
  return {
    url: "https://example.com",
    finalUrl: "https://example.com",
    status: 200,
    contentHash: "abcd1234",
    retrievedAt: "2026-01-01T00:00:00.000Z",
    hasHttps: true,
    ...over,
  };
}

// Fixed-input matrix covering safe / caution / risky / boundary / redirect.
const MATRIX: Partial<FetchMeta>[] = [
  { title: "Example Domain", ogDescription: "desc", domainAgeDays: 400 },
  { hasHttps: false, domainAgeDays: 5, title: "x" },
  { domainAgeDays: 100 },
  { title: "Example", ogDescription: "desc", domainAgeDays: null },
  { title: "Example", domainAgeDays: 10, finalUrl: "https://other.example/" },
  { hasHttps: false, domainAgeDays: null },
];

describe("rubric wiring", () => {
  const savedPreset = process.env.SCORING_PRESET;
  const savedPath = process.env.SCORING_RUBRIC_PATH;
  const savedKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    resetRubricCache();
    delete process.env.SCORING_PRESET;
    delete process.env.SCORING_RUBRIC_PATH;
  });

  afterEach(() => {
    if (savedPreset === undefined) delete process.env.SCORING_PRESET;
    else process.env.SCORING_PRESET = savedPreset;
    if (savedPath === undefined) delete process.env.SCORING_RUBRIC_PATH;
    else process.env.SCORING_RUBRIC_PATH = savedPath;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
    resetRubricCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    _resetBreakerForTest();
  });

  it("default (no rubric arg) is byte-identical to the balanced preset", () => {
    const balanced = loadActiveRubric({}).rubric;
    for (const over of MATRIX) {
      const m = meta(over);
      const def = scoreWebsitePure(m);
      const via = scoreWebsitePure(m, balanced);
      expect(via.trust).toBe(def.trust);
      expect(via.level).toBe(def.level);
      expect(via.preWhy).toBe(def.preWhy);
      expect(via.provenance).toEqual(def.provenance);
      expect(via.citations).toEqual(def.citations);
      const defFull = buildTrustScore(m);
      const viaFull = buildTrustScore(m, undefined, balanced);
      expect(viaFull).toEqual(defFull);
    }
  });

  it("strict preset observably changes trust/level on fixed inputs", () => {
    const strict = loadActiveRubric({ SCORING_PRESET: "strict" }).rubric;
    // Boundary input: balanced 50+10+5+5 = 70 safe; strict 45+10+5+5 = 65 caution.
    const boundary = meta({
      title: "Example",
      ogDescription: "desc",
      domainAgeDays: null,
    });
    const before = scoreWebsitePure(boundary);
    expect(before.trust).toBe(70);
    expect(before.level).toBe("safe");
    const after = scoreWebsitePure(boundary, strict);
    expect(after.trust).toBe(65);
    expect(after.level).toBe("caution");
    // Harsh input: balanced 50-20-20 = 10 risky; strict clamps at 0 risky.
    const harsh = meta({ hasHttps: false, domainAgeDays: 5, title: "x" });
    expect(scoreWebsitePure(harsh).trust).toBe(10);
    expect(scoreWebsitePure(harsh, strict).trust).toBe(0);
  });

  it("lenient preset observably changes trust/level on fixed inputs", () => {
    const lenient = loadActiveRubric({ SCORING_PRESET: "lenient" }).rubric;
    // Soft input: balanced 50-20 = 30 risky; lenient 60-10 = 50 caution.
    const soft = meta({ hasHttps: false, domainAgeDays: null });
    const before = scoreWebsitePure(soft);
    expect(before.trust).toBe(30);
    expect(before.level).toBe("risky");
    const after = scoreWebsitePure(soft, lenient);
    expect(after.trust).toBe(50);
    expect(after.level).toBe("caution");
  });

  it("buildTrustScore passes the rubric through to trust/level/summary", () => {
    const strict = loadActiveRubric({ SCORING_PRESET: "strict" }).rubric;
    const m = meta({
      title: "Example",
      ogDescription: "desc",
      domainAgeDays: null,
    });
    const def = buildTrustScore(m);
    const wired = buildTrustScore(m, undefined, strict);
    expect(def.trust).toBe(70);
    expect(wired.trust).toBe(65);
    expect(wired.level).toBe("caution");
    expect(wired.elderlySummary).toContain("65/100");
    expect(wired.elderlySummary).toContain("CAUTION");
  });

  it("score route live path honors SCORING_PRESET=strict (stubbed fetch)", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const stub = vi.fn(
      async () =>
        new Response(
          '<html><head><title>Wired Page</title><meta property="og:description" content="Wired desc"></head><body>hi</body></html>',
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", stub);
    // Untouched env (balanced default): 50+10+5+5 = 70 safe.
    const defRes = await scoreGet(
      new Request("http://localhost/api/score?url=https://wired.example/page"),
    );
    expect(defRes.status).toBe(200);
    const defJson = (await defRes.json()) as { trust: number; level: string };
    expect(defJson.trust).toBe(70);
    expect(defJson.level).toBe("safe");

    // Strict preset through the route: 45+10+5+5 = 65 caution.
    process.env.SCORING_PRESET = "strict";
    resetRubricCache();
    _resetBreakerForTest();
    const strictRes = await scoreGet(
      new Request(
        "http://localhost/api/score?url=https://wired-strict.example/page",
      ),
    );
    expect(strictRes.status).toBe(200);
    const strictJson = (await strictRes.json()) as {
      trust: number;
      level: string;
    };
    expect(strictJson.trust).toBe(65);
    expect(strictJson.level).toBe("caution");
  });

  it("score route fixture stays pinned under SCORING_PRESET=strict", async () => {
    process.env.SCORING_PRESET = "strict";
    resetRubricCache();
    const res = await scoreGet(
      new Request(
        "http://localhost/api/score?url=https://example.com&fixture=1",
      ),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { trust: number; level: string };
    expect(json.trust).toBe(42);
    expect(json.level).toBe("caution");
  });

  it("score route fails loudly (500) on invalid SCORING_PRESET", async () => {
    process.env.SCORING_PRESET = "bogus";
    resetRubricCache();
    const res = await scoreGet(
      new Request("http://localhost/api/score?url=https://example.com"),
    );
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/rubric/i);
  });

  it("check route evidence badge follows the active rubric (stubbed fetch)", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const stub = vi.fn(
      async () =>
        new Response(
          '<html><head><title>Badge Page</title><meta property="og:description" content="Badge desc"></head><body>quoted evidence text here</body></html>',
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", stub);
    const url =
      "http://localhost/api/check?claim=this%20claim%20has%20enough%20length%20for%20validation&contextUrl=https://badge.example/evidence";
    // Untouched env (balanced default): 50+10+5+5 = 70 safe.
    const defRes = await checkGet(new Request(url));
    expect(defRes.status).toBe(200);
    const defJson = (await defRes.json()) as {
      verdict: string;
      evidence: { badge: { trust: number; level: string } }[];
    };
    expect(defJson.evidence).toHaveLength(1);
    expect(defJson.evidence[0].badge.trust).toBe(70);
    expect(defJson.evidence[0].badge.level).toBe("safe");

    // Strict preset through the route: 45+10+5+5 = 65 caution.
    process.env.SCORING_PRESET = "strict";
    resetRubricCache();
    _resetBreakerForTest();
    const strictRes = await checkGet(
      new Request(url.replace("badge.example", "badge-strict.example")),
    );
    expect(strictRes.status).toBe(200);
    const strictJson = (await strictRes.json()) as {
      verdict: string;
      evidence: { badge: { trust: number; level: string } }[];
    };
    expect(strictJson.evidence).toHaveLength(1);
    expect(strictJson.evidence[0].badge.trust).toBe(65);
    expect(strictJson.evidence[0].badge.level).toBe("caution");
    // Badge is display-only: verdict/confidence untouched (fail-closed, no key).
    expect(strictJson.verdict).toBe("unverified");
  });

  it("check route fixture stays pinned under SCORING_PRESET=strict", async () => {
    process.env.SCORING_PRESET = "strict";
    resetRubricCache();
    const res = await checkGet(
      new Request(
        "http://localhost/api/check?claim=this%20claim%20has%20enough%20length%20for%20validation&fixture=1",
      ),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      verdict: string;
      confidence: number;
    };
    expect(json.verdict).toBe("supported");
    expect(json.confidence).toBe(0.82);
  });
});
