# VeriBrowse — WebMCP Trust Scoring + Claim Verification

**2-tool WebMCP site: `scoreWebsite(url)` + `checkClaim(claim, contextUrl)`** (plus tracer tools `ping`, `echoEcho`).

Safer browsing for elderly / non-power-users (plain-language verdict card) + nerd verbose audit with citations and provenance. Every verdict carries evidence citations + provenance (`url`, `contentHash`, `retrievedAt`/`checkedAt`); unknown claims fail closed to `unverified` with empty evidence, never hallucinated citations.

- **Live production:** `https://veribrowse.netlify.app` (Netlify deploy from `main`, no custom domain)
- **Contract:** WebMCP tool names/order/schemas frozen (`ping`, `echoEcho`, `scoreWebsite`, `checkClaim`); `lib/schemas.ts` zod is the single source for `inputSchema` and route validation.

## Stack (final, verified)

| Layer           | Pin                                                                                                                                                                                                                                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime         | `next 16.3.4` + `eslint-config-next 16.3.4` (Turbopack is the default bundler for dev and build — no `--turbopack` flag; build log shows `Next.js 16.3.4 (Turbopack)`)                                                                                                                                                 |
| UI              | `react` / `react-dom 19.2.8`, `@types/react 19.2.18`, `@types/react-dom 19.2.7`                                                                                                                                                                                                                                        |
| Data / AI       | `openai 7.10.0`, `zod 4.5.4`, `pino 10.3.1`                                                                                                                                                                                                                                                                            |
| Toolchain       | `typescript 5.9.3`, `vitest 5.0.0` (+ `@vitest/coverage-v8 5.0.0`, `jsdom 30.0.1`), `tailwindcss 4.3.3` (+ `@tailwindcss/postcss 4.3.3`), `knip 6.34.0`, `eslint 9.39.5`                                                                                                                                               |
| Node            | `22.23.2` — pinned in `mise.toml`, `.github/workflows/ci.yml`, root + mirror `netlify.toml`, `package.json` engines (`>=22.23.2`)                                                                                                                                                                                      |
| Package manager | **pnpm `9.15.9` only** — `pnpm-lock.yaml` is the single lockfile (`package-lock.json` deleted; dual lockfiles confused installer detection). `package.json` sets `packageManager: pnpm@9.15.9`, so Corepack (bundled with Node ≥22.14) provisions the exact pnpm: run `corepack enable` once, then use `pnpm` directly |

One-time note after the Next 15 → 16 upgrade: delete the stale build cache once (`rm -rf .next`) — the old cache breaks page-data collection (`Failed to collect page data for /_not-found`). `.next` is gitignored build output, safe to delete.

```bash
rm -rf .next
```

## Quick start

From a fresh clone to a running dev server:

```bash
mise install && mise run setup && mise run dev  # dev server on :3000
```

`mise run setup` is idempotent and non-interactive: it copies `.env.example` to `.env` only if `.env` is missing (never overwrites), enables Corepack for the pinned pnpm, and runs `pnpm install --frozen-lockfile`. Equivalent manual steps:

```bash
mise install                    # Node 22.23.2 + pitchfork 2.23.0 + pnpm 9.15.9 shims
cp .env.example .env            # leave OPENAI_API_KEY empty for deterministic mock mode
corepack enable                 # one-time: let Corepack honor the packageManager pin
pnpm install --frozen-lockfile  # pnpm only — single lockfile
node --version && pnpm --version  # expect v22.23.2 and 9.15.9
```

## Gates (all green required before handoff)

```bash
mise run check    # lint + type + test
mise run lint     # eslint + prettier --check
mise run type     # tsc --noEmit strict
mise run test     # vitest --coverage, 35% lines/branches floor (do not lower)
mise run replay   # deterministic fixture replay (retrievedAt/checkedAt normalized)
mise run build    # next build, NODE_ENV=production
bash scripts/check_version_drift.sh  # Node 22.23.2 parity + root/mirror netlify.toml sync
```

Node parity spot-check:

```bash
grep 22.23.2 mise.toml netlify.toml infra/netlify.toml .github/workflows/ci.yml package.json
```

## Run & QA (no secret, no auth)

```bash
mise run dev        # next dev --port 3000
curl -s http://127.0.0.1:3000/api/health | jq
curl -s "http://127.0.0.1:3000/api/score?url=https://example.com&fixture=1" | jq .trust
curl -s "http://127.0.0.1:3000/api/check?claim=hello%20world%20claim%20text&fixture=1" | jq .verdict
curl -is http://127.0.0.1:3000/api/score?url=https://example.com | grep -i X-Request-Id
```

Full one-shot smoke (ephemeral server, every endpoint, headers, provenance, golden diff — exits non-zero on any failure):

```bash
./scripts/qa_smoke.sh --ephemeral                # default port 3000
./scripts/qa_smoke.sh --ephemeral --port 3457    # free-port form; refuses to kill an occupant port
```

With `OPENAI_API_KEY` empty, routes return deterministic heuristic/fail-closed results (the CI/QA contract — still with `contentHash` + `retrievedAt`). With a key plus `OPENAI_BASE_URL=http://127.0.0.1:8787` (mock, `node scripts/mock_openai.mjs`), the OpenAI JSON-parse branch is exercised without a real secret.

Browser check (WebMCP surface): open the dev server in a WebMCP-enabled browser and run `await document.modelContext.getTools()` — expect `ping`, `echoEcho`, `scoreWebsite`, `checkClaim`. No-WebMCP browsers get the fallback banner plus manual Score/Verify controls.

### Browser-only state (privacy)

Theme choice (`veribrowse:theme:v1`, system preference on first visit) and recent result summaries (`veribrowse:recents:v1`, bounded, user-clearable) live only in this browser's `localStorage`. No tracking, no server persistence (`cache-control: no-store`), never secrets or page HTML.

## Production smoke

```bash
curl -s https://veribrowse.netlify.app/api/health | jq
curl -s "https://veribrowse.netlify.app/api/score?url=https://example.com&fixture=1" | jq .trust
curl -s "https://veribrowse.netlify.app/api/check?claim=hello%20world%20claim%20text&fixture=1" | jq .verdict
```

Expect `200 {"status":"ok","service":"veribrowse","version":"0.1.0"}` + `X-Request-Id` + `cache-control: no-store` on every API response.

## Environment variables

`.env` is gitignored — never commit it. Copy `.env.example` and fill locally; the user owns real-key entry (local `.env` and the Netlify dashboard).

| Var                    | Default                     | Notes                                                                                                              |
| ---------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `OPENAI_API_KEY`       | _(empty)_                   | Empty = deterministic heuristic/fail-closed (CI/QA contract). Filled = real enrichment. Never logged (pino redact) |
| `OPENAI_BASE_URL`      | `https://api.openai.com/v1` | `http://127.0.0.1:8787` + dummy key exercises the mock branch                                                      |
| `OPENAI_MODEL`         | `gpt-4o-mini`               | Chat-completions model for enrichment/verification proposals                                                       |
| `LOG_LEVEL`            | `info`                      | pino level                                                                                                         |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000`     | Production: `https://veribrowse.netlify.app`                                                                       |
| `EDGE_ORIGIN`          | `http://localhost:3000`     | Edge/site origin override                                                                                          |
| `SENTRY_DSN`           | _(empty)_                   | Disabled by default (`lib/sentry.ts` is a no-op stub until set + SDK installed, human-approved)                    |
| `DATABASE_URL`         | _(empty)_                   | Optional stretch only — the app is stateless; no DB without an ADR                                                 |

## Branch policy (solo maintainer)

`main` is protected by ruleset **"Protect main - require check, PR, no force-push"** — direct pushes are rejected. Every change ships as a branch + PR, CI `check` green, squash-merge, then sync local `main` to `origin/main`:

```bash
git checkout -b <type>/<short-name>
git push -u origin <type>/<short-name>
gh pr create --title "<conventional-commit>" --body "..."
gh pr merge --squash --delete-branch   # after check is green
```

- Required status check: `check` (lint, type, test, replay, build, audit, gitleaks, osv-scanner). No force-push, no deletion, linear history.
- `required_approving_review_count: 0` is **intentional**: single-maintainer repo, an approval gate would block autonomous merges for zero security gain. CODEOWNERS (`*`, `/lib/schemas.ts`, `/app/api/*`) documents ownership but does not block.
- Details + recovery: `docs/branch-protection.md`.

## Deploy

Netlify reads **only the repo-root `netlify.toml`** (`pnpm build`, publish `.next`, `NODE_VERSION 22.23.2`, `[[plugins]] @netlify/plugin-nextjs` for SSR/API routes, `cache-control: no-store` for `/api/*`). `infra/netlify.toml` is a tracked mirror — edit both together; `scripts/check_version_drift.sh` enforces sync. Full deploy docs: `docs/deployment.md`; ops runbook: `docs/runbook.md`.

## Docs map

- `docs/api.md` — generated API/schema reference (`mise run docs` regenerates from `lib/`)
- `docs/architecture.md` — system architecture + bounded capabilities
- `docs/runbook.md` — deployment, rollback, key rotation, mock fallback, triage, alerting
- `docs/deployment.md` — Netlify contexts, headers, live URL, env vars
- `docs/branch-protection.md` — ruleset, checks, recovery, human approval boundary
- `docs/skills.md` — agent QA skills (WebMCP + smoke flows)
- `CHANGELOG.md` — release history (stale version pins live here as history, nowhere else)

## License

MIT — see `LICENSE` at repo top.
