import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  formatUsd,
  estimateKeyedRun,
  resolveSpendPlan,
  TOKENS_PER_SCORE_REQUEST,
} from "../../scripts/eval/cost.mjs";

const EVAL_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "scripts",
  "eval",
);
const MODULE_PATHS = ["metrics.mjs", "cost.mjs", "report.mjs", "run.mjs"].map(
  (file) => join(EVAL_DIR, file),
);

describe("zero-spend proof", () => {
  it("no harness module reads key material from the environment", () => {
    for (const modulePath of MODULE_PATHS) {
      const source = readFileSync(modulePath, "utf8");
      expect(source).not.toContain("process.env");
    }
  });

  it("fixture spend plan is exactly $0 with no key required", () => {
    const plan = resolveSpendPlan({ fixture: true, rowCount: 115 });
    expect(plan.mode).toBe("fixture-dry-run");
    expect(plan.llmCalls).toBe(0);
    expect(plan.usd).toBe(0);
    expect(plan.keyRequired).toBe(false);
  });
});

describe("estimateKeyedRun", () => {
  it("counts one LLM call per row with documented token assumptions", () => {
    const estimate = estimateKeyedRun({ rowCount: 20, model: "gpt-4o-mini" });
    expect(estimate.llmCalls).toBe(20);
    expect(estimate.inputTokens).toBe(20 * TOKENS_PER_SCORE_REQUEST.input);
    expect(estimate.outputTokens).toBe(20 * TOKENS_PER_SCORE_REQUEST.output);
    const expected =
      ((20 * 1500) / 1_000_000) * 0.15 + ((20 * 150) / 1_000_000) * 0.6;
    expect(estimate.usd).toBeCloseTo(expected);
  });

  it("stays under the $0.10 pilot budget for 20 rows", () => {
    const estimate = estimateKeyedRun({ rowCount: 20 });
    expect(estimate.usd).toBeLessThan(0.1);
  });

  it("stays under the $0.50 full-run budget for 115 rows", () => {
    const estimate = estimateKeyedRun({ rowCount: 115 });
    expect(estimate.usd).toBeLessThan(0.5);
  });

  it("prices the pinned gpt-5.6-luna pilot at $0.0096 for 20 rows", () => {
    const estimate = estimateKeyedRun({ rowCount: 20, model: "gpt-5.6-luna" });
    expect(estimate.llmCalls).toBe(20);
    const expected =
      ((20 * 1500) / 1_000_000) * 0.2 + ((20 * 150) / 1_000_000) * 1.2;
    expect(estimate.usd).toBeCloseTo(expected);
    expect(estimate.usd).toBeCloseTo(0.0096);
    expect(estimate.usd).toBeLessThan(0.1);
  });

  it("rejects unknown models instead of pricing silently", () => {
    expect(() => estimateKeyedRun({ rowCount: 1, model: "nope" })).toThrow(
      /Unknown model/,
    );
  });

  it("keyed plan requires a key and reports positive spend", () => {
    const plan = resolveSpendPlan({ fixture: false, rowCount: 20 });
    expect(plan.mode).toBe("keyed");
    expect(plan.keyRequired).toBe(true);
    expect(plan.usd).toBeGreaterThan(0);
  });
});

describe("formatUsd", () => {
  it("formats zero and small estimates without losing cents", () => {
    expect(formatUsd(0)).toBe("$0.0000");
    expect(formatUsd(0.0063)).toBe("$0.0063");
  });
});
