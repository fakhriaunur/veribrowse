# M14 URL-trust benchmark harness (dry-run only)

Eval code lives in `scripts/eval/` + dataset files ONLY. No changes to
`app/`, `lib/`, routes, or fixtures. Product behavior is untouched by M14.

## Precondition note

The M14 research file (`contract-work/m14-eval-sources.md`) was absent from
the worktree, so the design below follows the feature spec + mission doc.
The frozen auditor-labeled `dataset.v1.json` still needs the user-approved
candidate list from that research — see the spend gates.

## Spend gates (HARD)

1. Zero-spend dry-run harness on fixtures (this directory — do that first).
2. User approves the frozen labeled list.
3. 20-URL pilot on the user's key in a local clean-room.
4. User approves the 100+ full run.

No live-LLM eval run happens without explicit user approval for that stage.

## $0 proof (fixture dry-run)

- Every request carries `fixture=1`, which bypasses page fetch and LLM.
- No harness module reads key material: `scripts/eval/*.mjs` contains no
  `process.env` access (asserted by `tests/eval/spend.test.ts`), and the
  dry-run self-test asserts every outbound URL has `fixture=1` with no
  `authorization` header.
- A keyed (`--live`) run prints the estimate first and REFUSES to send any
  request without `--confirm-spend`.

## Usage

```bash
# Dry-run against a local dev server (start it on a FREE port, never :3000):
node scripts/eval/run.mjs --base-url=http://127.0.0.1:3221 --fixture
node scripts/eval/run.mjs --dataset=scripts/eval/dataset.sample.json --out-dir=/tmp/eval-out

# Keyed runs are spend-gated (do NOT run without user approval):
node scripts/eval/run.mjs --live  # prints estimate, refuses without --confirm-spend
```

Outputs (default `scripts/eval/out/`, gitignored):

- `records.jsonl` — raw rows: url, expected_tier, contentHash, date, trust,
  level, llmStep (null on fallback), fetchFailed + error when excluded.
- `report.md` — tier agreement, confusion matrix, Pearson + Spearman vs tier
  rank (risky=0, caution=1, safe=2), per-tier calibration, fail-closed rate.

Policy: fetch failures are excluded from agreement, never scored as misses.
contentHash + date are recorded per row because pages drift.

## Files

- `dataset.schema.json` — row schema (url, expected_tier, auditor_source,
  citation, notes).
- `dataset.sample.json` — 9 synthetic rows for harness validation. Labels are
  illustrative, NOT auditor ratings; the frozen v1 needs user approval.
- `metrics.mjs` (+ `.d.mts`) — pure benchmark math.
- `cost.mjs` (+ `.d.mts`) — spend estimator, gpt-4o-mini-class pricing.
- `report.mjs` (+ `.d.mts`) — markdown renderer.
- `run.mjs` (+ `.d.mts`) — CLI runner with cap/sleep/429-403-abort guardians.
