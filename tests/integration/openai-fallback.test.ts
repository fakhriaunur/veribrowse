import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET as scoreGet } from "@/app/api/score/route";
import { GET as checkGet } from "@/app/api/check/route";
import { getCounters, resetForTest as resetMetrics } from "@/lib/metrics";
import { _resetBreakerForTest } from "@/lib/fetchWithRetry";

// VAL-CROSS-011: mock OpenAI parse/slice/clamp branches exercised through the
// real route handlers with a stubbed fetch layer (no network, no real key).
// Cases: malformed JSON -> heuristic fallback, oversized bullets -> sliced to
// cap, out-of-range confidence -> clamped, non-200 -> openai_fallback_total
// incremented with provenance preserved, no-evidence -> no OpenAI call.

type StubSpec = {
  openaiContent?: string;
  openaiStatus?: number;
  evidenceHtml?: string;
  scoreHtml?: string;
};

function makeStub(spec: StubSpec, calls: { openai: number }) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/v1/chat/completions")) {
      calls.openai += 1;
      const status = spec.openaiStatus ?? 200;
      const content = spec.openaiContent ?? "{}";
      // Mirror the real OpenAI chat-completions envelope: the route reads
      // choices[0].message.content (a JSON string) and JSON.parses it, so
      // malformed content exercises the route's parse-fallback branch.
      const envelope = { choices: [{ message: { content } }] };
      return {
        ok: status >= 200 && status < 300,
        status,
        url: u,
        text: async () =>
          status === 200 ? JSON.stringify(envelope) : "mock upstream error",
        json: async () => envelope,
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    }
    const html =
      u === "https://evidence.example/article"
        ? (spec.evidenceHtml ??
          "<html><head><title>Evidence</title></head><body>quoted evidence text for the claim under test</body></html>")
        : (spec.scoreHtml ??
          '<html><head><title>Stubbed title</title><meta property="og:description" content="stubbed desc"></head></html>');
    return {
      ok: true,
      status: 200,
      url: u,
      text: async () => html,
      json: async () => ({}),
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  });
}

describe("Mock OpenAI parse/slice/clamp branches (VAL-CROSS-011)", () => {
  const origFetch = global.fetch;
  const origKey = process.env.OPENAI_API_KEY;
  const origBase = process.env.OPENAI_BASE_URL;

  beforeEach(() => {
    _resetBreakerForTest();
    resetMetrics();
    process.env.OPENAI_API_KEY = "dummy";
    process.env.OPENAI_BASE_URL = "http://127.0.0.1:8787";
  });

  afterEach(() => {
    global.fetch = origFetch;
    vi.restoreAllMocks();
    if (origKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = origKey;
    if (origBase === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = origBase;
  });

  it("falls back on malformed OpenAI JSON", async () => {
    const calls = { openai: 0 };
    // @ts-ignore stub fetch
    global.fetch = makeStub({ openaiContent: "NOT-JSON{{{oops" }, calls);
    const before = getCounters().openai_fallback_total;
    const res = await scoreGet(
      new Request("http://localhost/api/score?url=https://malformed.example"),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      trust: number;
      why: string;
      provenance: { contentHash: string; retrievedAt: string };
    };
    expect(typeof json.trust).toBe("number");
    expect(json.provenance.contentHash).toBeTruthy();
    expect(json.why).not.toContain("NOT-JSON");
    expect(getCounters().openai_fallback_total).toBeGreaterThan(before);
    expect(calls.openai).toBeGreaterThan(0);
  });

  it("slices bullets to cap and why to 200 chars", async () => {
    const calls = { openai: 0 };
    const bullets = Array.from({ length: 100 }, (_, i) => `bullet ${i}`);
    const why = "w".repeat(500);
    // @ts-ignore stub fetch
    global.fetch = makeStub(
      { openaiContent: JSON.stringify({ why, bullets }) },
      calls,
    );
    const res = await scoreGet(
      new Request("http://localhost/api/score?url=https://oversized.example"),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { bullets: string[]; why: string };
    // Mock returned 100 bullets + 500-char why: route must slice to caps.
    expect(json.bullets.length).toBe(3);
    expect(json.bullets[0]).toBe("bullet 0");
    expect(json.why.length).toBe(200);
  });

  it("clamps confidence into 0-1", async () => {
    const calls = { openai: 0 };
    // @ts-ignore stub fetch
    global.fetch = makeStub(
      {
        openaiContent: JSON.stringify({
          verdict: "supported",
          confidence: 2.0,
          reasoning: "over-range confidence",
        }),
      },
      calls,
    );
    const res = await checkGet(
      new Request(
        "http://localhost/api/check?claim=this%20is%20a%20long%20enough%20claim%20for%20clamp&contextUrl=https://evidence.example/article",
      ),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      verdict: string;
      confidence: number;
    };
    // Mock returned confidence 2.0: route must clamp into [0, 1].
    expect(json.verdict).toBe("supported");
    expect(json.confidence).toBe(1);
  });

  it("non-200 OpenAI increments openai_fallback_total and preserves provenance", async () => {
    const calls = { openai: 0 };
    // @ts-ignore stub fetch
    global.fetch = makeStub({ openaiStatus: 500 }, calls);
    const before = getCounters().openai_fallback_total;
    const res = await checkGet(
      new Request(
        "http://localhost/api/check?claim=this%20is%20a%20long%20enough%20claim%20for%20fivehundred&contextUrl=https://evidence.example/article",
      ),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      verdict: string;
      provenance: { claimHash: string; checkedAt: string };
    };
    expect(["supported", "contradicted", "unverified"]).toContain(json.verdict);
    expect(json.provenance.claimHash).toBeTruthy();
    expect(json.provenance.checkedAt).toBeTruthy();
    expect(getCounters().openai_fallback_total).toBeGreaterThan(before);
  });

  it("does not call OpenAI without evidence even with key set", async () => {
    const calls = { openai: 0 };
    // @ts-ignore stub fetch
    global.fetch = makeStub({}, calls);
    const res = await checkGet(
      new Request(
        "http://localhost/api/check?claim=this%20novel%20claim%20has%20no%20context%20at%20all",
      ),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      verdict: string;
      confidence: number;
      evidence: unknown[];
    };
    expect(json.verdict).toBe("unverified");
    expect(json.confidence).toBe(0.3);
    expect(json.evidence).toEqual([]);
    expect(calls.openai).toBe(0);
  });
});
