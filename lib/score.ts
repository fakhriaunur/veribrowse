// Functional core for scoreWebsite — pure, deterministic, testable without fetch/LLM.
// APOSD deep module: one module owns fetch heuristics + trust mapping + elderly summary.

import type { Rubric } from "@/lib/rubric";

export type TrustLevel = "safe" | "caution" | "risky";

/**
 * Subset of a scoring rubric that affects the heuristic numbers.
 * Passed as an OPTIONAL param (default = balanced = frozen constants below,
 * so the default path stays byte-identical to the sealed heuristic).
 */
export type ScoringRubric = Pick<Rubric, "weights" | "thresholds">;

// Frozen default weights — sealed heuristic. The shipped `balanced` preset
// (config/rubrics/balanced.json) is regression-pinned byte-identical to these
// (tests/unit/rubric.test.ts); when no rubric arg is passed these apply.
const FROZEN_WEIGHTS = {
  base: 50,
  httpsBonus: 10,
  noHttpsPenalty: -20,
  oldDomainBonus: 15,
  oldDomainDays: 365,
  newDomainPenalty: -20,
  newDomainDays: 30,
  titleBonus: 5,
  titleMinLength: 5,
  ogBonus: 5,
};

const FROZEN_THRESHOLDS = { safe: 70, caution: 40 };

export type FetchMeta = {
  url: string;
  title?: string;
  ogDescription?: string;
  finalUrl?: string;
  status?: number;
  contentHash: string; // sha256 of raw bytes truncated for provenance
  retrievedAt: string; // ISO
  domainAgeDays?: number | null;
  hasHttps: boolean;
};

export type TrustScore = {
  trust: number; // 0-100
  level: TrustLevel;
  elderlySummary: string; // <=80 words, plain
  bullets: string[];
  why: string;
  provenance: { url: string; contentHash: string; retrievedAt: string };
  citations: { url: string; snippet: string }[];
  raw: FetchMeta;
};

function trustToLevel(
  trust: number,
  thresholds: { safe: number; caution: number } = FROZEN_THRESHOLDS,
): TrustLevel {
  if (trust >= thresholds.safe) return "safe";
  if (trust >= thresholds.caution) return "caution";
  return "risky";
}

// Pure heuristic — deterministic, no LLM. The optional `rubric` selects the
// weights/thresholds; omitted (or partially omitted) falls back to the frozen
// balanced constants, so the default path is byte-identical to sealed behavior.
export function scoreWebsitePure(
  meta: FetchMeta,
  rubric?: ScoringRubric | undefined,
): Omit<TrustScore, "elderlySummary" | "why" | "bullets"> & { preWhy: string } {
  const w = rubric?.weights ?? FROZEN_WEIGHTS;
  const t = rubric?.thresholds ?? FROZEN_THRESHOLDS;
  let trust = w.base;
  const reasons: string[] = [];

  if (meta.hasHttps) {
    trust += w.httpsBonus;
  } else {
    trust += w.noHttpsPenalty;
    reasons.push("No HTTPS");
  }

  if (meta.domainAgeDays !== null && meta.domainAgeDays !== undefined) {
    if (meta.domainAgeDays > w.oldDomainDays) trust += w.oldDomainBonus;
    else if (meta.domainAgeDays < w.newDomainDays) {
      trust += w.newDomainPenalty;
      reasons.push("Very new domain");
    }
  }

  if (meta.title && meta.title.length > w.titleMinLength) trust += w.titleBonus;
  if (meta.ogDescription) trust += w.ogBonus;
  if (meta.finalUrl && meta.finalUrl !== meta.url) reasons.push("Redirected");

  // Clamp
  trust = Math.max(0, Math.min(100, trust));
  const level = trustToLevel(trust, t);
  const preWhy = reasons.length ? reasons.join("; ") : "Standard signals";

  return {
    trust,
    level,
    provenance: {
      url: meta.url,
      contentHash: meta.contentHash,
      retrievedAt: meta.retrievedAt,
    },
    citations: [
      { url: meta.url, snippet: meta.title ?? meta.ogDescription ?? meta.url },
    ],
    raw: meta,
    preWhy,
  };
}

export function elderlySummarize(
  trust: number,
  level: TrustLevel,
  why: string,
): string {
  const icon = level === "safe" ? "✅" : level === "caution" ? "⚠️" : "⛔";
  const msg =
    level === "safe"
      ? "This site looks safe to browse. Keep usual caution."
      : level === "caution"
        ? "Be careful. Double-check before sharing personal info or paying."
        : "High risk — likely scam or impersonation. Do not enter data or pay. Ask family for help.";
  // Keep under ~60 words
  return `${icon} Score ${trust}/100 — ${level.toUpperCase()}. ${msg} Why: ${why}`;
}

// Full pure with LLM placeholder — caller injects LLM-provided why/bullets if available.
// The optional `rubric` is passed through to scoreWebsitePure (default = frozen balanced).
export function buildTrustScore(
  meta: FetchMeta,
  llm?: { why: string; bullets: string[] },
  rubric?: ScoringRubric | undefined,
): TrustScore {
  const base = scoreWebsitePure(meta, rubric);
  const why = llm?.why ?? base.preWhy;
  const bullets =
    llm?.bullets ??
    (base.preWhy === "Standard signals"
      ? ["Standard signals — verify via second source"]
      : [base.preWhy]);
  const elderlySummary = elderlySummarize(base.trust, base.level, why);
  return {
    trust: base.trust,
    level: base.level,
    elderlySummary,
    bullets,
    why,
    provenance: base.provenance,
    citations: base.citations,
    raw: meta,
  };
}
