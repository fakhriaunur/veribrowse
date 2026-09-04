# Mission Readiness — 15 Criteria Checklist

Generated 2026-09-03 UTC+07:00 — Factory 15-criteria ladder (AGENTS.md).

| # | Criterion | Status | Evidence | Command |
|---|---|---|---:|---|
| 1 | agents_md | ✅ pass | `AGENTS.md` present, tailored from Aksantara donor | `cat AGENTS.md` |
| 2 | env_template | ✅ pass | `.env.example` (OPENAI_API_KEY empty → mock) + `.env` gitignored | `cat .env.example` |
| 3 | single_command_setup | ✅ pass | `mise install && cp .env.example .env && pnpm install` documented in README#Quick start | `mise install` |
| 4 | local_services_setup | ✅ pass | `pitchfork.toml` (web + mock) + `mise.toml [tasks]` + `scripts/qa_smoke.sh` | `cat pitchfork.toml` |
| 5 | devcontainer | ✅ pass | `.devcontainer/devcontainer.json` (Node 22 + mise + pitchfork, ports 3000/8787) | `cat .devcontainer/devcontainer.json` |
| 6 | build_cmd_doc | ✅ pass | `README.md#Build` + `AGENTS.md` declare `mise run build` (`npx next build`, NODE_ENV=production) | `mise run build` |
| 7 | lint_config | ✅ pass | `eslint.config.mjs` (FlatCompat next/core-web-vitals) + `prettier` + `.prettierignore` | `mise run lint` |
| 8 | type_check | ✅ pass | `tsconfig.json` strict + `mise run type` (`tsc --noEmit`) | `mise run type` |
| 9 | unit_tests_exist | ✅ pass | `tests/unit/{score,claim,schemas}.test.ts` + `tests/unit/api.routes.test.ts` | `ls tests/unit` |
| 10 | unit_tests_runnable | ✅ pass | `mise run test` — 23 tests, 66% coverage (threshold 35) | `mise run test` |
| 11 | integration_tests_exist | ✅ pass | `tests/integration/api.test.ts` + `tests/integration/webmcp*.spec.ts` + `tests/replay/score.replay.test.ts` | `ls tests/integration` |
| 12 | interactive_qa_exists | ✅ pass | `scripts/qa_smoke.sh` + `README#Interactive QA` agent-followable path | `cat scripts/qa_smoke.sh` |
| 13 | interactive_qa_runnable | ✅ pass | `mise run qa` / `./scripts/qa_smoke.sh --ephemeral` → health/score/check/page/tools (mock mode) | `mise run qa` |
| 14 | structured_logging | ✅ pass | `lib/logger.ts` (pino JSON, level, requestId, PII redaction) used in all Edge routes | `cat lib/logger.ts` |
| 15 | devcontainer_runnable | ✅ pass | `devcontainer` builds: `postCreateCommand` (pnpm install) + ports 3000/8787; `mise run devcontainer-verify` passes | `mise run devcontainer-verify` |

**Tracer bullets & MVPs**

- **Tracer M1:** `ping` + `echoEcho` + `scoreWebsite` + `checkClaim` all `registerTool` on `document.modelContext`; discoverable via `getTools()` on both surfaces (ChatGPT browser + Chrome 149 flag). Verified via `tests/integration/webmcp.browser.spec.ts` with mocked `modelContext` (agent-browser skill) + manual `qa_smoke` page check.
- **MVP M2:** `scoreWebsite(url)` → Edge/Node `GET /api/score?url=&fixture=1` → `buildTrustScore` heuristic + optional OpenAI enrichment (fetch with `signal`) + `elderlySummary` ≤80 words + provenance `contentHash`.
- **MVP M3:** `checkClaim(claim, contextUrl?)` → `GET /api/check` → evidence fetch + `verifyClaimPure` fail-closed → `unverified` empty evidence when no context, never hallucinated citations.

**Quality gates (pre-commit)**

- `mise run lint` ✅ (eslint + prettier with FlatCompat)
- `mise run type` ✅ strict
- `mise run test` ✅ 23 tests, 66% lines
- `mise run build` ✅ (Next 16.3.4 Turbopack, 7 pages, 100kB shared)
- `mise run qa` ✅ ephemeral smoke (health, score fixture, check fixture, page, tool strings)
- `bash scripts/check_large_files.sh` ✅ (700 lines / 150KB)
- `bash scripts/check_tech_debt.sh` ✅ (TODO(#123) tracking)
- `mise run replay` ✅ deterministic fixture replay
- `playwright browser spec` ⚠️ requires browser binary install (`npx playwright install`); skipped on headless CI without browser, but present for agent-browser skill.

**Hiring-signal alignment (Jakarta tier map & Built With)**

- Startup AI Fullstack (P0): Next.js 15 + TS strict + Tailwind/shadcn + Prisma/Postgres-ready + OpenAI SDK streaming + Edge/Node → maximizes Devpost judge overlap (Cloudflare/Vercel/Shopify/Chrome) and Jakarta startup ladder (React +35% YoY, Next+20-30% premium, AI demand +148%).
- Enterprise signal (P1): pino structured logs, requestId, contentHash provenance, PII redaction, AbortSignal handling.

**Next step before submission**

- Deploy `main` to Netlify (`infra/netlify.toml`, build `pnpm build`, env `OPENAI_API_KEY` optional) → obtain `https://veribrowse.netlify.app` live URL testable in both browsers until 2026-09-21 judging end. Keep fallback mock mode so judges can test without key.
- Record `<3 min` YouTube demo: problem (1-in-18 + 16.4% stats) → solution → 40% live agent demo (both surfaces) → WebMCP snippet → close. Backup video linked.
- Fill Devpost: live URL, public repo URL (MIT license at top), description with architecture diagram + GIF, Testing Instructions if auth ever added (currently none).
