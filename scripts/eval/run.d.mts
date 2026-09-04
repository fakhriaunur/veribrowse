import type { EvalRecord } from "./metrics.mjs";
export interface DatasetRow {
  url: string;
  expected_tier: string;
  auditor_source: string;
  citation: string;
  notes?: string | null;
}
export interface DatasetDoc {
  name?: string;
  version?: string;
  rows: DatasetRow[];
  [key: string]: unknown;
}
export interface RunStats {
  requested: number;
  attempted: number;
  truncated: boolean;
  recorded: number;
  excluded: number;
  aborted: boolean;
}
export type FetchFn = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;
export function parseArgs(argv: string[]): {
  dataset: string;
  baseUrl: string;
  fixture: boolean;
  confirmSpend: boolean;
  model: string;
  timeoutMs: number | null;
  maxRequests: number;
  sleepMs: number;
  outDir: string;
  help?: boolean;
};
export function resolveTimeoutMs(explicitMs: number | null): {
  timeoutMs: number;
  source: string;
};
export function validateDataset(dataset: unknown): {
  rows: DatasetRow[];
  errors: string[];
};
export function loadDatasetFile(
  datasetPath: string,
):
  | { ok: true; dataset: DatasetDoc; rows: DatasetRow[] }
  | { ok: false; error: string };
export function buildScoreUrl(
  baseUrl: string,
  rowUrl: string,
  options: { fixture: boolean; timeoutMs: number },
): string;
export function runDataset(options: {
  rows: DatasetRow[];
  baseUrl: string;
  fixture: boolean;
  timeoutMs: number;
  maxRequests: number;
  sleepMs: number;
  fetchFn?: FetchFn;
  sleepFn?: (ms: number) => Promise<void>;
  nowFn?: () => string;
}): Promise<{ records: EvalRecord[]; stats: RunStats }>;
export function fetchHealthPreset(
  baseUrl: string,
  fetchFn?: FetchFn,
): Promise<{ preset: string; source: string | null }>;
export function main(
  argv?: string[],
  deps?: {
    fetchFn?: FetchFn;
    sleepFn?: (ms: number) => Promise<void>;
    nowFn?: () => string;
    log?: (message: string) => void;
  },
): Promise<number>;
