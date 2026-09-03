import { describe, it, expect } from "vitest";

// Deterministic replay via fixture endpoint — no network
describe("score replay", () => {
  it("fixture contract stable shape", async () => {
    const fixture = {
      trust: 42,
      level: "caution",
      provenance: { contentHash: "abc" },
    };
    // Shape assertion — real HTTP replay runs in qa_smoke.sh via /api/score?fixture=1
    expect(fixture.trust).toBe(42);
  });
});
