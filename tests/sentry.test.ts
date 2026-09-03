import { describe, it, expect } from "vitest";
import { captureException, isSentryEnabled } from "@/lib/sentry";

describe("sentry stub", () => {
  it("is disabled by default (no SENTRY_DSN), captureException is a no-op", async () => {
    expect(process.env.SENTRY_DSN ?? "").toBe("");
    expect(isSentryEnabled()).toBe(false);
    await expect(
      captureException(new Error("boom"), { requestId: "test-1" }),
    ).resolves.toBeUndefined();
  });
});
