# VeriBrowse — WebMCP Challenge

**2-tool WebMCP site: `scoreWebsite(url)` + `checkClaim(claim, contextUrl)`**

Safer browsing for elderly / non-power-users + nerd verbose audit with citations. Built for the [WebMCP Challenge](https://webmcp.devpost.com) (OpenAI, Aug 25 → Sep 3 13:00 PDT, stored `2026-09-04T03:00:00+07:00`). Browser test surfaces: **ChatGPT in-app browser** + **Chrome ≥149 with `chrome://flags#webmcp`**.

> Reference donor: `../all-things-agentic` (Aksantara) — same `mise+Pitchfork` toolchain contract, same 15-criteria readiness ladder, narrow 2-tool product.

## Why this problem — citable

- **1 in 18** cognitively intact older adults / year lose to financial fraud/scam (Burnes et al., _Am J Public Health_ 2017 meta-analysis n=41,711. PMC5508139 — pooled 5.4% 1-yr). CDC-recognized public-health problem.
- **16.4% engaged without skepticism**, ~12% leaked PII, ~5% SSN in live government-impersonation behavioral test (n=644) — low scam awareness + financial literacy predicted vulnerability (Yu et al., _JAMA Network Open_ 2023, PMC10517371).
- **Indonesia: 77% penetration (210M) but safety pillar 3.12/5; 51.7% of >55 online yet not digitally literate** (APJII 2022). Only 32% confident to spot hoax, 12% admitted sharing hoax; 98.3% got scam SMS, prize scam 91.2% (CfDS UGM n=1,671; Katadata n=10,000 MoE 0.98%; APJII-BAKTI 2024 n=1,950).
- **Older adults shared most fake news in 2016 US election; worse phishing discrimination when cognitively normal** (Brashier & Schacter 2020 PMC7505057; Grilli 2020 PMC8557838; Ebner 2020 J Geron B).
- **Frontiers Public Health 2025 (n=471, RAT model):** lack of technical guardianship β=0.46 → victimization; family active mediation β=-0.80 → protection. **VeriBrowse is the capable guardian.**

## How it works — WebMCP leverage

```js
if (typeof document.modelContext?.registerTool === "function") {
  await document.modelContext.registerTool({
    name: "scoreWebsite",
    description:
      "Score a website for scam/trust. Returns elderly summary + nerd audit.",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string", format: "uri" } },
      required: ["url"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: async ({ url }, { signal }) => {
      const r = await fetch(`/api/score?url=${encodeURIComponent(url)}`, {
        signal,
      });
      return r.json(); // { trust, level, elderlySummary, citations, provenance }
    },
  });
  await document.modelContext.registerTool({
    name: "checkClaim",
    description: "Verify claim vs evidence URL. Fail-closed when no evidence.",
    inputSchema: {
      type: "object",
      properties: {
        claim: { type: "string", minLength: 8 },
        contextUrl: { type: "string", format: "uri" },
      },
      required: ["claim"],
      additionalProperties: false,
    },
    execute: async ({ claim, contextUrl }, { signal }) => {
      const qs = new URLSearchParams({
        claim,
        ...(contextUrl ? { contextUrl } : {}),
      });
      const r = await fetch(`/api/check?${qs}`, { signal });
      return r.json(); // { verdict, confidence, evidence, provenance }
    },
  });
}
```

Agent flow: **user → ChatGPT page visits VeriBrowse → discovers `scoreWebsite` / `checkClaim` via `getTools()` → executes with `signal` → UI updates without reload**. Human and agent share live session.

## Architecture

```
User + Agent (ChatGPT / Chrome WebMCP)
  → Next.js App Router page (registerTool: ping/echoEcho/scoreWebsite/checkClaim)
    → Edge API /api/score, /api/check (zod parse, AbortSignal, contentHash provenance)
      → Fetch layer (meta/og/title, evidence snippet)
      → OpenAI (streamed) or deterministic mock when no key (fail-closed)
    → Provenance (url, contentHash, retrievedAt, citation manifest)
  → Elderly toggle UI (plain ≤80 words, large type) + nerd verbose JSON
```

- **Functional core:** `lib/score.ts` + `lib/claim.ts` pure, deterministic, testable without fetch/mcp.
- **Imperative shell:** `app/page.tsx` `registerTool` + `app/api/*/route.ts` Edge handlers.
- **Shared kernel:** `lib/schemas.ts` zod → JSON Schema single source.

## Built With (5 frozen + implicit)

- `Next.js 15` / `React 19` / `TypeScript strict`
- `document.modelContext.registerTool` (WebMCP imperative API)
- `Edge API` (`app/api/*` `runtime=edge`)
- `OpenAI API` (compatible) — mock when `OPENAI_API_KEY` empty
- `Netlify` hosting (also Vercel/Cloudflare compatible) + MIT license

Test surfaces: ChatGPT in-app browser AND Chrome ≥149 `chrome://flags#webmcp`.

## Project layout

```
app/                # pages + Edge routes (health/score/check)
lib/                # score, claim, schemas, logger (pure core)
components/         # TrustBadge, evidence view
tests/              # unit, replay (deterministic fixtures), integration (agent-browser, no Playwright)
scripts/            # qa_smoke.sh, mock_openai.mjs, check_*.sh
infra/              # netlify.toml
.devcontainer/      # Node 22 + mise + pitchfork
mise.toml           # task runner + toolchain pins
pitchfork.toml      # local daemons (web + mock)
```

## Quick start (3 commands, agent-followable)

```bash
mise install          # Node 22.11.0 + pitchfork 2.23.0 (or: npm i -g pnpm@9)
cp .env.example .env  # leave OPENAI_API_KEY empty for mock mode
pnpm install           # or npm install
```

## Build, lint, type, test

```bash
mise run check    # lint + type + test (lint = eslint && prettier --check, type = tsc --noEmit)
mise run lint     # eslint + prettier
mise run type     # tsc --noEmit strict
mise run test     # vitest --coverage --threshold 35%
mise run replay   # deterministic fixture replay
```

## Run & QA (no secret, no auth)

```bash
mise run dev &                          # next dev --port 3000
curl -s http://127.0.0.1:3000/api/health | jq
curl -s "http://127.0.0.1:3000/api/score?url=https://example.com&fixture=1" | jq .trust
curl -s "http://127.0.0.1:3000/api/check?claim=hello%20world%20claim%20text&fixture=1" | jq .verdict
# Browser: await document.modelContext.getTools()  → [{name:"scoreWebsite"}, {name:"checkClaim"}, {name:"ping"}, ...]
./scripts/qa_smoke.sh --ephemeral        # one-shot: starts ephemeral server, curls every endpoint, exits 0
mise run qa                             # same via mise
```

With `OPENAI_API_KEY` empty, routes return deterministic fixtures + heuristic scores (expected). With key, routes call OpenAI streamed.

Pitchfork alternative:

```bash
pitchfork start --all   # starts web (mise run dev) + mock (8787)
pitchfork logs web
pitchfork stop --all
```

## Demo (≤90s path that survives no-key mode)

1. Open `https://veribrowse.netlify.app` in ChatGPT.
2. User: "Is tokopedia-sale-99.net safe?" → Agent discovers `scoreWebsite` → calls `scoreWebsite({url:"https://tokopedia-sale-99.net"})` → elderly card: `⛔ Score 22/100 — RISKY. Do not enter data.` + nerd expand shows `contentHash, retrievedAt, why`.
3. Site shows claim "90% off all products limited time" → Agent calls `checkClaim({claim:"90% off all products", contextUrl:"https://tokopedia-sale-99.net"})` → `⛔ contradicted — no evidence, fail-closed`.
4. Toggle “Nerd verbose” for full provenance JSON.

Video template: problem (1 in 18 + 16.4% + 98.3% stats) → solution → 40% live agent demo on BOTH surfaces → WebMCP code snippet → close. `<3 min`, audio, public YouTube.

## DevContainer

Open in VS Code → _Reopen in Container_ → `pnpm install` → `mise run check` → `mise run qa`. Forwarded ports: 3000 (Next.js), 8787 (mock).

## Deployment (Netlify)

- Build command: `pnpm build` or `mise run build`
- Publish: `.next` (Next.js) or rely on Netlify Next.js Runtime
- Env: `OPENAI_API_KEY` (optional), `NEXT_PUBLIC_SITE_URL`
- Keep live URL free until judging ends **Sep 21 2026 17:00 PDT** (`2026-09-22T07:00:00+07:00`). If auth needed, put creds in Devpost _Testing Instructions_ (private).

## Triage

- **Worksheet:** `triage/worksheet.md` (Gate A/B, build plan, checkpoints)
- **Root register:** `../TRIAGE.md` (portfolio capacity, attention_score, EV)

## License

MIT — see `LICENSE` at repo top (must be visible for Devpost).

## Not building (stretch)

`crossReferenceReviews`, vector DB, bulk history, auth — violations of 5-tech sweet spot and A3 ≤60% demo path.
