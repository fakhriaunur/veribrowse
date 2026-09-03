# Branch Protection — main

Branch `main` is protected via GitHub Ruleset "Protect main - require check, PR, no force-push" (ID 22200129).

## Ruleset

- **Target:** `refs/heads/main` (branch)
- **Enforcement:** `active`
- **Deletion:** blocked
- **Non-fast-forward:** blocked — `git push --force` rejected
- **Required linear history:** enforced — no merge commits, history must be linear
- **Required status checks:** `check` (CI job `check` from `.github/workflows/ci.yml` must pass)
  - `strict_required_status_checks_policy: false` — branch need not be up to date before merge (optimistic)
- **Pull request:** required before merge
  - `required_approving_review_count: 1`
  - `dismiss_stale_reviews_on_push: false`
  - `require_code_owner_review: false` (CODEOWNERS advisory, not blocking)
  - `required_review_thread_resolution: false`
  - Merge methods allowed: `merge`, `squash`, `rebase`

## Verification

```bash
gh api repos/{owner}/{repo}/rulesets --jq '.[].name'
gh api repos/{owner}/{repo}/rulesets --jq '.[0].rules'
# required_status_checks includes check
gh api repos/{owner}/{repo}/rulesets/22200129 --jq '.rules[] | select(.type=="required_status_checks")'
# pull_request requires 1 approval
gh api repos/{owner}/{repo}/rulesets/22200129 --jq '.rules[] | select(.type=="pull_request")'
# non_fast_forward present
gh api repos/{owner}/{repo}/rulesets/22200129 --jq '.rules[] | select(.type=="non_fast_forward")'
# force-push blocked: git push --force origin main -> rejected (remote: GH006)
git push --force origin main  # expect: ! [remote rejected] main -> main (protected branch hook declined)
```

## Recovery

If a required check flakes:

1. Re-run the `check` job via `gh run rerun <run-id> --failed`.
2. If the ruleset must be temporarily relaxed, an admin may set `enforcement: evaluate` or add a `bypass_actors` entry, then restore to `active` after merge. Record the change in `docs/branch-protection.md` and audit log.

## Human approval boundary

Direct pushes to `main` are rejected — all changes require a PR with at least one approval. This applies even to repository admins (`current_user_can_bypass: never`). Admins may only bypass via explicit ruleset edit, which is audited.

## Related files

- `.github/workflows/ci.yml` — job `check` (lint, type, test, replay, build, audit, gitleaks, osv-scanner)
- `.github/workflows/codeql.yml` — CodeQL analysis (weekly + push/PR)
- `.github/CODEOWNERS` — `* @fakhriaunur`, `/lib/schemas.ts`, `/app/api/*`
- `.github/dependabot.yml` — npm weekly, limit 5
