import { NextResponse } from "next/server";
import { checkClaimSchema } from "@/lib/schemas";
import {
  verifyClaimPure,
  type Evidence,
  type EvidenceBadge,
} from "@/lib/claim";
import { scoreWebsitePure, type FetchMeta } from "@/lib/score";
import { withRequestId } from "@/lib/logger";
import { fetchWithRetry } from "@/lib/fetchWithRetry";
import { createFetchMemo } from "@/lib/fetchMemo";
import { inc } from "@/lib/metrics";

export const runtime = "nodejs";
// nodejs avoids the legacy edge prerender bug; switchable to "edge"

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

// VAL-CROSS-024 fixture badge: the score route pins trust 42 / level caution
// for ANY fixture url (VAL-API-006), so the fixture evidence badge uses the
// same pin — badge level trivially equals the direct /api/score level.
const FIXTURE_EVIDENCE_BADGE: EvidenceBadge = { trust: 42, level: "caution" };

// Display-only page-meta extractor mirroring the score route's parse (same
// regexes and slice caps) so the in-request badge level matches a direct
// GET /api/score for the same URL. Only trust-affecting inputs are read:
// hasHttps, title, ogDescription (domainAgeDays null, same as score live).
function pageMeta(html: string): { title?: string; ogDescription?: string } {
  const pick = (re: RegExp) => html.match(re)?.[1]?.trim();
  const title = pick(/<title[^>]*>([^<]+)<\/title>/i)?.slice(0, 120);
  const ogDescription = pick(
    /property=["']og:description["'][^>]*content=["']([^"']+)["']/i,
  )?.slice(0, 200);
  return { title, ogDescription };
}

// VAL-CROSS-024 link-back: score one evidence URL in-request through the
// existing pure function. Display-layer only — verdict/confidence untouched.
function evidenceBadge(
  url: string,
  html: string,
  res: { status: number; url?: string },
  contentHash: string,
  retrievedAt: string,
): EvidenceBadge {
  const { title, ogDescription } = pageMeta(html);
  const meta: FetchMeta = {
    url,
    title,
    ogDescription,
    finalUrl: res.url ?? url,
    status: res.status,
    contentHash,
    retrievedAt,
    domainAgeDays: null,
    hasHttps: url.startsWith("https://"),
  };
  const { trust, level } = scoreWebsitePure(meta);
  return { trust, level };
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

  // Per-request fetch memo (VAL-CROSS-025): duplicate evidence-URL fetches
  // in this request collapse to one. Created fresh here, evaporates with
  // the request — no cross-request cache, `cache-control: no-store` holds.
  // The evidenceBadge() below reuses the memo-fetched HTML (no refetch).
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
      "check aborted",
    );
    return NextResponse.json({ error: "aborted" }, { status: 499, headers });
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
          log.warn(
            {
              requestId,
              traceparent,
              hasKey,
              durationMs: Math.max(1, Date.now() - start),
            },
            "check 400 — invalid claim",
          );
          return NextResponse.json(
            {
              error:
                "Invalid claim — must be 8-500 chars with optional valid contextUrl",
              details: parsedFix.error.flatten(),
              issues: parsedFix.error.issues,
            },
            { status: 400, headers },
          );
        }
      } else if (!claim) {
        log.warn(
          {
            requestId,
            traceparent,
            hasKey,
            durationMs: Math.max(1, Date.now() - start),
          },
          "check 400 — missing claim",
        );
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
            retrievedAt: "2026-01-01T00:00:00.000Z",
            badge: FIXTURE_EVIDENCE_BADGE,
          },
        ],
        {
          verdict: "supported",
          confidence: 0.82,
          reasoning: "Fixture reasoning — deterministic",
        },
      );
      inc("check_requests_total");
      log.info(
        {
          requestId,
          traceparent,
          claim,
          hasKey,
          durationMs: Math.max(1, Date.now() - start),
        },
        "check fixture",
      );
      return NextResponse.json(result, { status: 200, headers });
    }

    if (!claim) {
      log.warn(
        {
          requestId,
          traceparent,
          hasKey,
          durationMs: Math.max(1, Date.now() - start),
        },
        "check 400 — missing claim",
      );
      return NextResponse.json(
        { error: "Missing claim query param" },
        { status: 400, headers },
      );
    }

    const parsed = checkClaimSchema.safeParse({ claim, contextUrl });
    if (!parsed.success) {
      log.warn(
        {
          requestId,
          traceparent,
          hasKey,
          durationMs: Math.max(1, Date.now() - start),
        },
        "check 400 — invalid claim",
      );
      return NextResponse.json(
        {
          error:
            "Invalid claim — must be 8-500 chars with optional valid contextUrl",
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
    // m10-013 diagnosis (additive observability only): track which span is in
    // flight so the incoming-signal abort listener can note it. Every line
    // below is log.debug — suppressed at the default LOG_LEVEL=info, so
    // default output and all response shapes stay byte-identical.
    let spanInFlight: "idle" | "evidence-fetch" | "gateway-call" = "idle";
    signal.addEventListener(
      "abort",
      () => {
        log.debug(
          {
            requestId,
            span: spanInFlight,
            elapsedMs: Math.max(1, Date.now() - start),
          },
          "check incoming-signal aborted",
        );
      },
      { once: true },
    );
    let evidence: Evidence[] | null = null;

    if (parsed.data.contextUrl) {
      try {
        spanInFlight = "evidence-fetch";
        const evidenceStart = Date.now();
        const res = await fetchMemo(parsed.data.contextUrl, {
          signal,
          headers: { "user-agent": "VeriBrowse/0.1" },
        });
        log.debug(
          {
            requestId,
            span: "evidence-fetch",
            spanMs: Date.now() - evidenceStart,
          },
          "check evidence-fetch span done",
        );
        spanInFlight = "idle";
        if (signal.aborted) return abort();
        const html = await res.text();
        const text = html
          .replace(/<[^>]+>/g, " ")
          .slice(0, 500)
          .trim();
        if (text) {
          const contentHash = hashBytes(text);
          const retrievedAt = new Date().toISOString();
          evidence = [
            {
              url: parsed.data.contextUrl,
              quote: text.slice(0, 500),
              contentHash,
              retrievedAt,
              badge: evidenceBadge(
                parsed.data.contextUrl,
                html,
                {
                  status: res.status,
                  url: (res as unknown as { url?: string }).url,
                },
                contentHash,
                retrievedAt,
              ),
            },
          ];
        } else {
          evidence = [];
        }
      } catch (e) {
        spanInFlight = "idle";
        if (isAbortError(e)) {
          log.debug(
            {
              requestId,
              span: "evidence-fetch",
              elapsedMs: Math.max(1, Date.now() - start),
            },
            "check evidence-fetch aborted",
          );
          return abort();
        }
        log.warn(
          {
            requestId,
            contextUrl: parsed.data.contextUrl,
            err: String(e),
            hasKey,
            durationMs: Math.max(1, Date.now() - start),
          },
          "evidence fetch failed",
        );
        evidence = [];
      }
    } else {
      evidence = [];
      log.info(
        {
          requestId,
          claim: parsed.data.claim,
          hasKey,
          durationMs: Math.max(1, Date.now() - start),
          openai_skipped: "no_evidence",
        },
        "check fail-closed — no evidence",
      );
    }

    if (signal.aborted) return abort();

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
        spanInFlight = "gateway-call";
        const gatewayStart = Date.now();
        const prompt = `Verify claim="${parsed.data.claim}" against evidence="${evidence[0].quote.slice(0, 400)}" url=${evidence[0].url}. Return JSON {"verdict":"supported"|"contradicted"|"unverified","confidence":0-1,"reasoning":string 30 words}. Never hallucinate citations.`;
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
            temperature: 0.1,
            response_format: { type: "json_object" },
            messages: [{ role: "user", content: prompt }],
          }),
        });
        log.debug(
          {
            requestId,
            span: "gateway-call",
            spanMs: Date.now() - gatewayStart,
            ok: res.ok,
            status: res.status,
          },
          "check gateway-call span done",
        );
        spanInFlight = "idle";
        if (signal.aborted) return abort();
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
          log.info(
            {
              requestId,
              claim: parsed.data.claim,
              llm,
              hasKey,
              durationMs: Math.max(1, Date.now() - start),
            },
            "openai claim enrichment ok",
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
            "openai claim enrichment failed — fail-closed",
          );
        }
      } catch (e) {
        spanInFlight = "idle";
        if (isAbortError(e)) {
          log.debug(
            {
              requestId,
              span: "gateway-call",
              elapsedMs: Math.max(1, Date.now() - start),
            },
            "check gateway-call aborted",
          );
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
          "openai claim call error — fail-closed",
        );
      }
    } else if (hasKey && (!evidence || evidence.length === 0)) {
      log.info(
        {
          requestId,
          hasKey: true,
          durationMs: Math.max(1, Date.now() - start),
          openai_skipped: "no_evidence",
        },
        "openai skipped — no evidence fail-closed",
      );
    }

    if (signal.aborted) return abort();

    const result = verifyClaimPure(
      { claim: parsed.data.claim, contextUrl: parsed.data.contextUrl },
      evidence,
      llm,
    );
    inc("check_requests_total");
    log.info(
      {
        requestId,
        traceparent,
        claim: parsed.data.claim,
        verdict: result.verdict,
        hasKey,
        durationMs: Math.max(1, Date.now() - start),
      },
      "check computed",
    );
    return NextResponse.json(result, { status: 200, headers });
  } catch (e) {
    if (isAbortError(e)) return abort();
    log.error(
      {
        requestId,
        err: String(e),
        hasKey,
        durationMs: Math.max(1, Date.now() - start),
      },
      "check unexpected error",
    );
    return NextResponse.json(
      { error: "internal", details: String(e) },
      { status: 200, headers },
    );
  }
}
