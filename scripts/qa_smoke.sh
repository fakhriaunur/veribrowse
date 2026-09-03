#!/usr/bin/env bash
set -euo pipefail

# VeriBrowse QA smoke — agent-followable, ephemeral by default
# Mirrors Aksantara qa_smoke.sh contract: --ephemeral starts server, curls every route, exits with cleanup

EPHEMERAL=false
PORT=3000
for arg in "$@"; do case $arg in --ephemeral) EPHEMERAL=true;; --port) shift;; esac; done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

pass() { echo "✅ $*"; }
fail() { echo "❌ $*"; exit 1; }

start_ephemeral() {
  echo "[qa] starting ephemeral next dev on $PORT..."
  # Prefer pnpm if available else npm
  if command -v pnpm >/dev/null 2>&1; then
    pnpm dev > /tmp/veribrowse-qa.log 2>&1 & echo $! > /tmp/veribrowse-qa.pid
  else
    npm run dev > /tmp/veribrowse-qa.log 2>&1 & echo $! > /tmp/veribrowse-qa.pid
  fi
  # wait for health
  for i in $(seq 1 60); do
    if curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
      echo "[qa] server ready after ${i}s"
      return 0
    fi
    sleep 1
  done
  echo "[qa] server failed to start — log:"
  cat /tmp/veribrowse-qa.log || true
  return 1
}

stop_ephemeral() {
  if [ -f /tmp/veribrowse-qa.pid ]; then
    pid=$(cat /tmp/veribrowse-qa.pid)
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    rm -f /tmp/veribrowse-qa.pid
    echo "[qa] stopped ephemeral $pid"
  fi
}

if $EPHEMERAL; then trap stop_ephemeral EXIT; start_ephemeral; fi

echo "[qa] curl /api/health"
curl -sf "http://127.0.0.1:$PORT/api/health" | tee /tmp/qa-health.json | grep -q '"status":"ok"' || fail "health failed"
pass "health"

echo "[qa] curl /api/score?fixture=1"
SCORE_BODY=$(curl -sf "http://127.0.0.1:$PORT/api/score?url=https://example.com&fixture=1" | tee /tmp/qa-score.json) || fail "score fixture failed"
echo "$SCORE_BODY" | grep -q '"trust"' || fail "score fixture failed"
pass "score fixture"

echo "[qa] curl /api/check?fixture=1"
CHECK_BODY=$(curl -sf "http://127.0.0.1:$PORT/api/check?claim=hello%20world%20claim%20text&fixture=1" | tee /tmp/qa-check.json) || fail "check fixture failed"
echo "$CHECK_BODY" | grep -q '"verdict"' || fail "check fixture failed"
pass "check fixture"

echo "[qa] curl / (html)"
curl -sf "http://127.0.0.1:$PORT/" | grep -q "VeriBrowse" || fail "page failed"
pass "page"

echo "[qa] check tool schemas present in page"
curl -sf "http://127.0.0.1:$PORT/" | grep -q "scoreWebsite" || fail "scoreWebsite not in page"
curl -sf "http://127.0.0.1:$PORT/" | grep -q "checkClaim" || fail "checkClaim not in page"
pass "tool strings in html"

echo "[qa] X-Request-Id present on health/score/check (echo + generated)"
curl -sD /tmp/qa-hdrs-health.txt "http://127.0.0.1:$PORT/api/health" -o /dev/null
grep -qi "X-Request-Id" /tmp/qa-hdrs-health.txt || fail "health missing X-Request-Id"
curl -sD /tmp/qa-hdrs-echo.txt -H "X-Request-Id: qa-echo-123" "http://127.0.0.1:$PORT/api/health" -o /dev/null
grep -q "qa-echo-123" /tmp/qa-hdrs-echo.txt || fail "health X-Request-Id echo failed"
curl -sD /tmp/qa-hdrs-score.txt "http://127.0.0.1:$PORT/api/score?url=https://example.com&fixture=1" -o /dev/null
grep -qi "X-Request-Id" /tmp/qa-hdrs-score.txt || fail "score missing X-Request-Id"
curl -sD /tmp/qa-hdrs-check.txt "http://127.0.0.1:$PORT/api/check?claim=hello%20world%20claim%20text&fixture=1" -o /dev/null
grep -qi "X-Request-Id" /tmp/qa-hdrs-check.txt || fail "check missing X-Request-Id"
pass "X-Request-Id headers"

echo "[qa] provenance present on score/check 200"
echo "$SCORE_BODY" | grep -q '"contentHash"' || fail "score missing provenance contentHash"
pass "score provenance"
echo "$CHECK_BODY" | grep -q '"checkedAt"' || fail "check missing checkedAt"
pass "check provenance"

echo "[qa] curl /api/metrics (Prometheus text/plain)"
METRICS_BODY=$(curl -sf "http://127.0.0.1:$PORT/api/metrics") || fail "metrics failed"
curl -sD /tmp/qa-hdrs-metrics.txt "http://127.0.0.1:$PORT/api/metrics" -o /dev/null
grep -qi "content-type: text/plain" /tmp/qa-hdrs-metrics.txt || fail "metrics wrong content-type"
grep -qi "X-Request-Id" /tmp/qa-hdrs-metrics.txt || fail "metrics missing X-Request-Id"
echo "$METRICS_BODY" | grep -q "# HELP score_requests_total" || fail "metrics missing HELP score_requests_total"
echo "$METRICS_BODY" | grep -q "# TYPE score_requests_total counter" || fail "metrics missing TYPE score_requests_total"
echo "$METRICS_BODY" | grep -q "score_requests_total [1-9]" || fail "metrics score_requests_total not incremented"
echo "$METRICS_BODY" | grep -q "check_requests_total [1-9]" || fail "metrics check_requests_total not incremented"
pass "metrics"

echo ""
pass "qa smoke complete — replay: try: mise run replay && mise run test"
echo "[qa] health:"; cat /tmp/qa-health.json; echo
echo "[qa] score:"; cat /tmp/qa-score.json | head -c 400; echo
echo "[qa] check:"; cat /tmp/qa-check.json | head -c 400; echo
