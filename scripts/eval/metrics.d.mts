export type Tier = "safe" | "caution" | "risky";
export interface EvalRecord {
  url: string;
  expected_tier: string;
  trust: number | null;
  level: string | null;
  llmStep: string | null;
  fetchFailed: boolean;
  error?: string | null;
  [key: string]: unknown;
}
export interface Agreement {
  matches: number;
  total: number;
  agreement: number | null;
}
export interface Confusion {
  matrix: Record<string, Record<string, number>>;
  total: number;
}
export interface Correlation {
  n: number;
  pearson: number | null;
  spearman: number | null;
}
export interface TierCalibration {
  n: number;
  meanTrust: number | null;
  agreementRate: number | null;
  predicted: Record<string, number>;
}
export interface FailClosed {
  completed: number;
  fallback: number;
  rate: number | null;
}
export interface Summary {
  total: number;
  included: number;
  excluded: number;
  agreement: Agreement;
  confusion: Confusion;
  correlation: Correlation;
  calibration: Record<string, TierCalibration>;
  failClosed: FailClosed;
}
export const TIERS: string[];
export const TIER_RANK: Record<string, number>;
export function isIncluded(record: EvalRecord): boolean;
export function tierAgreement(records: EvalRecord[]): Agreement;
export function confusionMatrix(records: EvalRecord[]): Confusion;
export function pearson(xs: number[], ys: number[]): number | null;
export function spearman(xs: number[], ys: number[]): number | null;
export function trustTierCorrelation(records: EvalRecord[]): Correlation;
export function perTierCalibration(
  records: EvalRecord[],
): Record<string, TierCalibration>;
export function failClosedRate(records: EvalRecord[]): FailClosed;
export function summarize(records: EvalRecord[]): Summary;
