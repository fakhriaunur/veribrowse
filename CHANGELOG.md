# Changelog

All notable changes to VeriBrowse are documented in this file. Format follows Keep a Changelog and Conventional Commits. Version aligns with `package.json` and `GET /api/health` `version: "0.1.0"`.

## [Unreleased]

### Fixed

- Netlify Corepack hotfix: Node `22.11.0` → `22.23.2` (latest 22.x LTS verified against the nodejs.org release index on 2026-09-04; `22.23.3` does not exist upstream) in every pin site — `mise.toml`, `.github/workflows/ci.yml`, root + mirror `netlify.toml`, `package.json` engines, `scripts/check_version_drift.sh`, `scripts/build_perf.sh`, `AGENTS.md`, `README.md`, `docs/runbook.md`, `docs/deployment.md`, `docs/skills.md`, issue/PR templates. The Corepack bundled with Node 22.11.0 has stale signing keys (`Cannot find matching keyid` for pnpm 9.15.9); Node ≥22.14.0 ships Corepack ≥0.31.0 with the fix. pnpm stays `9.15.9`; `COREPACK_INTEGRITY_KEYS=0` stays forbidden. (VAL-CROSS-015/016/017 deploy path, VAL-OBS-021/022)
- Double-`/v1` OpenAI URL bug: `app/api/score` and `app/api/check` appended `/v1/chat/completions` onto the default base `https://api.openai.com/v1`, hitting `/v1/v1/chat/completions` (OpenAI 404 → silent fallback, so real-key enrichment could never fire). Both routes now normalize the configured base (strip trailing `/` + one trailing `/v1`) in one place before appending the path; the mock base `http://127.0.0.1:8787` is unchanged. (VAL-CROSS-009/010/012/013)
- `scripts/qa_smoke.sh` now honors `--port N` / `--port=N` (previously parsed but ignored) and refuses to kill an occupant port instead of stomping it; pid/log files are port-scoped. (VAL-CROSS-008)

## [0.1.0] - 2026-09-03

### Added

- Netlify deploy configuration: `infra/netlify.toml` with `NODE_VERSION = "22.11.0"`, `publish = ".next"`, `command = "pnpm build"` for all contexts `production`, `deploy-preview`, `branch-deploy`; headers `cache-control: no-store` for `/api/*` (VAL-OBS-021, VAL-OBS-022, VAL-CFG-053, VAL-OBS-020).
- Deployment documentation: `docs/deployment.md` covering contexts, `NODE_VERSION`, headers, publish dir, live URL (`https://veribrowse.netlify.app` placeholder, no custom domain), `NEXT_PUBLIC_SITE_URL`, env vars (`OPENAI_API_KEY`, `OPENAI_BASE_URL`, `LOG_LEVEL`), and smoke verification (VAL-CFG-053).
- Operational runbook: `docs/runbook.md` with Deployment (log location + `X-Request-Id` correlation), Rollback (`git revert <sha> && git push`), Key rotation (`OPENAI_API_KEY` human-controlled, pino redact, `gitleaks`), Mock fallback (`OPENAI_BASE_URL=http://127.0.0.1:8787` + dummy key, `pitchfork mock`), Triage and Alerting & Uptime (VAL-OBS-012, VAL-OBS-022, VAL-CROSS-021/022/023).
- Release provenance: tag `v0.1.0` aligns with `package.json` `0.1.0` and `/api/health` version, Node parity verified across `mise.toml`, `infra/netlify.toml`, `.github/workflows/ci.yml`.
- Branch & supply-chain hardening (prior): CI pipeline (`pnpm --frozen-lockfile`, `mise run lint/type/test/replay/build`), Dependabot, CODEOWNERS, CodeQL, gitleaks secret scan, `NODE_VERSION 22.11.0` parity (VAL-CFG-013..034).
- OpenAI wiring: `OPENAI_BASE_URL` (default `https://api.openai.com/v1`), `OPENAI_MODEL` (`gpt-4o-mini`), `fetchWithRetry` with `AbortSignal`, `json_object`, `temp 0.2`, sliced caps, fallback heuristic; deterministic fixture `?fixture=1` paths remain (no key required).

### Notes

- No custom domain — Netlify subdomain only.
- Live URL linking and dashboard env-var entry remain human-controlled. Until linked, local `mise run qa --ephemeral` and `mise run build` are passing; live `curl -is $NEXT_PUBLIC_SITE_URL/api/health` documents blocker in `docs/deployment.md` and build provenance is green (see `docs/deployment.md#Live URL`).
- `lib/score.ts`, `lib/claim.ts`, `lib/schemas.ts` frozen — heuristic thresholds and fail-closed semantics unchanged.
- Coverage gate 35% lines/branches, `mise run replay` deterministic, `scripts/qa_smoke.sh --ephemeral` covers health/score/check/page + `X-Request-Id` + `cache-control: no-store`.

## [0.0.1] - 2026-08-30

### Added

- Initial tracer: `ping`/`echoEcho` + `scoreWebsite`/`checkClaim` WebMCP tools, Next.js 15 + React 19 + zod + pino, `GET /api/health|score|check` with provenance.
