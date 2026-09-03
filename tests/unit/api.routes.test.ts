import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as healthGet } from "@/app/api/health/route";
import { GET as scoreGet } from "@/app/api/score/route";
import { GET as checkGet } from "@/app/api/check/route";

describe("API routes GET", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("health returns ok", async () => {
    const res = await healthGet();
    const json = (await res.json()) as { status: string };
    expect(json.status).toBe("ok");
  });

  it("score fixture returns trust", async () => {
    const req = new Request(
      "http://localhost/api/score?url=https://example.com&fixture=1",
    );
    const res = await scoreGet(req);
    const json = (await res.json()) as { trust: number; level: string };
    expect(json.trust).toBeDefined();
    expect(["safe", "caution", "risky"]).toContain(json.level);
  });

  it("score returns 400 on missing url", async () => {
    const req = new Request("http://localhost/api/score");
    const res = await scoreGet(req);
    expect(res.status).toBe(400);
  });

  it("score handles fetch with mocked HTML", async () => {
    const orig = global.fetch;
    // @ts-ignore
    global.fetch = vi.fn(async () => ({
      status: 200,
      url: "https://example.com",
      text: async () =>
        '<html><head><title>Test</title><meta property="og:description" content="desc"></head></html>',
    }));
    const req = new Request(
      "http://localhost/api/score?url=https://example.com",
    );
    const res = await scoreGet(req);
    const json = (await res.json()) as { trust: number };
    expect(json.trust).toBeDefined();
    global.fetch = orig;
  });

  it("check fixture returns verdict", async () => {
    const req = new Request(
      "http://localhost/api/check?claim=hello%20world%20claim%20text&fixture=1",
    );
    const res = await checkGet(req);
    const json = (await res.json()) as { verdict: string };
    expect(["supported", "contradicted", "unverified"]).toContain(json.verdict);
  });

  it("check returns 400 on missing claim", async () => {
    const req = new Request("http://localhost/api/check");
    const res = await checkGet(req);
    expect(res.status).toBe(400);
  });

  it("check fail-closed without contextUrl", async () => {
    const req = new Request(
      "http://localhost/api/check?claim=long%20enough%20claim%20text%20for%20test",
    );
    const res = await checkGet(req);
    const json = (await res.json()) as { verdict: string; evidence: unknown[] };
    expect(json.verdict).toBe("unverified");
    expect(json.evidence).toEqual([]);
  });
});
