/**
 * LLM failover chain (M11 — VAL-CROSS-028..031).
 *
 * Every LLM enrichment/verification step runs up to four attempts in fixed
 * order:
 *   Responses(primary) -> Chat(primary) -> Responses(alt) -> Chat(alt)
 *
 * ANY failure on a step (non-ok status including quota 403s, per-step
 * timeout, network error, malformed payload, refusal/incomplete) falls
 * through to the next step. First success wins; when every step fails the
 * caller applies its contracted fallback (score heuristic / check
 * fail-closed `unverified`) and increments `openai_fallback_total`.
 *
 * Budgets: each step enforces a configurable timeout (default 10s from
 * `config/llm.json`, server-clamped into [min, max]) via `AbortSignal`.
 * A short backoff separates steps. The page/evidence `fetchWithRetry`
 * 3s policy is untouched — this module uses raw fetch so the per-step
 * budget (not the 3s page constant) governs LLM calls and so transient
 * gateway failures fail over across modalities/endpoints instead of
 * retrying one URL.
 *
 * Responses calls send `store:false` + `include:["reasoning.encrypted_content"]`
 * (statelessness); if a gateway rejects the param the Chat fallback absorbs
 * it. Response parsing hand-rolls the `output_text` walk (skips `reasoning`
 * items, never assumes `output[0]`). Empty `OPENAI_BASE_URL_ALT` means
 * single-endpoint mode: alt steps are skipped, existing behavior unchanged.
 *
 * The chain never throws for step failures — it returns `{ok:false}`.
 * The only throw is a caller abort (`AbortError`), so routes keep their
 * 499 client-abort mapping while gateway stalls stay on the fail-closed
 * 200 path. Alt URLs and keys are read from env only and never logged.
 */

import llmConfigJson from "@/config/llm.json";

export type LlmStep =
  "responses-primary" | "chat-primary" | "responses-alt" | "chat-alt";

/**
 * Per-attempt timing (M12 VAL-WEB-021): one entry per chain step attempted,
 * in chain order. Recorded on BOTH success and all-fail results; chain
 * semantics (order, clamp, backoff, abort/499) are byte-identical — timing
 * capture is strictly additive. Routes forward these as
 * `provenance.llmTimings` only when a chain ran.
 */
export type LlmAttemptTiming = {
  step: LlmStep;
  /** Wall-clock ms for this single attempt (fetch + parse). */
  ms: number;
  /** Whether this attempt succeeded (first success wins the chain). */
  ok: boolean;
};

export type ChainOk = {
  ok: true;
  /** Parsed `Record` payload — routes apply their existing slice/clamp shaping. */
  payload: Record<string, unknown>;
  /** Provenance note: which step succeeded (first-success-wins). */
  step: LlmStep;
  /** Per-attempt timings, in chain order; winning entry has `ok: true`. */
  timings: LlmAttemptTiming[];
};

export type ChainFail = {
  ok: false;
  /** Per-attempt timings, in chain order; every entry has `ok: false`. */
  timings: LlmAttemptTiming[];
};

export type ChainOut = ChainOk | ChainFail;

type TimeoutRange = { min: number; max: number; default: number };

const FALLBACK_RANGE: TimeoutRange = { min: 1000, max: 30000, default: 10000 };

function numOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Timeout range from `config/llm.json`, defensively validated. */
function readRange(): TimeoutRange {
  const raw = (llmConfigJson as { timeoutMs?: Partial<TimeoutRange> | null })
    ?.timeoutMs;
  const min = numOr(raw?.min, FALLBACK_RANGE.min);
  const max = numOr(raw?.max, FALLBACK_RANGE.max);
  const def = numOr(raw?.default, FALLBACK_RANGE.default);
  if (!(min > 0) || !(max >= min) || !(def >= min) || !(def <= max)) {
    return FALLBACK_RANGE;
  }
  return { min, max, default: def };
}

const RANGE = readRange();

export const LLM_TIMEOUT_MIN_MS = RANGE.min;
export const LLM_TIMEOUT_MAX_MS = RANGE.max;
export const LLM_TIMEOUT_DEFAULT_MS = RANGE.default;

/** Backoff delay between chain steps (ms). Exported for test pinning. */
export const LLM_CHAIN_BACKOFF_MS = 100;

const PRIMARY_FALLBACK = "https://api.openai.com/v1";

/**
 * Clamp a requested per-step timeout into `[min, max]`; `undefined` (or
 * non-finite) yields the configured default (10s).
 */
export function resolveStepTimeout(requestedMs?: number): number {
  if (requestedMs === undefined || !Number.isFinite(requestedMs)) {
    return LLM_TIMEOUT_DEFAULT_MS;
  }
  return Math.min(
    LLM_TIMEOUT_MAX_MS,
    Math.max(LLM_TIMEOUT_MIN_MS, requestedMs),
  );
}

/** Parse the optional client timeout param; chain clamps it into range. */
export function parseTimeoutParam(
  raw: string | null | undefined,
): number | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Normalize a configured base before appending an API path: strip trailing
 * slashes and one trailing `/v1` so a default base (`.../v1`) never becomes
 * `/v1/v1/...`. A bare mock base (`http://127.0.0.1:8787`) is unaffected.
 */
function normalizeLlmBase(base: string): string {
  return base.replace(/\/+$/, "").replace(/\/v1$/, "");
}

export function responsesUrl(base: string): string {
  return `${normalizeLlmBase(base)}/v1/responses`;
}

export function chatUrl(base: string): string {
  return `${normalizeLlmBase(base)}/v1/chat/completions`;
}

function abortError(): Error {
  return Object.assign(new Error("aborted"), { name: "AbortError" });
}

function combineSignals(
  caller: AbortSignal | null | undefined,
  step: AbortSignal,
): AbortSignal {
  if (!caller) return step;
  const anyFn = (
    AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }
  ).any;
  if (typeof anyFn === "function") return anyFn([caller, step]);
  return caller.aborted ? caller : step;
}

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Hand-rolled `output_text` walk: skips `reasoning` items, never `output[0]`. */
function extractOutputText(output: unknown): string | undefined {
  if (!Array.isArray(output)) return undefined;
  for (const item of output) {
    const typed = item as { type?: string; content?: unknown };
    if (typed?.type !== "message") continue;
    if (!Array.isArray(typed.content)) continue;
    for (const part of typed.content) {
      const p = part as { type?: string; text?: unknown };
      if (p?.type === "output_text" && typeof p.text === "string" && p.text) {
        return p.text;
      }
    }
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function parseResponsesPayload(
  envelope: unknown,
): Record<string, unknown> | undefined {
  const body = envelope as { status?: string; output?: unknown } | null;
  // Refusal/incomplete responses fail the step (never terminal for the chain).
  if (!body || body.status === "incomplete" || body.status === "failed") {
    return undefined;
  }
  const text = extractOutputText(body.output);
  if (!text) return undefined;
  return asRecord(JSON.parse(text) as unknown);
}

function parseChatPayload(
  envelope: unknown,
): Record<string, unknown> | undefined {
  const content = (
    envelope as { choices?: { message?: { content?: unknown } }[] } | null
  )?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content) return undefined;
  return asRecord(JSON.parse(content) as unknown);
}

export type RunChainOptions = {
  prompt: string;
  model: string;
  /** Low temperature ported per caller (0.2 score, 0.1 check). */
  temperature: number;
  maxOutputTokens?: number;
  /** Caller (request) signal: abort propagates immediately, no more steps. */
  signal?: AbortSignal | null;
  /** Requested per-step timeout ms; clamped into config range. */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type StepDef = { step: LlmStep; url: string; kind: "responses" | "chat" };

function buildSteps(): StepDef[] {
  const primary =
    (process.env.OPENAI_BASE_URL ?? PRIMARY_FALLBACK).trim() ||
    PRIMARY_FALLBACK;
  const steps: StepDef[] = [
    {
      step: "responses-primary",
      url: responsesUrl(primary),
      kind: "responses",
    },
    { step: "chat-primary", url: chatUrl(primary), kind: "chat" },
  ];
  const alt = (process.env.OPENAI_BASE_URL_ALT ?? "").trim();
  if (alt) {
    steps.push(
      { step: "responses-alt", url: responsesUrl(alt), kind: "responses" },
      { step: "chat-alt", url: chatUrl(alt), kind: "chat" },
    );
  }
  return steps;
}

function stepBody(
  kind: "responses" | "chat",
  opts: Pick<
    RunChainOptions,
    "prompt" | "model" | "temperature" | "maxOutputTokens"
  >,
): Record<string, unknown> {
  if (kind === "responses") {
    return {
      model: opts.model,
      input: [{ role: "user", content: opts.prompt }],
      text: { format: { type: "json_object" } },
      temperature: opts.temperature,
      max_output_tokens: opts.maxOutputTokens ?? 512,
      store: false,
      include: ["reasoning.encrypted_content"],
    };
  }
  return {
    model: opts.model,
    temperature: opts.temperature,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: opts.prompt }],
  };
}

/**
 * Run the failover chain. Returns the first success with its provenance
 * step, or `{ok:false}` when every step fails. Throws `AbortError` only
 * when the caller's own signal aborted (route maps to 499).
 */
export async function runLlmChain(opts: RunChainOptions): Promise<ChainOut> {
  const {
    prompt,
    model,
    temperature,
    maxOutputTokens = 512,
    signal = null,
    timeoutMs,
    fetchImpl = fetch,
  } = opts;
  const stepTimeout = resolveStepTimeout(timeoutMs);
  const steps = buildSteps();
  // M12 nerd timer: per-attempt wall-clock timings, recorded additively.
  // Chain control flow below is untouched (first-success-wins, backoff,
  // abort/499); timing entries only observe each attempt.
  const timings: LlmAttemptTiming[] = [];

  for (let i = 0; i < steps.length; i++) {
    const def = steps[i];
    if (signal?.aborted) throw abortError();
    if (i > 0) {
      try {
        await sleep(LLM_CHAIN_BACKOFF_MS, signal);
      } catch (e) {
        throw e;
      }
      if (signal?.aborted) throw abortError();
    }
    const attemptStart = Date.now();
    const recordAttempt = (ok: boolean) => {
      timings.push({
        step: def.step,
        ms: Math.max(0, Date.now() - attemptStart),
        ok,
      });
    };
    try {
      const combined = combineSignals(signal, AbortSignal.timeout(stepTimeout));
      const res = await fetchImpl(def.url, {
        method: "POST",
        signal: combined,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
        },
        body: JSON.stringify(
          stepBody(def.kind, { prompt, model, temperature, maxOutputTokens }),
        ),
      });
      if (!res.ok) {
        // Drain to free the socket; status (incl. quota 403s) fails the step.
        await res.text().catch(() => "");
        recordAttempt(false);
        continue;
      }
      const text = await res.text();
      const payload =
        def.kind === "responses"
          ? parseResponsesPayload(JSON.parse(text) as unknown)
          : parseChatPayload(JSON.parse(text) as unknown);
      if (payload) {
        recordAttempt(true);
        return { ok: true, payload, step: def.step, timings };
      }
      // Malformed/empty payload fails the step — next step is attempted.
      recordAttempt(false);
    } catch (e) {
      // Caller abort propagates immediately (499 path); every other error
      // (step timeout, network, parse) fails the step — next step attempted.
      // Note: the step-timeout abort is never rethrown even when no caller
      // signal exists; it is a step failure, not a client abort.
      if (signal?.aborted) throw abortError();
      recordAttempt(false);
    }
  }
  return { ok: false, timings };
}
