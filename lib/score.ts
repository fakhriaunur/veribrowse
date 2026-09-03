// Functional core for scoreWebsite — pure, deterministic, testable without fetch/LLM.
// APOSD deep module: one module owns fetch heuristics + trust mapping + elderly summary.

export type TrustLevel = "safe" | "caution" | "risky";

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

function trustToLevel(trust: number): TrustLevel {
  if (trust >= 70) return "safe";
  if (trust >= 40) return "caution";
  return "risky";
}

// Pure heuristic — deterministic, no LLM.
export function scoreWebsitePure(
  meta: FetchMeta,
): Omit<TrustScore, "elderlySummary" | "why" | "bullets"> & { preWhy: string } {
  let trust = 50;
  const reasons: string[] = [];

  if (meta.hasHttps) {
    trust += 10;
  } else {
    trust -= 20;
    reasons.push("No HTTPS");
  }

  if (meta.domainAgeDays !== null && meta.domainAgeDays !== undefined) {
    if (meta.domainAgeDays > 365) trust += 15;
    else if (meta.domainAgeDays < 30) {
      trust -= 20;
      reasons.push("Very new domain");
    }
  }

  if (meta.title && meta.title.length > 5) trust += 5;
  if (meta.ogDescription) trust += 5;
  if (meta.finalUrl && meta.finalUrl !== meta.url) reasons.push("Redirected");

  // Clamp
  trust = Math.max(0, Math.min(100, trust));
  const level = trustToLevel(trust);
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
export function buildTrustScore(
  meta: FetchMeta,
  llm?: { why: string; bullets: string[] },
): TrustScore {
  const base = scoreWebsitePure(meta);
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
