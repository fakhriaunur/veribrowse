#!/usr/bin/env bash
set -euo pipefail

# VeriBrowse QA smoke — agent-followable, ephemeral by default
# Mirrors Aksantara qa_smoke.sh contract: --ephemeral starts server, curls every route, exits with cleanup

EPHEMERAL=false
PORT=3000
while [ $# -gt 0 ]; do
  case "$1" in
    --ephemeral) EPHEMERAL=true; shift;;
    --port) PORT="${2:?--port requires a value}"; shift 2;;
    --port=*) PORT="${1#--port=}"; shift;;
    *) echo "[qa] unknown arg: $1" >&2; exit 2;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

pass() { echo "✅ $*"; }
fail() { echo "❌ $*"; exit 1; }

start_ephemeral() {
  echo "[qa] starting ephemeral next dev on $PORT..."
  # Invoke next directly with the honored --port (package.json `dev` pins 3000).
  # Never kill anything already on the port — fail fast instead; the caller
  # picks another free port via --port.
  if curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    echo "[qa] port $PORT already in use — refusing to kill it; rerun with --port <free>"
    return 1
  fi
  npx next dev --port "$PORT" > "/tmp/veribrowse-qa-$PORT.log" 2>&1 & echo $! > "/tmp/veribrowse-qa-$PORT.pid"
  # wait for health
  for i in $(seq 1 60); do
    if curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
      echo "[qa] server ready after ${i}s"
      return 0
    fi
    sleep 1
  done
  echo "[qa] server failed to start — log:"
  cat "/tmp/veribrowse-qa-$PORT.log" || true
  return 1
}

stop_ephemeral() {
  pidfile="/tmp/veribrowse-qa-$PORT.pid"
  if [ -f "$pidfile" ]; then
    pid=$(cat "$pidfile")
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    rm -f "$pidfile"
    echo "[qa] stopped ephemeral $pid (port $PORT)"
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

echo "[qa] 400 contract shapes (VAL-API-010,011,018,019,028)"
assert400() {
  desc="$1"; url="$2"; frag="$3"; kind="$4"  # kind: zod|plain
  code=$(curl -s -D /tmp/qa-400-hdrs.txt -o /tmp/qa-400-body.json -w "%{http_code}" "$url") || fail "$desc curl failed"
  [ "$code" = "400" ] || fail "$desc expected 400 got $code"
  grep -q '"error"' /tmp/qa-400-body.json || fail "$desc missing error field"
  grep -qi "X-Request-Id" /tmp/qa-400-hdrs.txt || fail "$desc missing X-Request-Id"
  grep -q "application/json" /tmp/qa-400-hdrs.txt || fail "$desc wrong content-type"
  grep -q "$frag" /tmp/qa-400-body.json || fail "$desc body missing fragment $frag"
  if [ "$kind" = "zod" ]; then
    grep -q '"issues"' /tmp/qa-400-body.json || fail "$desc missing issues array"
    grep -q '"details"' /tmp/qa-400-body.json || fail "$desc missing details"
  fi
  pass "$desc"
}
assert400 "score missing url" "http://127.0.0.1:$PORT/api/score" "Missing url" "plain"
assert400 "score fixture without url" "http://127.0.0.1:$PORT/api/score?fixture=1" "Missing url" "plain"
assert400 "score invalid url" "http://127.0.0.1:$PORT/api/score?url=not-a-url" "Invalid url" "zod"
assert400 "score invalid url with fixture" "http://127.0.0.1:$PORT/api/score?url=not-a-url&fixture=1" "Invalid url" "zod"
assert400 "check missing claim" "http://127.0.0.1:$PORT/api/check" "Missing claim" "plain"
assert400 "check short claim" "http://127.0.0.1:$PORT/api/check?claim=hi" "Invalid claim" "zod"

echo "[qa] 8-char claim passes validation then fail-closed (VAL-API-019)"
CODE8=$(curl -s -o /tmp/qa-8char.json -w "%{http_code}" "http://127.0.0.1:$PORT/api/check?claim=12345678") || fail "8char curl failed"
[ "$CODE8" = "200" ] || fail "8char expected 200 got $CODE8"
grep -q '"unverified"' /tmp/qa-8char.json || fail "8char expected unverified"
pass "8-char claim fail-closed unverified"

echo "[qa] X-Request-Id echo-test-999 on score/check/400 (VAL-API-024)"
curl -sD /tmp/qa-hdrs-score-echo.txt -H "X-Request-Id: echo-test-999" "http://127.0.0.1:$PORT/api/score?url=https://example.com&fixture=1" -o /dev/null
grep -q "echo-test-999" /tmp/qa-hdrs-score-echo.txt || fail "score X-Request-Id echo failed"
curl -sD /tmp/qa-hdrs-check-echo.txt -H "X-Request-Id: echo-test-999" "http://127.0.0.1:$PORT/api/check?claim=hello%20world%20claim%20text&fixture=1" -o /dev/null
grep -q "echo-test-999" /tmp/qa-hdrs-check-echo.txt || fail "check X-Request-Id echo failed"
curl -sD /tmp/qa-hdrs-400-echo.txt -H "X-Request-Id: echo-test-999" "http://127.0.0.1:$PORT/api/score" -o /dev/null
grep -q "echo-test-999" /tmp/qa-hdrs-400-echo.txt || fail "400 X-Request-Id echo failed"
pass "X-Request-Id echo on score/check/400"

echo "[qa] no sk- leakage in JSON responses (VAL-API-026)"
cat /tmp/qa-health.json /tmp/qa-score.json /tmp/qa-check.json /tmp/qa-8char.json /tmp/qa-400-body.json > /tmp/qa-all-json.txt
if grep -q "sk-" /tmp/qa-all-json.txt; then fail "secret leaked in JSON"; fi
pass "no sk- in JSON"

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

echo "[qa] golden diff vs tests/fixtures ignoring retrievedAt/checkedAt (VAL-CROSS-005,006,007)"
command -v jq >/dev/null 2>&1 || fail "jq required for golden diff"
curl -sf "http://127.0.0.1:$PORT/api/score?url=https://example.com&fixture=1" -o /tmp/qa-score-golden.json || fail "score golden curl failed"
jq -S 'del(.provenance.retrievedAt) | del(.raw.retrievedAt)' /tmp/qa-score-golden.json > /tmp/qa-score-norm.json
jq -S 'del(.provenance.retrievedAt) | del(.raw.retrievedAt)' "$ROOT/tests/fixtures/score.fixture.json" > /tmp/qa-score-golden-norm.json
diff -u /tmp/qa-score-golden-norm.json /tmp/qa-score-norm.json || fail "score golden diff non-empty"
grep -q '"trust": 42' /tmp/qa-score-norm.json || fail "score golden trust != 42"
pass "score fixture matches golden (trust 42, retrievedAt normalized)"
curl -sf "http://127.0.0.1:$PORT/api/check?claim=hello%20world%20fixture&fixture=1" -o /tmp/qa-check-golden.json || fail "check golden curl failed"
jq -S 'del(.provenance.checkedAt) | del(.evidence[].retrievedAt)' /tmp/qa-check-golden.json > /tmp/qa-check-norm.json
jq -S 'del(.provenance.checkedAt) | del(.evidence[].retrievedAt)' "$ROOT/tests/fixtures/check.fixture.json" > /tmp/qa-check-golden-norm.json
diff -u /tmp/qa-check-golden-norm.json /tmp/qa-check-norm.json || fail "check golden diff non-empty"
grep -q '"confidence": 0.82' /tmp/qa-check-norm.json || fail "check golden confidence != 0.82"
pass "check fixture matches golden (supported 0.82, checkedAt normalized)"

echo ""
pass "qa smoke complete — replay: try: mise run replay && mise run test"
echo "[qa] health:"; cat /tmp/qa-health.json; echo
echo "[qa] score:"; cat /tmp/qa-score.json | head -c 400; echo
echo "[qa] check:"; cat /tmp/qa-check.json | head -c 400; echo
