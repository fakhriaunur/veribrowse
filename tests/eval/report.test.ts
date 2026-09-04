import { describe, it, expect } from "vitest";
import { renderReport } from "../../scripts/eval/report.mjs";
import { summarize } from "../../scripts/eval/metrics.mjs";
import type { EvalRecord } from "../../scripts/eval/metrics.mjs";

function row(over: Partial<EvalRecord> = {}): EvalRecord {
  return {
    url: "https://example.com/a",
    expected_tier: "safe",
    trust: 85,
    level: "safe",
    llmStep: null,
    fetchFailed: false,
    ...over,
  };
}

describe("renderReport", () => {
  it("renders every required section with exclusion policy", () => {
    const records = [
      row(),
      row({ expected_tier: "risky", trust: 12, level: "risky" }),
      {
        ...row({ url: "https://example.com/down", trust: null, level: null }),
        fetchFailed: true,
        error: "http 500",
      },
    ];
    const summary = summarize(records);
    const markdown = renderReport({
      records,
      summary,
      context: {
        baseUrl: "http://127.0.0.1:3000",
        fixture: true,
        model: "gpt-4o-mini",
        preset: "balanced",
        presetSource: "config/rubrics/balanced.json",
        timeoutMs: 10000,
        timeoutSource: "config/llm.json",
        datasetName: "synthetic-sample",
        datasetVersion: "0.1.0",
        generatedAt: "2026-09-04T00:00:00.000Z",
        spend: { usd: 0, llmCalls: 0, proof: "$0 fixture proof" },
      },
    });
    expect(markdown).toMatch(/# M14 URL-trust benchmark/);
    expect(markdown).toMatch(/## Run pins/);
    expect(markdown).toMatch(/balanced/);
    expect(markdown).toMatch(/## Spend/);
    expect(markdown).toMatch(/## Headline/);
    expect(markdown).toMatch(/tier agreement/);
    expect(markdown).toMatch(/Pearson\(trust, tier rank\)/);
    expect(markdown).toMatch(/Spearman\(trust, tier rank\)/);
    expect(markdown).toMatch(/fail-closed/);
    expect(markdown).toMatch(/## Confusion matrix/);
    expect(markdown).toMatch(/## Per-tier calibration/);
    expect(markdown).toMatch(/## Excluded rows/);
    expect(markdown).toMatch(/https:\/\/example\.com\/down/);
    expect(markdown).toMatch(/never scored as misses/);
    expect(markdown).toMatch(/## Notes/);
  });
});
