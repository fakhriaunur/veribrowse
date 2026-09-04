# M14 pilot-20 subset (spend sign-off pending)

Zero-spend selection cut 2026-09-04 from the user-approved lists
(`evals/dataset.v1.json` v1.0.0, 130 rows + `evals/dataset.v1-sectors.json`,
66 rows). No inference was run to cut this subset; no keyed calls were made.

- Balance: 7 safe / 7 caution / 6 risky; pools 10 general + 5 banking + 5 ecommerce.
- Preference: probed-clean + article/deep-page rows; known-dead/dropped rows excluded.
- Fetch-degraded rows: 2 of 20 (infowars #7, SEC PAUSE #12) to exercise the
  failure-exclusion policy (fetch failures excluded from agreement, never misses).
- Validation: harness `validateDataset` from `scripts/eval/run.mjs` (0 errors).

## Pinned run parameters (for the future keyed pilot run)

- model: `gpt-4o-mini` (harness default; `.env.example` `OPENAI_MODEL`)
- rubric preset: `balanced` (`.env.example` `SCORING_PRESET`; byte-identical to frozen weights)
- step timeout: `10000` ms (`config/llm.json` default)
- estimator: `scripts/eval/cost.mjs` (`TOKENS_PER_SCORE_REQUEST` 1500 in / 150 out)

## Exact cost estimate (harness estimator, pinned model)

20 rows x 1 call/row = 20 LLM calls; 30,000 input + 3,000 output tokens;
**$0.0063** (gpt-4o-mini list-price estimate; re-check before any keyed run).

The keyed pilot RUN is a separate future feature and requires explicit spend
sign-off. Do NOT run with `--confirm-spend` under this feature.

## Subset table

| #   | tier    | pool      | url                                                  | auditor source                                               | why included                                                                                                          |
| --- | ------- | --------- | ---------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 1   | safe    | general   | https://www.bbc.com/news                             | MBFC HIGH + Tranco top                                       | Probed-clean (HEAD 200) MBFC-HIGH homepage; safe-class anchor                                                         |
| 2   | safe    | general   | https://apnews.com/                                  | MBFC HIGH (wire)                                             | Probed-clean (200) wire-service homepage; safe-class anchor                                                           |
| 3   | safe    | general   | https://en.wikipedia.org/wiki/Climate_change         | Wikipedia featured-topic article                             | Probed-clean (200) article-level reference tier; article-level coverage                                               |
| 4   | safe    | general   | https://en.wikipedia.org/wiki/Photosynthesis         | Wikipedia stable reference article                           | Article-level reference (liveness unconfirmed at freeze; failure-excluded)                                            |
| 5   | caution | general   | https://www.dailymail.co.uk/                         | MBFC MIXED/low                                               | Probed-clean (200) tabloid-blend MIXED anchor                                                                         |
| 6   | caution | general   | https://www.theonion.com/                            | Self-declared satire                                         | Probed-clean (200) satire; literal-read trap                                                                          |
| 7   | caution | general   | https://www.infowars.com/                            | MBFC VERY-LOW/conspiracy                                     | DEGRADED 1/2: HEAD 403 bot-wall, fetcher likely 403; failure-exclusion exercise; borderline-risky edge                |
| 8   | risky   | general   | https://www.naturalnews.com/                         | MBFC VERY-LOW/pseudoscience                                  | Probed-clean (200) health-misinfo archetype                                                                           |
| 9   | risky   | general   | https://beforeitsnews.com/                           | MBFC VERY-LOW/conspiracy                                     | Probed-clean (200) UGC-conspiracy archetype                                                                           |
| 10  | risky   | general   | https://thepeoplesvoice.tv/                          | MBFC VERY-LOW/fake                                           | HEAD 200 renamed domain (ex-YourNewsWire); renamed-entity handling                                                    |
| 11  | safe    | banking   | https://www.bca.co.id/                               | OJK licensed bank (register-checkable)                       | Probed-clean (HEAD 200) OJK-licensed bank; safe anchor                                                                |
| 12  | safe    | banking   | https://www.sec.gov/enforce/public-alerts            | SEC PAUSE program index (self, regulator)                    | DEGRADED 2/2: HEAD 403, fetcher GET likely 403; regulator index must-score-safe trap; failure-exclusion exercise      |
| 13  | caution | banking   | https://www.seekingalpha.com/                        | Contributor-driven investment analysis (position disclosure) | Contributor-analysis caution class; stable                                                                            |
| 14  | caution | banking   | https://www.fool.com/                                | Opinion/stock-picking editorial (commercial)                 | Opinion/commercial caution class; stable                                                                              |
| 15  | risky   | banking   | https://www.onetradepro.com/en/                      | HK SFC Alert List -- suspicious website                      | SFC-listed (20 Aug 2026) suspicious site; recent risky anchor (unprobed per policy; failure-excluded if dead/cloaked) |
| 16  | safe    | ecommerce | https://www.amazon.com/gp/help/customer/display.html | Official marketplace help center (self)                      | Entity help-center deep page (HEAD 405 is method-block only; GET expected OK); deep-page coverage                     |
| 17  | caution | ecommerce | https://www.trustpilot.com/                          | UGC review aggregator (fake-review risk)                     | UGC review-aggregator caution class; stable                                                                           |
| 18  | caution | ecommerce | https://slickdeals.net/                              | UGC deal forum (unverified listings)                         | UGC deal-forum caution class; stable                                                                                  |
| 19  | risky   | ecommerce | https://everly-melbourne.com/                        | ACCC Public Warning Notice -- ghost store (release 78/25)    | ACCC-named ghost store (unprobed per policy; failure-excluded if rebranded/dead)                                      |
| 20  | risky   | ecommerce | https://www.cloroxstore.com/                         | FTC TRO -- counterfeit website (case 202 3053)               | FTC-enjoined counterfeit site; dead/seized-domain handling (failure-excluded if parked)                               |

## Exclusion list (deliberately NOT in the pilot)

- Known-dead/dropped at freeze: bipartisanreport.com (probe timeout, dropped from
  v1); blacklistednews (parked, dropped from v1); 13 runtime URLs (v1 slots 96-108:
  PhishTank/OpenPhish/URLhaus/FakeNewsNet/NELA/ClaimReview — never frozen to
  concrete URLs, not in either dataset file); bankofamerica `/security-center/`
  path (HEAD 404, dropped; the live `/security/` path in the sectors file was
  also not selected).
- Skipped by preference (probed-clean first): paywalled safe rows (ft.com, wsj.com,
  economist.com — fetch-degraded/paywall risk); sanctioned-state caution rows with
  unconfirmed liveness (sputnikglobe.com, presstv.ir); bot-walled risky rows
  (neonnettle.com, thefreethoughtproject.com — HEAD 403); additional FTC-enjoined
  likely-dead domains beyond the single cloroxstore.com representative
  (lysol-clean, lysolservicebest, clean-sale, clorox-sale, thaclean); extra SFC-listed
  and ACCC-named risky rows beyond the one-per-pool representatives.
- Freeze-added article-level rows with unconfirmed liveness were sampled lightly
  (1 of 20: #4 Photosynthesis) in favor of probed-clean rows for pilot stability;
  fetch failures are excluded from agreement per policy either way.

## Files

- `evals/pilot-20.json` — machine-readable subset (`subset_of` + per-row `reason`).
  `frozen: false` until spend sign-off freezes the keyed run list.
- `evals/dataset.v1.json`, `evals/dataset.v1-sectors.json` — flipped `frozen: true`
  with `approved_date: 2026-09-04` (user approval of the v1 + sector lists).
