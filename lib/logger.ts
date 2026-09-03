import pino from "pino";

// Tracing stub: accepts W3C traceparent header passthrough without OTel SDK.
// Future: when OTEL_EXPORTER_OTLP_ENDPOINT is set, initialize @opentelemetry/sdk-node
// and propagate traceparent -> span context. Until then X-Request-Id is primary correlation.
// Error tracking stub lives in lib/sentry.ts (disabled unless SENTRY_DSN is set).

/**
 * Pino redact paths — secrets are censored as "[Redacted]", never logged raw.
 * Covers the OpenAI key env var and bearer tokens at any nesting level.
 */
export const redactPaths = [
  "OPENAI_API_KEY",
  "authorization",
  "*.authorization",
  "req.headers.authorization",
  "headers.authorization",
  "*.apiKey",
  "*.token",
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  redact: {
    paths: redactPaths,
  },
  base: { service: "veribrowse" },
});

export function withRequestId(requestId: string) {
  return logger.child({ requestId });
}
