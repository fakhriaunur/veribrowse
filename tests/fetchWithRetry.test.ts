import { describe, it, expect, vi, afterEach } from "vitest";
import {
  fetchWithRetry,
  backoffMs,
  TIMEOUT_MS,
  MAX_RETRIES,
  BREAKER_MS,
  BACKOFF_BASE_MS,
  _resetBreakerForTest,
  _getBreaker,
} from "@/lib/fetchWithRetry";
import { logger } from "@/lib/logger";

function okResponse(body = "ok", status = 200): Response {
  return new Response(body, { status });
}

/** Fetch stub that hangs until the passed signal aborts (like real fetch). */
function hangingFetch() {
  return vi.fn((_url: string, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal as AbortSignal | undefined;
      if (!signal) return; // hangs forever — only used with timeout signal
      if (signal.aborted) {
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        return;
      }
      signal.addEventListener(
        "abort",
        () => {
          reject(
            Object.assign(new Error("This operation was aborted"), {
              name: "AbortError",
            }),
          );
        },
        { once: true },
      );
    });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  _resetBreakerForTest();
});

describe("fetchWithRetry policy constants", () => {
  it("uses 3s timeout per attempt, 2 retries, 30s breaker", () => {
    expect(TIMEOUT_MS).toBe(3000);
    expect(MAX_RETRIES).toBe(2);
    expect(BREAKER_MS).toBe(30_000);
    expect(BACKOFF_BASE_MS).toBe(200);
  });

  it("backoffMs is exponential 200/400ms plus jitter, capped under 1s", () => {
    for (let i = 0; i < 25; i++) {
      const d0 = backoffMs(0);
      expect(d0).toBeGreaterThanOrEqual(200);
      expect(d0).toBeLessThan(300);
      const d1 = backoffMs(1);
      expect(d1).toBeGreaterThanOrEqual(400);
      expect(d1).toBeLessThan(500);
      expect(backoffMs(10)).toBeLessThanOrEqual(1000);
    }
  });
});

describe("fetchWithRetry timeout", () => {
  it("aborts after the default 3s timeout", async () => {
    const fetchMock = hangingFetch();
    vi.stubGlobal("fetch", fetchMock);
    const start = Date.now();
    await expect(
      fetchWithRetry("https://example.com/slow", { retries: 0 }),
    ).rejects.toMatchObject({ name: "AbortError" });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(2800);
    expect(elapsed).toBeLessThan(6000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }, 10000);

  it("honours a custom short timeout", async () => {
    const fetchMock = hangingFetch();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchWithRetry("https://example.com/slow", {
        timeoutMs: 50,
        retries: 0,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("fetchWithRetry retries", () => {
  it("retries twice then succeeds (3 attempts total)", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom-1"))
      .mockRejectedValueOnce(new Error("boom-2"))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithRetry("https://example.com/flaky");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("opens the breaker after exhausting all attempts", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("down"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchWithRetry("https://example.com/down")).rejects.toThrow(
      "down",
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(_getBreaker().has("example.com")).toBe(true);
  });

  it("retries 5xx then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okResponse("err", 500))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithRetry("https://example.com/unstable");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry plain 4xx (400 returns immediately)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse("bad", 400));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithRetry("https://example.com/bad");
    expect(res.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(_getBreaker().has("example.com")).toBe(false);
  });

  it("retries 429 but not other 4xx, then throws when exhausted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse("slow", 429));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchWithRetry("https://example.com/ratelimited"),
    ).rejects.toThrow(/429/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(_getBreaker().has("example.com")).toBe(true);
  });

  it("propagates caller abort immediately without retry", async () => {
    const fetchMock = hangingFetch();
    vi.stubGlobal("fetch", fetchMock);
    const ctrl = new AbortController();
    const pending = fetchWithRetry("https://example.com/abort", {
      signal: ctrl.signal,
    });
    setTimeout(() => ctrl.abort(), 20);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("fetchWithRetry circuit breaker", () => {
  it("short-circuits without fetch when open and logs breaker:open", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn().mockRejectedValue(new Error("down"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchWithRetry("https://example.com/outage", { retries: 0 }),
    ).rejects.toThrow("down");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Second call short-circuits: fetch not invoked again.
    await expect(
      fetchWithRetry("https://example.com/outage", { retries: 0 }),
    ).rejects.toMatchObject({ name: "CircuitOpenError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      warnSpy.mock.calls.some(
        (c) => (c[0] as { breaker?: string }).breaker === "open",
      ),
    ).toBe(true);
  });

  it("half-open probe goes through after 30s", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchWithRetry("https://example.com/recover", { retries: 0 }),
    ).rejects.toThrow("down");
    expect(_getBreaker().has("example.com")).toBe(true);
    const openedAt = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(openedAt + 31_000);
    const res = await fetchWithRetry("https://example.com/recover", {
      retries: 0,
    });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(_getBreaker().has("example.com")).toBe(false);
  });

  it("tracks breakers per host", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("down"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchWithRetry("https://a.example/out", { retries: 0 }),
    ).rejects.toThrow();
    expect(_getBreaker().has("a.example")).toBe(true);
    expect(_getBreaker().has("b.example")).toBe(false);
  });
});
