#!/usr/bin/env bash
set -euo pipefail
# check_agents_md.sh — validate AGENTS.md stays consistent with the repo.
#
# This is the automation behind the `agents_md_validation` readiness signal:
# it proves AGENTS.md commands/paths still work instead of rotting.
#
# Checks (hermetic, seconds — no network, no builds, no servers):
#   1. AGENTS.md exists (prerequisite for the signal).
#   2. Every `mise run <task>` task referenced in AGENTS.md exists as a
#      `[tasks.<name>]` section in mise.toml (angle-bracket placeholders
#      like `mise run <task>` are skipped; `mise install` is a builtin,
#      not a task, and is never extracted).
#   3. Every concrete *file* path referenced in backticks in AGENTS.md
#      resolves on disk — exact relative path or suffix match (so
#      `workflows/ci.yml` matches `.github/workflows/ci.yml`).
#      Directory-only references (trailing `/`) are warn-only: the guide
#      names future-planned dirs (`infra/containers/`, `skills/`) that do
#      not exist yet on purpose.
#   4. Every `scripts/<name>.sh|.mjs` mention anywhere in AGENTS.md resolves
#      to a real file (`check_*.sh`-style globs must match >= 1 file), plus
#      bare backticked `*.sh`/`*.mjs` names resolved under `scripts/`.
#
# Usage: scripts/check_agents_md.sh [--agents-md PATH]
# Fails nonzero on stale references; passes on a consistent checkout.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILE="$ROOT/AGENTS.md"
if [ "${1:-}" = "--agents-md" ] && [ -n "${2:-}" ]; then
  FILE="$2"
fi
fail=0
warn=0

echo "[agents_md] checking $FILE ..."

# 1. prerequisite: file exists
if [ ! -f "$FILE" ]; then
  echo "❌ AGENTS.md missing ($FILE)"
  exit 1
fi
echo "✅ AGENTS.md exists"

# 2. mise tasks referenced vs defined
defined="$(grep -oE '^\[tasks\.("[^"]+"|[^]]+)\]' "$ROOT/mise.toml" \
  | sed -E 's/^\[tasks\.//; s/\]$//; s/"//g' | sort -u)"
referenced="$(grep -oE 'mise run [A-Za-z0-9_:.<>-]+' "$FILE" \
  | awk '{print $3}' | grep -v '[<>]' | sort -u || true)"
if [ -z "$referenced" ]; then
  echo "❌ no \`mise run <task>\` references found in AGENTS.md — extractor broken?"
  fail=1
else
  while IFS= read -r task; do
    [ -z "$task" ] && continue
    if printf '%s\n' "$defined" | grep -qxF "$task"; then
      echo "✅ mise task referenced and defined: $task"
    else
      echo "❌ mise task referenced in AGENTS.md but missing from mise.toml [tasks]: $task"
      fail=1
    fi
  done <<< "$referenced"
fi

# helper: resolve a path token to an on-disk file (exact match, else suffix
# match with node_modules/.git pruned for speed)
resolve_file() {
  local token="$1"
  if [ -e "$ROOT/$token" ]; then
    return 0
  fi
  if [ -n "$(find "$ROOT" -path "$ROOT/node_modules" -prune -o -path "$ROOT/.git" -prune -o -path "*/$token" -print 2>/dev/null | head -5)" ]; then
    return 0
  fi
  return 1
}

# 3. backticked file paths (skip URLs, shell commands with spaces/pipes/vars)
paths="$(grep -oE '`[^`]*`' "$FILE" | tr -d '`' \
  | grep '/' | grep -v '://' | grep -v '^GET ' | grep -v ' ' | grep -v '|' | grep -v '\$' | sort -u || true)"
while IFS= read -r p; do
  [ -z "$p" ] && continue
  case "$p" in
    */) # directory-only reference: warn-only (future-planned dirs allowed)
      d="${p%/}"
      if [ -d "$ROOT/$d" ]; then
        echo "✅ dir referenced and present: $p"
      else
        echo "⚠️  dir referenced but not present yet (warn-only, may be planned): $p"
        warn=1
      fi
      ;;
    *) # concrete file: must resolve
      if resolve_file "$p"; then
        echo "✅ path referenced and present: $p"
      else
        echo "❌ path referenced in AGENTS.md but missing on disk: $p"
        fail=1
      fi
      ;;
  esac
done <<< "$paths"

# 4a. scripts/ mentions anywhere (covers `./scripts/qa_smoke.sh --ephemeral`
# prose as well as backticked names)
scripts_refs="$(grep -oE 'scripts/[A-Za-z0-9_.*-]+\.(sh|mjs)' "$FILE" | sort -u || true)"
while IFS= read -r s; do
  [ -z "$s" ] && continue
  case "$s" in
    *\**) # glob (e.g. check_*.sh): must match >= 1 file
      if compgen -G "$ROOT/$s" > /dev/null; then
        echo "✅ script glob referenced and matches: $s"
      else
        echo "❌ script glob referenced in AGENTS.md but matches nothing: $s"
        fail=1
      fi
      ;;
    *)
      if [ -f "$ROOT/$s" ]; then
        echo "✅ script referenced and present: $s"
      else
        echo "❌ script referenced in AGENTS.md but missing: $s"
        fail=1
      fi
      ;;
  esac
done <<< "$scripts_refs"

# 4b. bare backticked *.sh/*.mjs names (e.g. repo-layout line) resolve under scripts/
bare_refs="$(grep -oE '`[^`]*`' "$FILE" | tr -d '`' \
  | grep -E '^[A-Za-z0-9_*.-]+\.(sh|mjs)$' | sort -u || true)"
while IFS= read -r b; do
  [ -z "$b" ] && continue
  case "$b" in
    *\**)
      if compgen -G "$ROOT/scripts/$b" > /dev/null; then
        echo "✅ bare script glob referenced and matches under scripts/: $b"
      else
        echo "❌ bare script glob referenced in AGENTS.md but matches nothing under scripts/: $b"
        fail=1
      fi
      ;;
    *)
      if [ -f "$ROOT/scripts/$b" ]; then
        echo "✅ bare script referenced and present under scripts/: $b"
      else
        echo "❌ bare script referenced in AGENTS.md but missing under scripts/: $b"
        fail=1
      fi
      ;;
  esac
done <<< "$bare_refs"

if [ "$fail" -ne 0 ]; then
  echo "[agents_md] FAILED — stale AGENTS.md references detected"
  exit 1
fi
if [ "$warn" -ne 0 ]; then
  echo "[agents_md] OK with warnings (planned dirs only)"
else
  echo "[agents_md] OK — tasks and paths consistent"
fi
