#!/usr/bin/env bash
set -euo pipefail
# Version drift gate: Node 22.11.0 alignment across mise.toml, netlify.toml, ci.yml, package.json
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXPECTED="22.11.0"
fail=0

echo "[version_drift] checking Node $EXPECTED alignment..."

check_file() {
  local file="$1"
  local label="$2"
  if [ ! -f "$ROOT/$file" ]; then
    echo "❌ missing $label ($file)"
    fail=1
    return
  fi
  if grep -q "$EXPECTED" "$ROOT/$file"; then
    echo "✅ $label ($file) contains $EXPECTED"
  else
    echo "❌ $label ($file) missing $EXPECTED"
    grep -n "node" "$ROOT/$file" || true
    fail=1
  fi
}

check_file "mise.toml" "mise.toml"
check_file "infra/netlify.toml" "netlify.toml NODE_VERSION"
check_file ".github/workflows/ci.yml" "ci.yml node-version"
check_file "package.json" "package.json engines"

# also check .nvmrc or .node-version if present (optional)
if [ -f "$ROOT/.nvmrc" ]; then
  check_file ".nvmrc" ".nvmrc"
fi

if [ $fail -ne 0 ]; then
  echo "[version_drift] FAILED — version drift detected (expected $EXPECTED everywhere)"
  exit 1
fi

echo "[version_drift] OK — all files aligned on $EXPECTED"
