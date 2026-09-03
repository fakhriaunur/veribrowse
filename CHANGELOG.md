# Changelog

All notable changes to VeriBrowse are documented in this file. Format follows Keep a Changelog and Conventional Commits. Version aligns with `package.json` and `GET /api/health` `version: "0.1.0"`.

## [Unreleased]

### Changed

- Toolchain major bump batch (verified against the npm registry on 2026-09-04; `pnpm-lock.yaml` refreshed, `pnpm install --frozen-lockfile` clean, no peer WARNs): `typescript` `5.7.2` → `5.9.3`, `vitest` + `@vitest/coverage-v8` `3.0.5` → `5.0.0`, `jsdom` `25.0.1` → `30.0.1`, `eslint` `9.18.0` → `9.39.5` (latest 9.x; 10.x deliberately not adopted), `tailwindcss` `3.4.17` → `4.3.3` (+ new `@tailwindcss/postcss` `4.3.3`), `postcss` `8.4.49` → `8.5.28`, `autoprefixer` `10.4.20` → `10.5.4`, `knip` `5.50.1` → `6.34.0`, `prettier` `3.4.2` → `3.9.6`, `typedoc` → `0.28.20` + `typedoc-plugin-markdown` → `4.13.0`, `@types/node` `22.10.1` → `22.20.1` (stays on 22.x to match the Node 22 runtime), `@types/react` → `19.2.18`, `@types/react-dom` → `19.2.7`. `jscpd`/`depcheck` already at latest (`5.1.2`/`1.4.7`). No new runtime dependencies. All quality gates green (knip 0 unused, jscpd under threshold, complexity warn, depcheck empty, drift parity, coverage ~79 lines / ~69 branches vs the 35 floor); `docs/api.md` regenerated under typedoc 0.28.20; `infra/build-perf.json` refreshed.
- Stability-valve rationale: TypeScript 7 (`7.0.2`, native rewrite shipping platform binaries) NOT adopted — the frozen lint toolchain caps TS below 6.1 (`typescript-eslint@8.69.0` peer `typescript >=4.8.4 <6.1.0` via `eslint-config-next`, `typedoc@0.28.20` peer `<=6.0.x`); `5.9.3` is the latest compatible. Vitest `5.0.0` (released 2026-09-03, day-old) WAS adopted after a zero-regression gate run (11 files / 56 tests green, coverage floor holds).
- Tailwind v4 migration: PostCSS plugin switched to `@tailwindcss/postcss` (autoprefixer entry dropped — v4 handles prefixing via lightningcss), `app/globals.css` `@tailwind` directives → `@import "tailwindcss"` with the `safe`/`caution`/`risky` theme moved to `@theme`, `tailwind.config.ts` deleted and dropped from `knip.json` entry (schema URL bumped to `knip@6`).
- Zod-4 peer hygiene: `knip` 6 depends on `zod` 4 directly (drops its `zod-validation-error@3.5.4` + nested `zod@3.23.8`), and the lockfile re-resolves the `eslint-plugin-react-hooks@7.1.1` transitive `zod-validation-error` `3.5.4` → `4.0.2` (within its declared `^3.5.0 || ^4.0.0` range, peer `zod ^3.25 || ^4` satisfied by root `zod@4.5.4`) — `pnpm install` is peer-WARN-free with a single `zod@4.5.4` in the tree. Nothing was forced onto the zod-4-only `zod-validation-error@5`.

### Fixed

- Bare-`pnpm` mise-shim failure (`No version is set for shim: pnpm`, breaking `mise run build-perf` in shim-only envs): `pnpm = "9.15.9"` pinned in `mise.toml [tools]` (matches `package.json` `packageManager`), so `mise install` now provisions the shim deterministically.
- Netlify deploy-blocker hotfix (CVE-2025-55182): `next` + `eslint-config-next` `15.2.3` → `15.5.25` (latest 15.x stable verified via npm registry on 2026-09-04; `react`/`react-dom` stay `19.1.0`). Netlify refused the `___netlify-server-handler` function upload (HTTP 400) because 15.2.3 is below the safe floor (≥15.3.3 for 15.x). Minimal hotfix on the same PR branch — the full Next 16 upgrade stays m9 scope. `pnpm-lock.yaml` refreshed; `package-lock.json` untouched (m9 scope). (VAL-CROSS-015/016/017 deploy path)
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
