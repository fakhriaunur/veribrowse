<!--
VeriBrowse PR template — Conventional Commits + 2-tool contract.
See docs/runbook.md, docs/branch-protection.md, and AGENTS.md.
-->

## Summary

<!-- What changed and why (1-3 sentences). Link issue: Closes # -->

## Type

<!-- conventional commits prefix: feat | fix | docs | chore | refactor | test | perf | build | ci -->

- [ ] `feat:` — new capability (only hardening/docs allowed; no new user-facing tool beyond scoreWebsite/checkClaim)
- [ ] `fix:` — bug fix (include reproduction + `mise run replay` pass)
- [ ] `docs:` — docs only (`docs/`, `README`, `CHANGELOG`)
- [ ] `chore:` / `refactor:` / `test:` / `ci:` — task-appropriate prefix

## Checklist — Conventional Commits & Contract

- [ ] Commit messages use conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:` …) — required for linear history. See https://www.conventionalcommits.org/
- [ ] No history rewrite / force-push (ruleset blocks `non_fast_forward`; use `git revert` to rollback)
- [ ] `lib/schemas.ts` is single source for WebMCP `inputSchema` + API zod validation — not duplicated
- [ ] `lib/score.ts` / `lib/claim.ts` thresholds + fail-closed semantics unchanged (or ADR linked and contract tests updated)
- [ ] Every success carries `provenance: {url, contentHash, retrievedAt}` and `citations`/`evidence`; unknown → `verdict: unverified` + `evidence: []`
- [ ] `AbortSignal` propagated (`app/page.tsx` `ctx.signal` → `fetch(..., {signal})` → `fetchWithRetry` / OpenAI)
- [ ] No secrets committed (`.env` gitignored, `sk-` scan clean, `lib/logger.ts` redact hides key)

## Quality Gates (run before request)

```bash
mise run lint      # eslint + prettier --check (complexity 12, max-depth 4)
mise run type      # tsc --noEmit strict
mise run test      # vitest --coverage 35% lines+branches
mise run replay    # deterministic fixtures ignoring retrievedAt/checkedAt
mise run qa --ephemeral  # or ./scripts/qa_smoke.sh --ephemeral → health/score/check/page 200
```

- [ ] `mise run lint` green
- [ ] `mise run type` green
- [ ] `mise run test` green (coverage 35% lines+branches)
- [ ] `mise run replay` green (no diff ignoring timestamps)
- [ ] `mise run build` green (`NODE_VERSION 22.11.0` parity)
- [ ] `pnpm audit` / `gitleaks` clean (or noted)

## Docs & Provenance

- [ ] If `lib/` public API changed, ran `mise run docs` → `docs/api.md` refreshed (typedoc from `lib/`)
- [ ] If `CHANGELOG.md` updated, version aligns with `package.json` and `GET /api/health` `version: "0.1.0"`
- [ ] `docs/skills.md` / `docs/runbook.md` updated where behavior affects QA skill

## Risk & Rollback

- Risk: <!-- low / medium / high + mitigation -->
- Rollback: `git revert <sha> && git push origin main` (Netlify auto-deploys) or Dashboard → Deploys → Publish previous

## Screenshots / Evidence

<!-- For UI/WebMCP changes: `agent-browser` screenshots, `getTools()` JSON, HAR with X-Request-Id -->

---

_Labels:_ `enhancement` / `bug` / `hardening` / `m7` / `m8` applied by CODEOWNERS (`* @fakhriaunur`, `/lib/schemas.ts` + `/app/api/*` require review). CI job `check` must be green; see `.github/labels.yml`.
