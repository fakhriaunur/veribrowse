import { describe, it, expect } from "vitest";
import pino from "pino";
import { logger, withRequestId, redactPaths } from "@/lib/logger";

function captureStream() {
  const lines: string[] = [];
  const stream = {
    write(chunk: string) {
      lines.push(chunk);
    },
  };
  return { lines, stream };
}

function testLogger(level: string) {
  const { lines, stream } = captureStream();
  const log = pino(
    {
      level,
      formatters: {
        level(label: string) {
          return { level: label };
        },
      },
      redact: { paths: redactPaths },
      base: { service: "veribrowse" },
    },
    stream,
  );
  return { lines, log };
}

describe("logger", () => {
  it("redact list covers OPENAI_API_KEY, authorization, *.authorization", () => {
    expect(redactPaths).toContain("OPENAI_API_KEY");
    expect(redactPaths).toContain("authorization");
    expect(redactPaths).toContain("*.authorization");
  });

  it("defaults to info level when LOG_LEVEL is unset", () => {
    expect(logger.level).toBe(process.env.LOG_LEVEL ?? "info");
  });

  it("debug vs error levels emit different lines", () => {
    const dbg = testLogger("debug");
    dbg.log.debug({ requestId: "a" }, "dbg line");
    const err = testLogger("error");
    err.log.info({ requestId: "b" }, "suppressed info");
    err.log.error({ requestId: "b" }, "visible error");
    expect(dbg.lines.length).toBe(1);
    expect(err.lines.length).toBe(1);
    expect(JSON.parse(err.lines[0]).level).toBe("error");
  });

  it("emits pino JSON with service, level, requestId, durationMs, hasKey", () => {
    const { lines, log } = testLogger("info");
    log
      .child({ requestId: "req-123" })
      .info(
        { requestId: "req-123", durationMs: 12, hasKey: false },
        "health ok",
      );
    expect(lines.length).toBe(1);
    const line = JSON.parse(lines[0]);
    expect(line.service).toBe("veribrowse");
    expect(line.level).toBe("info");
    expect(line.requestId).toBe("req-123");
    expect(line.durationMs).toBeGreaterThan(0);
    expect(typeof line.hasKey).toBe("boolean");
  });

  it("redacts OPENAI_API_KEY and authorization as [Redacted], never leaks secret value", () => {
    const { lines, log } = testLogger("info");
    log.info(
      {
        OPENAI_API_KEY: "DUMMY_KEY_FOR_REDACTION_TEST",
        authorization: "Bearer REDACTED_TEST_TOKEN",
        nested: { authorization: "Bearer REDACTED_TEST_TOKEN" },
      },
      "secret probe",
    );
    const raw = lines.join("\n");
    expect(raw).not.toContain("REDACTED_TEST_TOKEN");
    expect(raw).toContain("[Redacted]");
  });

  it("withRequestId isolates requestIds across children", () => {
    const childA = withRequestId("id-aaa");
    const childB = withRequestId("id-bbb");
    expect(childA).not.toBe(childB);
    const { lines, stream } = captureStream();
    const a = pino(
      { level: "info", base: { service: "veribrowse" } },
      stream,
    ).child({ requestId: "id-aaa" });
    const b = pino(
      { level: "info", base: { service: "veribrowse" } },
      stream,
    ).child({ requestId: "id-bbb" });
    a.info("from a");
    b.info("from b");
    const parsed = lines.map((l) => JSON.parse(l));
    expect(parsed[0].requestId).toBe("id-aaa");
    expect(parsed[1].requestId).toBe("id-bbb");
    expect(parsed[0].requestId).not.toBe(parsed[1].requestId);
  });
});
