import type { EvalRecord, Summary } from "./metrics.mjs";
export interface ReportContext {
  baseUrl: string;
  fixture: boolean;
  model: string;
  preset: string;
  presetSource: string;
  timeoutMs: number;
  timeoutSource: string;
  datasetName: string;
  datasetVersion: string;
  generatedAt: string;
  spend: { usd: number; llmCalls: number; proof: string | null };
}
export function renderReport(options: {
  records: EvalRecord[];
  summary: Summary;
  context: ReportContext;
}): string;
