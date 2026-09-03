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
  -> Edge GET /api/score?url=... (zod) -> fetch HTML -> meta -> buildTrustScore -> log json -> json response
  -> Edge GET /api/check?claim=... -> fetch evidence? -> verifyClaimPure -> log -> json
```

All logs via `pino` with `requestId`, `contentHash`, PII redacted.
