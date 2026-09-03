import { NextResponse } from "next/server";
import { toPrometheus } from "@/lib/metrics";
import { withRequestId } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const start = Date.now();
  const requestId =
    req.headers.get("x-request-id") ??
    req.headers.get("X-Request-Id") ??
    crypto.randomUUID().slice(0, 8);
  const traceparent = req.headers.get("traceparent") ?? undefined;
  const hasKey = !!process.env.OPENAI_API_KEY;
  const headers = {
    "X-Request-Id": requestId,
    "cache-control": "no-store",
    "content-type": "text/plain; version=0.0.4",
  };
  // tracing stub: traceparent passthrough — accepted without error, logged if present
  withRequestId(requestId).info(
    {
      requestId,
      traceparent,
      hasKey,
      durationMs: Math.max(1, Date.now() - start),
    },
    "metrics ok",
  );
  const body = toPrometheus();
  return new NextResponse(body, { status: 200, headers });
}
