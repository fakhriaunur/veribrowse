"use client";

// Client-only bounded recents store (VAL-WEB-019 / VAL-CROSS-026).
// Summaries only: trust/level + short summary for scores, verdict/confidence
// + short claim snippet for checks. Never stores secrets, keys, raw HTML,
// citations, or evidence quotes. Server is untouched (no fetch here).

import type { ClaimResult } from "./claim";
import type { TrustScore } from "./score";

export const RECENTS_KEY = "veribrowse:recents:v1";
export const RECENTS_MAX = 10;
const SUMMARY_MAX = 280;
const CLAIM_SNIPPET_MAX = 140;

export type RecentScore = {
  kind: "score";
  id: string;
  url: string;
  trust: number;
  level: "safe" | "caution" | "risky";
  summary: string;
  at: string;
};

export type RecentCheck = {
  kind: "check";
  id: string;
  claim: string;
  verdict: "supported" | "contradicted" | "unverified";
  confidence: number;
  evidenceCount: number;
  summary: string;
  at: string;
};

export type RecentEntry = RecentScore | RecentCheck;

function truncate(s: string, max: number): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function hasSecretMaterial(s: string): boolean {
  return /sk-[A-Za-z0-9]/.test(s) || /api[_-]?key/i.test(s);
}

function makeId(kind: string): string {
  return `${kind}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export function fromTrustScore(score: TrustScore): RecentEntry | null {
  const summary = truncate(score.elderlySummary ?? "", SUMMARY_MAX);
  const candidate: RecentScore = {
    kind: "score",
    id: makeId("score"),
    url: score.provenance?.url ?? score.citations?.[0]?.url ?? "",
    trust: score.trust,
    level: score.level,
    summary,
    at: new Date().toISOString(),
  };
  if (hasSecretMaterial(candidate.url) || hasSecretMaterial(candidate.summary))
    return null;
  return candidate;
}

export function fromClaimResult(result: ClaimResult): RecentEntry | null {
  const claim = truncate(result.provenance?.claim ?? "", CLAIM_SNIPPET_MAX);
  const summary = truncate(
    result.elderlySummary || result.reasoning || "",
    SUMMARY_MAX,
  );
  const candidate: RecentCheck = {
    kind: "check",
    id: makeId("check"),
    claim,
    verdict: result.verdict,
    confidence: result.confidence,
    evidenceCount: result.evidence?.length ?? 0,
    summary,
    at: new Date().toISOString(),
  };
  if (
    hasSecretMaterial(candidate.claim) ||
    hasSecretMaterial(candidate.summary)
  )
    return null;
  return candidate;
}

function isValidEntry(e: unknown): e is RecentEntry {
  if (typeof e !== "object" || e === null) return false;
  const o = e as Record<string, unknown>;
  if (o.kind === "score")
    return (
      typeof o.id === "string" &&
      typeof o.url === "string" &&
      typeof o.trust === "number" &&
      (o.level === "safe" || o.level === "caution" || o.level === "risky") &&
      typeof o.summary === "string" &&
      typeof o.at === "string"
    );
  if (o.kind === "check")
    return (
      typeof o.id === "string" &&
      typeof o.claim === "string" &&
      (o.verdict === "supported" ||
        o.verdict === "contradicted" ||
        o.verdict === "unverified") &&
      typeof o.confidence === "number" &&
      typeof o.evidenceCount === "number" &&
      typeof o.summary === "string" &&
      typeof o.at === "string"
    );
  return false;
}

/** Pure: prepend entry, drop same-URL/claim duplicate, evict oldest past cap. */
export function addRecent(
  list: RecentEntry[],
  entry: RecentEntry,
): RecentEntry[] {
  const serialized = JSON.stringify(entry);
  if (hasSecretMaterial(serialized)) return list;
  const deduped = list.filter((e) => {
    if (e.kind !== entry.kind) return true;
    if (e.kind === "score" && entry.kind === "score")
      return e.url !== entry.url;
    if (e.kind === "check" && entry.kind === "check")
      return e.claim !== entry.claim;
    return true;
  });
  return [entry, ...deduped].slice(0, RECENTS_MAX);
}

export function loadRecents(): RecentEntry[] {
  try {
    if (typeof window === "undefined" || !window.localStorage) return [];
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry).slice(0, RECENTS_MAX);
  } catch {
    return [];
  }
}

export function persistRecents(list: RecentEntry[]): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(
      RECENTS_KEY,
      JSON.stringify(list.slice(0, RECENTS_MAX)),
    );
  } catch {
    // Storage full or unavailable — recents are best-effort only.
  }
}

export function clearRecents(): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.removeItem(RECENTS_KEY);
  } catch {
    // Best-effort.
  }
}
