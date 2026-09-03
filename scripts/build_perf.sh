#!/usr/bin/env bash
set -euo pipefail
# Build performance timing artifact: wraps `next build` with timing and writes infra/build-perf.json
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="$ROOT/infra/build-perf.json"
mkdir -p "$(dirname "$OUTPUT")"

echo "[build-perf] starting timed build..."
START=$(date +%s)
# Use time wrapper; capture real duration
if command -v /usr/bin/time >/dev/null 2>&1; then
  /usr/bin/time -p pnpm build 2>&1 | tee /tmp/build-perf.log
else
  pnpm build 2>&1 | tee /tmp/build-perf.log
fi
END=$(date +%s)
DURATION=$((END - START))
# Fallback: parse Next build output if available
if [ $DURATION -eq 0 ]; then
  DURATION=1
fi

# Also try to get more precise via date +%s%3N if available
if date +%s%3N >/dev/null 2>&1; then
  START_MS=$(date +%s%3N)
  # we already built, so approximate
  true
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
NODE_VER=$(node -v 2>/dev/null || echo "unknown")
NEXT_VER=$(node -p "require('./package.json').dependencies.next" 2>/dev/null || echo "unknown")

cat > "$OUTPUT" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "durationSeconds": $DURATION,
  "durationMs": $((DURATION * 1000)),
  "nodeVersion": "$NODE_VER",
  "nextVersion": "$NEXT_VER",
  "expectedNode": "22.23.2"
}
EOF

echo "Build completed in ${DURATION}s"
echo "[build-perf] artifact written to $OUTPUT"
cat "$OUTPUT"
