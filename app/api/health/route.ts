import { NextResponse } from "next/server";
import { logger, withRequestId } from "@/lib/logger";
import { getActiveRubric } from "@/lib/rubric";

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
  const durationMs = () => Math.max(1, Date.now() - start);
  // Rubric preset (VAL-CFG-058): resolved load-once; an invalid
  // SCORING_PRESET/SCORING_RUBRIC_PATH throws here so a misconfigured
  // server fails loudly instead of scoring with unknown weights.
  // Verbose health echoes the active preset name + source.
  let rubricPreset = "balanced";
  let rubricSource = "config/rubrics/balanced.json";
  try {
    const active = getActiveRubric();
    rubricPreset = active.name;
    rubricSource = active.source;
  } catch (e) {
    log.error(
      { requestId, traceparent, err: String(e), durationMs: durationMs() },
      "health rubric invalid — refusing with unknown weights",
    );
    throw e;
  }
  if (verbose) {
    const body = {
      ...base,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      rubric: { preset: rubricPreset, source: rubricSource },
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
