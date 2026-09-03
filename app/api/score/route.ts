import { NextResponse } from "next/server";
import { scoreWebsiteSchema } from "@/lib/schemas";
import { buildTrustScore, type FetchMeta } from "@/lib/score";
import { withRequestId } from "@/lib/logger";
import { fetchWithRetry } from "@/lib/fetchWithRetry";
import { inc } from "@/lib/metrics";

export const runtime = "nodejs";

const OPENAI_BASE_URL_FALLBACK = "https://api.openai.com/v1";
const OPENAI_MODEL_FALLBACK = "gpt-4o-mini";

// Normalize the configured OpenAI base before appending the chat path: the
// default base already ends in /v1, so naive `${base}/v1/chat/completions`
// would hit /v1/v1/chat/completions (OpenAI 404 → silent fallback). Strip
// trailing slashes and one trailing /v1 segment first. A bare mock base
// (http://127.0.0.1:8787) is unaffected.
function openaiChatCompletionsUrl(base: string): string {
  return `${base.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1/chat/completions`;
}

function hashBytes(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++)
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(16).padStart(8, "0");
}

function isAbortError(e: unknown): boolean {
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
      const res = await fetchWithRetry(url, {
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
      if (isAbortError(e) || signal.aborted || /abort/i.test(String(e))) {
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
    if (hasKey) {
      try {
        const prompt = `You are VeriBrowse scam analyst. Score trust for URL=${meta.url} title="${meta.title ?? ""}" desc="${meta.ogDescription ?? ""}" hasHttps=${meta.hasHttps}. Return JSON {"why": string concise 20 words, "bullets": string[2]} explaining risk. No hallucinated citations.`;
        const baseUrl = process.env.OPENAI_BASE_URL ?? OPENAI_BASE_URL_FALLBACK;
        const res = await fetchWithRetry(openaiChatCompletionsUrl(baseUrl), {
          method: "POST",
          signal,
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL ?? OPENAI_MODEL_FALLBACK,
            temperature: 0.2,
            response_format: { type: "json_object" },
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (signal.aborted) {
          return abort();
        }
        if (res.ok) {
          const j = (await res.json()) as {
            choices?: { message?: { content?: string } }[];
          };
          const content = j.choices?.[0]?.message?.content ?? "{}";
          const parsedLlm = JSON.parse(content) as {
            why?: string;
            bullets?: string[];
          };
          if (parsedLlm.why)
            llm = {
              why: parsedLlm.why.slice(0, 200),
              bullets: (parsedLlm.bullets ?? [parsedLlm.why]).slice(0, 3),
            };
          log.info(
            {
              requestId,
              url,
              llmWhy: llm?.why,
              hasKey,
              durationMs: Math.max(1, Date.now() - start),
            },
            "openai enrichment ok",
          );
        } else {
          const body = await res.text().catch(() => "");
          inc("openai_fallback_total");
          log.warn(
            {
              requestId,
              status: res.status,
              body,
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

    const result = buildTrustScore(meta, llm);
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
