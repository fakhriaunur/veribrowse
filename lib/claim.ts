// Functional core for checkClaim — fail-closed, provenance-bearing.

export type Verdict = "supported" | "contradicted" | "unverified";

export type ClaimInput = { claim: string; contextUrl?: string };
export type Evidence = {
  url: string;
  quote: string;
  contentHash: string;
  retrievedAt: string;
};

export type ClaimResult = {
  verdict: Verdict;
  confidence: number; // 0-1
  elderlySummary: string;
  reasoning: string;
  evidence: Evidence[];
  provenance: { claim: string; claimHash: string; checkedAt: string };
};

// Pure helper — deterministic fake for tests / mock mode.
export function verifyClaimPure(
  input: ClaimInput,
  evidence: Evidence[] | null,
  llm?: { verdict: Verdict; confidence: number; reasoning: string },
): ClaimResult {
  // 16-hex claimHash (VAL-WEB-007): simpleHash yields 8 hex + length-hex,
  // so concatenate a second domain-separated hash to reach full 16 chars.
  // Prefix-stable with previous values; deterministic; no fixtures pin it.
  const claimHash = (
    simpleHash(input.claim) + simpleHash(`${input.claim}#2`)
  ).slice(0, 16);
  const checkedAt = new Date().toISOString();

  if (!evidence || evidence.length === 0) {
    return {
      verdict: "unverified",
      confidence: 0.3,
      elderlySummary:
        "⚠️ Not enough evidence to verify this claim. Ask a trusted source or family member before acting.",
      reasoning: llm?.reasoning ?? "No evidence retrieved — fail-closed.",
      evidence: [],
      provenance: { claim: input.claim, claimHash, checkedAt },
    };
  }

  const verdict = llm?.verdict ?? "unverified";
  const confidence = llm?.confidence ?? 0.5;
  const reasoning =
    llm?.reasoning ?? `Checked against ${evidence.length} source(s).`;
  const elderlySummary =
    verdict === "supported"
      ? `✅ Claim looks supported (${(confidence * 100).toFixed(0)}%). Source matches claim.`
      : verdict === "contradicted"
        ? `⛔ Claim looks contradicted (${(confidence * 100).toFixed(0)}%). Evidence says otherwise — do not share.`
        : `⚠️ Not enough evidence to verify. Be careful before trusting.`;

  return {
    verdict,
    confidence,
    elderlySummary,
    reasoning,
    evidence,
    provenance: { claim: input.claim, claimHash, checkedAt },
  };
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).padStart(8, "0") + s.length.toString(16);
}
