#!/usr/bin/env bash
set -euo pipefail
# test_perf.sh — per-test timing + tracked performance summary.
#
# This is the automation behind the `test_performance_tracking` readiness
# signal: it proves the suite measures and tracks test duration, not just
# pass/fail. Mirrors the scripts/build_perf.sh pattern (timed run writes a
# gitignored JSON artifact under infra/), but for vitest instead of Next.
#
# What it does (single vitest run):
#   1. Verbose per-test timing on stdout
#      (--reporter=verbose prints each test with its ms; the summary footer
#      prints total Duration + env/import/transform/tests/worker breakdown;
#      --slow-test-threshold flags slow tests inline).
#      NOTE: vitest 5 has no `--durations` flag (that is pytest/jest);
#      --reporter=verbose + --slow-test-threshold is the native equivalent.
#   2. Machine-readable timing report at infra/vitest-timing.json
#      (--reporter=json --outputFile; per-file startTime/endTime and
#      per-test assertion duration) — uploaded as a CI artifact.
#   3. Small trendable summary at infra/test-perf.json (slowest 10 files,
#      slowest 10 tests, total duration) — uploaded as a CI artifact.
#
# Both JSON outputs are gitignored (local trending / CI artifacts only,
# never committed). Exit code propagates the vitest result.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TIMING_JSON="$ROOT/infra/vitest-timing.json"
SUMMARY_JSON="$ROOT/infra/test-perf.json"
SLOW_THRESHOLD_MS=100
mkdir -p "$ROOT/infra"

echo "[test-perf] running suite with per-test timing (slow-test-threshold=${SLOW_THRESHOLD_MS}ms)..."
set +e
npx vitest run \
  --reporter=verbose \
  --reporter=json \
  --outputFile="$TIMING_JSON" \
  --slow-test-threshold="$SLOW_THRESHOLD_MS" \
  2>&1 | tee /tmp/test-perf.log
VITEST_EXIT=${PIPESTATUS[0]:-$?}
set -e

if [ ! -f "$TIMING_JSON" ]; then
  echo "[test-perf] ERROR: timing report missing ($TIMING_JSON)"
  exit "${VITEST_EXIT:-1}"
fi

node -e '
const fs = require("fs");
const pkg = require("./package.json");
const report = JSON.parse(fs.readFileSync("./infra/vitest-timing.json", "utf8"));
const threshold = Number(process.env.SLOW_THRESHOLD_MS || 100);
const files = (report.testResults || []).map((t) => ({
  file: String(t.name || "").replace(process.cwd() + "/", ""),
  durationMs: Math.round(((t.endTime || 0) - (t.startTime || 0)) * 100) / 100,
  status: t.status,
}));
files.sort((a, b) => b.durationMs - a.durationMs);
const tests = [];
for (const t of report.testResults || []) {
  for (const a of t.assertionResults || []) {
    tests.push({
      name: a.fullName || a.title,
      durationMs: Math.round((a.duration || 0) * 100) / 100,
      status: a.status,
    });
  }
}
tests.sort((a, b) => b.durationMs - a.durationMs);
const starts = (report.testResults || []).map((t) => t.startTime || 0).filter(Boolean);
const ends = (report.testResults || []).map((t) => t.endTime || 0).filter(Boolean);
const summary = {
  timestamp: new Date().toISOString(),
  nodeVersion: process.version,
  vitestVersion: (pkg.devDependencies && pkg.devDependencies.vitest) || "unknown",
  slowTestThresholdMs: threshold,
  totals: {
    suites: report.numTotalTestSuites || 0,
    suitesPassed: report.numPassedTestSuites || 0,
    suitesFailed: report.numFailedTestSuites || 0,
    tests: report.numTotalTests || 0,
    testsPassed: report.numPassedTests || 0,
    testsFailed: report.numFailedTests || 0,
    totalDurationMs: starts.length && ends.length ? Math.round((Math.max(...ends) - Math.min(...starts)) * 100) / 100 : 0,
  },
  slowestFiles: files.slice(0, 10),
  slowestTests: tests.slice(0, 10).map((t) => ({ ...t, slow: t.durationMs >= threshold })),
  sourceReport: "infra/vitest-timing.json",
};
fs.writeFileSync("./infra/test-perf.json", JSON.stringify(summary, null, 2) + "\n");
console.log(`[test-perf] ${summary.totals.testsPassed}/${summary.totals.tests} tests passed in ${summary.totals.totalDurationMs}ms`);
console.log("[test-perf] slowest files:");
for (const f of summary.slowestFiles.slice(0, 5)) console.log(`  ${f.durationMs}ms  ${f.file}`);
console.log("[test-perf] slowest tests:");
for (const t of summary.slowestTests.slice(0, 5)) console.log(`  ${t.durationMs}ms  ${t.name}`);
'

echo "[test-perf] artifacts: $TIMING_JSON + $SUMMARY_JSON (gitignored, CI-uploaded)"
exit "$VITEST_EXIT"
