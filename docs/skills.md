# Skills — VeriBrowse Agent & QA Capabilities

> Worker-facing WebMCP / agent-browser QA guide. For product architecture see `docs/architecture.md`, for operations see `docs/runbook.md`.

## Overview

VeriBrowse exposes two bounded capabilities as WebMCP tools via `document.modelContext.registerTool`:

- `scoreWebsite({ url })` → `GET /api/score?url=` — heuristic + optional LLM enrichment, returns `TrustScore` with `trust`, `level`, `elderlySummary`, `bullets`, `provenance`, `citations`.
- `checkClaim({ claim, contextUrl? })` → `GET /api/check?claim=&contextUrl=` — fail-closed verification, returns `ClaimResult` with `verdict`, `confidence`, `evidence`, `provenance`.

Tracer tools `ping` and `echoEcho` remain for smoke and compatibility. Schemas are single-sourced in `lib/schemas.ts` (zod → JSON Schema).

## Skills Inventory

| Skill | File | Purpose |
|-------|------|---------|
| `infra-worker` | CI/CD, env, OpenAI wiring, Netlify | `.env.example`, `OPENAI_BASE_URL` routing, `pitchfork.toml`, GitHub Actions CI |
| `quality-worker` | Quality gates + docs/templates | `knip`, `jscpd`, complexity, `depcheck`, `version_drift`, `typedoc` → `docs/api.md` |
| `observability-worker` | Logging, metrics, resilience, runbooks | `lib/logger.ts` pino, `lib/metrics.ts`, `lib/fetchWithRetry.ts`, `X-Request-Id` |

## WebMCP Skill — Registration & Discovery

```ts
// app/page.tsx — thin imperative shell
await document.modelContext.registerTool({
  name: "scoreWebsite",
  description: "Score a website for scam/trust. Returns elderly summary + nerd audit.",
  inputSchema: scoreWebsiteJsonSchema, // from lib/schemas.ts
  annotations: { readOnlyHint: true },
  execute: async ({ url }, { signal }) => {
    const r = await fetch(`/api/score?url=${encodeURIComponent(url)}`, { signal });
    return r.json();
  },
});

await document.modelContext.registerTool({
  name: "checkClaim",
  description: "Verify claim vs evidence URL. Fail-closed when no evidence.",
  inputSchema: checkClaimJsonSchema,
  annotations: { readOnlyHint: true },
  execute: async ({ claim, contextUrl }, { signal }) => {
    const qs = new URLSearchParams({ claim, ...(contextUrl ? { contextUrl } : {}) });
    const r = await fetch(`/api/check?${qs}`, { signal });
    return r.json();
  },
});

// Discovery after ~1.5s useEffect
await document.modelContext.getTools(); // → [ping, echoEcho, scoreWebsite, checkClaim]
```

Order is frozen: `ping`, `echoEcho`, `scoreWebsite`, `checkClaim`. Every tool carries `description`, `inputSchema`, `readOnlyHint`.

Fallback when `document.modelContext` is absent: banner `WebMCP: not detected (enable flag or use ChatGPT browser)` + activity log `WebMCP not available — running in browser without flag`. Manual controls remain operable.

## Agent-Browser QA Skill (droid-control)

> **Playwright is excluded.** Use only the installed `agent-browser` executable via the bundled `droid-control` plugin. Fresh isolated profile, no user auth.

### Prerequisites

```bash
mise install          # Node 22.23.2, pitchfork 2.23.0
cp .env.example .env  # leave OPENAI_API_KEY empty for mock
pnpm install
mise run dev          # port 3000, health /api/health → {"status":"ok"}
# or ephemeral smoke without persistent server:
mise run qa           # ./scripts/qa_smoke.sh --ephemeral
pitchfork start --all # web 3000 (Ready in) + mock 8787 (mock listening)
```

### Browser flows to verify

- **Page load:** `http://127.0.0.1:3000/` → h1 `VeriBrowse`, subtitle `Score any website and verify claims`, sections `Score a website` / `Check a claim`, footer provenance citation.
- **Tool discovery:** `getTools()` returns 4 tools in frozen order, badge `WebMCP: 4 tools`, `readOnlyHint: true`, required `url` / `claim`.
- **Fallback:** Without WebMCP flag shows banner + `No tools discovered yet…` + log entry.
- **Manual Score:** input `https://example.com` → `Score` → `GET /api/score?url=` 200 + `X-Request-Id`, TrustBadge + `Score \d+/100` + bullets + nerd JSON provenance.
- **Manual Verify:** claim + evidence URL → `Verify` → `GET /api/check?claim=` 200 verdict pill + confidence%.
- **WebMCP execute:** `executeTool scoreWebsite` / `checkClaim` with and without `contextUrl` — provenance `contentHash` 8-hex, `retrievedAt` ISO, `claimHash` 16-hex, fail-closed `unverified 0.3 []` when no evidence.
- **Toggle:** `Nerd verbose` checkbox shows/hides `<details><summary>Nerd audit</summary><pre>` with full JSON.
- **Headers & signals:** Every API response carries `X-Request-Id` (echo or UUID) + `cache-control: no-store`; execute forwards `ctx.signal` to `fetch(..., {signal})`, abort within 50ms → `AbortError`.

### Evidence to capture

Screenshots (full page before/after), `console-errors.json` (must be empty outside info), HAR with `X-Request-Id` headers, DOM snapshot of `getTools()` result.

## API & Fixture Skills

- **Health:** `curl -s http://127.0.0.1:3000/api/health | jq` → `{"status":"ok","service":"veribrowse","version":"0.1.0"}` + `X-Request-Id`. Verbose `?verbose=1` adds `uptime`.
- **Score fixture:** `curl -s "http://127.0.0.1:3000/api/score?url=https://example.com&fixture=1" | jq` → `trust:42`, `elderlySummary`, `bullets`, `provenance.contentHash`, `citations`.
- **Check fixture:** `curl -s "http://127.0.0.1:3000/api/check?claim=hello%20world&fixture=1" | jq` → `verdict:supported`, `confidence:0.82`.
- **Invalid:** `not-a-url` or `claim=hi` → `400` with `error` + `X-Request-Id`.
- **Replay:** `mise run replay` compares fixtures ignoring `retrievedAt`/`checkedAt` timestamps, asserts provenance shape.

## Mock & Real OpenAI Paths

- **No-key (default):** `OPENAI_API_KEY=""` → heuristic `preWhy` / `unverified` directly, no outbound `api.openai.com`, log `hasKey:false`.
- **Mock:** `OPENAI_API_KEY=dummy OPENAI_BASE_URL=http://127.0.0.1:8787` → `pitchfork mock` returns fixed JSON exercising parse/slice/clamp.
- **Real key (manual, human-controlled):** populate `.env` → score enriches `why`/`bullets`, check verifies only if `evidence.length>0`, otherwise still `unverified` fail-closed.

## Observability & Correlation

Every request logs pino JSON with `service:veribrowse`, `requestId` (mirrors `X-Request-Id`), `durationMs`, `hasKey`, plus `trust/level` or `verdict`. Logs never contain `sk-` (redacted). Metrics in `lib/metrics.ts` (`score_requests_total`, `check_requests_total`, `openai_fallback_total`) exposed at `/api/metrics` as `text/plain` Prometheus. See `docs/runbook.md` for correlation/triage.

## Generation & Docs

- `docs/api.md` is generated from `lib/` via `typedoc` → `mise run docs` or `npm run docs` (see `typedoc.json`). Do not edit generated file by hand.
- `CHANGELOG.md` follows Keep-a-Changelog, version aligns with `package.json` and `/api/health` `version`.
- Issue/PR templates and labels live under `.github/`; contributions use Conventional Commits.

## References

- `README.md#interactive-qa` — agent-followable 3-command path.
- `docs/runbook.md` — deployment, rollback, key rotation, mock fallback, alerting.
- `docs/branch-protection.md` — ruleset verification via `gh api`.
- `docs/deployment.md` — Netlify contexts, `NODE_VERSION`, headers.
- `docs/api.md` — typedoc-generated API from `lib/` (run `mise run docs` to refresh).
