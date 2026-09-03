import { describe, it, expect } from "vitest";
import { verifyClaimPure } from "@/lib/claim";

describe("verifyClaimPure", () => {
  it("fail-closed when no evidence", () => {
    const r = verifyClaimPure({ claim: "miracle drug cures everything" }, []);
    expect(r.verdict).toBe("unverified");
    expect(r.evidence).toHaveLength(0);
    expect(r.elderlySummary).toMatch(/Not enough evidence/);
  });
  it("null evidence also unverified", () => {
    const r = verifyClaimPure({ claim: "hello world claim" }, null);
    expect(r.verdict).toBe("unverified");
  });
  it("returns supported when evidence and llm says so", () => {
    const r = verifyClaimPure(
      { claim: "test claim for verify" },
      [
        {
          url: "https://example.com",
          quote: "quote",
          contentHash: "abc",
          retrievedAt: new Date().toISOString(),
        },
      ],
      { verdict: "supported", confidence: 0.9, reasoning: "matches" },
    );
    expect(r.verdict).toBe("supported");
    expect(r.confidence).toBe(0.9);
  });
});
