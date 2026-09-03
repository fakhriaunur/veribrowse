import { describe, it, expect } from "vitest";
import {
  scoreWebsitePure,
  buildTrustScore,
  elderlySummarize,
} from "@/lib/score";
import type { FetchMeta } from "@/lib/score";

function meta(over: Partial<FetchMeta> = {}): FetchMeta {
  return {
    url: "https://example.com",
    title: "Example",
    ogDescription: "desc",
    finalUrl: "https://example.com",
    status: 200,
    contentHash: "abcd1234",
    retrievedAt: new Date().toISOString(),
    domainAgeDays: 400,
    hasHttps: true,
    ...over,
  };
}

describe("scoreWebsitePure", () => {
  it("scores safe with https and aged domain", () => {
    const r = scoreWebsitePure(meta());
    expect(r.trust).toBeGreaterThanOrEqual(70);
    expect(r.level).toBe("safe");
  });
  it("penalizes non-https", () => {
    const r = scoreWebsitePure(meta({ hasHttps: false }));
    expect(r.trust).toBeLessThan(60);
  });
  it("penalizes new domain", () => {
    const r = scoreWebsitePure(meta({ domainAgeDays: 5 }));
    expect(r.preWhy).toMatch(/Very new domain/);
  });
  it("elderlySummarize stays under 80 words", () => {
    const s = elderlySummarize(85, "safe", "Good");
    expect(s.split(/\s+/).length).toBeLessThan(80);
  });
  it("buildTrustScore includes provenance", () => {
    const s = buildTrustScore(meta());
    expect(s.provenance.contentHash).toBe("abcd1234");
    expect(s.elderlySummary).toContain("Score");
  });
});
