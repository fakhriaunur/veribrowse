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
curl -sf "http://127.0.0.1:$PORT/api/score?url=https://example.com&fixture=1" | tee /tmp/qa-score.json | grep -q '"trust"' || fail "score fixture failed"
pass "score fixture"

echo "[qa] curl /api/check?fixture=1"
curl -sf "http://127.0.0.1:$PORT/api/check?claim=hello%20world%20claim%20text&fixture=1" | tee /tmp/qa-check.json | grep -q '"verdict"' || fail "check fixture failed"
pass "check fixture"

echo "[qa] curl / (html)"
curl -sf "http://127.0.0.1:$PORT/" | grep -q "VeriBrowse" || fail "page failed"
pass "page"

echo "[qa] check tool schemas present in page"
curl -sf "http://127.0.0.1:$PORT/" | grep -q "scoreWebsite" || fail "scoreWebsite not in page"
curl -sf "http://127.0.0.1:$PORT/" | grep -q "checkClaim" || fail "checkClaim not in page"
pass "tool strings in html"

echo ""
pass "qa smoke complete — replay: try: mise run replay && mise run test"
echo "[qa] health:"; cat /tmp/qa-health.json; echo
echo "[qa] score:"; cat /tmp/qa-score.json | head -c 400; echo
echo "[qa] check:"; cat /tmp/qa-check.json | head -c 400; echo
