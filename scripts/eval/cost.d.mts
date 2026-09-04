export interface ModelPrice {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  note: string;
}
export interface KeyedEstimate {
  model: string;
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
}
export interface SpendPlan {
  mode: "fixture-dry-run" | "keyed";
  llmCalls: number;
  usd: number;
  keyRequired: boolean;
  proof: string | null;
}
export const MODEL_PRICING: Record<string, ModelPrice>;
export const TOKENS_PER_SCORE_REQUEST: { input: number; output: number };
export function formatUsd(usd: number): string;
export function estimateKeyedRun(options: {
  rowCount: number;
  callsPerRow?: number;
  model?: string;
}): KeyedEstimate;
export function resolveSpendPlan(options: {
  fixture: boolean;
  rowCount: number;
  model?: string;
}): SpendPlan;
