// scripts/eval/run.mjs
// M14 benchmark runner — hits GET /api/score with pinned model/preset/timeout.
// --fixture dry-run mode costs $0 (every request carries fixture=1; this
// module never reads key material — see tests/eval/spend.test.ts).
// Guardians: per-run request cap, inter-call sleep, abort on repeated 429/403.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TIERS, summarize } from "./metrics.mjs";
import { resolveSpendPlan, formatUsd } from "./cost.mjs";
import { renderReport } from "./report.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATASET = join(HERE, "dataset.sample.json");
const DEFAULT_OUT_DIR = join(HERE, "out");
const GUARD_CONSECUTIVE_LIMIT = 3;

function usage() {
  return [
    "Usage: node scripts/eval/run.mjs [options]",
    "  --dataset=<path>     dataset JSON (default scripts/eval/dataset.sample.json)",
    "  --base-url=<url>     app base URL (default http://127.0.0.1:3000)",
    "  --fixture            dry-run: fixture=1 on every request, $0 (default)",
    "  --live               keyed run: requires --confirm-spend, spends real money",
    "  --confirm-spend      acknowledge the printed estimate for a --live run",
    "  --model=<name>       pinned model recorded in the report (default gpt-4o-mini)",
    "  --timeout-ms=<n>     pinned step timeout sent as llmTimeoutMs (default config/llm.json)",
    "  --max-requests=<n>   per-run request cap (default 120)",
    "  --sleep-ms=<n>       inter-call sleep (default 250)",
    "  --out-dir=<path>     output dir for records.jsonl + report.md (default scripts/eval/out)",
  ].join("\n");
}

const FLAG_OPTIONS = {
  "--fixture": (args) => {
    args.fixture = true;
  },
  "--live": (args) => {
    args.fixture = false;
  },
  "--confirm-spend": (args) => {
    args.confirmSpend = true;
  },
  "--help": (args) => {
    args.help = true;
  },
  "-h": (args) => {
    args.help = true;
  },
};

const VALUE_OPTIONS = {
  "--dataset=": (args, value) => {
    args.dataset = value;
  },
  "--base-url=": (args, value) => {
    args.baseUrl = value;
  },
  "--model=": (args, value) => {
    args.model = value;
  },
  "--timeout-ms=": (args, value) => {
    args.timeoutMs = Number(value);
  },
  "--max-requests=": (args, value) => {
    args.maxRequests = Number(value);
  },
  "--sleep-ms=": (args, value) => {
    args.sleepMs = Number(value);
  },
  "--out-dir=": (args, value) => {
    args.outDir = value;
  },
};

function assertBudgetInt(name, value, min) {
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`--${name} must be an integer >= ${min}\n${usage()}`);
  }
}

export function parseArgs(argv) {
  const args = {
    dataset: DEFAULT_DATASET,
    baseUrl: "http://127.0.0.1:3000",
    fixture: true,
    confirmSpend: false,
    model: "gpt-4o-mini",
    timeoutMs: null,
    maxRequests: 120,
    sleepMs: 250,
    outDir: DEFAULT_OUT_DIR,
  };
  for (const token of argv.slice(2)) {
    const flag = FLAG_OPTIONS[token];
    if (flag) {
      flag(args);
      continue;
    }
    const prefix = Object.keys(VALUE_OPTIONS).find((key) =>
      token.startsWith(key),
    );
    if (prefix) {
      VALUE_OPTIONS[prefix](args, token.slice(prefix.length));
      continue;
    }
    throw new Error(`Unknown arg: ${token}\n${usage()}`);
  }
  assertBudgetInt("max-requests", args.maxRequests, 1);
  assertBudgetInt("sleep-ms", args.sleepMs, 0);
  if (args.timeoutMs != null) assertBudgetInt("timeout-ms", args.timeoutMs, 1);
  return args;
}

export function resolveTimeoutMs(explicitMs) {
  if (explicitMs != null)
    return { timeoutMs: explicitMs, source: "cli --timeout-ms" };
  try {
    const raw = readFileSync(
      join(HERE, "..", "..", "config", "llm.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw);
    const fallback = parsed?.timeoutMs?.default;
    if (Number.isInteger(fallback) && fallback > 0) {
      return { timeoutMs: fallback, source: "config/llm.json" };
    }
  } catch {
    // fall through to the hardcoded default below
  }
  return { timeoutMs: 10000, source: "built-in default" };
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateDataset(dataset) {
  const errors = [];
  if (!dataset || typeof dataset !== "object" || Array.isArray(dataset)) {
    return {
      rows: [],
      errors: ["dataset root must be an object with a rows array"],
    };
  }
  const rows = dataset.rows;
  if (!Array.isArray(rows)) {
    return { rows: [], errors: ["dataset.rows must be an array"] };
  }
  rows.forEach((row, index) => {
    const where = `rows[${index}]`;
    if (!row || typeof row !== "object") {
      errors.push(`${where}: must be an object`);
      return;
    }
    if (typeof row.url !== "string" || !isHttpUrl(row.url)) {
      errors.push(`${where}.url: must be a valid http(s) URL`);
    }
    if (!TIERS.includes(row.expected_tier)) {
      errors.push(`${where}.expected_tier: must be one of ${TIERS.join(", ")}`);
    }
    if (
      typeof row.auditor_source !== "string" ||
      row.auditor_source.length === 0
    ) {
      errors.push(`${where}.auditor_source: must be a non-empty string`);
    }
    if (typeof row.citation !== "string" || row.citation.length === 0) {
      errors.push(`${where}.citation: must be a non-empty string`);
    }
    if (row.notes != null && typeof row.notes !== "string") {
      errors.push(`${where}.notes: must be a string when present`);
    }
  });
  return { rows: errors.length === 0 ? rows : [], errors };
}

export function loadDatasetFile(datasetPath) {
  let raw;
  try {
    raw = readFileSync(datasetPath, "utf8");
  } catch (error) {
    return { ok: false, error: `cannot read dataset: ${String(error)}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ok: false, error: `dataset is not valid JSON: ${String(error)}` };
  }
  const { rows, errors } = validateDataset(parsed);
  if (errors.length > 0) {
    return {
      ok: false,
      error: `dataset schema errors:\n- ${errors.join("\n- ")}`,
    };
  }
  return { ok: true, dataset: parsed, rows };
}

export function buildScoreUrl(baseUrl, rowUrl, { fixture, timeoutMs }) {
  const url = new URL("/api/score", baseUrl);
  url.searchParams.set("url", rowUrl);
  if (fixture) {
    url.searchParams.set("fixture", "1");
  } else {
    url.searchParams.set("llmTimeoutMs", String(timeoutMs));
  }
  return url.toString();
}

function sleep(ms) {
  return new Promise((response) => setTimeout(response, ms));
}

function failedRow(row, error) {
  return {
    url: row.url,
    expected_tier: row.expected_tier,
    auditor_source: row.auditor_source,
    citation: row.citation,
    notes: row.notes ?? null,
    contentHash: null,
    date: null,
    trust: null,
    level: null,
    llmStep: null,
    fetchFailed: true,
    error,
  };
}

async function attemptRow({ row, requestUrl, fetchFn, nowFn }) {
  let response;
  try {
    response = await fetchFn(requestUrl, {
      headers: { accept: "application/json" },
    });
  } catch (error) {
    return {
      outcome: "failed",
      record: {
        ...failedRow(row, `request failed: ${String(error)}`),
        date: nowFn(),
      },
    };
  }
  if (response.status === 429 || response.status === 403) {
    return {
      outcome: "guard",
      record: { ...failedRow(row, `http ${response.status}`), date: nowFn() },
    };
  }
  if (!response.ok) {
    return {
      outcome: "failed",
      record: { ...failedRow(row, `http ${response.status}`), date: nowFn() },
    };
  }
  let body;
  try {
    body = await response.json();
  } catch {
    return {
      outcome: "failed",
      record: {
        ...failedRow(row, "bad-shape: response is not JSON"),
        date: nowFn(),
      },
    };
  }
  const record = shapeRecord(row, body, nowFn);
  return { outcome: record.fetchFailed ? "failed" : "ok", record };
}

function hasTrustShape(body) {
  return (
    typeof body?.trust === "number" &&
    Number.isFinite(body.trust) &&
    TIERS.includes(body?.level)
  );
}

function shapeRecord(row, body, nowFn) {
  if (!hasTrustShape(body)) {
    return {
      ...failedRow(row, "bad-shape: missing trust/level"),
      date: nowFn(),
    };
  }
  return {
    url: row.url,
    expected_tier: row.expected_tier,
    auditor_source: row.auditor_source,
    citation: row.citation,
    notes: row.notes ?? null,
    contentHash: body?.provenance?.contentHash ?? null,
    date: nowFn(),
    trust: body.trust,
    level: body.level,
    llmStep: body?.provenance?.llmStep ?? null,
    fetchFailed: false,
  };
}

export async function runDataset({
  rows,
  baseUrl,
  fixture,
  timeoutMs,
  maxRequests,
  sleepMs,
  fetchFn = globalThis.fetch,
  sleepFn = sleep,
  nowFn = () => new Date().toISOString(),
}) {
  const capped = rows.slice(0, maxRequests);
  const records = [];
  let guardTrips = 0;
  let aborted = false;
  for (let i = 0; i < capped.length; i += 1) {
    const row = capped[i];
    const requestUrl = buildScoreUrl(baseUrl, row.url, { fixture, timeoutMs });
    const attempt = await attemptRow({ row, requestUrl, fetchFn, nowFn });
    records.push(attempt.record);
    if (attempt.outcome === "guard") {
      guardTrips += 1;
      if (guardTrips >= GUARD_CONSECUTIVE_LIMIT) {
        aborted = true;
        break;
      }
      continue;
    }
    guardTrips = 0;
    if (attempt.outcome === "ok" && sleepMs > 0 && i < capped.length - 1) {
      await sleepFn(sleepMs);
    }
  }
  return {
    records,
    stats: {
      requested: rows.length,
      attempted: capped.length,
      truncated: rows.length > capped.length,
      recorded: records.length,
      excluded: records.filter((record) => record.fetchFailed).length,
      aborted,
    },
  };
}

export async function fetchHealthPreset(baseUrl, fetchFn = globalThis.fetch) {
  try {
    const response = await fetchFn(
      new URL("/api/health?verbose=1", baseUrl).toString(),
      {
        headers: { accept: "application/json" },
      },
    );
    if (!response.ok) return { preset: "unknown", source: null };
    const body = await response.json();
    return {
      preset: body?.rubric?.preset ?? "unknown",
      source: body?.rubric?.source ?? null,
    };
  } catch {
    return { preset: "unknown", source: null };
  }
}

function gateSpend(args, spend, rowCount, log) {
  log(
    `Spend plan: mode=${spend.mode} rows=${rowCount} llmCalls=${spend.llmCalls} estimated=${formatUsd(spend.usd)}`,
  );
  if (!args.fixture && !args.confirmSpend) {
    log(
      "REFUSED: keyed run without --confirm-spend. No requests were sent. Re-run with --confirm-spend to accept the estimate above.",
    );
    return 2;
  }
  if (args.fixture) {
    log(
      `$0 proof: mode=fixture-dry-run, every request carries fixture=1, estimated=${formatUsd(0)}.`,
    );
  }
  return null;
}

function buildContext({
  args,
  dataset,
  timeoutMs,
  timeoutSource,
  health,
  nowFn,
  spend,
}) {
  return {
    baseUrl: args.baseUrl,
    fixture: args.fixture,
    model: args.model,
    preset: health.preset,
    presetSource: health.source ?? "unknown",
    timeoutMs,
    timeoutSource,
    datasetName: dataset.name ?? "unnamed",
    datasetVersion: dataset.version ?? "0",
    generatedAt: nowFn(),
    spend,
  };
}

function writeOutputs({ records, summary, context, outDir, log }) {
  const markdown = renderReport({ records, summary, context });
  mkdirSync(outDir, { recursive: true });
  const jsonlPath = join(outDir, "records.jsonl");
  const reportPath = join(outDir, "report.md");
  writeFileSync(
    jsonlPath,
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
  );
  writeFileSync(reportPath, markdown);
  log(`Wrote ${jsonlPath} and ${reportPath}`);
}

export async function main(argv = process.argv, deps = {}) {
  const fetchFn = deps.fetchFn ?? globalThis.fetch;
  const sleepFn = deps.sleepFn ?? sleep;
  const nowFn = deps.nowFn ?? (() => new Date().toISOString());
  const log = deps.log ?? console.log;

  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    log(String(error));
    return 2;
  }
  if (args.help) {
    log(usage());
    return 0;
  }

  const loaded = loadDatasetFile(resolve(args.dataset));
  if (!loaded.ok) {
    log(`Dataset error: ${loaded.error}`);
    return 2;
  }
  const { dataset, rows } = loaded;

  const spend = resolveSpendPlan({
    fixture: args.fixture,
    rowCount: rows.length,
    model: args.model,
  });
  const gated = gateSpend(args, spend, rows.length, log);
  if (gated != null) return gated;

  const { timeoutMs, source: timeoutSource } = resolveTimeoutMs(args.timeoutMs);
  const health = await fetchHealthPreset(args.baseUrl, fetchFn);

  const { records, stats } = await runDataset({
    rows,
    baseUrl: args.baseUrl,
    fixture: args.fixture,
    timeoutMs,
    maxRequests: args.maxRequests,
    sleepMs: args.sleepMs,
    fetchFn,
    sleepFn,
    nowFn,
  });

  const summary = summarize(records);
  const context = buildContext({
    args,
    dataset,
    timeoutMs,
    timeoutSource,
    health,
    nowFn,
    spend,
  });
  writeOutputs({ records, summary, context, outDir: args.outDir, log });

  log(
    `Rows: requested=${stats.requested} attempted=${stats.attempted} recorded=${stats.recorded} excluded=${stats.excluded} aborted=${stats.aborted}`,
  );
  log(
    `Agreement: ${summary.agreement.matches}/${summary.agreement.total} (excluded ${summary.excluded} fetch failures, never misses)`,
  );
  return stats.aborted ? 3 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(String(error));
      process.exit(1);
    },
  );
}
