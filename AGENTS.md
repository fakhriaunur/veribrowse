# VeriBrowse — Production Hardening Project Guide

## Mission

VeriBrowse is a 2-tool WebMCP site (`scoreWebsite`, `checkClaim`) plus tracers (`ping`, `echoEcho`). This Transform mission hardens the M0-M5 tracer (38/84 L3) to production ready L5 (68/84, with `large_file_detection` explicitly excluded as advisory → 68/83). Keep WebMCP contract frozen, add only supporting hardening where justifiable (YAGNI otherwise). Browser validation uses the installed `agent-browser` executable via the bundled `droid-control` plugin — Playwright is forbidden.

## Repository layout

- `app/` — Next.js App Router pages, layouts, Edge/Node API routes (`health`, `score`, `check`, optional `metrics`)
- `lib/` — functional core: `score`, `claim`, `schemas`, `logger`, `metrics` (stub), `fetchWithRetry`
- `components/` — React UI: `TrustBadge`, evidence view
- `tests/` — unit, replay (committed fixtures), integration (via vitest), agent-browser E2E (via droid-control)
- `scripts/` — `qa_smoke.sh`, `mock_openai.mjs`, `check_*.sh`, `gen_docs.mjs`
- `infra/` — `netlify.toml`, build perf artifacts
- `docs/` — `architecture.md`, `runbook.md`, `api.md`, `branch-protection.md`, `deployment.md`
- `.github/` — `workflows/ci.yml`, `CODEOWNERS`, `dependabot.yml`, issue/PR templates
- `.devcontainer/` — Node 22 + mise + pitchfork + gh-cli
- `pitchfork.toml` + `mise.toml` — toolchain and local services

## File editing

Use this priority:

1. ApplyPatch
2. Edit, MultiEdit, or Create if ApplyPatch cannot safely express the change
3. Bounded Node/shell scripts only as final fallback
   Review each change, preserve user work, never commit secrets.

## Tooling contract

- **mise** is the toolchain and task runner. Pin tool versions in `mise.toml` (node 22.x, pitchfork 2.23.0). Do NOT set `min_version` — Netlify's build image carries an older mise (2026.3.17 at last check) and any floor hard-fails the deploy at dependency-install (proven 2026-09-04). Document floors, never enforce them. Prefer `mise run <task>` over ad-hoc `npx`.
- **Pitchfork** is the local service manager. Keep daemons, health checks, logs, and shutdown explicit. Do not start persistent services without `pitchfork start`.
- **Do not use Playwright** in this mission. Use `agent-browser` via `droid-control` for browser validation. Remove legacy Playwright config/dep if present, unless needed as a dev stub — then replace with agent-browser flow and remove Playwright gates from `services.yaml`/`mise.toml`.
- Containerize later with Podman under `infra/containers/` — not a prerequisite for early slices.

## Required checks

Before commit, run the narrowest relevant `mise` tasks, then the full gate before handoff:

```bash
mise run lint    # eslint + prettier --check (includes complexity 12; naming: camelCase vars/fns/params, UPPER_CASE consts, PascalCase types/components)
mise run type    # tsc --noEmit strict
mise run test    # vitest --coverage --threshold 35 (keep 35 floor)
mise run replay  # deterministic fixture replay (ignore retrievedAt)
mise run check   # lint + type + test
./scripts/qa_smoke.sh --ephemeral  # one-shot curl smoke
# agent-browser flow via droid-control for web surface where supported
```

## Service Boundaries (NEVER VIOLATE)

- Web: `3000` (Next.js, `mise run dev` / `pitchfork web`). Health: `GET /api/health` → `{"status":"ok"}` + `X-Request-Id`.
- Mock OpenAI: `8787` (node `scripts/mock_openai.mjs`, `MOCK_PORT`/`OPENAI_BASE_URL`). Health: `GET /` → `{"ok":true}`.
- No DB/Redis: `DATABASE_URL` is optional stretch (Neon/Netlify DB). Tracer is stateless; do not add Postgres/Redis without ADR.
- Off-limits ports (shared oracle host): `22`/`53`/`111`/`631`/`904`/`9000`/`3389`/`34115`/`33519` and `54620-54630` (Factory Droid MCP) — never bind or probe destructively.
- Always `lsof -i -P -n | grep LISTEN` + `ss -tlnp` before binding a new port. Prefer `pitchfork start` over manual `npx`.
- `OPENAI_API_KEY` never committed; never printed in logs or artifacts; `.env` is ignored; `OPENAI_BASE_URL` defaults to `https://api.openai.com/v1`.

## Authority and safety

- WebMCP tool schemas are the agent contract — `lib/schemas.ts` zod is single source for both `inputSchema` and Edge validation. Tool names/order (`ping`, `echoEcho`, `scoreWebsite`, `checkClaim`) are frozen.
- OpenAI output is a proposal, never canonical truth — every claim verdict carries evidence citations + provenance (`url`, `contentHash`, `retrievedAt`/`checkedAt`). Fail-closed: unknown claim → `verdict: unverified` with empty evidence, never hallucinated citations.
- Empty `OPENAI_API_KEY` means deterministic heuristic/fail-closed — still returns `contentHash` + `retrievedAt`. This is the CI/QA contract.
- `OPENAI_BASE_URL` override allows `http://127.0.0.1:8787` + dummy key to exercise the OpenAI JSON-parse branch without a real secret.
- Do not expose secrets, commit `.env`, or bypass `AbortSignal` handling. Large file detection is advisory only (excluded from L5 denominator); deep modules retain headroom.

## Agent operating model

Two bounded capabilities: **Scoring** (`scoreWebsite`) and **Verification** (`checkClaim`). Keep fetch, heuristic, LLM, and provenance logic deterministic and pure. WebMCP `registerTool` is a thin imperative shell. Agents produce reviewable changes and evidence. Human owns Netlify secret entry, branch-protection approval, deployment linking, and real-key tests.

## Interactive QA — Agent-Followable Path (agent-browser via droid-control)

No auth gate, no external OpenAI key required — mock mode fail-closed:

**Deps & services (fresh clone to running dev):** `mise install && mise run setup && mise run dev` — `mise run setup` is the idempotent one-command setup (seeds `.env` only if missing, enables Corepack, `pnpm install --frozen-lockfile`). Manual equivalent: `mise install` (Node 22.23.2, pitchfork 2.23.0, pnpm 9), `cp .env.example .env` (leave `OPENAI_API_KEY` empty), `pnpm install`.

**Launch:**

```bash
mise run dev        # next dev --port 3000 on pitchfork or directly
# or: pitchfork start --all (web + mock) then pitchfork logs web
```

**Drive (curl):**

```bash
curl -s http://127.0.0.1:3000/api/health | jq
curl -s "http://127.0.0.1:3000/api/score?url=https://example.com&fixture=1" | jq .trust
curl -s "http://127.0.0.1:3000/api/check?claim=hello%20world%20claim%20text&fixture=1" | jq .verdict
curl -is http://127.0.0.1:3000/api/score?url=https://example.com | grep -i X-Request-Id
```

**Drive (browser via agent-browser + droid-control):**
Fresh isolated profile, `agent-browser open http://127.0.0.1:3000`, wait for `document.modelContext.getTools()` → 4 tools, screenshot, check console-errors 0, click Score/Verify, verify `TrustBadge`, `X-Request-Id` header in network, elderly vs nerd toggle.

**Full smoke:**

```bash
./scripts/qa_smoke.sh --ephemeral
mise run replay
# with mock OpenAI branch: OPENAI_BASE_URL=http://127.0.0.1:8787 OPENAI_API_KEY=dummy npm run dev then curl score/check
```

## Git workflow

Use conventional commits. Never commit secrets or generated credentials. Review staged diff before committing. Do not push without explicit authorization. Do not rewrite published history.

## Mission Directives

**Tools:** `mise`, `pitchfork`, `gh` (repo/workflow), `pnpm` 9, `agent-browser` via `droid-control`, `curl`/`jq`.
**Skills:** `agent-browser` skill (web validation), plus worker skills in `skills/` (infra-worker, quality-worker, observability-worker).
**Dependencies:** `next 16.3.4` + `eslint-config-next 16.3.4` (Turbopack default), `react`/`react-dom 19.2.8`, `openai 7.x`, `zod 4.x`, `pino 10.x`, latest compatible toolchain (`typescript 5.9.3`, `vitest 5`, `tailwind v4`, `eslint 9.39`, `jsdom 30`); Node stays on major 22 (`22.23.2`); pnpm 9 is the single package manager (`package-lock.json` removed). Dev-time only additions: `knip`, `jscpd`, `depcheck`, `typedoc`, `gitleaks`.
**Other:** Large file gate is advisory/excluded; Playwright is forbidden; YAGNI list (feature flags, progressive rollout, monorepo, N+1, DB, analytics, SBOM, SLO) remains documented as excluded without implementation.

## Testing & Validation Guidance

Validators treat this section as authoritative.

- No Playwright — use `agent-browser` skill via `droid-control`.
- Coverage gate 35% lines/branches must not be lowered.
- Replay fixtures compare ignoring `retrievedAt`/`checkedAt`.
- Mock OpenAI flow uses `OPENAI_BASE_URL=http://127.0.0.1:8787` + dummy key, not a real secret.
- Real OpenAI path is only exercised when the user has populated `.env` with a real key; never assert it passed in CI without that.
- Resource headroom: lightweight Next ~300MB per validator + 200MB dev server, max 5 concurrent when sharing server; use 70% headroom rule.

## Known Pre-Existing Issues (Do Not Fix)

- `large_file_detection` intentionally excluded from L5 denominator to allow deep modules >700 lines. `scripts/check_large_files.sh` exists as advisory.
- Playwright 1.52.0 does not support Ubuntu 26.04 (Resolute) in this host — its `chromium` install fails; mission replaces it with `agent-browser`. Validators should note but not fix Playwright install.
