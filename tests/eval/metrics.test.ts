import { describe, it, expect } from "vitest";
import {
  tierAgreement,
  confusionMatrix,
  pearson,
  spearman,
  trustTierCorrelation,
  perTierCalibration,
  failClosedRate,
  summarize,
} from "../../scripts/eval/metrics.mjs";
import type { EvalRecord } from "../../scripts/eval/metrics.mjs";

function row(over: Partial<EvalRecord> = {}): EvalRecord {
  return {
    url: "https://example.com/a",
    expected_tier: "safe",
    trust: 85,
    level: "safe",
    llmStep: "chat-primary",
    fetchFailed: false,
    ...over,
  };
}

describe("tierAgreement", () => {
  it("counts matches over included rows", () => {
    const records = [
      row(),
      row({ expected_tier: "risky", level: "risky", trust: 10 }),
      row({ expected_tier: "safe", level: "caution", trust: 55 }),
    ];
    const result = tierAgreement(records);
    expect(result.matches).toBe(2);
    expect(result.total).toBe(3);
    expect(result.agreement).toBeCloseTo(2 / 3);
  });

  it("excludes fetch failures from agreement, never as misses", () => {
    const records = [
      row(),
      row({
        url: "https://example.com/down",
        expected_tier: "risky",
        trust: null,
        level: null,
        fetchFailed: true,
      }),
    ];
    const result = tierAgreement(records);
    expect(result.total).toBe(1);
    expect(result.matches).toBe(1);
    expect(result.agreement).toBe(1);
  });

  it("returns null agreement when nothing is included", () => {
    const result = tierAgreement([]);
    expect(result.total).toBe(0);
    expect(result.agreement).toBeNull();
  });
});

describe("confusionMatrix", () => {
  it("tallies predicted level per expected tier, skipping failures", () => {
    const records = [
      row({ expected_tier: "safe", level: "safe" }),
      row({ expected_tier: "safe", level: "caution", trust: 55 }),
      row({ expected_tier: "risky", level: "risky", trust: 12 }),
      row({ trust: null, level: null, fetchFailed: true }),
    ];
    const { matrix, total } = confusionMatrix(records);
    expect(matrix.safe.safe).toBe(1);
    expect(matrix.safe.caution).toBe(1);
    expect(matrix.risky.risky).toBe(1);
    expect(matrix.caution.safe).toBe(0);
    expect(total).toBe(3);
  });
});

describe("pearson", () => {
  it("returns 1 for perfect positive linear relation", () => {
    expect(pearson([10, 50, 90], [0, 1, 2])).toBeCloseTo(1);
  });

  it("returns -1 for perfect inverse relation", () => {
    expect(pearson([10, 50, 90], [2, 1, 0])).toBeCloseTo(-1);
  });

  it("returns null for degenerate inputs", () => {
    expect(pearson([5], [1])).toBeNull();
    expect(pearson([7, 7, 7], [0, 1, 2])).toBeNull();
    expect(pearson([1, 2], [1])).toBeNull();
    expect(pearson([], [])).toBeNull();
  });
});

describe("spearman", () => {
  it("returns 1 for perfect monotone (non-linear) relation", () => {
    expect(spearman([1, 2, 3, 4], [1, 4, 9, 16])).toBeCloseTo(1);
  });

  it("handles tied tier ranks", () => {
    const value = spearman([10, 20, 80, 90], [0, 0, 2, 2]);
    expect(value).not.toBeNull();
    expect(value as number).toBeGreaterThan(0.5);
  });

  it("returns null for degenerate inputs", () => {
    expect(spearman([1], [2])).toBeNull();
    expect(spearman([3, 3], [1, 2])).toBeNull();
  });
});

describe("trustTierCorrelation", () => {
  it("correlates trust against tier rank over included rows", () => {
    const records = [
      row({ expected_tier: "safe", trust: 90, level: "safe" }),
      row({ expected_tier: "caution", trust: 55, level: "caution" }),
      row({ expected_tier: "risky", trust: 12, level: "risky" }),
    ];
    const result = trustTierCorrelation(records);
    expect(result.n).toBe(3);
    expect(result.pearson).toBeCloseTo(1, 2);
    expect(result.spearman).toBeCloseTo(1);
  });
});

describe("perTierCalibration", () => {
  it("reports mean trust and agreement per expected tier", () => {
    const records = [
      row({ expected_tier: "safe", trust: 90, level: "safe" }),
      row({ expected_tier: "safe", trust: 70, level: "caution" }),
      row({ expected_tier: "risky", trust: 12, level: "risky" }),
    ];
    const calibration = perTierCalibration(records);
    expect(calibration.safe.n).toBe(2);
    expect(calibration.safe.meanTrust).toBeCloseTo(80);
    expect(calibration.safe.agreementRate).toBeCloseTo(0.5);
    expect(calibration.safe.predicted).toEqual({
      safe: 1,
      caution: 1,
      risky: 0,
    });
    expect(calibration.risky.agreementRate).toBe(1);
    expect(calibration.caution.n).toBe(0);
    expect(calibration.caution.meanTrust).toBeNull();
  });
});

describe("failClosedRate", () => {
  it("counts completed rows served without LLM enrichment", () => {
    const records = [
      row({ llmStep: null }),
      row({ llmStep: "chat-primary" }),
      row({ trust: null, level: null, llmStep: null, fetchFailed: true }),
    ];
    const result = failClosedRate(records);
    expect(result.completed).toBe(2);
    expect(result.fallback).toBe(1);
    expect(result.rate).toBeCloseTo(0.5);
  });

  it("returns null rate when nothing completed", () => {
    expect(failClosedRate([]).rate).toBeNull();
  });
});

describe("summarize", () => {
  it("bundles every metric with excluded counts", () => {
    const records = [
      row(),
      row({ trust: null, level: null, fetchFailed: true }),
    ];
    const summary = summarize(records);
    expect(summary.total).toBe(2);
    expect(summary.included).toBe(1);
    expect(summary.excluded).toBe(1);
    expect(summary.agreement.agreement).toBe(1);
    expect(summary.confusion.total).toBe(1);
    expect(summary.failClosed.completed).toBe(1);
  });
});
