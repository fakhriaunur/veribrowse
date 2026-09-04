import { describe, it, expect, vi, afterEach } from "vitest";
import { createFetchMemo } from "@/lib/fetchMemo";
import { _resetBreakerForTest } from "@/lib/fetchWithRetry";
import { GET as scoreGet } from "@/app/api/score/route";
import { GET as checkGet } from "@/app/api/check/route";

// Per-request server fetch memo (VAL-CROSS-025): duplicate URL fetches
// within one request collapse to one; the memo evaporates with the
// request (fresh fetch on the next request); `no-store` holds.

function countingStub(bodies: Record<string, string>, counter: { n: number }) {
  return vi.fn(async (url: string) => {
    counter.n += 1;
    return new Response(
      bodies[url] ??
        `<html><head><title>T</title></head><body>text for ${url}</body></html>`,
      { status: 200 },
    );
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  _resetBreakerForTest();
});

describe("per-request fetch memo", () => {
  it("collapses concurrent duplicate URL fetches to one", async () => {
    const counter = { n: 0 };
    const fetchMemo = createFetchMemo(
      countingStub({ "https://example.com/a": "<html>A</html>" }, counter),
    );
    const [a, b] = await Promise.all([
      fetchMemo("https://example.com/a"),
      fetchMemo("https://example.com/a"),
    ]);
    expect(counter.n).toBe(1);
    expect(await a.text()).toBe(await b.text());
  });

  it("collapses sequential duplicate URL fetches to one", async () => {
    const counter = { n: 0 };
    const fetchMemo = createFetchMemo(countingStub({}, counter));
    await (await fetchMemo("https://example.com/a")).text();
    await (await fetchMemo("https://example.com/a")).text();
    expect(counter.n).toBe(1);
  });

  it("memo evaporates with the request — fresh memo refetches", async () => {
    const counter = { n: 0 };
    const stub = countingStub({}, counter);
    await (await createFetchMemo(stub)("https://example.com/a")).text();
    await (await createFetchMemo(stub)("https://example.com/a")).text();
    expect(counter.n).toBe(2);
  });

  it("different URLs fetch independently", async () => {
    const counter = { n: 0 };
    const fetchMemo = createFetchMemo(countingStub({}, counter));
    await (await fetchMemo("https://example.com/a")).text();
    await (await fetchMemo("https://example.com/b")).text();
    expect(counter.n).toBe(2);
  });

  it("non-GET requests bypass the memo", async () => {
    const counter = { n: 0 };
    const fetchMemo = createFetchMemo(countingStub({}, counter));
    await fetchMemo("https://example.com/a", { method: "POST", body: "{}" });
    await fetchMemo("https://example.com/a", { method: "POST", body: "{}" });
    expect(counter.n).toBe(2);
  });

  it("shares the reference when the stub has no clone()", async () => {
    // Plain-object stubs (as used by older route tests) carry no clone —
    // the memo must still collapse to one fetch, not throw.
    let n = 0;
    const stub = vi.fn(async (url: string) => {
      n += 1;
      return {
        status: 200,
        url,
        text: async () => "<html>stub</html>",
      } as unknown as Response;
    });
    const fetchMemo = createFetchMemo(stub);
    await fetchMemo("https://example.com/a");
    await fetchMemo("https://example.com/a");
    expect(n).toBe(1);
  });

  it("score route fetches the page once and keeps no-store", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const stub = vi.fn(
      async () =>
        new Response(
          '<html><head><title>Memo Page</title><meta property="og:description" content="Memo desc"></head><body>hi</body></html>',
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", stub);
    const res = await scoreGet(
      new Request(
        "http://localhost/api/score?url=https://memo-score.example/page",
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(stub).toHaveBeenCalledTimes(1);
  });

  it("check route fetches evidence once and keeps no-store", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const stub = vi.fn(
      async () =>
        new Response(
          "<html><head><title>Memo Evidence</title></head><body>quoted evidence text here</body></html>",
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", stub);
    const res = await checkGet(
      new Request(
        "http://localhost/api/check?claim=this%20claim%20has%20enough%20length%20for%20validation&contextUrl=https://memo-check.example/evidence",
      ),
    );
    const json = (await res.json()) as { evidence: unknown[] };
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(json.evidence).toHaveLength(1);
    expect(stub).toHaveBeenCalledTimes(1);
  });
});
