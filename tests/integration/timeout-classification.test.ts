import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET as scoreGet } from "@/app/api/score/route";
import { GET as checkGet } from "@/app/api/check/route";
import { _resetBreakerForTest, isTimeoutError } from "@/lib/fetchWithRetry";
import { getCounters, resetForTest as resetMetrics } from "@/lib/metrics";

// m10-timeout-classification: gateway stalls surface as TimeoutError
// (AbortSignal.timeout), NOT AbortError — but the TimeoutError message
// ("The operation was aborted due to timeout") matches the routes' /abort/i
// mapping, yielding 499 instead of the contracted fail-closed 200.
// These tests pin: gateway timeout on check AND score -> 200 fail-closed
// (unverified/heuristic) with fallback metric, never 499; genuine client
// aborts still -> 499 (VAL-API-015/029 preserved).

function timeoutError(): Error {
  // Same shape Node/undici produces for AbortSignal.timeout stalls.
  return new DOMException(
    "The operation was aborted due to timeout",
    "TimeoutError",
  ) as unknown as Error;
}

function abortError(): Error {
  return Object.assign(new Error("This operation was aborted"), {
    name: "AbortError",
  });
}

function okPage(html: string) {
  return {
    ok: true,
    status: 200,
    url: "https://page.example/",
    text: async () => html,
    json: async () => ({}),
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

const PAGE_HTML =
  '<html><head><title>Stubbed title</title><meta property="og:description" content="stubbed desc"></head><body>quoted evidence text for the claim under test with enough words</body></html>';

/** Stub fetch: page fetches succeed, OpenAI gateway hangs-turned-timeout. */
function gatewayTimeoutStub() {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("/v1/chat/completions")) throw timeoutError();
    return okPage(PAGE_HTML);
  });
}

/** Stub fetch: every fetch rejects with TimeoutError (full stall). */
function fullStallStub() {
  return vi.fn(async () => {
    throw timeoutError();
  });
}

/** Stub fetch: hangs until the caller signal aborts (genuine client abort). */
function hangingStub() {
  return vi.fn((_url: string | URL | Request, init?: RequestInit) => {
    return new Promise<never>((_resolve, reject) => {
      const signal = init?.signal as AbortSignal | undefined;
      if (!signal) return; // hangs forever — tests always pass a signal
      if (signal.aborted) {
        reject(abortError());
        return;
      }
      signal.addEventListener("abort", () => reject(abortError()), {
        once: true,
      });
    });
  });
}

describe("isTimeoutError classifier", () => {
  it("matches TimeoutError name", () => {
    expect(isTimeoutError(timeoutError())).toBe(true);
  });

  it("matches TimeoutError in the cause chain", () => {
    expect(
      isTimeoutError(
        Object.assign(new Error("fetch failed"), { cause: timeoutError() }),
      ),
    ).toBe(true);
  });

  it("does not match genuine client AbortError", () => {
    expect(isTimeoutError(abortError())).toBe(false);
  });

  it("does not match unrelated errors", () => {
    expect(isTimeoutError(new Error("boom"))).toBe(false);
    expect(isTimeoutError(new Error("request timed out waiting"))).toBe(false);
  });
});

describe("gateway timeout classification (m10-timeout-classification)", () => {
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
    _resetBreakerForTest();
    if (origKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = origKey;
    if (origBase === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = origBase;
  });

  it("score page-fetch stall yields 200 heuristic, never 499", async () => {
    // @ts-ignore stub fetch
    global.fetch = fullStallStub();
    const res = await scoreGet(
      new Request("http://localhost/api/score?url=https://stall.example/page"),
    );
    expect(res.status).toBe(200);
    expect(res.status).not.toBe(499);
    const json = (await res.json()) as {
      trust: number;
      level: string;
      provenance: { contentHash: string; retrievedAt: string };
    };
    expect(typeof json.trust).toBe("number");
    expect(["safe", "caution", "risky"]).toContain(json.level);
    expect(json.provenance.contentHash).toBeTruthy();
    expect(json.provenance.retrievedAt).toBeTruthy();
  });

  it("score gateway stall yields 200 heuristic + fallback metric, never 499", async () => {
    // @ts-ignore stub fetch
    global.fetch = gatewayTimeoutStub();
    const before = getCounters().openai_fallback_total;
    const res = await scoreGet(
      new Request(
        "http://localhost/api/score?url=https://gateway-stall.example/page",
      ),
    );
    expect(res.status).toBe(200);
    expect(res.status).not.toBe(499);
    const json = (await res.json()) as {
      trust: number;
      provenance: { contentHash: string };
    };
    expect(typeof json.trust).toBe("number");
    expect(json.provenance.contentHash).toBeTruthy();
    expect(getCounters().openai_fallback_total).toBeGreaterThan(before);
  });

  it("check evidence-fetch stall yields 200 fail-closed unverified, never 499", async () => {
    // @ts-ignore stub fetch
    global.fetch = fullStallStub();
    const res = await checkGet(
      new Request(
        "http://localhost/api/check?claim=this%20is%20a%20long%20enough%20claim%20for%20stall&contextUrl=https://evidence-stall.example/article",
      ),
    );
    expect(res.status).toBe(200);
    expect(res.status).not.toBe(499);
    const json = (await res.json()) as {
      verdict: string;
      confidence: number;
      evidence: unknown[];
    };
    expect(json.verdict).toBe("unverified");
    expect(json.confidence).toBe(0.3);
    expect(json.evidence).toEqual([]);
  });

  it("check gateway stall yields 200 + fallback metric, never 499", async () => {
    // @ts-ignore stub fetch
    global.fetch = gatewayTimeoutStub();
    const before = getCounters().openai_fallback_total;
    const res = await checkGet(
      new Request(
        "http://localhost/api/check?claim=this%20is%20a%20long%20enough%20claim%20for%20gateway&contextUrl=https://evidence-gw.example/article",
      ),
    );
    expect(res.status).toBe(200);
    expect(res.status).not.toBe(499);
    const json = (await res.json()) as {
      verdict: string;
      evidence: unknown[];
      provenance: { claimHash: string; checkedAt: string };
    };
    // Evidence present but no LLM verdict -> fail-closed unverified.
    expect(json.verdict).toBe("unverified");
    expect(json.evidence.length).toBe(1);
    expect(json.provenance.claimHash).toBeTruthy();
    expect(getCounters().openai_fallback_total).toBeGreaterThan(before);
  });

  it("client abort on score still yields 499 (VAL-API-015/029 preserved)", async () => {
    // @ts-ignore stub fetch
    global.fetch = hangingStub();
    const ctrl = new AbortController();
    const pending = scoreGet(
      new Request("http://localhost/api/score?url=https://abort.example/page", {
        signal: ctrl.signal,
      }),
    );
    setTimeout(() => ctrl.abort(), 20);
    const res = await pending;
    expect(res.status).toBe(499);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/abort/i);
  });

  it("client abort on check still yields 499 (VAL-API-015/029 preserved)", async () => {
    // @ts-ignore stub fetch
    global.fetch = hangingStub();
    const ctrl = new AbortController();
    const pending = checkGet(
      new Request(
        "http://localhost/api/check?claim=this%20is%20a%20long%20enough%20claim%20for%20abort&contextUrl=https://abort-evidence.example/article",
        { signal: ctrl.signal },
      ),
    );
    setTimeout(() => ctrl.abort(), 20);
    const res = await pending;
    expect(res.status).toBe(499);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/abort/i);
  });
});
