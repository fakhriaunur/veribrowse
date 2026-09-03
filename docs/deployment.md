# Deployment — Netlify (VeriBrowse)

## Summary
VeriBrowse deploys from `main` via Netlify on a Netlify-provided subdomain (no custom domain). Build is `pnpm build`, publish directory `.next`, Node `22.11.0` pinned. API responses carry `cache-control: no-store` and `X-Request-Id` for correlation.

## Build Configuration

`infra/netlify.toml` is the source of truth:

```toml
[build]
  command = "pnpm build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "22.11.0"
```

- **Node version:** `22.11.0` — must align with `mise.toml` (`node = "22.11.0"`), `package.json` `engines.node >=22.11.0`, `.github/workflows/ci.yml` `node-version: "22.11.0"`. Verified by `grep 22.11.0 mise.toml infra/netlify.toml .github/workflows/ci.yml package.json`.
- **Build command:** `pnpm build` (same as `mise run build` which runs `npx next build` with `NODE_ENV=production`).
- **Publish directory:** `.next` (Next.js).
- `pnpm` version: `9` via `pnpm/action-setup@v4`.

## Deploy Contexts

All contexts use the same build command to keep provenance deterministic:

```toml
[context.production]
  command = "pnpm build"

[context.deploy-preview]
  command = "pnpm build"

[context.branch-deploy]
  command = "pnpm build"
```

- `production` — deploys `main` (or default branch). Trigger: `git push origin main`.
- `deploy-preview` — PR previews (Netlify builds each PR).
- `branch-deploy` — other branches pushed to Netlify.

Verify via:
```bash
cat infra/netlify.toml
grep -n "context\." infra/netlify.toml
```

All three contexts run `pnpm build` — validated by `grep -c 'pnpm build' infra/netlify.toml` (expect 4: one in `[build]` + three contexts).

## Headers

```toml
[[headers]]
  for = "/api/*"
  [headers.values]
    cache-control = "no-store"
```

- `cache-control: no-store` for `/api/*` prevents caching of health/score/check responses (provenance `contentHash` + `retrievedAt` are dynamic).
- Application routes also set `cache-control: no-store` at runtime (`app/api/health/route.ts`, `app/api/score/route.ts`, `app/api/check/route.ts` via `headers: { "cache-control": "no-store" }`), so local `curl -is http://127.0.0.1:3000/api/health` shows the header even without Netlify.

Verify headers block:
```bash
cat infra/netlify.toml | grep -A5 headers
curl -is http://127.0.0.1:3000/api/health | grep -i cache-control
```

## Live URL

- **Live URL (Netlify subdomain, no custom domain):** `https://veribrowse.netlify.app` — placeholder until dashboard linking completes. After the Netlify site is linked via the Netlify dashboard (human-controlled), update this URL and set `NEXT_PUBLIC_SITE_URL` env var in Netlify to the actual subdomain.

- **Current blocker (2026-09-03):** Netlify site linking and env-var entry (`OPENAI_API_KEY`, `OPENAI_BASE_URL`, `NEXT_PUBLIC_SITE_URL`) are human-controlled and have not yet been completed in the dashboard. The repository build provenance, `infra/netlify.toml`, and local `mise run build` are verified. Live `curl` against the placeholder will fail until the site is linked. This is documented here rather than silently skipped; local smoke against `http://127.0.0.1:3000` is passing (see below), and build provenance is green (`mise run build` succeeds, `infra/netlify.toml` NODE_VERSION 22.11.0 verified).

- **Smoke after link:**
```bash
curl -is $NEXT_PUBLIC_SITE_URL/api/health | head -20
# expect: 200 {"status":"ok","service":"veribrowse","version":"0.1.0"} + X-Request-Id + cache-control: no-store
curl -is "$NEXT_PUBLIC_SITE_URL/api/score?url=https://example.com&fixture=1" | jq
curl -is "$NEXT_PUBLIC_SITE_URL/api/check?claim=hello%20world%20fixture&fixture=1" | jq
curl -is $NEXT_PUBLIC_SITE_URL/ | head -20
```

- **Local smoke (no key, no live URL required):**
```bash
mise run qa --ephemeral
# or
./scripts/qa_smoke.sh --ephemeral
```

Both cover `GET /api/health -> 200 {status:ok, service:veribrowse, version:0.1.0} + X-Request-Id + cache-control no-store`, `GET /api/score?fixture=1`, `GET /api/check?fixture=1`, `GET / -> 200 HTML`.

## Environment Variables (Netlify dashboard — human-controlled)

- `OPENAI_API_KEY` — empty = mock/fixture path (default), filled = real enrichment. Never committed.
- `OPENAI_BASE_URL` — `https://api.openai.com/v1` (default), `http://127.0.0.1:8787` for mock.
- `OPENAI_MODEL` — `gpt-4o-mini`
- `LOG_LEVEL` — `info`
- `NEXT_PUBLIC_SITE_URL` — Netlify subdomain (e.g., `https://veribrowse.netlify.app`) or `http://localhost:3000` locally.

Do not commit secrets. Verify no `sk-` in logs: `grep -r "sk-" . --exclude-dir=node_modules` should be empty outside placeholders.

## Verification Checklist

- [ ] `cat infra/netlify.toml` shows `NODE_VERSION = "22.11.0"`, `publish = ".next"`, `command = "pnpm build"`, all three contexts.
- [ ] `cat infra/netlify.toml | grep -A5 headers` shows `/api/*` `cache-control = "no-store"`.
- [ ] `grep -n "netlify\|NODE_VERSION" docs/deployment.md` passes (this document).
- [ ] `mise run build` passes locally without key.
- [ ] `curl -is http://127.0.0.1:3000/api/health | grep -i X-Request-Id` shows header.
- [ ] After Netlify link, `curl -is $NEXT_PUBLIC_SITE_URL/api/health` shows `200`, `cache-control: no-store`, `X-Request-Id`.

## Related

- `docs/runbook.md#Deployment` — deploy logs, rollback, X-Request-Id correlation, no `sk-` guarantee.
- `docs/branch-protection.md` — `main` ruleset requires `check` job.
- `infra/netlify.toml` — canonical Netlify config.
