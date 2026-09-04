import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { GET as scoreGet } from "@/app/api/score/route";
import { GET as checkGet } from "@/app/api/check/route";
import { getCounters, resetForTest as resetMetrics } from "@/lib/metrics";
import { _resetBreakerForTest } from "@/lib/fetchWithRetry";

// m11-mock-chain: amended VAL-CROSS-009/010/011 + VAL-CROSS-029/030 proven
// through REAL mock processes (scripts/mock_openai.mjs) on private ports —
// never the shared :8787 sibling daemon. The chain (lib/llm.ts) hits the
// live mock's /v1/responses + /v1/chat/completions; page/evidence fetches
// stay stubbed via a global-fetch wrapper that delegates LLM URLs to the
// real fetch. Error injection uses the mock's /__mock/inject plane.

const PRIMARY_PORT = 18887;
const ALT_PORT = 18888;
const PRIMARY = `http://127.0.0.1:${PRIMARY_PORT}`;
const ALT = `http://127.0.0.1:${ALT_PORT}`;

const PAGE_HTML =
  '<html><head><title>Stubbed title</title><meta property="og:description" content="stubbed desc"></head><body>page body</body></html>';
const EVIDENCE_HTML =
  "<html><head><title>Evidence article</title></head><body>quoted evidence text for the claim under test with enough words to form a quote</body></html>";

type MockRequest = {
  seq: number;
  method: string;
  path: string;
  status?: number;
  model?: string;
  store?: boolean;
  include?: string[];
};

function mockScript(): string {
  return path.resolve(process.cwd(), "scripts/mock_openai.mjs");
}

function spawnMock(port: number): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [mockScript()], {
      env: { ...process.env, MOCK_PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`mock on :${port} did not start in time`));
    }, 8000);
    const onData = (chunk: Buffer) => {
      if (String(chunk).includes("mock listening")) {
        clearTimeout(timer);
        child.stdout?.off("data", onData);
        resolve(child);
      }
    };
    child.stdout?.on("data", onData);
    child.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

describe("mock chain via live mock processes (m11-mock-chain)", () => {
  let primary: ChildProcess | undefined;
  let alt: ChildProcess | undefined;
  // Captured before the wrapper below replaces global.fetch: the control
  // plane (inject/reset/log) must bypass the wrapper, which maps every
  // non-LLM URL to canned HTML.
  const realFetch = global.fetch;
  const origKey = process.env.OPENAI_API_KEY;
  const origBase = process.env.OPENAI_BASE_URL;
  const origAlt = process.env.OPENAI_BASE_URL_ALT;

  async function mockPost(
    port: number,
    pathname: string,
    body: unknown,
  ): Promise<unknown> {
    const res = await realFetch(`http://127.0.0.1:${port}${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json() as Promise<unknown>;
  }

  function inject(port: number, patch: unknown): Promise<unknown> {
    return mockPost(port, "/__mock/inject", patch);
  }

  function resetMock(port: number): Promise<unknown> {
    return mockPost(port, "/__mock/reset", {});
  }

  async function mockLog(port: number): Promise<MockRequest[]> {
    const res = await realFetch(`http://127.0.0.1:${port}/__mock/requests`);
    const json = (await res.json()) as { requests: MockRequest[] };
    return json.requests;
  }

  beforeAll(async () => {
    primary = await spawnMock(PRIMARY_PORT);
    alt = await spawnMock(ALT_PORT);
    // Wrapper: LLM chain URLs go to the live mocks; page/evidence fetches
    // get canned HTML (no external network in tests).
    global.fetch = (async (url: unknown, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/v1/responses") || u.includes("/v1/chat/completions")) {
        return realFetch(url as string, init);
      }
      const html = u.includes("evidence") ? EVIDENCE_HTML : PAGE_HTML;
      return {
        ok: true,
        status: 200,
        url: u,
        text: async () => html,
        json: async () => ({}),
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    }) as unknown as typeof fetch;
  }, 30000);

  afterAll(async () => {
    global.fetch = realFetch;
    if (origKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = origKey;
    if (origBase === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = origBase;
    if (origAlt === undefined) delete process.env.OPENAI_BASE_URL_ALT;
    else process.env.OPENAI_BASE_URL_ALT = origAlt;
    primary?.kill("SIGTERM");
    alt?.kill("SIGTERM");
  });

  beforeEach(async () => {
    _resetBreakerForTest();
    resetMetrics();
    process.env.OPENAI_API_KEY = "dummy";
    process.env.OPENAI_BASE_URL = PRIMARY;
    delete process.env.OPENAI_BASE_URL_ALT;
    await resetMock(PRIMARY_PORT);
    await resetMock(ALT_PORT);
  });

  it("score enriches Responses-first with provenance step + sliced mock payload (VAL-CROSS-009)", async () => {
    const res = await scoreGet(
      new Request(
        "http://localhost/api/score?url=https://score-mock.example/page",
      ),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      why: string;
      bullets: string[];
      provenance: { url: string; contentHash: string; llmStep?: string };
    };
    // llmWhy from mock (not heuristic), sliced to caps on responses path.
    expect(json.why.startsWith("Mock LLM why")).toBe(true);
    expect(json.why.length).toBeLessThanOrEqual(200);
    expect(json.bullets).toHaveLength(3);
    expect(json.provenance.contentHash).toBeTruthy();
    expect(json.provenance.llmStep).toBe("responses-primary");
    // Attempt order: Responses first, Chat never attempted after success.
    const log = await mockLog(PRIMARY_PORT);
    expect(log.map((e) => `${e.method} ${e.path}`)).toEqual([
      "POST /v1/responses",
    ]);
    // Responses step carries statelessness + low-temperature contract.
    expect(log[0].store).toBe(false);
    expect(log[0].include).toEqual(["reasoning.encrypted_content"]);
  });

  it("check verifies via chain with evidence; no-evidence stays fail-closed with no LLM call (VAL-CROSS-010)", async () => {
    const res = await checkGet(
      new Request(
        "http://localhost/api/check?claim=this%20is%20a%20long%20enough%20claim%20for%20chain&contextUrl=https://evidence-mock.example/article",
      ),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      verdict: string;
      confidence: number;
      evidence: { quote: string; url: string; contentHash: string }[];
      provenance: { claimHash: string; checkedAt: string; llmStep?: string };
    };
    expect(json.verdict).toBe("supported");
    expect(json.confidence).toBe(0.92);
    expect(json.evidence).toHaveLength(1);
    expect(json.evidence[0].quote.length).toBeLessThanOrEqual(500);
    expect(json.evidence[0].contentHash).toBeTruthy();
    expect(json.provenance.llmStep).toBe("responses-primary");

    // Companion call without contextUrl: fail-closed even with key set, and
    // the mock sees zero new LLM attempts.
    await resetMock(PRIMARY_PORT);
    const closed = await checkGet(
      new Request(
        "http://localhost/api/check?claim=this%20novel%20claim%20has%20no%20context%20at%20all",
      ),
    );
    expect(closed.status).toBe(200);
    const closedJson = (await closed.json()) as {
      verdict: string;
      confidence: number;
      evidence: unknown[];
    };
    expect(closedJson.verdict).toBe("unverified");
    expect(closedJson.confidence).toBe(0.3);
    expect(closedJson.evidence).toEqual([]);
    expect(await mockLog(PRIMARY_PORT)).toEqual([]);
  });

  it("chat serves when Responses fails; provenance notes chat-primary (VAL-CROSS-029)", async () => {
    await inject(PRIMARY_PORT, {
      responses: { status: 500 },
      chat: {
        body: {
          why: "CHAT-PATH-MARKER fallback why served from chat completions",
          bullets: ["chat bullet one", "chat bullet two"],
        },
      },
    });
    const res = await scoreGet(
      new Request(
        "http://localhost/api/score?url=https://chat-fallback.example/page",
      ),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      why: string;
      provenance: { llmStep?: string };
    };
    expect(json.why).toContain("CHAT-PATH-MARKER");
    expect(json.provenance.llmStep).toBe("chat-primary");
    const log = await mockLog(PRIMARY_PORT);
    expect(log.map((e) => `${e.path} ${e.status}`)).toEqual([
      "/v1/responses 500",
      "/v1/chat/completions 200",
    ]);
  });

  it("chat serves when Responses times out on its step budget (VAL-CROSS-029)", async () => {
    await inject(PRIMARY_PORT, { responses: { delayMs: 2500 } });
    const started = Date.now();
    const res = await scoreGet(
      new Request(
        "http://localhost/api/score?url=https://responses-timeout.example/page&llmTimeoutMs=1000",
      ),
    );
    // Hung Responses step aborts on the 1s budget (+backoff), Chat serves.
    expect(Date.now() - started).toBeLessThan(9000);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      why: string;
      provenance: { llmStep?: string };
    };
    expect(json.why.startsWith("Mock LLM why")).toBe(true);
    expect(json.provenance.llmStep).toBe("chat-primary");
  });

  it("primary 403s fail over to alt; provenance notes responses-alt (VAL-CROSS-030)", async () => {
    process.env.OPENAI_BASE_URL_ALT = ALT;
    await inject(PRIMARY_PORT, {
      responses: { status: 403 },
      chat: { status: 403 },
    });
    await inject(ALT_PORT, {
      responses: {
        body: {
          why: "ALT-MARKER responses-alt why served from the alt endpoint",
          bullets: ["alt bullet one"],
          verdict: "supported",
          confidence: 0.77,
          reasoning: "alt reasoning",
        },
      },
    });
    const res = await scoreGet(
      new Request(
        "http://localhost/api/score?url=https://alt-failover.example/page",
      ),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      why: string;
      provenance: { llmStep?: string };
    };
    expect(json.why).toContain("ALT-MARKER");
    expect(json.provenance.llmStep).toBe("responses-alt");
    const primaryLog = await mockLog(PRIMARY_PORT);
    expect(primaryLog.map((e) => `${e.path} ${e.status}`)).toEqual([
      "/v1/responses 403",
      "/v1/chat/completions 403",
    ]);
    const altLog = await mockLog(ALT_PORT);
    expect(altLog.map((e) => `${e.path} ${e.status}`)[0]).toBe(
      "/v1/responses 200",
    );
  });

  it("empty ALT keeps single-endpoint behavior: all-primary-fail falls back with metric (VAL-CROSS-030)", async () => {
    await inject(PRIMARY_PORT, {
      responses: { status: 500 },
      chat: { status: 500 },
    });
    const before = getCounters().openai_fallback_total;
    const res = await scoreGet(
      new Request(
        "http://localhost/api/score?url=https://single-endpoint.example/page",
      ),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      why: string;
      bullets: string[];
      provenance: { contentHash: string; llmStep?: string };
    };
    // Contracted heuristic fallback, provenance preserved, no step note.
    expect(json.why).toBe("Standard signals");
    expect(json.bullets).toEqual([
      "Standard signals — verify via second source",
    ]);
    expect(json.provenance.contentHash).toBeTruthy();
    expect(json.provenance.llmStep).toBeUndefined();
    expect(getCounters().openai_fallback_total).toBeGreaterThan(before);
    // Alt never attempted in single-endpoint mode.
    expect(await mockLog(ALT_PORT)).toEqual([]);
  });

  it("check all-steps-fail stays fail-closed with evidence + metric (VAL-CROSS-030)", async () => {
    process.env.OPENAI_BASE_URL_ALT = ALT;
    await inject(PRIMARY_PORT, {
      responses: { status: 500 },
      chat: { status: 500 },
    });
    await inject(ALT_PORT, {
      responses: { status: 500 },
      chat: { status: 500 },
    });
    const before = getCounters().openai_fallback_total;
    const res = await checkGet(
      new Request(
        "http://localhost/api/check?claim=this%20is%20a%20long%20enough%20claim%20for%20allfail&contextUrl=https://evidence-mock.example/article",
      ),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      verdict: string;
      evidence: { quote: string }[];
      provenance: { claimHash: string; checkedAt: string; llmStep?: string };
    };
    expect(json.verdict).toBe("unverified");
    expect(json.evidence).toHaveLength(1);
    expect(json.provenance.claimHash).toBeTruthy();
    expect(json.provenance.checkedAt).toBeTruthy();
    expect(json.provenance.llmStep).toBeUndefined();
    expect(getCounters().openai_fallback_total).toBeGreaterThan(before);
    const altLog = await mockLog(ALT_PORT);
    expect(altLog).toHaveLength(2);
  });

  it("parse/slice/clamp hold on both paths; malformed step falls through (VAL-CROSS-011)", async () => {
    // Responses-path clamp: out-of-range confidence clamps into [0,1].
    await inject(PRIMARY_PORT, {
      responses: {
        body: { verdict: "contradicted", confidence: -0.5, reasoning: "neg" },
      },
    });
    const clamped = await checkGet(
      new Request(
        "http://localhost/api/check?claim=this%20is%20a%20long%20enough%20claim%20for%20clamp&contextUrl=https://evidence-mock.example/article",
      ),
    );
    expect(clamped.status).toBe(200);
    const clampedJson = (await clamped.json()) as {
      verdict: string;
      confidence: number;
      provenance: { llmStep?: string };
    };
    expect(clampedJson.verdict).toBe("contradicted");
    expect(clampedJson.confidence).toBe(0);
    expect(clampedJson.provenance.llmStep).toBe("responses-primary");

    // Malformed Responses envelope -> Chat attempted, slice caps on chat path.
    await inject(PRIMARY_PORT, {
      responses: { rawBody: "NOT-JSON{{{oops" },
      chat: {
        body: {
          why: "w".repeat(500),
          bullets: Array.from({ length: 100 }, (_, i) => `bullet ${i}`),
        },
      },
    });
    const sliced = await scoreGet(
      new Request(
        "http://localhost/api/score?url=https://oversized.example/page",
      ),
    );
    expect(sliced.status).toBe(200);
    const slicedJson = (await sliced.json()) as {
      why: string;
      bullets: string[];
      provenance: { llmStep?: string };
    };
    expect(slicedJson.bullets).toHaveLength(3);
    expect(slicedJson.bullets[0]).toBe("bullet 0");
    expect(slicedJson.why).toHaveLength(200);
    expect(slicedJson.provenance.llmStep).toBe("chat-primary");
  });
});
