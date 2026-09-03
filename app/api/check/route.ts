import { NextResponse } from "next/server";
import { checkClaimSchema } from "@/lib/schemas";
import { verifyClaimPure, type Evidence } from "@/lib/claim";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
// See score route — nodejs avoids Next 15.2.3 edge prerender bug; switchable to "edge"

function hashBytes(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++)
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(16).padStart(8, "0");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const claim = searchParams.get("claim");
  const contextUrl = searchParams.get("contextUrl") ?? undefined;
  const fixture = searchParams.get("fixture");
  const requestId = crypto.randomUUID().slice(0, 8);

  if (fixture === "1") {
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
    logger.info({ requestId, claim }, "check fixture");
    return NextResponse.json(result, { status: 200 });
  }

  if (!claim) {
    return NextResponse.json(
      { error: "Missing claim query param" },
      { status: 400 },
    );
  }

  const parsed = checkClaimSchema.safeParse({ claim, contextUrl });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const signal = req.signal;
  let evidence: Evidence[] | null = null;

  if (parsed.data.contextUrl) {
    try {
      const res = await fetch(parsed.data.contextUrl, {
        signal,
        headers: { "user-agent": "VeriBrowse/0.1" },
      });
      const html = await res.text();
      const text = html
        .replace(/<[^>]+>/g, " ")
        .slice(0, 500)
        .trim();
      if (text) {
        evidence = [
          {
            url: parsed.data.contextUrl,
            quote: text,
            contentHash: hashBytes(text),
            retrievedAt: new Date().toISOString(),
          },
        ];
      } else {
        evidence = [];
      }
    } catch (e) {
      logger.warn(
        { requestId, contextUrl: parsed.data.contextUrl, err: String(e) },
        "evidence fetch failed",
      );
      evidence = [];
    }
  } else {
    evidence = [];
  }

  // Fail-closed: empty evidence → unverified regardless of LLM (DDIA + FCIS)
  const hasKey = !!process.env.OPENAI_API_KEY;
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
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }],
        }),
      });
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
          { requestId, claim: parsed.data.claim, llm },
          "openai claim enrichment ok",
        );
      } else {
        logger.warn(
          { requestId, status: res.status },
          "openai claim enrichment failed — fail-closed",
        );
      }
    } catch (e) {
      logger.warn(
        { requestId, err: String(e) },
        "openai claim call error — fail-closed",
      );
    }
  }

  const result = verifyClaimPure(
    { claim: parsed.data.claim, contextUrl: parsed.data.contextUrl },
    evidence,
    llm,
  );
  logger.info(
    { requestId, claim: parsed.data.claim, verdict: result.verdict },
    "check computed",
  );
  return NextResponse.json(result, { status: 200 });
}
