import { NextResponse } from "next/server";
import { scoreWebsiteSchema } from "@/lib/schemas";
import { buildTrustScore, type FetchMeta } from "@/lib/score";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
// Edge runtime also supported on Netlify/Vercel; nodejs avoids 404 prerender edge bug in Next 15.2.3 tracer
// To re-enable edge, change to "edge" and ensure _error page not prerendered via `export const dynamic = "force-dynamic"`

function hashBytes(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++)
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(16).padStart(8, "0");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  const fixture = searchParams.get("fixture");
  const requestId = crypto.randomUUID().slice(0, 8);

  if (fixture === "1") {
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
    logger.info(
      { requestId, url: meta.url, trust: result.trust },
      "score fixture",
    );
    return NextResponse.json(result, { status: 200 });
  }

  if (!url) {
    return NextResponse.json(
      { error: "Missing url query param" },
      { status: 400 },
    );
  }

  const parsed = scoreWebsiteSchema.safeParse({ url });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Mock mode when no key — deterministic fallback (fail-open to fixture-like value, but with warning)
  const hasKey = !!process.env.OPENAI_API_KEY;
  const signal = req.signal;

  // Fetch meta with abort support
  let title: string | undefined;
  let ogDesc: string | undefined;
  let finalUrl = url;
  let status = 200;
  let hasHttps = url.startsWith("https://");
  try {
    const res = await fetch(url, {
      signal,
      redirect: "follow",
      headers: { "user-agent": "VeriBrowse/0.1" },
    });
    status = res.status;
    finalUrl = res.url;
    const html = await res.text();
    const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (t) title = t[1].trim().slice(0, 120);
    const og = html.match(
      /property=["']og:description["'][^>]*content=["']([^"']+)["']/i,
    );
    if (og) ogDesc = og[1].trim().slice(0, 200);
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      return NextResponse.json({ error: "Request aborted" }, { status: 499 });
    }
    logger.warn(
      { requestId, url, err: String(e) },
      "fetch failed — using minimal meta",
    );
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

  // LLM enrichment — if no key, use heuristic only (DDIA provenance + fail-closed)
  let llm: { why: string; bullets: string[] } | undefined;
  if (hasKey) {
    try {
      const prompt = `You are VeriBrowse scam analyst. Score trust for URL=${meta.url} title="${meta.title ?? ""}" desc="${meta.ogDescription ?? ""}" hasHttps=${meta.hasHttps}. Return JSON {"why": string concise 20 words, "bullets": string[2]} explaining risk. No hallucinated citations.`;
      const baseUrl =
        process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (res.ok) {
        const j = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content = j.choices?.[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(content) as {
          why?: string;
          bullets?: string[];
        };
        if (parsed.why)
          llm = {
            why: parsed.why.slice(0, 200),
            bullets: (parsed.bullets ?? [parsed.why]).slice(0, 3),
          };
        logger.info(
          { requestId, url, llmWhy: llm?.why },
          "openai enrichment ok",
        );
      } else {
        logger.warn(
          {
            requestId,
            status: res.status,
            body: await res.text().catch(() => ""),
          },
          "openai enrichment failed — fallback to heuristic",
        );
      }
    } catch (e) {
      logger.warn(
        { requestId, err: String(e) },
        "openai call error — fallback",
      );
    }
  }

  const result = buildTrustScore(meta, llm);
  logger.info(
    { requestId, url, trust: result.trust, level: result.level },
    "score computed",
  );
  return NextResponse.json(result, { status: 200 });
}
