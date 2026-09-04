// scripts/eval/cost.mjs
// M14 spend estimator — pure functions only (no I/O, no network, no env).
// The fixture dry-run path costs exactly $0: zero LLM calls are made.

export const MODEL_PRICING = {
  "gpt-4o-mini": {
    inputPerMillionUsd: 0.15,
    outputPerMillionUsd: 0.6,
    note: "Public list-price estimate at time of writing; re-check before any keyed run.",
  },
};

// Per-score-request token assumption for the /api/score enrichment prompt.
// Documented estimate only — actual usage varies with title/desc length.
export const TOKENS_PER_SCORE_REQUEST = { input: 1500, output: 150 };

export function formatUsd(usd) {
  return `$${usd.toFixed(usd < 1 ? 4 : 2)}`;
}

export function estimateKeyedRun({
  rowCount,
  callsPerRow = 1,
  model = "gpt-4o-mini",
}) {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    throw new Error(`Unknown model for pricing: ${model}`);
  }
  const llmCalls = rowCount * callsPerRow;
  const inputTokens = llmCalls * TOKENS_PER_SCORE_REQUEST.input;
  const outputTokens = llmCalls * TOKENS_PER_SCORE_REQUEST.output;
  const usd =
    (inputTokens / 1_000_000) * pricing.inputPerMillionUsd +
    (outputTokens / 1_000_000) * pricing.outputPerMillionUsd;
  return { model, llmCalls, inputTokens, outputTokens, usd };
}

export function resolveSpendPlan({ fixture, rowCount, model = "gpt-4o-mini" }) {
  if (fixture) {
    return {
      mode: "fixture-dry-run",
      llmCalls: 0,
      usd: 0,
      keyRequired: false,
      proof:
        "Every request carries fixture=1, which bypasses fetch and LLM; no key material is read.",
    };
  }
  const estimate = estimateKeyedRun({ rowCount, model });
  return {
    mode: "keyed",
    llmCalls: estimate.llmCalls,
    usd: estimate.usd,
    keyRequired: true,
    proof: null,
  };
}
