import { NextResponse } from "next/server";
import { scoreWebsiteSchema } from "@/lib/schemas";
import { buildTrustScore, type FetchMeta } from "@/lib/score";
import { logger } from "@/lib/logger";
import { fetchWithRetry } from "@/lib/fetchWithRetry";
import { inc } from "@/lib/metrics";

export const runtime = "nodejs";

const OPENAI_BASE_URL_FALLBACK = "https://api.openai.com/v1";
const OPENAI_MODEL_FALLBACK = "gpt-4o-mini";

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
  const hasKey = !!process.env.OPENAI_API_KEY;
  const headers = {
    "X-Request-Id": requestId,
    "cache-control": "no-store",
  };

  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");
    const fixture = searchParams.get("fixture");

    if (fixture === "1") {
      if (!url) {
        return NextResponse.json(
          { error: "Missing url query param" },
          { status: 400, headers },
        );
      }
      const parsedFix = scoreWebsiteSchema.safeParse({ url });
      if (!parsedFix.success) {
        return NextResponse.json(
          { error: parsedFix.error.flatten() },
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
        retrievedAt: new Date().toISOString(),
        domainAgeDays: 400,
        hasHttps: true,
      };
      const result = buildTrustScore(meta, {
        why: "Fixture — deterministic",
        bullets: ["Fixture — use for replay"],
      });
      inc("score_requests_total");
      logger.info(
        {
          requestId,
          url: meta.url,
          trust: result.trust,
          hasKey,
          durationMs: Date.now() - start,
        },
        "score fixture",
      );
      return NextResponse.json(result, { status: 200, headers });
    }

    if (!url) {
      return NextResponse.json(
        { error: "Missing url query param" },
        { status: 400, headers },
      );
    }

    const parsed = scoreWebsiteSchema.safeParse({ url });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400, headers },
      );
    }

    if (req.signal.aborted) {
      return NextResponse.json({ error: "aborted" }, { status: 499, headers });
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
        return NextResponse.json(
          { error: "aborted" },
          { status: 499, headers },
        );
      }
      logger.warn(
        {
          requestId,
          url,
          err: String(e),
          hasKey,
          durationMs: Date.now() - start,
        },
        "fetch failed — using minimal meta",
      );
    }

    if (signal.aborted) {
      return NextResponse.json({ error: "aborted" }, { status: 499, headers });
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
        const res = await fetchWithRetry(`${baseUrl}/v1/chat/completions`, {
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
          return NextResponse.json(
            { error: "aborted" },
            { status: 499, headers },
          );
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
          logger.info(
            {
              requestId,
              url,
              llmWhy: llm?.why,
              hasKey,
              durationMs: Date.now() - start,
            },
            "openai enrichment ok",
          );
        } else {
          const body = await res.text().catch(() => "");
          inc("openai_fallback_total");
          logger.warn(
            {
              requestId,
              status: res.status,
              body,
              hasKey,
              durationMs: Date.now() - start,
              openai_fallback_total: 1,
            },
            "openai enrichment failed — fallback to heuristic",
          );
        }
      } catch (e) {
        if (isAbortError(e) || signal.aborted) {
          return NextResponse.json(
            { error: "aborted" },
            { status: 499, headers },
          );
        }
        inc("openai_fallback_total");
        logger.warn(
          {
            requestId,
            err: String(e),
            hasKey,
            durationMs: Date.now() - start,
            openai_fallback_total: 1,
          },
          "openai call error — fallback",
        );
      }
    } else {
      logger.info(
        { requestId, url, hasKey: false, durationMs: Date.now() - start },
        "score heuristic — no key",
      );
    }

    if (signal.aborted) {
      return NextResponse.json({ error: "aborted" }, { status: 499, headers });
    }

    const result = buildTrustScore(meta, llm);
    inc("score_requests_total");
    logger.info(
      {
        requestId,
        url,
        trust: result.trust,
        level: result.level,
        hasKey,
        durationMs: Date.now() - start,
        llmWhy: llm?.why,
      },
      "score computed",
    );
    return NextResponse.json(result, { status: 200, headers });
  } catch (e) {
    if (isAbortError(e)) {
      return NextResponse.json({ error: "aborted" }, { status: 499, headers });
    }
    logger.error(
      { requestId, err: String(e), hasKey, durationMs: Date.now() - start },
      "score unexpected error — fallback to heuristic error shape",
    );
    return NextResponse.json(
      { error: "internal fallback", details: String(e) },
      { status: 200, headers },
    );
  }
}
