#!/usr/bin/env bash
set -euo pipefail
MAX_LINES=700
MAX_BYTES=153600
found=0
while IFS= read -r -d '' f; do
  lines=$(wc -l < "$f")
  bytes=$(wc -c < "$f")
  if [ "$lines" -gt "$MAX_LINES" ] || [ "$bytes" -gt "$MAX_BYTES" ]; then
    echo "Large file: $f lines=$lines bytes=$bytes (limit $MAX_LINES lines / $MAX_BYTES bytes)"
    found=1
  fi
done < <(find lib app components -type f \( -name "*.ts" -o -name "*.tsx" \) -print0 2>/dev/null || true)
exit $found
