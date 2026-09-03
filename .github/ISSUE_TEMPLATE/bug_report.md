---
name: Bug report
about: Report a reproducible bug in VeriBrowse (scoreWebsite / checkClaim, API, or WebMCP shell)
title: "fix: "
labels: [bug]
assignees: []
---

## Description

<!-- A clear, concise description of the bug. -->

## Reproduction

**Steps to reproduce**

1. Environment: `mise install` + `cp .env.example .env` (OPENAI_API_KEY empty for mock) + `pnpm install`
2. Start: `mise run dev` (or `mise run qa --ephemeral`)
3. Action: `curl -s ...` or `document.modelContext.getTools()` / manual Score/Verify
4. Observed: <!-- what happened -->

**Expected**

<!-- what should happen per `lib/` contract -->

## Evidence

- `GET /api/health` → `curl -is http://127.0.0.1:3000/api/health | head -20`
- `GET /api/score?url=https://example.com&fixture=1` or `GET /api/check?claim=...`
- Browser: `await document.modelContext.getTools()` output, screenshot, console-errors
- Logs: `pitchfork logs web 2>&1 | jq 'select(.requestId=="")'` + `X-Request-Id` header
- `mise run lint && mise run type && mise run test && mise run replay` results

## Env

- Node `mise exec -- node -v` → `v22.23.2`
- `OPENAI_API_KEY` empty / `dummy` + `OPENAI_BASE_URL=http://127.0.0.1:8787` / real (redacted, never paste `sk-`)
- `LOG_LEVEL`:
- OS / browser + WebMCP flag (`chrome://flags#webmcp` or ChatGPT in-app):

## Labels

<!-- Maintainers triage with: bug, enhancement, hardening, m7, m8 -->

- Area: `score` / `check` / `webmcp` / `observability` / `infra`

## Checklist

- [ ] No `sk-` secret pasted (gitleaks safe)
- [ ] `mise run lint && mise run type` green
- [ ] Fail-closed preserved (`unverified` with empty evidence when no `contextUrl`)

---

_Template follows VeriBrowse triage; see `docs/runbook.md` for smoke and `docs/skills.md` for QA skill._
