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

Defined in: [claim.ts:23](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/claim.ts#L23)

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

Defined in: [claim.ts:5](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/claim.ts#L5)

## Properties

### claim

> **claim**: `string`

Defined in: [claim.ts:5](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/claim.ts#L5)

***

### contextUrl?

> `optional` **contextUrl?**: `string`

Defined in: [claim.ts:5](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/claim.ts#L5)


---

<!-- claim/type-aliases/ClaimResult.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [claim](../README.md) / ClaimResult

# Type Alias: ClaimResult

> **ClaimResult** = `object`

Defined in: [claim.ts:13](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/claim.ts#L13)

## Properties

### confidence

> **confidence**: `number`

Defined in: [claim.ts:15](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/claim.ts#L15)

***

### elderlySummary

> **elderlySummary**: `string`

Defined in: [claim.ts:16](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/claim.ts#L16)

***

### evidence

> **evidence**: [`Evidence`](Evidence.md)[]

Defined in: [claim.ts:18](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/claim.ts#L18)

***

### provenance

> **provenance**: `object`

Defined in: [claim.ts:19](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/claim.ts#L19)

#### checkedAt

> **checkedAt**: `string`

#### claim

> **claim**: `string`

#### claimHash

> **claimHash**: `string`

***

### reasoning

> **reasoning**: `string`

Defined in: [claim.ts:17](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/claim.ts#L17)

***

### verdict

> **verdict**: [`Verdict`](Verdict.md)

Defined in: [claim.ts:14](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/claim.ts#L14)


---

<!-- claim/type-aliases/Evidence.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [claim](../README.md) / Evidence

# Type Alias: Evidence

> **Evidence** = `object`

Defined in: [claim.ts:6](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/claim.ts#L6)

## Properties

### contentHash

> **contentHash**: `string`

Defined in: [claim.ts:9](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/claim.ts#L9)

***

### quote

> **quote**: `string`

Defined in: [claim.ts:8](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/claim.ts#L8)

***

### retrievedAt

> **retrievedAt**: `string`

Defined in: [claim.ts:10](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/claim.ts#L10)

***

### url

> **url**: `string`

Defined in: [claim.ts:7](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/claim.ts#L7)


---

<!-- claim/type-aliases/Verdict.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [claim](../README.md) / Verdict

# Type Alias: Verdict

> **Verdict** = `"supported"` \| `"contradicted"` \| `"unverified"`

Defined in: [claim.ts:3](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/claim.ts#L3)


---

<!-- fetchWithRetry/README.md -->
[**veribrowse**](../README.md)

***

[veribrowse](../README.md) / fetchWithRetry

# fetchWithRetry

## Functions

- [\_getBreaker](functions/getBreaker.md)
- [\_resetBreakerForTest](functions/resetBreakerForTest.md)
- [fetchWithRetry](functions/fetchWithRetry.md)


---

<!-- fetchWithRetry/functions/fetchWithRetry.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [fetchWithRetry](../README.md) / fetchWithRetry

# Function: fetchWithRetry()

> **fetchWithRetry**(`url`, `init?`): `Promise`\<`Response`\>

Defined in: [fetchWithRetry.ts:70](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/fetchWithRetry.ts#L70)

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

Defined in: [fetchWithRetry.ts:167](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/fetchWithRetry.ts#L167)

## Returns

`Map`\<`string`, `number`\>


---

<!-- fetchWithRetry/functions/resetBreakerForTest.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [fetchWithRetry](../README.md) / \_resetBreakerForTest

# Function: \_resetBreakerForTest()

> **\_resetBreakerForTest**(): `void`

Defined in: [fetchWithRetry.ts:163](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/fetchWithRetry.ts#L163)

## Returns

`void`


---

<!-- logger/README.md -->
[**veribrowse**](../README.md)

***

[veribrowse](../README.md) / logger

# logger

## Variables

- [logger](variables/logger.md)

## Functions

- [withRequestId](functions/withRequestId.md)


---

<!-- logger/functions/withRequestId.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [logger](../README.md) / withRequestId

# Function: withRequestId()

> **withRequestId**(`requestId`): `Logger`\<`never`\>

Defined in: [logger.ts:24](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/logger.ts#L24)

## Parameters

### requestId

`string`

## Returns

`Logger`\<`never`\>


---

<!-- logger/variables/logger.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [logger](../README.md) / logger

# Variable: logger

> `const` **logger**: `Logger`\<`never`\>

Defined in: [logger.ts:3](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/logger.ts#L3)


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

Defined in: [metrics.ts:24](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/metrics.ts#L24)

## Returns

`Readonly`\<`Counters`\>


---

<!-- metrics/functions/inc.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [metrics](../README.md) / inc

# Function: inc()

> **inc**(`name`, `value?`): `void`

Defined in: [metrics.ts:20](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/metrics.ts#L20)

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

Defined in: [metrics.ts:28](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/metrics.ts#L28)

## Returns

`void`


---

<!-- metrics/functions/toPrometheus.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [metrics](../README.md) / toPrometheus

# Function: toPrometheus()

> **toPrometheus**(): `string`

Defined in: [metrics.ts:35](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/metrics.ts#L35)

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

Defined in: [schemas.ts:21](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/schemas.ts#L21)

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

Defined in: [schemas.ts:18](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/schemas.ts#L18)


---

<!-- schemas/type-aliases/ScoreWebsiteInput.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [schemas](../README.md) / ScoreWebsiteInput

# Type Alias: ScoreWebsiteInput

> **ScoreWebsiteInput** = `z.infer`\<*typeof* [`scoreWebsiteSchema`](../variables/scoreWebsiteSchema.md)\>

Defined in: [schemas.ts:17](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/schemas.ts#L17)


---

<!-- schemas/variables/checkClaimJsonSchema.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [schemas](../README.md) / checkClaimJsonSchema

# Variable: checkClaimJsonSchema

> `const` **checkClaimJsonSchema**: `object`

Defined in: [schemas.ts:40](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/schemas.ts#L40)

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

> `const` **checkClaimSchema**: `ZodObject`\<\{ `claim`: `ZodString`; `contextUrl`: `ZodOptional`\<`ZodString`\>; \}, `"strip"`, `ZodTypeAny`, \{ `claim`: `string`; `contextUrl?`: `string`; \}, \{ `claim`: `string`; `contextUrl?`: `string`; \}\>

Defined in: [schemas.ts:8](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/schemas.ts#L8)


---

<!-- schemas/variables/scoreWebsiteJsonSchema.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [schemas](../README.md) / scoreWebsiteJsonSchema

# Variable: scoreWebsiteJsonSchema

> `const` **scoreWebsiteJsonSchema**: `object`

Defined in: [schemas.ts:27](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/schemas.ts#L27)

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

> `const` **scoreWebsiteSchema**: `ZodObject`\<\{ `url`: `ZodString`; \}, `"strip"`, `ZodTypeAny`, \{ `url`: `string`; \}, \{ `url`: `string`; \}\>

Defined in: [schemas.ts:4](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/schemas.ts#L4)


---

<!-- score/README.md -->
[**veribrowse**](../README.md)

***

[veribrowse](../README.md) / score

# score

## Type Aliases

- [FetchMeta](type-aliases/FetchMeta.md)
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

> **buildTrustScore**(`meta`, `llm?`): [`TrustScore`](../type-aliases/TrustScore.md)

Defined in: [score.ts:99](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/score.ts#L99)

## Parameters

### meta

[`FetchMeta`](../type-aliases/FetchMeta.md)

### llm?

#### bullets

`string`[]

#### why

`string`

## Returns

[`TrustScore`](../type-aliases/TrustScore.md)


---

<!-- score/functions/elderlySummarize.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [score](../README.md) / elderlySummarize

# Function: elderlySummarize()

> **elderlySummarize**(`trust`, `level`, `why`): `string`

Defined in: [score.ts:82](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/score.ts#L82)

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

> **scoreWebsitePure**(`meta`): `Omit`\<[`TrustScore`](../type-aliases/TrustScore.md), `"elderlySummary"` \| `"why"` \| `"bullets"`\> & `object`

Defined in: [score.ts:36](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/score.ts#L36)

## Parameters

### meta

[`FetchMeta`](../type-aliases/FetchMeta.md)

## Returns

`Omit`\<[`TrustScore`](../type-aliases/TrustScore.md), `"elderlySummary"` \| `"why"` \| `"bullets"`\> & `object`


---

<!-- score/type-aliases/FetchMeta.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [score](../README.md) / FetchMeta

# Type Alias: FetchMeta

> **FetchMeta** = `object`

Defined in: [score.ts:6](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/score.ts#L6)

## Properties

### contentHash

> **contentHash**: `string`

Defined in: [score.ts:12](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/score.ts#L12)

***

### domainAgeDays?

> `optional` **domainAgeDays?**: `number` \| `null`

Defined in: [score.ts:14](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/score.ts#L14)

***

### finalUrl?

> `optional` **finalUrl?**: `string`

Defined in: [score.ts:10](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/score.ts#L10)

***

### hasHttps

> **hasHttps**: `boolean`

Defined in: [score.ts:15](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/score.ts#L15)

***

### ogDescription?

> `optional` **ogDescription?**: `string`

Defined in: [score.ts:9](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/score.ts#L9)

***

### retrievedAt

> **retrievedAt**: `string`

Defined in: [score.ts:13](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/score.ts#L13)

***

### status?

> `optional` **status?**: `number`

Defined in: [score.ts:11](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/score.ts#L11)

***

### title?

> `optional` **title?**: `string`

Defined in: [score.ts:8](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/score.ts#L8)

***

### url

> **url**: `string`

Defined in: [score.ts:7](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/score.ts#L7)


---

<!-- score/type-aliases/TrustLevel.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [score](../README.md) / TrustLevel

# Type Alias: TrustLevel

> **TrustLevel** = `"safe"` \| `"caution"` \| `"risky"`

Defined in: [score.ts:4](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/score.ts#L4)


---

<!-- score/type-aliases/TrustScore.md -->
[**veribrowse**](../../README.md)

***

[veribrowse](../../README.md) / [score](../README.md) / TrustScore

# Type Alias: TrustScore

> **TrustScore** = `object`

Defined in: [score.ts:18](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/score.ts#L18)

## Properties

### bullets

> **bullets**: `string`[]

Defined in: [score.ts:22](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/score.ts#L22)

***

### citations

> **citations**: `object`[]

Defined in: [score.ts:25](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/score.ts#L25)

#### snippet

> **snippet**: `string`

#### url

> **url**: `string`

***

### elderlySummary

> **elderlySummary**: `string`

Defined in: [score.ts:21](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/score.ts#L21)

***

### level

> **level**: [`TrustLevel`](TrustLevel.md)

Defined in: [score.ts:20](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/score.ts#L20)

***

### provenance

> **provenance**: `object`

Defined in: [score.ts:24](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/score.ts#L24)

#### contentHash

> **contentHash**: `string`

#### retrievedAt

> **retrievedAt**: `string`

#### url

> **url**: `string`

***

### raw

> **raw**: [`FetchMeta`](FetchMeta.md)

Defined in: [score.ts:26](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/score.ts#L26)

***

### trust

> **trust**: `number`

Defined in: [score.ts:19](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/score.ts#L19)

***

### why

> **why**: `string`

Defined in: [score.ts:23](https://github.com/fakhriaunur/veribrowse/blob/0f876d36d096af0552291ac0161787bfd3892a2f/lib/score.ts#L23)


---

