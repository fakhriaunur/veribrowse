import { NextResponse } from "next/server";
import { toPrometheus } from "@/lib/metrics";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const requestId =
    req.headers.get("x-request-id") ??
    req.headers.get("X-Request-Id") ??
    crypto.randomUUID().slice(0, 8);
  const traceparent = req.headers.get("traceparent") ?? undefined;
  void traceparent;
  const headers = {
    "X-Request-Id": requestId,
    "cache-control": "no-store",
    "content-type": "text/plain; version=0.0.4",
  };
  const body = toPrometheus();
  return new NextResponse(body, { status: 200, headers });
}
