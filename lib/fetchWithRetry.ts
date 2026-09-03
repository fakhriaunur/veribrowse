/**
 * Bounded fetch with timeout, retry, and circuit breaker.
 * Timeout 3s per attempt, 2 retries exponential, 30s breaker per host.
 * Signal propagation: caller's AbortSignal forwarded and combined with timeout.
 */

const breaker = new Map<string, number>(); // host -> openUntil ms
const BREAKER_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_RETRIES = 2;

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

export async function fetchWithRetry(
  url: string,
  init: RequestInit & { timeoutMs?: number; retries?: number } = {},
): Promise<Response> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    signal: callerSignal,
    ...rest
  } = init;
  const host = hostOf(url);

  const openUntil = breaker.get(host);
  if (openUntil && Date.now() < openUntil) {
    throw Object.assign(new Error(`circuit open for ${host}`), {
      name: "CircuitOpenError",
    });
  }

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

      // retry on 5xx
      if (res.status >= 500 && attempt < retries) {
        lastError = new Error(`retry on ${res.status}`);
        await sleep(100 * Math.pow(2, attempt), callerSignal ?? undefined);
        continue;
      }

      // success (including 4xx/2xx) — clear breaker
      breaker.delete(host);
      return res;
    } catch (e) {
      lastError = e;
      if (isAbortError(e)) {
        // do not retry on abort, propagate immediately
        throw e;
      }
      // check if circuit error already
      if ((e as Error)?.name === "CircuitOpenError") throw e;

      if (attempt < retries) {
        try {
          await sleep(100 * Math.pow(2, attempt), callerSignal ?? undefined);
        } catch (sleepErr) {
          throw sleepErr;
        }
        continue;
      }
      // last attempt failed — open breaker
      breaker.set(host, Date.now() + BREAKER_MS);
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
