// scripts/eval/report.mjs
// M14 markdown report renderer — pure function only (no I/O, no env).
// Renders tier agreement, confusion matrix, Pearson+Spearman vs tier rank,
// per-tier calibration, and the fail-closed (fallback) rate.

import { TIERS } from "./metrics.mjs";
import { formatUsd } from "./cost.mjs";

function fmt(value, digits = 3) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return value.toFixed(digits);
}

function pct(value) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${(value * 100).toFixed(1)}%`;
}

function confusionTable(confusion) {
  const header = `| actual \\ predicted | ${TIERS.join(" | ")} |`;
  const divider = `| --- | ${TIERS.map(() => " --- ").join("|")} |`;
  const rows = TIERS.map(
    (actual) =>
      `| ${actual} | ${TIERS.map((predicted) => confusion.matrix[actual][predicted]).join(" | ")} |`,
  );
  return [header, divider, ...rows].join("\n");
}

function calibrationTable(calibration) {
  const header =
    "| expected tier | n | mean trust | agreement | predicted safe/caution/risky |";
  const divider = "| --- | --- | --- | --- | --- |";
  const rows = TIERS.map((tier) => {
    const cell = calibration[tier];
    const predicted = TIERS.map((level) => cell.predicted[level]).join("/");
    return `| ${tier} | ${cell.n} | ${fmt(cell.meanTrust, 1)} | ${pct(cell.agreementRate)} | ${predicted} |`;
  });
  return [header, divider, ...rows].join("\n");
}

function excludedTable(records) {
  const excluded = records.filter((record) => record.fetchFailed);
  if (excluded.length === 0) return "None — every row completed.";
  const lines = excluded.map(
    (record) => `- ${record.url} — ${record.error ?? "unknown error"}`,
  );
  return lines.join("\n");
}

export function renderReport({ records, summary, context }) {
  const lines = [];
  lines.push(`# M14 URL-trust benchmark — ${context.datasetName}`);
  lines.push("");
  lines.push(`Generated: ${context.generatedAt}`);
  lines.push("");
  lines.push("## Run pins");
  lines.push("");
  lines.push(`- base URL: ${context.baseUrl}`);
  lines.push(`- mode: ${context.fixture ? "fixture dry-run ($0)" : "keyed"}`);
  lines.push(`- model pin: ${context.model}`);
  lines.push(`- rubric preset: ${context.preset} (${context.presetSource})`);
  lines.push(
    `- step timeout pin: ${context.timeoutMs}ms (${context.timeoutSource})`,
  );
  lines.push(
    `- dataset: ${context.datasetName} v${context.datasetVersion} (${records.length} rows)`,
  );
  lines.push("");
  lines.push("## Spend");
  lines.push("");
  lines.push(
    `- estimated spend: ${formatUsd(context.spend.usd)} (${context.spend.llmCalls} LLM calls)`,
  );
  if (context.fixture) {
    lines.push(`- $0 proof: ${context.spend.proof}`);
  }
  lines.push("");
  lines.push("## Headline");
  lines.push("");
  lines.push(
    `- tier agreement: ${pct(summary.agreement.agreement)} (${summary.agreement.matches}/${summary.agreement.total} included rows)`,
  );
  lines.push(
    `- Pearson(trust, tier rank): ${fmt(summary.correlation.pearson)} (n=${summary.correlation.n})`,
  );
  lines.push(
    `- Spearman(trust, tier rank): ${fmt(summary.correlation.spearman)} (n=${summary.correlation.n})`,
  );
  lines.push(
    `- fail-closed (fallback) rate: ${pct(summary.failClosed.rate)} (${summary.failClosed.fallback}/${summary.failClosed.completed} completed rows served without LLM enrichment)`,
  );
  lines.push(
    `- excluded from agreement (fetch failures, never misses): ${summary.excluded}`,
  );
  lines.push("");
  lines.push("## Confusion matrix (predicted level vs expected tier)");
  lines.push("");
  lines.push(confusionTable(summary.confusion));
  lines.push("");
  lines.push("## Per-tier calibration");
  lines.push("");
  lines.push(calibrationTable(summary.calibration));
  lines.push("");
  lines.push("## Excluded rows");
  lines.push("");
  lines.push(excludedTable(records));
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push(
    "- Tier rank mapping for correlation: risky=0, caution=1, safe=2 (higher trust should track higher rank).",
  );
  lines.push(
    "- Fetch failures are excluded from agreement/confusion/correlation/calibration denominators and listed above; they are never scored as misses.",
  );
  lines.push(
    "- contentHash + date are recorded per row in records.jsonl; pages drift, so re-runs are comparable only via stored hashes.",
  );
  if (context.fixture) {
    lines.push(
      "- Fixture dry-run: the server returns the pinned trust 42/caution for every URL, so agreement here exercises harness math, not model quality.",
    );
  }
  lines.push("");
  return lines.join("\n");
}
