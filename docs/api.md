# API — VeriBrowse lib/ (typedoc)

> Generated from `lib/` pure core. Do not edit — run `mise run docs` to regenerate.

Version: `0.1.0` — typedoc via `typedoc.json` → `lib/` → `docs/api.md`.

---

<!-- README.md -->
**veribrowse**

***

# veribrowse

## Modules

- [claim](claim/README.md)
- [fetchWithRetry](fetchWithRetry/README.md)
- [logger](logger/README.md)
- [metrics](metrics/README.md)
- [schemas](schemas/README.md)
- [score](score/README.md)


---

<!-- claim/README.md -->
[**veribrowse**](../README.md)

***

[veribrowse](../README.md) / claim

# claim

## Type Aliases

- [ClaimInput](type-aliases/ClaimInput.md)
- [ClaimResult](type-aliases/ClaimResult.md)
- [Evidence](type-aliases/Evidence.md)
- [EvidenceBadge](type-aliases/EvidenceBadge.md)
- [Verdict](type-aliases/Verdict.md)

## Functions

- [verifyClaimPure](functions/verifyClaimPure.md)


---

<!-- claim/functions/verifyClaimPure.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [claim](../README.md) / verifyClaimPure

# Function: verifyClaimPure()

> **verifyClaimPure**(`input`, `evidence`, `llm?`): [`ClaimResult`](../type-aliases/ClaimResult.md)

Defined in: [claim.ts:33](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/claim.ts#L33)

## Parameters

### input

[`ClaimInput`](../type-aliases/ClaimInput.md)

### evidence

[`Evidence`](../type-aliases/Evidence.md)[] \| `null`

### llm?

#### confidence

`number`

#### reasoning

`string`

#### verdict

[`Verdict`](../type-aliases/Verdict.md)

## Returns

[`ClaimResult`](../type-aliases/ClaimResult.md)


---

<!-- claim/type-aliases/ClaimInput.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [claim](../README.md) / ClaimInput

# Type Alias: ClaimInput

> **ClaimInput** = `object`

Defined in: [claim.ts:7](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/claim.ts#L7)

## Properties

### claim

> **claim**: `string`

Defined in: [claim.ts:7](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/claim.ts#L7)

***

### contextUrl?

> `optional` **contextUrl?**: `string`

Defined in: [claim.ts:7](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/claim.ts#L7)


---

<!-- claim/type-aliases/ClaimResult.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [claim](../README.md) / ClaimResult

# Type Alias: ClaimResult

> **ClaimResult** = `object`

Defined in: [claim.ts:23](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/claim.ts#L23)

## Properties

### confidence

> **confidence**: `number`

Defined in: [claim.ts:25](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/claim.ts#L25)

***

### elderlySummary

> **elderlySummary**: `string`

Defined in: [claim.ts:26](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/claim.ts#L26)

***

### evidence

> **evidence**: [`Evidence`](Evidence.md)[]

Defined in: [claim.ts:28](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/claim.ts#L28)

***

### provenance

> **provenance**: `object`

Defined in: [claim.ts:29](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/claim.ts#L29)

#### checkedAt

> **checkedAt**: `string`

#### claim

> **claim**: `string`

#### claimHash

> **claimHash**: `string`

***

### reasoning

> **reasoning**: `string`

Defined in: [claim.ts:27](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/claim.ts#L27)

***

### verdict

> **verdict**: [`Verdict`](Verdict.md)

Defined in: [claim.ts:24](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/claim.ts#L24)


---

<!-- claim/type-aliases/Evidence.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [claim](../README.md) / Evidence

# Type Alias: Evidence

> **Evidence** = `object`

Defined in: [claim.ts:15](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/claim.ts#L15)

## Properties

### badge?

> `optional` **badge?**: [`EvidenceBadge`](EvidenceBadge.md)

Defined in: [claim.ts:20](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/claim.ts#L20)

***

### contentHash

> **contentHash**: `string`

Defined in: [claim.ts:18](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/claim.ts#L18)

***

### quote

> **quote**: `string`

Defined in: [claim.ts:17](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/claim.ts#L17)

***

### retrievedAt

> **retrievedAt**: `string`

Defined in: [claim.ts:19](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/claim.ts#L19)

***

### url

> **url**: `string`

Defined in: [claim.ts:16](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/claim.ts#L16)


---

<!-- claim/type-aliases/EvidenceBadge.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [claim](../README.md) / EvidenceBadge

# Type Alias: EvidenceBadge

> **EvidenceBadge** = `object`

Defined in: [claim.ts:13](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/claim.ts#L13)

## Properties

### level

> **level**: [`TrustLevel`](../../score/type-aliases/TrustLevel.md)

Defined in: [claim.ts:13](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/claim.ts#L13)

***

### trust

> **trust**: `number`

Defined in: [claim.ts:13](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/claim.ts#L13)


---

<!-- claim/type-aliases/Verdict.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [claim](../README.md) / Verdict

# Type Alias: Verdict

> **Verdict** = `"supported"` \| `"contradicted"` \| `"unverified"`

Defined in: [claim.ts:5](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/claim.ts#L5)


---

<!-- fetchWithRetry/README.md -->
[**veribrowse**](../README.md)

***

[veribrowse](../README.md) / fetchWithRetry

# fetchWithRetry

## Variables

- [BACKOFF\_BASE\_MS](variables/BACKOFF_BASE_MS.md)
- [BREAKER\_MS](variables/BREAKER_MS.md)
- [MAX\_RETRIES](variables/MAX_RETRIES.md)
- [TIMEOUT\_MS](variables/TIMEOUT_MS.md)

## Functions

- [\_getBreaker](functions/getBreaker.md)
- [\_resetBreakerForTest](functions/resetBreakerForTest.md)
- [backoffMs](functions/backoffMs.md)
- [fetchWithRetry](functions/fetchWithRetry.md)
- [isTimeoutError](functions/isTimeoutError.md)


---

<!-- fetchWithRetry/functions/backoffMs.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [fetchWithRetry](../README.md) / backoffMs

# Function: backoffMs()

> **backoffMs**(`attempt`): `number`

Defined in: [fetchWithRetry.ts:62](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/fetchWithRetry.ts#L62)

Exponential backoff 200/400ms plus jitter, capped under 1s.

## Parameters

### attempt

`number`

## Returns

`number`


---

<!-- fetchWithRetry/functions/fetchWithRetry.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [fetchWithRetry](../README.md) / fetchWithRetry

# Function: fetchWithRetry()

> **fetchWithRetry**(`url`, `init?`): `Promise`\<`Response`\>

Defined in: [fetchWithRetry.ts:118](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/fetchWithRetry.ts#L118)

## Parameters

### url

`string`

### init?

`RequestInit` & `object` = `{}`

## Returns

`Promise`\<`Response`\>


---

<!-- fetchWithRetry/functions/getBreaker.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [fetchWithRetry](../README.md) / \_getBreaker

# Function: \_getBreaker()

> **\_getBreaker**(): `Map`\<`string`, `number`\>

Defined in: [fetchWithRetry.ts:242](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/fetchWithRetry.ts#L242)

## Returns

`Map`\<`string`, `number`\>


---

<!-- fetchWithRetry/functions/isTimeoutError.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [fetchWithRetry](../README.md) / isTimeoutError

# Function: isTimeoutError()

> **isTimeoutError**(`e`): `boolean`

Defined in: [fetchWithRetry.ts:49](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/fetchWithRetry.ts#L49)

Timeout-originated error classifier (m10 timeout-classification fix).

`AbortSignal.timeout()` (the 3s per-attempt timeout above) aborts with a
`TimeoutError` DOMException ("The operation was aborted due to timeout"),
NOT an `AbortError`. The message contains "aborted", so naive `/abort/i`
matching in the route handlers misroutes gateway stalls to the
client-abort (499) path instead of the contracted fail-closed 200
fallback. Route handlers must check `isTimeoutError` FIRST and take the
heuristic/fail-closed fallback; genuine client aborts keep the name
`AbortError` and still map to 499. No timeout/retry/breaker values change.

## Parameters

### e

`unknown`

## Returns

`boolean`


---

<!-- fetchWithRetry/functions/resetBreakerForTest.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [fetchWithRetry](../README.md) / \_resetBreakerForTest

# Function: \_resetBreakerForTest()

> **\_resetBreakerForTest**(): `void`

Defined in: [fetchWithRetry.ts:238](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/fetchWithRetry.ts#L238)

## Returns

`void`


---

<!-- fetchWithRetry/variables/BACKOFF_BASE_MS.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [fetchWithRetry](../README.md) / BACKOFF\_BASE\_MS

# Variable: BACKOFF\_BASE\_MS

> `const` **BACKOFF\_BASE\_MS**: `200` = `200`

Defined in: [fetchWithRetry.ts:21](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/fetchWithRetry.ts#L21)


---

<!-- fetchWithRetry/variables/BREAKER_MS.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [fetchWithRetry](../README.md) / BREAKER\_MS

# Variable: BREAKER\_MS

> `const` **BREAKER\_MS**: `30000` = `30_000`

Defined in: [fetchWithRetry.ts:20](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/fetchWithRetry.ts#L20)


---

<!-- fetchWithRetry/variables/MAX_RETRIES.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [fetchWithRetry](../README.md) / MAX\_RETRIES

# Variable: MAX\_RETRIES

> `const` **MAX\_RETRIES**: `2` = `2`

Defined in: [fetchWithRetry.ts:19](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/fetchWithRetry.ts#L19)


---

<!-- fetchWithRetry/variables/TIMEOUT_MS.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [fetchWithRetry](../README.md) / TIMEOUT\_MS

# Variable: TIMEOUT\_MS

> `const` **TIMEOUT\_MS**: `3000` = `3000`

Defined in: [fetchWithRetry.ts:18](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/fetchWithRetry.ts#L18)


---

<!-- logger/README.md -->
[**veribrowse**](../README.md)

***

[veribrowse](../README.md) / logger

# logger

## Variables

- [logger](variables/logger.md)
- [redactPaths](variables/redactPaths.md)

## Functions

- [withRequestId](functions/withRequestId.md)


---

<!-- logger/functions/withRequestId.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [logger](../README.md) / withRequestId

# Function: withRequestId()

> **withRequestId**(`requestId`): `Logger`\<`never`, `boolean`\>

Defined in: [logger.ts:35](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/logger.ts#L35)

## Parameters

### requestId

`string`

## Returns

`Logger`\<`never`, `boolean`\>


---

<!-- logger/variables/logger.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [logger](../README.md) / logger

# Variable: logger

> `const` **logger**: `Logger`\<`never`, `boolean`\>

Defined in: [logger.ts:22](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/logger.ts#L22)


---

<!-- logger/variables/redactPaths.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [logger](../README.md) / redactPaths

# Variable: redactPaths

> `const` **redactPaths**: `string`[]

Defined in: [logger.ts:12](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/logger.ts#L12)

Pino redact paths — secrets are censored as "[Redacted]", never logged raw.
Covers the OpenAI key env var and bearer tokens at any nesting level.


---

<!-- metrics/README.md -->
[**veribrowse**](../README.md)

***

[veribrowse](../README.md) / metrics

# metrics

## Functions

- [getCounters](functions/getCounters.md)
- [inc](functions/inc.md)
- [resetForTest](functions/resetForTest.md)
- [toPrometheus](functions/toPrometheus.md)


---

<!-- metrics/functions/getCounters.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [metrics](../README.md) / getCounters

# Function: getCounters()

> **getCounters**(): `Readonly`\<`Counters`\>

Defined in: [metrics.ts:37](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/metrics.ts#L37)

## Returns

`Readonly`\<`Counters`\>


---

<!-- metrics/functions/inc.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [metrics](../README.md) / inc

# Function: inc()

> **inc**(`name`, `value?`): `void`

Defined in: [metrics.ts:33](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/metrics.ts#L33)

## Parameters

### name

keyof `Counters`

### value?

`number` = `1`

## Returns

`void`


---

<!-- metrics/functions/resetForTest.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [metrics](../README.md) / resetForTest

# Function: resetForTest()

> **resetForTest**(): `void`

Defined in: [metrics.ts:41](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/metrics.ts#L41)

## Returns

`void`


---

<!-- metrics/functions/toPrometheus.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [metrics](../README.md) / toPrometheus

# Function: toPrometheus()

> **toPrometheus**(): `string`

Defined in: [metrics.ts:49](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/metrics.ts#L49)

## Returns

`string`


---

<!-- schemas/README.md -->
[**veribrowse**](../README.md)

***

[veribrowse](../README.md) / schemas

# schemas

## Type Aliases

- [CheckClaimInput](type-aliases/CheckClaimInput.md)
- [ScoreWebsiteInput](type-aliases/ScoreWebsiteInput.md)

## Variables

- [checkClaimJsonSchema](variables/checkClaimJsonSchema.md)
- [checkClaimSchema](variables/checkClaimSchema.md)
- [scoreWebsiteJsonSchema](variables/scoreWebsiteJsonSchema.md)
- [scoreWebsiteSchema](variables/scoreWebsiteSchema.md)

## Functions

- [zodToJsonSchema](functions/zodToJsonSchema.md)


---

<!-- schemas/functions/zodToJsonSchema.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [schemas](../README.md) / zodToJsonSchema

# Function: zodToJsonSchema()

> **zodToJsonSchema**(`shape`): `Record`\<`string`, `unknown`\>

Defined in: [schemas.ts:21](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/schemas.ts#L21)

## Parameters

### shape

`Record`\<`string`, `unknown`\>

## Returns

`Record`\<`string`, `unknown`\>


---

<!-- schemas/type-aliases/CheckClaimInput.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [schemas](../README.md) / CheckClaimInput

# Type Alias: CheckClaimInput

> **CheckClaimInput** = `z.infer`\<*typeof* [`checkClaimSchema`](../variables/checkClaimSchema.md)\>

Defined in: [schemas.ts:18](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/schemas.ts#L18)


---

<!-- schemas/type-aliases/ScoreWebsiteInput.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [schemas](../README.md) / ScoreWebsiteInput

# Type Alias: ScoreWebsiteInput

> **ScoreWebsiteInput** = `z.infer`\<*typeof* [`scoreWebsiteSchema`](../variables/scoreWebsiteSchema.md)\>

Defined in: [schemas.ts:17](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/schemas.ts#L17)


---

<!-- schemas/variables/checkClaimJsonSchema.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [schemas](../README.md) / checkClaimJsonSchema

# Variable: checkClaimJsonSchema

> `const` **checkClaimJsonSchema**: `object`

Defined in: [schemas.ts:40](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/schemas.ts#L40)

## Type Declaration

### additionalProperties

> `readonly` **additionalProperties**: `false` = `false`

### properties

> `readonly` **properties**: `object`

#### properties.claim

> `readonly` **claim**: `object`

#### properties.claim.description

> `readonly` **description**: `"Claim text to verify"` = `"Claim text to verify"`

#### properties.claim.maxLength

> `readonly` **maxLength**: `500` = `500`

#### properties.claim.minLength

> `readonly` **minLength**: `8` = `8`

#### properties.claim.type

> `readonly` **type**: `"string"` = `"string"`

#### properties.contextUrl

> `readonly` **contextUrl**: `object`

#### properties.contextUrl.description

> `readonly` **description**: `"Optional URL providing context"` = `"Optional URL providing context"`

#### properties.contextUrl.format

> `readonly` **format**: `"uri"` = `"uri"`

#### properties.contextUrl.type

> `readonly` **type**: `"string"` = `"string"`

### required

> `readonly` **required**: readonly \[`"claim"`\]

### type

> `readonly` **type**: `"object"` = `"object"`


---

<!-- schemas/variables/checkClaimSchema.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [schemas](../README.md) / checkClaimSchema

# Variable: checkClaimSchema

> `const` **checkClaimSchema**: `ZodObject`\<\{ `claim`: `ZodString`; `contextUrl`: `ZodOptional`\<`ZodString`\>; \}, `$strip`\>

Defined in: [schemas.ts:8](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/schemas.ts#L8)


---

<!-- schemas/variables/scoreWebsiteJsonSchema.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [schemas](../README.md) / scoreWebsiteJsonSchema

# Variable: scoreWebsiteJsonSchema

> `const` **scoreWebsiteJsonSchema**: `object`

Defined in: [schemas.ts:27](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/schemas.ts#L27)

## Type Declaration

### additionalProperties

> `readonly` **additionalProperties**: `false` = `false`

### properties

> `readonly` **properties**: `object`

#### properties.url

> `readonly` **url**: `object`

#### properties.url.description

> `readonly` **description**: `"URL to score for scam/trust"` = `"URL to score for scam/trust"`

#### properties.url.format

> `readonly` **format**: `"uri"` = `"uri"`

#### properties.url.type

> `readonly` **type**: `"string"` = `"string"`

### required

> `readonly` **required**: readonly \[`"url"`\]

### type

> `readonly` **type**: `"object"` = `"object"`


---

<!-- schemas/variables/scoreWebsiteSchema.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [schemas](../README.md) / scoreWebsiteSchema

# Variable: scoreWebsiteSchema

> `const` **scoreWebsiteSchema**: `ZodObject`\<\{ `url`: `ZodString`; \}, `$strip`\>

Defined in: [schemas.ts:4](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/schemas.ts#L4)


---

<!-- score/README.md -->
[**veribrowse**](../README.md)

***

[veribrowse](../README.md) / score

# score

## Type Aliases

- [FetchMeta](type-aliases/FetchMeta.md)
- [ScoringRubric](type-aliases/ScoringRubric.md)
- [TrustLevel](type-aliases/TrustLevel.md)
- [TrustScore](type-aliases/TrustScore.md)

## Functions

- [buildTrustScore](functions/buildTrustScore.md)
- [elderlySummarize](functions/elderlySummarize.md)
- [scoreWebsitePure](functions/scoreWebsitePure.md)


---

<!-- score/functions/buildTrustScore.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [score](../README.md) / buildTrustScore

# Function: buildTrustScore()

> **buildTrustScore**(`meta`, `llm?`, `rubric?`): [`TrustScore`](../type-aliases/TrustScore.md)

Defined in: [score.ts:135](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/score.ts#L135)

## Parameters

### meta

[`FetchMeta`](../type-aliases/FetchMeta.md)

### llm?

#### bullets

`string`[]

#### why

`string`

### rubric?

[`ScoringRubric`](../type-aliases/ScoringRubric.md)

## Returns

[`TrustScore`](../type-aliases/TrustScore.md)


---

<!-- score/functions/elderlySummarize.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [score](../README.md) / elderlySummarize

# Function: elderlySummarize()

> **elderlySummarize**(`trust`, `level`, `why`): `string`

Defined in: [score.ts:117](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/score.ts#L117)

## Parameters

### trust

`number`

### level

[`TrustLevel`](../type-aliases/TrustLevel.md)

### why

`string`

## Returns

`string`


---

<!-- score/functions/scoreWebsitePure.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [score](../README.md) / scoreWebsitePure

# Function: scoreWebsitePure()

> **scoreWebsitePure**(`meta`, `rubric?`): `Omit`\<[`TrustScore`](../type-aliases/TrustScore.md), `"elderlySummary"` \| `"why"` \| `"bullets"`\> & `object`

Defined in: [score.ts:68](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/score.ts#L68)

## Parameters

### meta

[`FetchMeta`](../type-aliases/FetchMeta.md)

### rubric?

[`ScoringRubric`](../type-aliases/ScoringRubric.md)

## Returns

`Omit`\<[`TrustScore`](../type-aliases/TrustScore.md), `"elderlySummary"` \| `"why"` \| `"bullets"`\> & `object`


---

<!-- score/type-aliases/FetchMeta.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [score](../README.md) / FetchMeta

# Type Alias: FetchMeta

> **FetchMeta** = `object`

Defined in: [score.ts:33](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/score.ts#L33)

## Properties

### contentHash

> **contentHash**: `string`

Defined in: [score.ts:39](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/score.ts#L39)

***

### domainAgeDays?

> `optional` **domainAgeDays?**: `number` \| `null`

Defined in: [score.ts:41](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/score.ts#L41)

***

### finalUrl?

> `optional` **finalUrl?**: `string`

Defined in: [score.ts:37](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/score.ts#L37)

***

### hasHttps

> **hasHttps**: `boolean`

Defined in: [score.ts:42](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/score.ts#L42)

***

### ogDescription?

> `optional` **ogDescription?**: `string`

Defined in: [score.ts:36](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/score.ts#L36)

***

### retrievedAt

> **retrievedAt**: `string`

Defined in: [score.ts:40](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/score.ts#L40)

***

### status?

> `optional` **status?**: `number`

Defined in: [score.ts:38](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/score.ts#L38)

***

### title?

> `optional` **title?**: `string`

Defined in: [score.ts:35](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/score.ts#L35)

***

### url

> **url**: `string`

Defined in: [score.ts:34](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/score.ts#L34)


---

<!-- score/type-aliases/ScoringRubric.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [score](../README.md) / ScoringRubric

# Type Alias: ScoringRubric

> **ScoringRubric** = `Pick`\<`Rubric`, `"weights"` \| `"thresholds"`\>

Defined in: [score.ts:13](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/score.ts#L13)

Subset of a scoring rubric that affects the heuristic numbers.
Passed as an OPTIONAL param (default = balanced = frozen constants below,
so the default path stays byte-identical to the sealed heuristic).


---

<!-- score/type-aliases/TrustLevel.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [score](../README.md) / TrustLevel

# Type Alias: TrustLevel

> **TrustLevel** = `"safe"` \| `"caution"` \| `"risky"`

Defined in: [score.ts:6](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/score.ts#L6)


---

<!-- score/type-aliases/TrustScore.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [score](../README.md) / TrustScore

# Type Alias: TrustScore

> **TrustScore** = `object`

Defined in: [score.ts:45](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/score.ts#L45)

## Properties

### bullets

> **bullets**: `string`[]

Defined in: [score.ts:49](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/score.ts#L49)

***

### citations

> **citations**: `object`[]

Defined in: [score.ts:52](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/score.ts#L52)

#### snippet

> **snippet**: `string`

#### url

> **url**: `string`

***

### elderlySummary

> **elderlySummary**: `string`

Defined in: [score.ts:48](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/score.ts#L48)

***

### level

> **level**: [`TrustLevel`](TrustLevel.md)

Defined in: [score.ts:47](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/score.ts#L47)

***

### provenance

> **provenance**: `object`

Defined in: [score.ts:51](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/score.ts#L51)

#### contentHash

> **contentHash**: `string`

#### retrievedAt

> **retrievedAt**: `string`

#### url

> **url**: `string`

***

### raw

> **raw**: [`FetchMeta`](FetchMeta.md)

Defined in: [score.ts:53](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/score.ts#L53)

***

### trust

> **trust**: `number`

Defined in: [score.ts:46](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/score.ts#L46)

***

### why

> **why**: `string`

Defined in: [score.ts:50](https://github.com/fakhriaunur/veribrowse/blob/ca1fd8a5e976eee219299ceccf1805112f586ac0/lib/score.ts#L50)


---


### HTTP route surface (query params + provenance)

Typedoc above covers `lib/` pure core only. The following are owned by the
thin route shell (`app/api/score/route.ts`, `app/api/check/route.ts`) plus
`lib/llm.ts` and `config/llm.json`:

- `?llmTimeoutMs=` (both `GET /api/score` and `GET /api/check`) —
  optional per-LLM-step timeout in milliseconds for the M11 failover chain
  (`runLlmChain`). Parsed by `parseTimeoutParam` (absent, empty, or
  non-numeric → configured default), clamped by `resolveStepTimeout` into
  the `config/llm.json` range `[min, max]` = `[1000, 30000]`, default
  `10000`. The client control is nerd-view-only (`app/page.tsx` number
  input, omitted from the query when empty); the server clamp always
  applies. LLM steps only — page/evidence fetches keep the separate 3s
  `fetchWithRetry` policy, and backoff applies between chain steps only.
  `?fixture=1` bypasses the LLM chain, so the param has no effect on
  fixture responses.
- `provenance.llmStep` — present on score/check 200 responses only when an
  LLM chain step succeeded; values `responses-primary` | `chat-primary`
  | `responses-alt` | `chat-alt` (chain order Responses(primary) →
  Chat(primary) → Responses(alt) → Chat(alt); first success wins; alt steps
  run only when `OPENAI_BASE_URL_ALT` is set). Absent on heuristic,
  fail-closed, and fixture responses. See `lib/llm.ts` (`LlmStep`,
  `runLlmChain`) and `docs/runbook.md` for the curl shape.
- `provenance.llmTimings` (M12, additive/optional) — per-attempt
  `[{step, ms, ok}]` timings in chain order, present ONLY alongside
  `provenance.llmStep` (i.e. only when a chain step succeeded). Omitted on
  no-key, `?fixture=1`, empty-evidence, and all-fail fallback paths, and
  ignored by replay/golden diffs like `retrievedAt`/`checkedAt`. The
  nerd view renders a live elapsed ticker while loading plus a post-hoc
  per-step table from this key; the main view never shows either.

---

