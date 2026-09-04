import { NextResponse } from "next/server";
import { scoreWebsiteSchema } from "@/lib/schemas";
import { buildTrustScore, type FetchMeta } from "@/lib/score";
import { withRequestId } from "@/lib/logger";
import { fetchWithRetry, isTimeoutError } from "@/lib/fetchWithRetry";
import {
  runLlmChain,
  parseTimeoutParam,
  resolveStepTimeout,
  type ChainOk,
} from "@/lib/llm";
import { createFetchMemo } from "@/lib/fetchMemo";
import { inc } from "@/lib/metrics";

export const runtime = "nodejs";

const OPENAI_MODEL_FALLBACK = "gpt-4o-mini";

function hashBytes(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++)
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(16).padStart(8, "0");
}

function isAbortError(e: unknown): boolean {
  // Timeout-originated errors (TimeoutError from AbortSignal.timeout) are
  // NEVER client aborts: exempt them so gateway stalls fall through to the
  // heuristic 200 fallback instead of the 499 abort path below.
  if (isTimeoutError(e)) return false;
  const name = (e as Error)?.name ?? "";
  const msg = (e as Error)?.message ?? "";
  return name === "AbortError" || /abort/i.test(name) || /abort/i.test(msg);
}

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
  };
  // tracing stub: traceparent passthrough — accepted without error, logged if present
  const log = withRequestId(requestId);

  // Per-request fetch memo (VAL-CROSS-025): duplicate page-URL fetches in
  // this request collapse to one. Created fresh here, evaporates with the
  // request — no cross-request cache, `cache-control: no-store` holds.
  const fetchMemo = createFetchMemo();

  // 499 abort shape (VAL-API-029): {error:"aborted"} + warn log with durationMs/requestId
  // NOTE: helper body must construct the response directly (never call abort()).
  const abort = () => {
    log.warn(
      {
        requestId,
        traceparent,
        hasKey,
        durationMs: Math.max(1, Date.now() - start),
        aborted: true,
      },
      "score aborted",
    );
    return NextResponse.json({ error: "aborted" }, { status: 499, headers });
  };

  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");
    const fixture = searchParams.get("fixture");

    if (fixture === "1") {
      if (!url) {
        log.warn(
          {
            requestId,
            traceparent,
            hasKey,
            durationMs: Math.max(1, Date.now() - start),
          },
          "score 400 — missing url",
        );
        return NextResponse.json(
          { error: "Missing url query param" },
          { status: 400, headers },
        );
      }
      const parsedFix = scoreWebsiteSchema.safeParse({ url });
      if (!parsedFix.success) {
        log.warn(
          {
            requestId,
            traceparent,
            hasKey,
            durationMs: Math.max(1, Date.now() - start),
          },
          "score 400 — invalid url",
        );
        return NextResponse.json(
          {
            error: "Invalid url — must be a valid http(s) URL",
            details: parsedFix.error.flatten(),
            issues: parsedFix.error.issues,
          },
          { status: 400, headers },
        );
      }
      const meta: FetchMeta = {
        url: url ?? "https://example.com",
        title: "Example Domain",
        ogDescription: "Fixture description for deterministic replay",
        finalUrl: url ?? "https://example.com",
        status: 200,
        contentHash: hashBytes("fixture-example"),
        retrievedAt: "2026-01-01T00:00:00.000Z",
        domainAgeDays: 400,
        hasHttps: true,
      };
      const raw = buildTrustScore(meta, {
        why: "Fixture — deterministic",
        bullets: ["Fixture — use for replay"],
      });
      // Fixture trust pinned to 42 (caution) for deterministic contract VAL-API-006 — stable across calls ignoring retrievedAt
      // Rebuild elderlySummary to match pinned trust/level
      const result = {
        ...raw,
        trust: 42,
        level: "caution" as const,
        elderlySummary: `⚠️ Score 42/100 — CAUTION. Be careful. Double-check before sharing personal info or paying. Why: ${raw.why}`,
      };
      inc("score_requests_total");
      log.info(
        {
          requestId,
          traceparent,
          url: meta.url,
          trust: result.trust,
          level: result.level,
          hasKey,
          durationMs: Math.max(1, Date.now() - start),
        },
        "score fixture",
      );
      return NextResponse.json(result, { status: 200, headers });
    }

    if (!url) {
      log.warn(
        {
          requestId,
          traceparent,
          hasKey,
          durationMs: Math.max(1, Date.now() - start),
        },
        "score 400 — missing url",
      );
      return NextResponse.json(
        { error: "Missing url query param" },
        { status: 400, headers },
      );
    }

    const parsed = scoreWebsiteSchema.safeParse({ url });
    if (!parsed.success) {
      log.warn(
        {
          requestId,
          traceparent,
          hasKey,
          durationMs: Math.max(1, Date.now() - start),
        },
        "score 400 — invalid url",
      );
      return NextResponse.json(
        {
          error: "Invalid url — must be a valid http(s) URL",
          details: parsed.error.flatten(),
          issues: parsed.error.issues,
        },
        { status: 400, headers },
      );
    }

    if (req.signal.aborted) {
      return abort();
    }

    const signal = req.signal;

    let title: string | undefined;
    let ogDesc: string | undefined;
    let finalUrl = url;
    let status = 200;
    let hasHttps = url.startsWith("https://");
    try {
      const res = await fetchMemo(url, {
        signal,
        redirect: "follow",
        headers: { "user-agent": "VeriBrowse/0.1" },
      });
      status = res.status;
      finalUrl = (res as unknown as { url?: string }).url ?? url;
      const html = await res.text();
      const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (t) title = t[1].trim().slice(0, 120);
      const og = html.match(
        /property=["']og:description["'][^>]*content=["']([^"']+)["']/i,
      );
      if (og) ogDesc = og[1].trim().slice(0, 200);
    } catch (e) {
      // Timeout-originated stall: not a client abort — fall through to the
      // minimal-meta heuristic 200 below (isAbortError already exempts
      // TimeoutError; the String(e) test needs the same guard because the
      // TimeoutError message contains "aborted").
      if (
        !isTimeoutError(e) &&
        (isAbortError(e) || signal.aborted || /abort/i.test(String(e)))
      ) {
        return abort();
      }
      log.warn(
        {
          requestId,
          url,
          err: String(e),
          hasKey,
          durationMs: Math.max(1, Date.now() - start),
        },
        "fetch failed — using minimal meta",
      );
    }

    if (signal.aborted) {
      return abort();
    }

    const raw = `${url}|${title ?? ""}`;
    const meta: FetchMeta = {
      url,
      title,
      ogDescription: ogDesc,
      finalUrl,
      status,
      contentHash: hashBytes(raw),
      retrievedAt: new Date().toISOString(),
      domainAgeDays: null,
      hasHttps,
    };

    let llm: { why: string; bullets: string[] } | undefined;
    let llmStep: ChainOk["step"] | undefined;
    if (hasKey) {
      try {
        const prompt = `You are VeriBrowse scam analyst. Score trust for URL=${meta.url} title="${meta.title ?? ""}" desc="${meta.ogDescription ?? ""}" hasHttps=${meta.hasHttps}. Return JSON {"why": string concise 20 words, "bullets": string[2]} explaining risk. No hallucinated citations.`;
        // Nerd-view LLM step-timeout control: client value clamped into
        // config range, default 10s when untouched. M11 chain tries
        // Responses(primary)->Chat(primary)->Responses(alt)->Chat(alt) on
        // ANY failure (non-ok incl. quota 403s, timeout, error, malformed
        // payload); first success wins, then existing shaping below.
        const stepTimeoutMs = resolveStepTimeout(
          parseTimeoutParam(searchParams.get("llmTimeoutMs")),
        );
        const chain = await runLlmChain({
          prompt,
          model: process.env.OPENAI_MODEL ?? OPENAI_MODEL_FALLBACK,
          temperature: 0.2,
          signal,
          timeoutMs: stepTimeoutMs,
        });
        if (signal.aborted) {
          return abort();
        }
        if (chain.ok) {
          const parsedLlm = chain.payload as {
            why?: string;
            bullets?: string[];
          };
          if (parsedLlm.why) {
            llm = {
              why: parsedLlm.why.slice(0, 200),
              bullets: (parsedLlm.bullets ?? [parsedLlm.why]).slice(0, 3),
            };
            llmStep = chain.step;
          } else {
            inc("openai_fallback_total");
            log.warn(
              {
                requestId,
                step: chain.step,
                hasKey,
                durationMs: Math.max(1, Date.now() - start),
                openai_fallback_total: 1,
              },
              "openai enrichment empty payload — fallback to heuristic",
            );
          }
          log.info(
            {
              requestId,
              url,
              llmWhy: llm?.why,
              llmStep,
              hasKey,
              durationMs: Math.max(1, Date.now() - start),
            },
            "openai enrichment ok",
          );
        } else {
          inc("openai_fallback_total");
          log.warn(
            {
              requestId,
              hasKey,
              durationMs: Math.max(1, Date.now() - start),
              openai_fallback_total: 1,
            },
            "openai enrichment failed — fallback to heuristic",
          );
        }
      } catch (e) {
        if (isAbortError(e) || signal.aborted) {
          return abort();
        }
        inc("openai_fallback_total");
        log.warn(
          {
            requestId,
            err: String(e),
            hasKey,
            durationMs: Math.max(1, Date.now() - start),
            openai_fallback_total: 1,
          },
          "openai call error — fallback",
        );
      }
    } else {
      log.info(
        {
          requestId,
          url,
          hasKey: false,
          durationMs: Math.max(1, Date.now() - start),
        },
        "score heuristic — no key",
      );
    }

    if (signal.aborted) {
      return abort();
    }

    // First-success-wins provenance: note which chain step succeeded.
    const scored = buildTrustScore(meta, llm);
    const result = llmStep
      ? {
          ...scored,
          provenance: { ...scored.provenance, llmStep },
        }
      : scored;
    inc("score_requests_total");
    log.info(
      {
        requestId,
        traceparent,
        url,
        trust: result.trust,
        level: result.level,
        hasKey,
        durationMs: Math.max(1, Date.now() - start),
        llmWhy: llm?.why,
        llmStep,
      },
      "score computed",
    );
    return NextResponse.json(result, { status: 200, headers });
  } catch (e) {
    if (isAbortError(e)) {
      return abort();
    }
    log.error(
      {
        requestId,
        err: String(e),
        hasKey,
        durationMs: Math.max(1, Date.now() - start),
      },
      "score unexpected error — fallback to heuristic error shape",
    );
    return NextResponse.json(
      { error: "internal fallback", details: String(e) },
      { status: 200, headers },
    );
  }
}
