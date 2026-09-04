/**
 * Per-request server fetch memo (VAL-CROSS-025).
 *
 * Duplicate GET fetches of the same URL within one request collapse to a
 * single underlying fetch. Each caller receives its own Response via
 * clone() so bodies stay independently readable — concurrent in-flight
 * duplicates share one pending promise.
 *
 * The memo is created fresh per request by the `app/api/score|check` GET
 * handlers and evaporates with it: no cross-request result cache exists,
 * and every response keeps `cache-control: no-store`, so the server stays
 * stateless. Only idempotent GETs are memoized — non-GET methods (e.g.
 * OpenAI POSTs) bypass the memo and always hit the underlying fetch.
 */

import { fetchWithRetry } from "./fetchWithRetry";

/** Create a fresh per-request memo. One memo per request — never shared. */
export function createFetchMemo(
  fetchImpl: (
    url: string,
    init?: RequestInit & { timeoutMs?: number; retries?: number },
  ) => Promise<Response> = fetchWithRetry,
): (url: string, init?: RequestInit) => Promise<Response> {
  const memo = new Map<string, Promise<Response>>();
  return (url: string, init: RequestInit = {}) => {
    if ((init.method ?? "GET").toUpperCase() !== "GET") {
      return fetchImpl(url, init);
    }
    const hit = memo.get(url);
    if (hit) return hit.then(cloneRes);
    const pending = fetchImpl(url, init);
    memo.set(url, pending);
    return pending.then(cloneRes);
  };
}

/** Hand out an independently readable copy of a memoized response. */
function cloneRes(res: Response): Response {
  // Plain-object fetch stubs in unit tests carry no clone() — share the
  // reference (their text() stubs are repeatable). Real Responses always
  // clone, so concurrent duplicate callers read independent bodies.
  if (typeof res.clone === "function") {
    try {
      return res.clone();
    } catch {
      return res;
    }
  }
  return res;
}
