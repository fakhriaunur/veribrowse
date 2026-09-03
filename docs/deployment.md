# Deployment — Netlify (VeriBrowse)

## Summary
VeriBrowse deploys from `main` via Netlify on a Netlify-provided subdomain (no custom domain). Build is `pnpm build`, publish directory `.next`, Node `22.23.2` pinned. Runtime is Next.js `16.3.4` (Turbopack is the default bundler for dev and build — no `--turbopack` flag needed; the build log shows `▲ Next.js 16.3.4 (Turbopack)`). `pnpm-lock.yaml` is the single lockfile (`package-lock.json` removed — dual lockfiles confused Netlify installer detection). API responses carry `cache-control: no-store` and `X-Request-Id` for correlation.

## Build Configuration

Netlify reads **only the repo-root `netlify.toml`** — that file is the live
source of truth. `infra/netlify.toml` is a tracked mirror of its `[build]`,
`[context.*]`, and `[[headers]]` blocks (the root file additionally declares
the `[[plugins]] @netlify/plugin-nextjs` Next.js runtime needed for SSR and
`/api/*` routes). `scripts/check_version_drift.sh` enforces the mirror stays
in sync; edit both files together.

```toml
[build]
  command = "pnpm build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "22.23.2"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

- **Node version:** `22.23.2` — must align with `mise.toml` (`node = "22.23.2"`), `package.json` `engines.node >=22.23.2`, `.github/workflows/ci.yml` `node-version: "22.23.2"`. Verified by `grep 22.23.2 mise.toml infra/netlify.toml .github/workflows/ci.yml package.json`.
- **Build command:** `pnpm build` (same as `mise run build` which runs `npx next build` with `NODE_ENV=production`).
- **Runtime pins:** `next` + `eslint-config-next` `16.3.4`, `react`/`react-dom` `19.2.8`, `@types/react` `19.2.18`, `@types/react-dom` `19.2.7` (see `package.json`).
- **Lockfile:** pnpm only — install with `pnpm install --frozen-lockfile` (Netlify detects pnpm from `pnpm-lock.yaml` + the `packageManager` field; the `ci.yml` `pnpm/action-setup` step intentionally carries no `version:` pin, it follows `package.json`).
- **First build after the 15→16 upgrade:** delete the stale cache once (`rm -rf .next`) — the Next 15 cache breaks 16 page-data collection (`Failed to collect page data for /_not-found`). `tsconfig.json` `jsx: react-jsx` + the `.next/dev/types` include are build-managed; do not hand-revert them.
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

- **Live URL (Netlify subdomain, no custom domain):** `https://veribrowse.netlify.app` — **live, verified 200** (2026-09-04 smoke: `/api/health` → `{"status":"ok","service":"veribrowse","version":"0.1.0"}` + `X-Request-Id` + `cache-control: no-store`; `/api/score?fixture=1` trust 42; `/api/check?fixture=1` verdict `supported`; `/` serves the page). Dashboard linking + `NEXT_PUBLIC_SITE_URL` were set by the user on 2026-09-04; the repo-side root-`netlify.toml` + Node 22.23.2 fixes below unblocked the deploy.

- **Repo-side cause fixed (2026-09-04):** the repo kept its Netlify config at `infra/netlify.toml`, which Netlify ignores — it only reads the repo-root `netlify.toml`. With no root config, the linked site had no usable build settings and no Next.js runtime wiring, so nothing was served. Fix committed here: new repo-root `netlify.toml` (`pnpm build`, publish `.next`, `NODE_VERSION 22.23.2`, `[[plugins]] @netlify/plugin-nextjs` for SSR/API routes, `cache-control: no-store` for `/api/*`), with `infra/netlify.toml` kept as a drift-gated mirror. The next production deploy from `main` picks this up automatically.

- **Corepack hotfix (2026-09-04):** past the mise gate, Netlify failed at `Installing npm packages using pnpm version` with Corepack `Cannot find matching keyid` — the Corepack bundled with the pre-hotfix Node 22.x pin had stale signing keys and cannot verify pnpm 9.15.9 (fixed in Corepack >=0.31.0, shipped in Node >=22.14.0). Fix: Node → `22.23.2` (latest 22.x LTS verified against nodejs.org release index on 2026-09-04; the prescribed `22.23.3` does not exist upstream) in every pin site (`mise.toml`, `.github/workflows/ci.yml`, root + mirror `netlify.toml`, `package.json` engines, `scripts/check_version_drift.sh`, docs/templates). pnpm stays `9.15.9`. Never set `COREPACK_INTEGRITY_KEYS=0` (security bypass).

- **Dashboard-side observations for the user (not guessable from the repo):** the site-wide 404 (even `/`) means no successful deploy is published yet. In the Netlify dashboard for `veribrowse`: (1) Deploys tab — confirm the site is linked to this repo's `main` branch with auto-publish on, and trigger **Trigger deploy → Deploy site** (or push `main`) so a build runs with the new root `netlify.toml`; (2) check the deploy log for `pnpm build` success and the `@netlify/plugin-nextjs` runtime install line; (3) Site settings → Environment variables — confirm `NEXT_PUBLIC_SITE_URL=https://veribrowse.netlify.app` (leave `OPENAI_API_KEY` empty for deterministic fixture mode, or fill it for real enrichment); (4) if 404 persists after a **successful** deploy, share the deploy log — that points at a dashboard/build-image issue, not the repo.

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

- [ ] `cat netlify.toml` (repo root — the file Netlify reads) shows `NODE_VERSION = "22.23.2"`, `publish = ".next"`, `command = "pnpm build"`, all three contexts, and `[[plugins]] @netlify/plugin-nextjs`.
- [ ] `bash scripts/check_version_drift.sh` passes (Node parity + root/mirror sync).
- [ ] `cat infra/netlify.toml` mirror matches the root file's `[build]`/`[context.*]`/`[[headers]]` blocks.
- [ ] `cat infra/netlify.toml | grep -A5 headers` shows `/api/*` `cache-control = "no-store"`.
- [ ] `grep -n "netlify\|NODE_VERSION" docs/deployment.md` passes (this document).
- [ ] `mise run build` passes locally without key.
- [ ] `curl -is http://127.0.0.1:3000/api/health | grep -i X-Request-Id` shows header.
- [ ] After Netlify link, `curl -is $NEXT_PUBLIC_SITE_URL/api/health` shows `200`, `cache-control: no-store`, `X-Request-Id`.

## Related

- `docs/runbook.md#Deployment` — deploy logs, rollback, X-Request-Id correlation, no `sk-` guarantee.
- `docs/branch-protection.md` — `main` ruleset requires `check` job.
- `infra/netlify.toml` — canonical Netlify config.
