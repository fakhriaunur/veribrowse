import { NextResponse } from "next/server";
import { checkClaimSchema } from "@/lib/schemas";
import { verifyClaimPure, type Evidence } from "@/lib/claim";
import { logger } from "@/lib/logger";
import { fetchWithRetry } from "@/lib/fetchWithRetry";
import { inc } from "@/lib/metrics";

export const runtime = "nodejs";
// See score route — nodejs avoids Next 15.2.3 edge prerender bug; switchable to "edge"

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
    const claim = searchParams.get("claim");
    const contextUrl = searchParams.get("contextUrl") ?? undefined;
    const fixture = searchParams.get("fixture");

    if (fixture === "1") {
      if (claim) {
        const parsedFix = checkClaimSchema.safeParse({ claim, contextUrl });
        if (!parsedFix.success) {
          return NextResponse.json(
            { error: parsedFix.error.flatten() },
            { status: 400, headers },
          );
        }
      } else if (!claim) {
        return NextResponse.json(
          { error: "Missing claim query param" },
          { status: 400, headers },
        );
      }
      const result = verifyClaimPure(
        { claim: claim ?? "fixture claim", contextUrl },
        [
          {
            url: "https://example.com/evidence",
            quote: "Fixture evidence quote for deterministic replay",
            contentHash: hashBytes("fixture-evidence"),
            retrievedAt: new Date().toISOString(),
          },
        ],
        {
          verdict: "supported",
          confidence: 0.82,
          reasoning: "Fixture reasoning — deterministic",
        },
      );
      inc("check_requests_total");
      logger.info(
        { requestId, claim, hasKey, durationMs: Date.now() - start },
        "check fixture",
      );
      return NextResponse.json(result, { status: 200, headers });
    }

    if (!claim) {
      return NextResponse.json(
        { error: "Missing claim query param" },
        { status: 400, headers },
      );
    }

    const parsed = checkClaimSchema.safeParse({ claim, contextUrl });
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
    let evidence: Evidence[] | null = null;

    if (parsed.data.contextUrl) {
      try {
        const res = await fetchWithRetry(parsed.data.contextUrl, {
          signal,
          headers: { "user-agent": "VeriBrowse/0.1" },
        });
        if (signal.aborted)
          return NextResponse.json(
            { error: "aborted" },
            { status: 499, headers },
          );
        const html = await res.text();
        const text = html
          .replace(/<[^>]+>/g, " ")
          .slice(0, 500)
          .trim();
        if (text) {
          evidence = [
            {
              url: parsed.data.contextUrl,
              quote: text.slice(0, 500),
              contentHash: hashBytes(text),
              retrievedAt: new Date().toISOString(),
            },
          ];
        } else {
          evidence = [];
        }
      } catch (e) {
        if (isAbortError(e))
          return NextResponse.json(
            { error: "aborted" },
            { status: 499, headers },
          );
        logger.warn(
          {
            requestId,
            contextUrl: parsed.data.contextUrl,
            err: String(e),
            hasKey,
            durationMs: Date.now() - start,
          },
          "evidence fetch failed",
        );
        evidence = [];
      }
    } else {
      evidence = [];
      logger.info(
        {
          requestId,
          claim: parsed.data.claim,
          hasKey,
          durationMs: Date.now() - start,
          openai_skipped: "no_evidence",
        },
        "check fail-closed — no evidence",
      );
    }

    if (signal.aborted)
      return NextResponse.json({ error: "aborted" }, { status: 499, headers });

    // Fail-closed: empty evidence → unverified regardless of LLM
    let llm:
      | {
          verdict: "supported" | "contradicted" | "unverified";
          confidence: number;
          reasoning: string;
        }
      | undefined;
    if (hasKey && evidence && evidence.length > 0) {
      try {
        const prompt = `Verify claim="${parsed.data.claim}" against evidence="${evidence[0].quote.slice(0, 400)}" url=${evidence[0].url}. Return JSON {"verdict":"supported"|"contradicted"|"unverified","confidence":0-1,"reasoning":string 30 words}. Never hallucinate citations.`;
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
            temperature: 0.1,
            response_format: { type: "json_object" },
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (signal.aborted)
          return NextResponse.json(
            { error: "aborted" },
            { status: 499, headers },
          );
        if (res.ok) {
          const j = (await res.json()) as {
            choices?: { message?: { content?: string } }[];
          };
          const content = j.choices?.[0]?.message?.content ?? "{}";
          const p = JSON.parse(content) as {
            verdict?: string;
            confidence?: number;
            reasoning?: string;
          };
          const v =
            p.verdict === "supported" || p.verdict === "contradicted"
              ? p.verdict
              : "unverified";
          llm = {
            verdict: v,
            confidence: Math.min(1, Math.max(0, p.confidence ?? 0.5)),
            reasoning: (p.reasoning ?? "").slice(0, 300),
          };
          logger.info(
            {
              requestId,
              claim: parsed.data.claim,
              llm,
              hasKey,
              durationMs: Date.now() - start,
            },
            "openai claim enrichment ok",
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
            "openai claim enrichment failed — fail-closed",
          );
        }
      } catch (e) {
        if (isAbortError(e))
          return NextResponse.json(
            { error: "aborted" },
            { status: 499, headers },
          );
        inc("openai_fallback_total");
        logger.warn(
          {
            requestId,
            err: String(e),
            hasKey,
            durationMs: Date.now() - start,
            openai_fallback_total: 1,
          },
          "openai claim call error — fail-closed",
        );
      }
    } else if (hasKey && (!evidence || evidence.length === 0)) {
      logger.info(
        {
          requestId,
          hasKey: true,
          durationMs: Date.now() - start,
          openai_skipped: "no_evidence",
        },
        "openai skipped — no evidence fail-closed",
      );
    }

    if (signal.aborted)
      return NextResponse.json({ error: "aborted" }, { status: 499, headers });

    const result = verifyClaimPure(
      { claim: parsed.data.claim, contextUrl: parsed.data.contextUrl },
      evidence,
      llm,
    );
    inc("check_requests_total");
    logger.info(
      {
        requestId,
        claim: parsed.data.claim,
        verdict: result.verdict,
        hasKey,
        durationMs: Date.now() - start,
      },
      "check computed",
    );
    return NextResponse.json(result, { status: 200, headers });
  } catch (e) {
    if (isAbortError(e))
      return NextResponse.json({ error: "aborted" }, { status: 499, headers });
    logger.error(
      { requestId, err: String(e), hasKey, durationMs: Date.now() - start },
      "check unexpected error",
    );
    return NextResponse.json(
      { error: "internal", details: String(e) },
      { status: 200, headers },
    );
  }
}
