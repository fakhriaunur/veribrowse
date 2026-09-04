import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { GET as checkGet } from "@/app/api/check/route";
import { GET as scoreGet } from "@/app/api/score/route";
import { scoreWebsitePure, type FetchMeta } from "@/lib/score";

function meta(over: Partial<FetchMeta> = {}): FetchMeta {
  return {
    url: "https://example.com/evidence",
    title: "Example Evidence Page",
    ogDescription: "Evidence description",
    finalUrl: "https://example.com/evidence",
    status: 200,
    contentHash: "deadbeef",
    retrievedAt: "2026-01-01T00:00:00.000Z",
    domainAgeDays: null,
    hasHttps: true,
    ...over,
  };
}

afterEach(() => vi.restoreAllMocks());

// crossReference link-back (VAL-CROSS-024): per-evidence-URL trust badges
// computed in-request via scoreWebsitePure, display-layer only.
describe("crossReference link-back badges", () => {
  it("badge mapping follows pure-score thresholds (safe>=70, caution>=40, risky<40)", () => {
    // safe: https + title + og = 50+10+5+5 = 70
    expect(scoreWebsitePure(meta()).level).toBe("safe");
    // caution: bare https = 50+10 = 60
    expect(
      scoreWebsitePure(meta({ title: undefined, ogDescription: undefined }))
        .level,
    ).toBe("caution");
    // risky: plain http, no signals = 50-20 = 30
    expect(
      scoreWebsitePure(
        meta({ hasHttps: false, title: undefined, ogDescription: undefined }),
      ).level,
    ).toBe("risky");
    // boundaries: exactly 70 -> safe, exactly 40 -> caution
    expect(scoreWebsitePure(meta()).trust).toBe(70);
    expect(
      scoreWebsitePure(
        meta({
          hasHttps: false,
          title: "Example Evidence Page",
          ogDescription: "Evidence description",
        }),
      ),
    ).toMatchObject({ trust: 40, level: "caution" });
  });

  it("fixture check evidence badge equals fixture score level for the same URL", async () => {
    const url = "https://example.com/evidence";
    const checkReq = new Request(
      `http://localhost/api/check?claim=hello%20world%20fixture%20claim&contextUrl=${encodeURIComponent(url)}&fixture=1`,
    );
    const checkJson = (await (await checkGet(checkReq)).json()) as {
      evidence: { badge: { trust: number; level: string } }[];
    };
    const scoreReq = new Request(
      `http://localhost/api/score?url=${encodeURIComponent(url)}&fixture=1`,
    );
    const scoreJson = (await (await scoreGet(scoreReq)).json()) as {
      trust: number;
      level: string;
    };
    expect(checkJson.evidence).toHaveLength(1);
    expect(checkJson.evidence[0].badge.trust).toBe(scoreJson.trust);
    expect(checkJson.evidence[0].badge.level).toBe(scoreJson.level);
  });

  it("live check evidence badge equals live score level for the same fetched HTML", async () => {
    const html =
      '<html><head><title>Example Evidence Page</title><meta property="og:description" content="Evidence description"></head><body>Some quoted evidence text here</body></html>';
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        url: "https://example.com/evidence",
        text: async () => html,
      })),
    );
    const claim = "this claim has enough length for validation";
    const url = "https://example.com/evidence";
    const checkReq = new Request(
      `http://localhost/api/check?claim=${encodeURIComponent(claim)}&contextUrl=${encodeURIComponent(url)}`,
    );
    const checkJson = (await (await checkGet(checkReq)).json()) as {
      verdict: string;
      evidence: { badge: { trust: number; level: string } }[];
    };
    const scoreReq = new Request(
      `http://localhost/api/score?url=${encodeURIComponent(url)}`,
    );
    const scoreJson = (await (await scoreGet(scoreReq)).json()) as {
      trust: number;
      level: string;
    };
    expect(checkJson.evidence).toHaveLength(1);
    expect(checkJson.evidence[0].badge.trust).toBe(scoreJson.trust);
    expect(checkJson.evidence[0].badge.level).toBe(scoreJson.level);
  });

  it("fail-closed check carries no badge (empty evidence)", async () => {
    const req = new Request(
      "http://localhost/api/check?claim=long%20enough%20claim%20text%20for%20test",
    );
    const json = (await (await checkGet(req)).json()) as {
      verdict: string;
      evidence: unknown[];
    };
    expect(json.verdict).toBe("unverified");
    expect(json.evidence).toEqual([]);
  });

  it("fixture shape byte-compatible ignoring timestamps", async () => {
    const req = new Request(
      "http://localhost/api/check?claim=hello%20world%20fixture&fixture=1",
    );
    const json = (await (await checkGet(req)).json()) as Record<
      string,
      unknown
    >;
    const norm = JSON.parse(
      JSON.stringify(json)
        .replace(/"checkedAt":\s*"[^"]*"/g, '"checkedAt":"T"')
        .replace(/"retrievedAt":\s*"[^"]*"/g, '"retrievedAt":"T"'),
    );
    const golden = JSON.parse(
      readFileSync("tests/fixtures/check.fixture.json", "utf8")
        .replace(/"checkedAt":\s*"[^"]*"/g, '"checkedAt":"T"')
        .replace(/"retrievedAt":\s*"[^"]*"/g, '"retrievedAt":"T"'),
    );
    // Same top-level keys, same evidence shape incl. deterministic badge.
    expect(Object.keys(norm).sort()).toEqual(Object.keys(golden).sort());
    expect(norm.evidence).toEqual(golden.evidence);
    expect(norm.verdict).toBe(golden.verdict);
    expect(norm.confidence).toBe(golden.confidence);
    expect(norm.reasoning).toBe(golden.reasoning);
  });
});
