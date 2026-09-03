/**
 * Error-tracking stub (Sentry-compatible, disabled by default).
 *
 * - When `SENTRY_DSN` is empty/unset (the default, see `.env.example`),
 *   `captureException` is a no-op: no SDK is initialized and no network
 *   call is made on any error path.
 * - Enabling real error tracking requires setting `SENTRY_DSN` plus human
 *   approval and installing a Sentry SDK — see `docs/runbook.md` Triage.
 * - API routes currently log errors via pino (`lib/logger.ts`) and do not
 *   call this stub on the hot path; it exists as the single integration
 *   point for future wiring without changing call sites.
 */

function isEnabled(): boolean {
  return Boolean(process.env.SENTRY_DSN);
}

export async function captureException(
  err: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  if (!isEnabled()) return;
  // No Sentry SDK installed — log locally instead of sending anywhere.
  const { logger, withRequestId } = await import("./logger");
  const requestId =
    typeof context?.["requestId"] === "string"
      ? (context["requestId"] as string)
      : "unknown";
  withRequestId(requestId).warn(
    { err: String(err), context },
    "sentry stub: SDK not installed, error logged locally",
  );
  void logger;
}

export function isSentryEnabled(): boolean {
  return isEnabled();
}
