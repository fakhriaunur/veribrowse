import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req?: Request) {
  const requestId =
    req?.headers.get("x-request-id") ??
    req?.headers.get("X-Request-Id") ??
    crypto.randomUUID().slice(0, 8);
  const headers = {
    "X-Request-Id": requestId,
    "cache-control": "no-store",
  };
  const url = req ? new URL(req.url) : new URL("http://localhost/api/health");
  const verbose = url.searchParams.get("verbose") === "1";
  const base = { status: "ok", service: "veribrowse", version: "0.1.0" };
  if (verbose) {
    return NextResponse.json(
      {
        ...base,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers },
    );
  }
  return NextResponse.json(base, { status: 200, headers });
}
