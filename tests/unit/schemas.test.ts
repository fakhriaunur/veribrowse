import { describe, it, expect } from "vitest";
import { scoreWebsiteSchema, checkClaimSchema } from "@/lib/schemas";

describe("schemas", () => {
  it("scoreWebsite accepts valid url", () => {
    expect(
      scoreWebsiteSchema.safeParse({ url: "https://example.com" }).success,
    ).toBe(true);
  });
  it("scoreWebsite rejects bad url", () => {
    expect(scoreWebsiteSchema.safeParse({ url: "not-a-url" }).success).toBe(
      false,
    );
  });
  it("checkClaim rejects short claim", () => {
    expect(checkClaimSchema.safeParse({ claim: "hi" }).success).toBe(false);
  });
  it("checkClaim accepts with contextUrl", () => {
    expect(
      checkClaimSchema.safeParse({
        claim: "This is a valid claim text",
        contextUrl: "https://example.com",
      }).success,
    ).toBe(true);
  });
});
