/**
 * Bounded fetch with timeout, retry, and circuit breaker.
 *
 * - Timeout 3s per attempt via AbortSignal.timeout(3000).
 * - 2 retries (3 attempts total) with exponential backoff 200/400ms + jitter.
 * - Retries network errors, 5xx, and 429. Other 4xx returns without retry.
 * - In-memory circuit breaker: after a call exhausts all attempts the host
 *   breaker opens for 30s; while open, calls short-circuit with
 *   CircuitOpenError (no fetch). After 30s a half-open probe is allowed.
 * - Caller's AbortSignal is forwarded and combined with the timeout signal;
 *   aborts propagate immediately as AbortError with no retry.
 */

import { logger } from "./logger";

const breaker = new Map<string, number>(); // host -> openUntil ms epoch

export const TIMEOUT_MS = 3000;
export const MAX_RETRIES = 2;
export const BREAKER_MS = 30_000;
export const BACKOFF_BASE_MS = 200;
const BACKOFF_JITTER_MS = 100;
const BACKOFF_CAP_MS = 1000;

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function isAbortError(e: unknown): boolean {
  return (e as Error)?.name === "AbortError";
}

/**
 * Timeout-originated error classifier (m10 timeout-classification fix).
 *
 * `AbortSignal.timeout()` (the 3s per-attempt timeout above) aborts with a
 * `TimeoutError` DOMException ("The operation was aborted due to timeout"),
 * NOT an `AbortError`. The message contains "aborted", so naive `/abort/i`
 * matching in the route handlers misroutes gateway stalls to the
 * client-abort (499) path instead of the contracted fail-closed 200
 * fallback. Route handlers must check `isTimeoutError` FIRST and take the
 * heuristic/fail-closed fallback; genuine client aborts keep the name
 * `AbortError` and still map to 499. No timeout/retry/breaker values change.
 */
export function isTimeoutError(e: unknown): boolean {
  const err = e as Error | undefined;
  if (err?.name === "TimeoutError") return true;
  const cause = (e as { cause?: unknown })?.cause as Error | undefined;
  if (cause?.name === "TimeoutError") return true;
  const msg = err?.message ?? "";
  // The TimeoutError message pairs both words ("aborted ... timeout");
  // requiring the pair keeps bare "aborted" (client abort) and bare
  // "timeout" (unrelated) errors on their existing paths.
  return /timeout/i.test(msg) && /abort/i.test(msg);
}

/** Exponential backoff 200/400ms plus jitter, capped under 1s. */
export function backoffMs(attempt: number): number {
  const base = BACKOFF_BASE_MS * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * BACKOFF_JITTER_MS);
  return Math.min(base + jitter, BACKOFF_CAP_MS);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) {
      if (signal.aborted) {
        clearTimeout(t);
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        return;
      }
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        },
        { once: true },
      );
    }
  });
}

function combineSignals(
  a?: AbortSignal | null,
  b?: AbortSignal | null,
): AbortSignal | undefined {
  if (!a && !b) return undefined;
  if (a && !b) return a;
  if (!a && b) return b;
  // both present
  // Node 20+ has AbortSignal.any
  const anyFn = (
    AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }
  ).any;
  if (typeof anyFn === "function") {
    return anyFn([a as AbortSignal, b as AbortSignal]);
  }
  // fallback manual
  const ctrl = new AbortController();
  const onAbort = () =>
    ctrl.abort((a as AbortSignal).reason ?? (b as AbortSignal).reason);
  a!.addEventListener("abort", onAbort, { once: true });
  b!.addEventListener("abort", onAbort, { once: true });
  if (a!.aborted || b!.aborted) ctrl.abort();
  return ctrl.signal;
}

function shouldRetryStatus(status: number): boolean {
  return status >= 500 || status === 429;
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit & { timeoutMs?: number; retries?: number } = {},
): Promise<Response> {
  const {
    timeoutMs = TIMEOUT_MS,
    retries = MAX_RETRIES,
    signal: callerSignal,
    ...rest
  } = init;
  const host = hostOf(url);

  const openUntil = breaker.get(host);
  if (openUntil && Date.now() < openUntil) {
    logger.warn(
      { breaker: "open", host, openUntil },
      "breaker:open — short-circuit, no fetch",
    );
    throw Object.assign(new Error(`circuit open for ${host}`), {
      name: "CircuitOpenError",
    });
  }
  // Half-open probe: stale entry expired, allow one attempt through.
  if (openUntil) breaker.delete(host);

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (callerSignal?.aborted) {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    }

    const timeoutSignal =
      typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(timeoutMs)
        : undefined;

    // fallback timeout signal polyfill if not available
    let timeoutCtrl: AbortController | undefined;
    let effectiveTimeoutSignal: AbortSignal | undefined = timeoutSignal;
    if (!timeoutSignal) {
      timeoutCtrl = new AbortController();
      effectiveTimeoutSignal = timeoutCtrl.signal;
      setTimeout(
        () =>
          timeoutCtrl!.abort(
            Object.assign(new Error("timeout"), { name: "AbortError" }),
          ),
        timeoutMs,
      );
    }

    const signal = combineSignals(
      callerSignal ?? null,
      effectiveTimeoutSignal ?? null,
    );

    try {
      const res = await fetch(url, { ...rest, signal });

      // Retry on 5xx and 429 only; other 4xx/2xx return without retry.
      if (shouldRetryStatus(res.status) && attempt < retries) {
        lastError = new Error(`retry on ${res.status}`);
        await res.arrayBuffer().catch(() => undefined);
        await sleep(backoffMs(attempt), callerSignal ?? undefined);
        continue;
      }

      // Exhausted retries on retryable status — open breaker and throw so
      // callers map to heuristic/fail-closed fallback (never a fake 200).
      if (shouldRetryStatus(res.status)) {
        breaker.set(host, Date.now() + BREAKER_MS);
        logger.warn(
          { breaker: "open", host, status: res.status },
          "breaker:open — retryable status exhausted",
        );
        await res.arrayBuffer().catch(() => undefined);
        throw Object.assign(new Error(`retry on ${res.status} exhausted`), {
          name: "RetryExhaustedError",
        });
      }

      // success (including non-retryable 4xx/2xx) — clear breaker
      breaker.delete(host);
      return res;
    } catch (e) {
      // Own exhaustion throw from the try block above — already logged + open.
      if ((e as Error)?.name === "RetryExhaustedError") throw e;
      lastError = e;
      if (isAbortError(e)) {
        // do not retry on abort, propagate immediately
        throw e;
      }
      // check if circuit error already
      if ((e as Error)?.name === "CircuitOpenError") throw e;

      if (attempt < retries) {
        try {
          await sleep(backoffMs(attempt), callerSignal ?? undefined);
        } catch (sleepErr) {
          throw sleepErr;
        }
        continue;
      }
      // last attempt failed — open breaker
      breaker.set(host, Date.now() + BREAKER_MS);
      logger.warn(
        { breaker: "open", host, err: String(lastError) },
        "breaker:open — attempts exhausted",
      );
      throw lastError;
    } finally {
      if (timeoutCtrl) {
        // no cleanup needed
      }
    }
  }
  throw lastError;
}

export function _resetBreakerForTest() {
  breaker.clear();
}

export function _getBreaker() {
  return breaker;
}
