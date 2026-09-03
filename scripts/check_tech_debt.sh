#!/usr/bin/env bash
set -euo pipefail
if grep -rn "TODO" --include="*.ts" --include="*.tsx" lib app components | grep -v "TODO(#" | grep -q "TODO"; then
  echo "Untracked TODO found — use TODO(#123)"
  grep -rn "TODO" --include="*.ts" --include="*.tsx" lib app components | grep -v "TODO(#"
  exit 1
fi
echo "tech-debt ok"
