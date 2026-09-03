# Runbook — VeriBrowse Production Operations

## Deployment

Netlify deploys `main` via `infra/netlify.toml` (`pnpm build` publish `.next`, `NODE_VERSION 22.11.0`). All contexts `production`, `deploy-preview`, `branch-deploy` use `pnpm build`. Headers `cache-control: no-store` for `/api/*`.

### Deploy from main
```bash
git push origin main   # Netlify auto-builds production
# or trigger via Netlify dashboard: Deploys -> Trigger deploy -> Deploy site
```

### Log location
- **Netlify dashboard:** Site -> Deploys -> select deploy -> Deploy log (Build log + Function log).
- **Functions/Edge logs:** Netlify -> Functions -> `next-server` -> Real-time logs filtered by `X-Request-Id`.
- **Local correlation:** Every API response includes `X-Request-Id` header (UUID, echoed if caller sends `X-Request-Id: test-echo-123`). Structured pino logs include `requestId`, `durationMs`, `hasKey`, `trust/level` (score) or `verdict` (check). Correlate with `grep requestId <log>` or `curl -D - -H "X-Request-Id: my-id" http://host/api/health`.

```bash
curl -is http://127.0.0.1:3000/api/health | grep -i X-Request-Id
curl -is http://127.0.0.1:3000/api/score?url=https://example.com | grep -i X-Request-Id
# logs
pitchfork logs web 2>&1 | jq 'select(.requestId)'
```

### X-Request-Id correlation
- Request sends `X-Request-Id: abc-123` -> server echoes same value in response header and pino `requestId` field.
- If no header sent, server generates `crypto.randomUUID().slice(0,8)` and logs it.
- Use this ID to trace: health/score/check -> fetchWithRetry -> OpenAI fallback -> metric `openai_fallback_total`.
- Ensure logs never contain `sk-` (secret-leak check: `rg -n "sk-" lib/ app/ | grep -v ".md"` should be 0).

### Build provenance
- `infra/netlify.toml` contexts all `pnpm build` — `cat infra/netlify.toml` shows 4 occurrences.
- Build logs retained in Netlify dashboard under Deploys; local `mise run build` time captured as `Build completed in Xs` (see CI log).
- Verify Node parity: `grep 22.11.0 mise.toml infra/netlify.toml .github/workflows/ci.yml package.json`.
- No secrets in build logs: Netlify build does not print `OPENAI_API_KEY`; pino redact guarantees `lib/logger.ts` `redact: ["OPENAI_API_KEY","authorization"]` and CI gitleaks job blocks `sk-` commits.

### Verification after deploy
```bash
curl -is $NEXT_PUBLIC_SITE_URL/api/health | head -20
# 200 {"status":"ok","service":"veribrowse","version":"0.1.0"} + X-Request-Id + cache-control: no-store
curl -is "$NEXT_PUBLIC_SITE_URL/api/score?url=https://example.com&fixture=1" | jq .trust
curl -is "$NEXT_PUBLIC_SITE_URL/api/check?claim=hello%20world%20fixture&fixture=1" | jq .verdict
# local smoke (no key, no live URL)
mise run qa --ephemeral
# or
./scripts/qa_smoke.sh --ephemeral
```

If live URL not yet linked (human-controlled dashboard linking — see `docs/deployment.md`), local smoke is passing and build provenance is green; live `curl` will fail until link completes. Document blocker in deployment.md; do not claim live smoke passed prematurely.

## Rollback

### Git revert (no custom domain, no external state)
```bash
git log --oneline -10
git revert <sha>   # reverts bad commit, creates new commit
git push origin main  # Netlify auto-deploys previous-good
# Netlify dashboard alternative: Deploys -> select previous good deploy -> Publish deploy -> netlify.toml cache-control and NODE_VERSION remain pinned
```

### When build fails (deploy failure)
1. Read Netlify deploy log: Deploys -> failed deploy -> "View deploy log" (look for `pnpm build` error, `NODE_VERSION` drift, or `cache-control` syntax).
2. Repro locally: `mise run build` (or `pnpm build`) with same `NODE_VERSION=22.11.0`. Fix lint/type: `mise run lint && mise run type`.
3. Check `infra/netlify.toml` headers and contexts: `cat infra/netlify.toml`.
4. Rollback via `git revert <sha> && git push` as above; no data migration (stateless app).

## Key rotation

Rotate `OPENAI_API_KEY` without committing secrets. Human approval boundary: only humans enter keys in `.env` and Netlify dashboard env vars.

### Checklist
1. Generate new key at provider (e.g., OpenAI dashboard).
2. Update local `.env`: `OPENAI_API_KEY=sk-...` (never commit, `.env` is gitignored via `grep -qxF '.env' .gitignore`).
3. If Netlify site linked, update Netlify dashboard: Site settings -> Environment variables -> `OPENAI_API_KEY` -> Save -> Trigger deploy.
4. Restart services: `pitchfork stop --all && pitchfork start --all` or `mise run dev` restart.
5. Verify matrix (see below) — ensure `pino` redact hides key:

```bash
# no-key (hasKey false)
OPENAI_API_KEY='' curl -s http://127.0.0.1:3000/api/score?url=https://example.com | jq
# dummy-key + mock (hasKey true, mock)
OPENAI_API_KEY=dummy OPENAI_BASE_URL=http://127.0.0.1:8787 curl -s http://127.0.0.1:3000/api/score?url=https://example.com | jq
# real key (manual, only with populated .env — do not log)
curl -s http://127.0.0.1:3000/api/score?url=https://example.com | jq
# verify no sk- leak
pitchfork logs web 2>&1 | grep -v "sk-" | head  # should have no sk- line; pino shows [Redacted]
grep -r "sk-" . --exclude-dir=node_modules --exclude="*.md" | wc -l  # expect 0
```

- `lib/logger.ts` configures `redact: ["OPENAI_API_KEY","authorization","*.authorization","headers.authorization"]`.
- `.env.example` has `OPENAI_API_KEY=` empty (not real key) and `.env` is gitignored; pre-commit `.pre-commit-config.yaml` has `gitleaks` hook scanning for `sk-`.
- `OPENAI_BASE_URL` default remains `https://api.openai.com/v1`, `OPENAI_MODEL` `gpt-4o-mini` (see `.env.example`).

Cross-link: `docs/branch-protection.md` (CODEOWNERS requires review for `lib/schemas.ts` / `app/api/*`), `docs/deployment.md` (env var list).

## Mock fallback

When real OpenAI is down or no key is configured, app stays operational via deterministic fallback — stateless, privacy-first, never hallucinated citations.

### No-key operation (CI/default)
```bash
cp .env.example .env  # OPENAI_API_KEY empty
mise run dev
curl -s "http://127.0.0.1:3000/api/score?url=https://example.com&fixture=1" | jq .trust
curl -s "http://127.0.0.1:3000/api/check?claim=hello%20world%20claim%20text%20long%20enough&fixture=1" | jq .verdict
# score -> heuristic TrustScore with provenance contentHash, check -> fail-closed unverified empty evidence
```

### Mock server (branch-path testing with dummy key)
```bash
pitchfork start mock   # mock listening on 8787
OPENAI_API_KEY=dummy OPENAI_BASE_URL=http://127.0.0.1:8787 curl -s http://127.0.0.1:3000/api/score?url=https://example.com | jq
# mock parses json_object, slices bullets to cap, clamps trust 0-100; metric openai_fallback_total not incremented on 200
curl -s http://127.0.0.1:8787/ | grep "mock listening"
```

### Fallback behavior
- `lib/fetchWithRetry.ts` wraps all fetches with `AbortSignal.timeout(3000)`, 2 retries exponential backoff, in-memory breaker 30s open per host. On failure: score returns heuristic `preWhy` with `provenance.contentHash` + `retrievedAt`; check returns `verdict: unverified, confidence:0.3, evidence:[]` (fail-closed, never hallucinated).
- Metric `openai_fallback_total` increments on OpenAI non-200 or parse failure; observe via `curl -s http://127.0.0.1:3000/api/metrics | grep openai_fallback_total` or pino `openai_fallback_total:1`.
- Fixtures: `mise run replay` normalizes `retrievedAt`/`checkedAt` and asserts shape; `scripts/qa_smoke.sh --ephemeral` covers health/score/check/page with `cache-control: no-store` and `X-Request-Id`.

Flowchart for triage when real OpenAI fails: `real failure -> mock verify (OPENAI_BASE_URL=http://127.0.0.1:8787 + dummy key, pitchfork mock) -> fallback heuristic observed -> metric openai_fallback_total N`.

## Triage

### Incident triage steps
1. Check `X-Request-Id` header on failing request: `curl -is http://127.0.0.1:3000/api/health | grep -i X-Request-Id`.
2. Search logs by `requestId`: `pitchfork logs web 2>&1 | jq 'select(.requestId=="<id>")'`.
3. Run smoke: `./scripts/qa_smoke.sh --ephemeral` (health, score fixture, check fixture, page).
4. Run replay: `mise run replay` (fixture shapes ignoring retrievedAt/checkedAt).
5. Verify fail-closed: `curl -s "http://127.0.0.1:3000/api/check?claim=hello%20world%20claim%20text%20long%20enough" | jq '{verdict, confidence, evidence}'` expect `unverified 0.3 []`.
6. Check metrics: `curl -s http://127.0.0.1:3000/api/metrics | grep -E "score_requests_total|check_requests_total|openai_fallback_total"`.
7. Check breaker/cache: `rg -n 'breaker|30_000|timeout' lib/fetchWithRetry.ts`.

### Related docs
- `docs/branch-protection.md` — ruleset, required checks, CODEOWNERS, recovery for flaky check.
- `docs/deployment.md` — NETLIFY contexts, NODE_VERSION, headers, live URL + blocker.
- `pitchfork.toml` — `web` port 3000 (`Ready in`), `mock` port 8787 (`mock listening`).

### Error tracking (Sentry stub, disabled by default)

`lib/sentry.ts` exports `captureException` as a no-op while `SENTRY_DSN` is empty (the default — `.env.example` has `SENTRY_DSN=` with no value). No Sentry SDK is initialized and no network call is made on any error path; API routes log errors via pino (`lib/logger.ts`) instead.

- Verify disabled: `rg -n 'SENTRY|captureException' lib/` shows the stub, and `grep -E '^SENTRY_DSN=$' .env.example` confirms the empty default.
- Enabling real error tracking requires human approval: set `SENTRY_DSN`, install a Sentry SDK, and wire `captureException` at the error log sites in `app/api/*/route.ts`. Until then, triage via `X-Request-Id` log correlation above.

## Alerting & Uptime

Netlify deploy logs are primary signal; no Prometheus/Grafana required for this stateless deploy.

- **Netlify logs:** Site -> Deploys -> Build log and Function log are the primary alert source. Search for `level:error` in Netlify dashboard or local pino JSON (`jq 'select(.level==50)'`).
- **External uptime check (optional):** Point UptimeRobot/Checkly/Upptime at `GET /api/health` and `GET /api/health?verbose=1` (expects `{"status":"ok","service":"veribrowse","version":"0.1.0"}` + `X-Request-Id` + `uptime` when verbose). Poll every 5m; alert on non-200 or missing `X-Request-Id` or `cache-control: no-store` mismatch. Example: `curl -is http://127.0.0.1:3000/api/health | grep -i X-Request-Id` and `curl -s http://127.0.0.1:3000/api/health?verbose=1 | jq`.
- **Health verbose:** `curl -s http://127.0.0.1:3000/api/health?verbose=1 | jq '{status, service, version, uptime}'`.
- Log search: `pitchfork logs web 2>&1 | jq 'select(.level >= 40)'` for warn/error; `durationMs` bounded >0 per `lib/logger.ts`.
- **Metrics:** `curl -s http://127.0.0.1:3000/api/metrics | grep -E "score_requests_total|openai_fallback_total"` shows Prometheus text/plain counters (`# HELP score_requests_total`).

### Tracing stub

Tracing is stubbed for future OTel — no SDK is initialized by default.

- Every response carries `X-Request-Id` (echo if caller sends `X-Request-Id: my-id`, else `crypto.randomUUID().slice(0,8)`). Use `withRequestId(requestId)` child logger (`lib/logger.ts`) to correlate logs: `pitchfork logs web 2>&1 | jq 'select(.requestId=="my-id")'`.
- `traceparent` (W3C) passthrough stub: if request includes `traceparent: 00-<trace>-<parent>-01`, server accepts it without error, logs it as `traceparent` field when present, and still generates/echoes `X-Request-Id`. No full OTel collector required. Example: `curl -is -H "traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" http://127.0.0.1:3000/api/health` → 200 + `X-Request-Id` preserved.
- Future OTel: when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, replace stub with `@opentelemetry/sdk-node` initialization; keep `X-Request-Id` as primary correlation until then. See `lib/logger.ts` comment and `docs/architecture.md` Observability section.

## QA & Tooling

- `mise install` (Node 22.11.0, pitchfork 2.23.0), `cp .env.example .env`, `pnpm install --frozen-lockfile`.
- `mise run lint && mise run type && mise run test && mise run replay && mise run build`.
- `scripts/qa_smoke.sh --ephemeral` starts ephemeral server on 3000, curls health/score/check/page, checks `X-Request-Id` and `cache-control: no-store` headers, exits 0 only if all pass.
- `pitchfork start --all` (web + mock), `pitchfork logs web`, `pitchfork stop --all`.
- Do not use Playwright; `agent-browser` via `droid-control` is the only browser tool (fresh isolated profile).
