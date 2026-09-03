import pino from "pino";

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
      "req.headers.authorization",
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
