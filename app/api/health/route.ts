import { NextResponse } from "next/server";
import { logger, withRequestId } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(req?: Request) {
  const start = Date.now();
  const requestId =
    req?.headers.get("x-request-id") ??
    req?.headers.get("X-Request-Id") ??
    crypto.randomUUID().slice(0, 8);
  const traceparent = req?.headers.get("traceparent") ?? undefined;
  const headers = {
    "X-Request-Id": requestId,
    "cache-control": "no-store",
  };
  const url = req ? new URL(req.url) : new URL("http://localhost/api/health");
  const verbose = url.searchParams.get("verbose") === "1";
  const base = { status: "ok", service: "veribrowse", version: "0.1.0" };
  const hasKey = !!process.env.OPENAI_API_KEY;
  const log = withRequestId(requestId);
  const durationMs = () => Date.now() - start;
  if (verbose) {
    const body = {
      ...base,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
    log.info(
      {
        requestId,
        traceparent,
        hasKey,
        durationMs: durationMs(),
        verbose: true,
      },
      "health verbose",
    );
    return NextResponse.json(body, { status: 200, headers });
  }
  // traceparent stub: accept without error, log if present, preserve X-Request-Id
  log.info(
    { requestId, traceparent, hasKey, durationMs: durationMs() },
    "health ok",
  );
  // also ensure pino base service field present via logger base
  void logger;
  return NextResponse.json(base, { status: 200, headers });
}
