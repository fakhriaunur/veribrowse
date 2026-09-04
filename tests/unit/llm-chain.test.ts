import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  runLlmChain,
  resolveStepTimeout,
  parseTimeoutParam,
  responsesUrl,
  chatUrl,
  LLM_TIMEOUT_DEFAULT_MS,
  LLM_TIMEOUT_MIN_MS,
  LLM_TIMEOUT_MAX_MS,
  LLM_CHAIN_BACKOFF_MS,
} from "@/lib/llm";
import { TIMEOUT_MS as PAGE_TIMEOUT_MS } from "@/lib/fetchWithRetry";
import llmConfig from "@/config/llm.json";

// lib/llm.ts failover chain (VAL-CROSS-028..031): Responses(primary) ->
// Chat(primary) -> Responses(alt) -> Chat(alt) on ANY failure, 10s
// per-step AbortSignal budget, backoff between steps, first-success-wins
// with provenance step note. fetchImpl is stubbed — no network, no key.

type Call = { url: string; body: Record<string, unknown> };

function okJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    url: "",
    text: async () => JSON.stringify(body),
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

function errStatus(status: number) {
  return {
    ok: false,
    status,
    url: "",
    text: async () => `upstream ${status}`,
    json: async () => ({}),
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

function responsesEnvelope(payload: unknown) {
  return {
    status: "completed",
    output: [
      { type: "reasoning", id: "rs_skip" },
      {
        type: "message",
        content: [
          { type: "output_text", text: JSON.stringify(payload) },
          { type: "refusal", refusal: "never-picked" },
        ],
      },
    ],
  };
}

function chatEnvelope(payload: unknown) {
  return { choices: [{ message: { content: JSON.stringify(payload) } }] };
}

function recordingStub(
  calls: Call[],
  handler: (url: string, init?: RequestInit) => unknown,
) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    });
    return handler(String(url), init);
  });
}

/** Hangs until the step signal aborts (proves per-step timeout wiring). */
function hangingStep() {
  return (_url: string, init?: RequestInit) =>
    new Promise<never>((_resolve, reject) => {
      const signal = init?.signal as AbortSignal | undefined;
      const fail = () =>
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      if (!signal) return; // hangs forever — tests always pass a signal
      if (signal.aborted) {
        fail();
        return;
      }
      signal.addEventListener("abort", fail, { once: true });
    });
}

const PRIMARY = "http://127.0.0.1:8787";
const ALT = "http://127.0.0.1:8899";

describe("llm chain order — Responses-first, first success wins (VAL-CROSS-028)", () => {
  const env = process.env;
  beforeEach(() => {
    process.env = { ...env, OPENAI_BASE_URL: PRIMARY };
    delete process.env.OPENAI_BASE_URL_ALT;
  });
  afterEach(() => {
    process.env = env;
    vi.restoreAllMocks();
  });

  it("attempts Responses before Chat on primary; Chat never runs after Responses success", async () => {
    const calls: Call[] = [];
    const fetchImpl = recordingStub(calls, (url) =>
      url.endsWith("/v1/responses")
        ? okJson(responsesEnvelope({ why: "responses why", bullets: ["b1"] }))
        : okJson(chatEnvelope({ why: "chat why", bullets: ["c1"] })),
    );
    const out = await runLlmChain({
      prompt: "p",
      model: "gpt-4o-mini",
      temperature: 0.2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out.ok).toBe(true);
    expect(out.ok && out.step).toBe("responses-primary");
    expect(out.ok && out.payload).toMatchObject({ why: "responses why" });
    // Zero Chat attempts on Responses success.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(responsesUrl(PRIMARY));
  });

  it("Responses step sends store:false + include reasoning.encrypted_content", async () => {
    const calls: Call[] = [];
    const fetchImpl = recordingStub(calls, () =>
      okJson(responsesEnvelope({ why: "w", bullets: ["b"] })),
    );
    await runLlmChain({
      prompt: "score prompt",
      model: "gpt-4o-mini",
      temperature: 0.2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(calls[0].body).toMatchObject({
      model: "gpt-4o-mini",
      temperature: 0.2,
      store: false,
      include: ["reasoning.encrypted_content"],
    });
    expect(calls[0].body).toHaveProperty("input");
  });
});

describe("llm chain chat fallback when Responses fails (VAL-CROSS-029)", () => {
  const env = process.env;
  beforeEach(() => {
    process.env = { ...env, OPENAI_BASE_URL: PRIMARY };
    delete process.env.OPENAI_BASE_URL_ALT;
  });
  afterEach(() => {
    process.env = env;
    vi.restoreAllMocks();
  });

  it("falls through to Chat on Responses non-ok and serves the Chat payload", async () => {
    const calls: Call[] = [];
    const fetchImpl = recordingStub(calls, (url) =>
      url.endsWith("/v1/responses")
        ? errStatus(500)
        : okJson(chatEnvelope({ why: "chat fallback why", bullets: ["c1"] })),
    );
    const out = await runLlmChain({
      prompt: "p",
      model: "gpt-4o-mini",
      temperature: 0.2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out.ok).toBe(true);
    expect(out.ok && out.step).toBe("chat-primary");
    expect(out.ok && out.payload).toMatchObject({ why: "chat fallback why" });
    expect(calls.map((c) => c.url)).toEqual([
      responsesUrl(PRIMARY),
      chatUrl(PRIMARY),
    ]);
  });

  it("falls through to Chat on malformed Responses payload", async () => {
    const calls: Call[] = [];
    const fetchImpl = recordingStub(calls, (url) =>
      url.endsWith("/v1/responses")
        ? { ...okJson("NOT-JSON{{{oops"), ok: true, status: 200 }
        : okJson(chatEnvelope({ why: "chat after malformed", bullets: [] })),
    );
    const out = await runLlmChain({
      prompt: "p",
      model: "gpt-4o-mini",
      temperature: 0.2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out.ok).toBe(true);
    expect(out.ok && out.step).toBe("chat-primary");
    expect(calls).toHaveLength(2);
  });
});

describe("llm chain alt-endpoint failover (VAL-CROSS-030)", () => {
  const env = process.env;
  beforeEach(() => {
    process.env = {
      ...env,
      OPENAI_BASE_URL: PRIMARY,
      OPENAI_BASE_URL_ALT: ALT,
    };
  });
  afterEach(() => {
    process.env = env;
    vi.restoreAllMocks();
  });

  it("attempts alt Responses after primary 403s; alt success wins", async () => {
    const calls: Call[] = [];
    const fetchImpl = recordingStub(calls, (url) => {
      if (url.startsWith(PRIMARY)) return errStatus(403);
      if (url.endsWith("/v1/responses"))
        return okJson(
          responsesEnvelope({ why: "alt responses why", bullets: ["a"] }),
        );
      return okJson(chatEnvelope({ why: "alt chat", bullets: [] }));
    });
    const out = await runLlmChain({
      prompt: "p",
      model: "gpt-4o-mini",
      temperature: 0.1,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out.ok).toBe(true);
    expect(out.ok && out.step).toBe("responses-alt");
    expect(calls.map((c) => c.url)).toEqual([
      responsesUrl(PRIMARY),
      chatUrl(PRIMARY),
      responsesUrl(ALT),
    ]);
  });

  it("reaches alt Chat when alt Responses fails; all-fail returns ok:false", async () => {
    const calls: Call[] = [];
    const fetchImpl = recordingStub(calls, (url) => {
      if (url.startsWith(PRIMARY)) return errStatus(403);
      if (url.endsWith("/v1/responses")) return errStatus(500);
      return okJson(
        chatEnvelope({ verdict: "supported", confidence: 0.9, reasoning: "r" }),
      );
    });
    const out = await runLlmChain({
      prompt: "p",
      model: "gpt-4o-mini",
      temperature: 0.1,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out.ok).toBe(true);
    expect(out.ok && out.step).toBe("chat-alt");
    expect(calls).toHaveLength(4);

    const failCalls: Call[] = [];
    const failImpl = recordingStub(failCalls, () => errStatus(500));
    const failed = await runLlmChain({
      prompt: "p",
      model: "gpt-4o-mini",
      temperature: 0.1,
      fetchImpl: failImpl as unknown as typeof fetch,
    });
    expect(failed).toEqual({ ok: false });
    expect(failCalls).toHaveLength(4);
  });

  it("empty ALT skips alt steps — single-endpoint behavior unchanged", async () => {
    delete process.env.OPENAI_BASE_URL_ALT;
    const calls: Call[] = [];
    const fetchImpl = recordingStub(calls, () => errStatus(500));
    const out = await runLlmChain({
      prompt: "p",
      model: "gpt-4o-mini",
      temperature: 0.2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out).toEqual({ ok: false });
    expect(calls.map((c) => c.url)).toEqual([
      responsesUrl(PRIMARY),
      chatUrl(PRIMARY),
    ]);
  });
});

describe("llm chain timeout + backoff + clamp (VAL-CROSS-031)", () => {
  const env = process.env;
  beforeEach(() => {
    process.env = { ...env, OPENAI_BASE_URL: PRIMARY };
    delete process.env.OPENAI_BASE_URL_ALT;
  });
  afterEach(() => {
    process.env = env;
    vi.restoreAllMocks();
  });

  it("config holds min/max/default with 10s default", () => {
    expect(llmConfig.timeoutMs.default).toBe(10000);
    expect(LLM_TIMEOUT_DEFAULT_MS).toBe(10000);
    expect(LLM_TIMEOUT_MIN_MS).toBe(llmConfig.timeoutMs.min);
    expect(LLM_TIMEOUT_MAX_MS).toBe(llmConfig.timeoutMs.max);
    expect(LLM_TIMEOUT_MIN_MS).toBeLessThan(LLM_TIMEOUT_DEFAULT_MS);
    expect(LLM_TIMEOUT_DEFAULT_MS).toBeLessThan(LLM_TIMEOUT_MAX_MS);
    // Base normalization: trailing /v1 never doubles, bare mock unaffected.
    expect(responsesUrl("https://api.openai.com/v1")).toBe(
      "https://api.openai.com/v1/responses",
    );
    expect(chatUrl("https://api.openai.com/v1/")).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
    expect(responsesUrl(PRIMARY)).toBe(`${PRIMARY}/v1/responses`);
  });

  it("wires the default-10s per-step abort via AbortSignal.timeout", async () => {
    const spy = vi.spyOn(AbortSignal, "timeout");
    const calls: Call[] = [];
    const fetchImpl = recordingStub(calls, () =>
      okJson(responsesEnvelope({ why: "w", bullets: [] })),
    );
    await runLlmChain({
      prompt: "p",
      model: "gpt-4o-mini",
      temperature: 0.2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(spy).toHaveBeenCalledWith(10000);
  });

  it("hung step aborts on its budget and the chain proceeds to the next step", async () => {
    const calls: Call[] = [];
    const chatPayload = chatEnvelope({ why: "post-hang chat", bullets: [] });
    const fetchImpl = recordingStub(calls, (url, init) =>
      url.endsWith("/v1/responses")
        ? hangingStep()(url, init)
        : okJson(chatPayload),
    );
    const started = Date.now();
    const out = await runLlmChain({
      prompt: "p",
      model: "gpt-4o-mini",
      temperature: 0.2,
      timeoutMs: 40,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    // Hung step aborted on its 40ms budget (+100ms backoff), chain served Chat.
    expect(Date.now() - started).toBeLessThan(5000);
    expect(out.ok).toBe(true);
    expect(out.ok && out.step).toBe("chat-primary");
    expect(calls).toHaveLength(2);
  });

  it("backs off between steps — full alt failure takes >= 3 backoffs", async () => {
    process.env.OPENAI_BASE_URL_ALT = ALT;
    const failImpl = recordingStub([], () => errStatus(500));
    const started = Date.now();
    const out = await runLlmChain({
      prompt: "p",
      model: "gpt-4o-mini",
      temperature: 0.2,
      timeoutMs: 5000,
      fetchImpl: failImpl as unknown as typeof fetch,
    });
    expect(out).toEqual({ ok: false });
    expect(LLM_CHAIN_BACKOFF_MS).toBeGreaterThan(0);
    expect(Date.now() - started).toBeGreaterThanOrEqual(
      3 * LLM_CHAIN_BACKOFF_MS - 50,
    );
  });

  it("clamps requested timeouts into [min,max]; default when untouched", () => {
    expect(resolveStepTimeout(undefined)).toBe(10000);
    expect(resolveStepTimeout(Number.NaN)).toBe(10000);
    expect(resolveStepTimeout(1)).toBe(LLM_TIMEOUT_MIN_MS);
    expect(resolveStepTimeout(999_999_999)).toBe(LLM_TIMEOUT_MAX_MS);
    expect(resolveStepTimeout(5000)).toBe(5000);
    expect(parseTimeoutParam(null)).toBeUndefined();
    expect(parseTimeoutParam("")).toBeUndefined();
    expect(parseTimeoutParam("abc")).toBeUndefined();
    expect(parseTimeoutParam("5000")).toBe(5000);
  });

  it("page/evidence fetch policy stays 3s — distinct from the 10s LLM budget", () => {
    expect(PAGE_TIMEOUT_MS).toBe(3000);
    expect(LLM_TIMEOUT_DEFAULT_MS).not.toBe(PAGE_TIMEOUT_MS);
  });

  it("caller abort throws AbortError so routes keep the 499 mapping", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      runLlmChain({
        prompt: "p",
        model: "gpt-4o-mini",
        temperature: 0.2,
        signal: ctrl.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
