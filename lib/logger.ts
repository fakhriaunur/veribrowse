import pino from "pino";

// Tracing stub: accepts W3C traceparent header passthrough without OTel SDK.
// Future: when OTEL_EXPORTER_OTLP_ENDPOINT is set, initialize @opentelemetry/sdk-node
// and propagate traceparent -> span context. Until then X-Request-Id is primary correlation.

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  redact: {
    paths: [
      "OPENAI_API_KEY",
      "authorization",
      "req.headers.authorization",
      "headers.authorization",
      "*.apiKey",
      "*.token",
    ],
    remove: true,
  },
  base: { service: "veribrowse" },
});

export function withRequestId(requestId: string) {
  return logger.child({ requestId });
}
