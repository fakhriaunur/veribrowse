# VeriBrowse Architecture — DDD + FCIS + DDIA

## Bounded contexts

- **Scoring** (`lib/score.ts`): `url → FetchMeta → TrustScore` — heuristic + LLM why.
- **Verification** (`lib/claim.ts`): `claim + contextUrl → Evidence → ClaimResult` — fail-closed.

Shared kernel: `Url`, `Citation {url, snippet, contentHash, retrievedAt}`.

## File mapping to monolith families

- **pp:** tracer `ping`/`echoEcho` before `scoreWebsite`/`checkClaim`; `mise run qa` executable spec; DRY zod in `lib/schemas.ts`.
- **aposd:** `lib/score.ts` is deep module — one place owns heuristics, summary, provenance. `app/page.tsx` registerTool is thin.
- **fcis:** `execute` parses with zod, delegates to pure `scoreWebsitePure` / `verifyClaimPure`. No hidden IO in core.
- **ddia:** fetch with `AbortSignal`, timeouts, provenance `contentHash` + `retrievedAt`; unknown claim → `unverified` empty evidence (never hallucinated).
- **ddd:** two contexts, no anemic `utils` cross-contamination.
- **aiswe:** AI scaffolds routes/tests, human verifies `registerTool` on both browsers and prompt PII handling.

## Data flow

```
browser registerTool
  -> Node.js runtime GET /api/score?url=... (zod) -> fetch HTML -> meta -> buildTrustScore -> log json -> json response
  -> Node.js runtime GET /api/check?claim=... -> fetch evidence? -> verifyClaimPure -> log -> json
```

All logs via `pino` with `requestId`, `contentHash`, PII redacted.

## Observability & Resilience

- **Logging:** `lib/logger.ts` pino JSON with `service: veribrowse`, `level` from `LOG_LEVEL` (default `info`), `requestId` via `withRequestId(id)` child logger, `durationMs` bounded >0, `hasKey` boolean, `trust/level` or `verdict`. Redact `OPENAI_API_KEY`, `authorization` — never logs `sk-` (`redact: ["OPENAI_API_KEY","authorization"]`).
- **Request correlation:** Every `app/api/*` route reads `X-Request-Id` (case-insensitive) and echoes it; if absent generates `crypto.randomUUID().slice(0,8)`. Header set on 200 and 4xx/499. Logs include `requestId` mirroring header. Use `curl -D - -H "X-Request-Id: my-id" http://127.0.0.1:3000/api/health` to correlate.
- **Tracing stub:** `traceparent` (W3C `00-<trace>-<parent>-01`) passthrough stub — server accepts header without error, optionally logs `traceparent` field, preserves `X-Request-Id`. No OTel SDK by default; comment in `lib/logger.ts` and `docs/runbook.md` documents future `@opentelemetry/sdk-node` wiring when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. See `docs/runbook.md#tracing-stub`.
- **Metrics:** `lib/metrics.ts` in-memory counters `score_requests_total`, `check_requests_total`, `openai_fallback_total`, `http_requests_total` (`inc()` per request/fallback, `toPrometheus()` HELP/TYPE exposition). Exposed at `GET /api/metrics` as `text/plain; version=0.0.4` Prometheus format, no auth, includes `X-Request-Id`. Counters reset on restart (stateless Netlify).
- **Fetch resilience:** `lib/fetchWithRetry.ts` wraps HTML and `POST {OPENAI_BASE_URL}/v1/chat/completions` with `AbortSignal.timeout(3000)` per attempt, 2 retries exponential (100ms * 2^attempt), in-memory breaker 30s open per host (`breaker.set(host, Date.now()+30_000)`), `AbortError` not retried, signal propagation via `AbortSignal.any` / fallback.
- **Health & metrics endpoints:** `GET /api/health` → `{status:"ok",service:"veribrowse",version:"0.1.0"}` + `X-Request-Id` + `cache-control: no-store`; `?verbose=1` adds `uptime` + `timestamp`. `GET /api/metrics` → Prometheus text. Both stateless, no auth.
- **Alerting:** Primary signal is Netlify deploy/function logs (`level:error` search); optional external uptime check `curl /api/health` via UptimeRobot/Checkly every 5m. No Prometheus/Grafana required. See `docs/runbook.md#alerting--uptime`.

## Version pins (refreshed 2026-09-04)

Single source of truth is `mise.toml` + `package.json`; `scripts/check_version_drift.sh`
gates Node alignment across `mise.toml`, both `netlify.toml` files, `ci.yml`, and
`package.json` engines. Documented floors only — never enforce `min_version`
(Netlify build image carries an older mise and hard-fails on any floor).

- Runtime: Node `22.23.2`, pnpm `9.15.9`, Pitchfork `2.23.0`
- Framework: Next.js `16.3.4` (App Router, `nodejs` runtime), React `19.2.8`, Tailwind CSS v4 (`4.3.3` via `@tailwindcss/postcss`)
- Core deps: `zod 4.x` (`4.5.4`), `pino 10.x` (`10.3.1`), `openai 7.x` (`7.10.0`)
- Toolchain: TypeScript `5.9.3` strict, vitest `5.0.0`, eslint `9.39.5`, jsdom `30`
- Deploy: `netlify.toml` `NODE_VERSION 22.23.2`, `@netlify/plugin-nextjs` runtime, `cache-control: no-store` on `/api/*`

## Diagrams (mermaid — GitHub renders natively)

### 1. High-level architecture (beta)

```mermaid
flowchart TB
    Agent["Agent<br/>(ChatGPT / Chrome WebMCP)"]
    Shell["WebMCP shell<br/>app/page.tsx registerTool<br/>ping, echoEcho, scoreWebsite, checkClaim"]
    ScoreRoute["GET /api/score<br/>app/api/score/route.ts"]
    CheckRoute["GET /api/check<br/>app/api/check/route.ts"]
    HealthRoute["GET /api/health<br/>app/api/health/route.ts"]
    MetricsRoute["GET /api/metrics<br/>app/api/metrics/route.ts"]
    Schemas["Validation<br/>lib/schemas.ts (zod)"]
    ScoreCore["Scoring core<br/>lib/score.ts scoreWebsitePure"]
    ClaimCore["Verification core<br/>lib/claim.ts verifyClaimPure"]
    FetchR["Fetch helpers<br/>lib/fetchWithRetry.ts<br/>lib/fetchMemo.ts per-request memo"]
    Logger["Logging<br/>lib/logger.ts pino"]
    Metrics["Metrics<br/>lib/metrics.ts counters"]
    UI["UI components<br/>TrustBadge, ThemeToggle,<br/>RecentsCompare, lib/recents.ts"]
    OpenAI["OpenAI API<br/>optional enrichment"]
    MockOpenAI["Mock OpenAI :8787<br/>scripts/mock_openai.mjs"]
    Netlify["Netlify deploy<br/>@netlify/plugin-nextjs<br/>no-store on /api/*"]

    Agent --> Shell
    Shell --> ScoreRoute
    Shell --> CheckRoute
    Shell --> UI
    ScoreRoute --> Schemas
    CheckRoute --> Schemas
    ScoreRoute --> ScoreCore
    CheckRoute --> ClaimCore
    ScoreRoute --> FetchR
    CheckRoute --> FetchR
    ScoreCore --> OpenAI
    ClaimCore --> OpenAI
    ScoreRoute --> Logger
    CheckRoute --> Logger
    HealthRoute --> Logger
    ScoreRoute --> Metrics
    CheckRoute --> Metrics
    MetricsRoute --> Metrics
    OpenAI -.->|"OPENAI_BASE_URL override"| MockOpenAI
    Shell -.->|"deployed on"| Netlify
    ScoreRoute -.->|"deployed on"| Netlify
    CheckRoute -.->|"deployed on"| Netlify
```

### 2. Request sequence (score + check)

```mermaid
sequenceDiagram
    participant A as Agent (WebMCP)
    participant P as app/page.tsx execute
    participant S as /api/score route
    participant C as /api/check route
    participant Z as lib/schemas.ts (zod)
    participant F as lib/fetchWithRetry + fetchMemo
    participant L as lib/score.ts / lib/claim.ts pure core
    participant O as OpenAI (optional)
    participant G as lib/logger.ts pino

    A->>P: scoreWebsite({url})
    P->>S: GET /api/score?url=... (signal)
    S->>Z: validate url
    Z-->>S: ok
    S->>F: fetch HTML (memo per request)
    F-->>S: FetchMeta title/og
    S->>L: scoreWebsitePure(meta)
    L-->>S: TrustScore heuristic
    S->>O: POST chat/completions (only if key set)
    O-->>S: why/bullets (or fallback)
    S->>G: log trust/level/durationMs/requestId
    S-->>P: 200 TrustScore + X-Request-Id
    P-->>A: result + TrustBadge update

    A->>P: checkClaim({claim, contextUrl})
    P->>C: GET /api/check?claim=... (signal)
    C->>Z: validate claim 8-500
    Z-->>C: ok
    C->>F: fetch evidence (contextUrl only)
    F-->>C: Evidence quote/contentHash
    alt evidence present
        C->>L: verifyClaimPure(evidence)
        C->>O: POST verdict (only if evidence>0)
        O-->>C: verdict/confidence
    else no evidence
        C->>L: verifyClaimPure fail-closed
        L-->>C: unverified 0.3 empty evidence
    end
    C->>G: log verdict/confidence/requestId
    C-->>P: 200 ClaimResult + X-Request-Id
    P-->>A: verdict pill + evidence list
```

### 3. Bounded contexts

```mermaid
flowchart LR
    subgraph Scoring["Scoring context (lib/score.ts)"]
        SIn["url + FetchMeta"]
        SOut["TrustScore<br/>trust, level, elderlySummary,<br/>bullets, provenance, citations"]
        SIn --> SOut
    end
    subgraph Verification["Verification context (lib/claim.ts)"]
        CIn["claim + contextUrl"]
        COut["ClaimResult<br/>verdict, confidence, evidence,<br/>claimHash, checkedAt"]
        CIn --> COut
    end
    subgraph Kernel["Shared kernel"]
        K["Url, Citation<br/>contentHash, retrievedAt<br/>lib/schemas.ts zod"]
    end
    Scoring <-->|"shared kernel"| Kernel
    Verification <-->|"shared kernel"| Kernel
    Verification -.->|"M10: evidence URLs scored<br/>in-request via scoreWebsitePure"| Scoring
```

### 4. Context map (contexts + supporting subdomains)

```mermaid
flowchart TB
    Browser["Browser host<br/>app/page.tsx WebMCP shell"]
    ScoreCtx["Scoring context<br/>/api/score + lib/score.ts"]
    VerifyCtx["Verification context<br/>/api/check + lib/claim.ts"]
    ObsSup["Observability supporting subdomain<br/>lib/logger.ts, lib/metrics.ts<br/>/api/health, /api/metrics"]
    FetchSup["Fetch supporting subdomain<br/>lib/fetchWithRetry.ts<br/>lib/fetchMemo.ts"]
    ClientSup["Client supporting subdomain<br/>ThemeToggle, RecentsCompare<br/>lib/recents.ts, lib/theme.ts"]
    LLM["Upstream: OpenAI API<br/>(conformist — json_object, temp 0.2)"]
    MockLLM["Test double: mock OpenAI :8787"]
    CDN["Netlify platform<br/>(hosting + no-store headers)"]

    Browser -->|"calls"| ScoreCtx
    Browser -->|"calls"| VerifyCtx
    Browser -->|"renders"| ClientSup
    ScoreCtx -->|"uses"| FetchSup
    VerifyCtx -->|"uses"| FetchSup
    ScoreCtx -->|"emits to"| ObsSup
    VerifyCtx -->|"emits to"| ObsSup
    ScoreCtx -.->|"optional enrich"| LLM
    VerifyCtx -.->|"only if evidence>0"| LLM
    LLM -.->|"OPENAI_BASE_URL swap"| MockLLM
    Browser -.->|"served by"| CDN
    ScoreCtx -.->|"served by"| CDN
    VerifyCtx -.->|"served by"| CDN
```

### 5. C4 container diagram

```mermaid
flowchart TB
    Person["Person: Elder + Nerd user<br/>scores sites, verifies claims"]

    subgraph Boundary["System boundary: VeriBrowse (Next.js 16 on Netlify)"]
        SPA["Container: WebMCP shell SPA<br/>app/page.tsx + TrustBadge,<br/>ThemeToggle, RecentsCompare<br/>registers ping, echoEcho,<br/>scoreWebsite, checkClaim"]
        API["Container: API routes (nodejs)<br/>/api/score, /api/check,<br/>/api/health, /api/metrics<br/>zod validation, AbortSignal,<br/>X-Request-Id"]
        Core["Container: Pure core lib<br/>score.ts, claim.ts, schemas.ts<br/>fetchWithRetry, fetchMemo<br/>deterministic, fail-closed"]
        Obs["Container: Observability<br/>logger.ts pino JSON,<br/>metrics.ts counters"]
    end

    ExtLLM["External: OpenAI API<br/>optional why/verdict enrichment"]
    ExtMock["External (dev/test): mock OpenAI :8787"]
    ExtNetlify["External: Netlify platform<br/>plugin-nextjs, no-store headers"]

    Person -->|"uses (browser, WebMCP)"| SPA
    SPA -->|"GET JSON (fetch + signal)"| API
    API -->|"calls pure functions"| Core
    API -->|"logs + counters"| Obs
    Core -.->|"POST chat/completions (key set)"| ExtLLM
    Core -.->|"BASE_URL override"| ExtMock
    SPA -.->|"hosted on"| ExtNetlify
    API -.->|"hosted on"| ExtNetlify
```
