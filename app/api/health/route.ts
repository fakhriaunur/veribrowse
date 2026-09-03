import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    { status: "ok", service: "veribrowse", version: "0.1.0" },
    { status: 200 },
  );
}
