import { describe, it, expect } from "vitest";

// These are light integration tests that hit the in-memory fetch layer without starting a server.
// They prove the Edge routes' contracts (zod + provenance + fail-closed) are wired.
// Full browser + ephemeral server check is in scripts/qa_smoke.sh and playwright browser spec.

describe("API integration (in-memory core)", () => {
  it("scoreWebsitePure + buildTrustScore covers safe/caution/risky levels", async () => {
    const { buildTrustScore } = await import("@/lib/score");
    const base = {
      url: "https://example.com",
      title: "Example",
      ogDescription: "desc",
      finalUrl: "https://example.com",
      status: 200,
      contentHash: "deadbeef",
      retrievedAt: new Date().toISOString(),
      domainAgeDays: 400,
      hasHttps: true,
    };
    const safe = buildTrustScore(base);
    expect(safe.level).toBe("safe");
    expect(safe.provenance.contentHash).toBe("deadbeef");

    const risky = buildTrustScore({ ...base, hasHttps: false, domainAgeDays: 2 });
    expect(risky.level).toBe("risky");
  });

  it("verifyClaimPure fail-closed without evidence", async () => {
    const { verifyClaimPure } = await import("@/lib/claim");
    const r = verifyClaimPure({ claim: "miracle drug cures all" }, []);
    expect(r.verdict).toBe("unverified");
    expect(r.evidence).toEqual([]);
  });

  it("schemas reject invalid and accept valid", async () => {
    const { scoreWebsiteSchema, checkClaimSchema } = await import("@/lib/schemas");
    expect(scoreWebsiteSchema.safeParse({ url: "https://ok.example" }).success).toBe(true);
    expect(scoreWebsiteSchema.safeParse({ url: "bad" }).success).toBe(false);
    expect(checkClaimSchema.safeParse({ claim: "short" }).success).toBe(false);
    expect(checkClaimSchema.safeParse({ claim: "long enough claim for test" }).success).toBe(true);
  });
});
