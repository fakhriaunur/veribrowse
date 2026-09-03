# VeriBrowse — WebMCP Challenge Project Guide

## Mission

VeriBrowse is a 2-tool WebMCP site (`scoreWebsite`, `checkClaim`) for elderly/non-power-users and nerd auditors. Provide scam trust scoring + claim-vs-evidence verification via WebMCP `document.modelContext.registerTool`, Edge API, and OpenAI. Dual UX: plain elderly summary + verbose audit with citations. Fail-closed on unknown, preserve provenance.

## Repository layout

- `app/`: Next.js App Router pages, layouts, and Edge API routes.
- `lib/`: functional core — schemas, scoring, claim verification, provenance, logger.
- `components/`: React UI — elderly toggle, trust badge, evidence view.
- `tests/`: unit, integration (WebMCP), replay (deterministic fixtures).
- `scripts/`: `qa_smoke.sh`, `check_*.sh` quality gates.
- `infra/`: Netlify config, Edge runtime manifests.
- `docs/`: architecture, authority, readiness.
- `triage/`: event worksheet and execution record.
- `.devcontainer/`: reproducible dev environment (Node 22, mise, pitchfork).

## File editing

Use this file-editing priority:

1. ApplyPatch.
2. Edit, MultiEdit, or Create if ApplyPatch fails or cannot safely express the change.
3. Bounded Node/Python/shell scripts only as a final fallback.

Review each change and preserve user work.

## Tooling contract

Use **mise** as project toolchain and task runner. Pin runtime and dependency versions in `mise.toml`; prefer `mise run <task>` over ad-hoc `npm`/`npx`.

Use **Pitchfork** as local service manager. Keep service definitions, health checks, logs, and shutdown explicit. Do not start persistent services without `pitchfork start`.

Containerize later with **Podman** under `infra/containers/` — not a prerequisite for the first slice.

## Required checks

Before commit, run the narrowest relevant `mise` tasks for formatting, linting, type checking, tests, replay, and security. Record failed or skipped checks. Keep fast checks separate from full checks.

```bash
mise run lint    # eslint + prettier --check
mise run type    # tsc --noEmit strict
mise run test    # vitest --coverage 35% gate
mise run check   # lint + type + test
```

## Authority and safety

- WebMCP tool schemas are the agent contract — zod schemas are single source of truth for both `inputSchema` and Edge validation.
- OpenAI output is a proposal, never canonical truth — every claim verdict carries evidence citations + provenance (`url`, `contentHash`, `retrievedAt`).
- Fail-closed: unknown claim → `verdict: unverified` with empty evidence, never hallucinated citations.
- Do not expose secrets, commit `.env`, or bypass `AbortSignal` handling.
- Human reviews prompt changes, WebMCP registrations, and public claims.

## Agent operating model

Two bounded capabilities: **Scoring** (`scoreWebsite`) and **Verification** (`checkClaim`). Keep fetch, heuristic, LLM, and provenance logic deterministic and pure. WebMCP `registerTool` is a thin imperative shell. Agents produce reviewable changes and evidence.

## Interactive QA — Agent-Followable Path

Concrete end-to-end QA for an agent (no auth gate, no external OpenAI key required — mock mode fail-closed):

**Deps & services:** `mise install` (Node 22.11.0, pitchfork 2.23.0), `cp .env.example .env` (leave `OPENAI_API_KEY` empty for mock), `pnpm install`.

**Auth:** None. API is public for QA (`/api/health`, `/api/score?fixture=1` require no credentials). Without key, routes return deterministic fixtures.

**Launch:**

```bash
mise run dev        # next dev --port 3000
# or: mise run qa  # one-shot smoke that starts ephemeral server and curls every endpoint
```

**Drive (meaningful interactions):**

```bash
curl -s http://127.0.0.1:3000/api/health | jq
curl -s "http://127.0.0.1:3000/api/score?url=https://example.com&fixture=1" | jq .trust
curl -s "http://127.0.0.1:3000/api/check?claim=hello%20world&fixture=1" | jq .verdict
curl -s http://127.0.0.1:3000/ | head -20
# Browser (agent-browser): await document.modelContext.getTools()
./scripts/qa_smoke.sh --ephemeral  # full smoke: health, score, check, WebMCP discovery via Playwright
mise run replay  # fixture replay: score + claim golden files
```

Expected: `/api/health` → `{"status":"ok"}`, `/api/score?fixture=1` → `{"trust":42,...}`, without key returns mock. `document.modelContext.getTools()` → `[{name:"scoreWebsite"}, {name:"checkClaim"}]` when WebMCP flag enabled. See `README.md#interactive-qa` and `scripts/qa_smoke.sh`.

## Git workflow

Use conventional commits. Never commit secrets or generated credentials. Review staged diff before committing. Do not push without explicit authorization.
