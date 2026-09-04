# Scoring best practices (M11, docs-only)

How VeriBrowse scores websites, what the wider state of the art (SOTA) does,
and why each technique is used or deliberately not used. **No app code changes
here**: the live heuristic stays the frozen `scoreWebsitePure` weights in
`lib/score.ts`, and the shipped `balanced` preset
(`config/rubrics/balanced.json`) is regression-pinned byte-identical to them
(`tests/unit/rubric.test.ts`). `strict` / `lenient` are documented opt-in
operating points, selected via `SCORING_PRESET` or overridden via
`SCORING_RUBRIC_PATH`.

Source of citations: `research/m11-rubric-sources.md` in the mission
directory (collected 2026-09-04). Tags below (`[MOH2015]`, `[FOGG2002]`,
`[CISA]`, `[CISA-JOINT2023]`, `[FTC2024]`, `[PHISHML2024]`) refer to the full
bibliography at the end of this file.

## 1. SOTA signal survey — used vs not used

| Signal | SOTA role | VeriBrowse stance | Why |
| --- | --- | --- | --- |
| HTTPS presence / certificate validity | Phishing-predictive feature: untrusted issuer or certificate age under 1 year reads as suspicious [MOH2015]; operational guidance says share sensitive info only on secure sites [CISA] | **Used** (`httpsBonus +10`, `noHttpsPenalty -20` in balanced) | Empirically validated predictor [MOH2015] with operator guidance behind it [CISA] |
| Domain age (WHOIS) | Domains younger than 6 months read as suspicious; long-lived domains read as safer [MOH2015]; fresh-domain abuse is a catalogued attacker technique [CISA-JOINT2023] | **Used** (`oldDomainBonus +15` over 365 days, `newDomainPenalty -20` under 30 days in balanced) | Empirical anchor [MOH2015] plus defender-side catalogue [CISA-JOINT2023] |
| Page metadata quality (title, description, contact cues) | Perceived-credibility cues: verifiable accuracy, real organization, contactability, professional design, fresh content, absence of errors [FOGG2002] (study: 3 years, 4,500+ participants); abnormal-content ratios also feed phishing features [MOH2015] | **Used** (`titleBonus +5` over 5 chars, `ogBonus +5`) | Credibility-cue support [FOGG2002] where Fogg measures *perceived* credibility, so metadata is a supporting signal only, never a sole verdict (pairs with the fail-closed rule) |
| Redirect behavior / URL obfuscation | `//` beyond the protocol position and meta/JS redirect chains are phishing-predictive [MOH2015]; malicious-URL obfuscation (subdomain tricks, homoglyphs, open-redirect abuse) is catalogued defender-side [CISA-JOINT2023] | **Used as reason only** (`Redirected` note, no points) | Both sources justify the penalty direction; kept points-free so a legitimate redirect cannot single-handedly tank a score |
| Fail-closed on unknown | "If suspicious, assume phishing; retype the address instead of clicking" [CISA] | **Used** (unknown claim returns `verdict: unverified`, confidence 0.3, empty evidence, no LLM call without evidence) | Operator guidance [CISA], reinforced by elder harm asymmetry [FTC2024] |
| Sentiment / tone analysis of page or claim text | Auxiliary text-classification feature in phishing literature: urgency, fear, greed, and false-authority tone can separate scam copy from neutral copy | **Not used — surveyed docs-only** (see section 2) | Frozen contract and M11 boundary allow no new signals; tone is gameable, language-dependent, and prone to false positives on legitimate marketing urgency; an opaque tone score conflicts with the provenance requirement (every verdict carries `contentHash` + `retrievedAt`/`checkedAt`) |
| Blocklist / reputation-feed lookup | Operational staple: query a third-party reputation feed before scoring | **Not used** | Stateless server with `cache-control: no-store` and no persistence; a feed lookup adds a network dependency, latency, and a tracking surface with no deterministic fixture path |
| ML ensemble classifier scores (RF/XGB) as score inputs | Ensembles dominate single models on phishing detection, with an explicit precision/recall operating point set by the decision threshold [PHISHML2024] | **Not used as inputs; used as threshold rationale** (see section 3) | No new signals allowed; the precision/recall tradeoff finding [PHISHML2024] is instead the citable basis for offering three documented presets rather than one fixed cutoff |

## 2. The sentiment-signal role, and why it stays out

Sentiment analysis in trust scoring means scoring the *tone* of page or claim
text (urgency, fear, flattery, false authority) as an auxiliary signal
alongside URL and metadata features. In the SOTA literature it plays a
supporting role: scam copy skews toward manufactured urgency ("act now",
"limited time"), so tone features can lift classifier recall on text-heavy
phish.

VeriBrowse deliberately does **not** feed sentiment into the score:

1. **Contract freeze.** M11 allows no new signals, tools, or routes; sentiment
   would be a new score input by definition.
2. **Determinism and provenance.** Every verdict must carry evidence citations
   plus provenance (`url`, `contentHash`, `retrievedAt`/`checkedAt`), and the
   no-key path must stay deterministic. A model-judged tone score is neither.
3. **False-positive cost.** Legitimate marketing, fundraising, and emergency
   information all use urgent tone; penalizing tone punishes exactly the small
   organizations elderly users already struggle to distinguish from scams.
4. **Adversarial gaming.** Tone is the cheapest signal for an attacker to
   neutralize (reword the copy, keep the trap), while HTTPS, domain age, and
   redirect behavior [MOH2015] cost the attacker real money or infrastructure
   to fake.

If sentiment is ever reconsidered, the cited bar is: a deterministic,
fixture-compatible implementation whose precision/recall contribution is
measured on the documented tradeoff curve [PHISHML2024], shipped as an
opt-in preset — never silently folded into the frozen default.

## 3. Per-preset rationale

All three presets share the same signal set (section 1); they differ only in
weights and decision thresholds, i.e. documented operating points on one
precision/recall tradeoff curve [PHISHML2024]. Exact magnitudes and windows
are operator choices positioned on that curve, not constants derived from the
sources; the *direction* of each choice is what the sources justify. Values
below are confirmed against `config/rubrics/*.json` (2026-09-04).

### balanced (default, sealed behavior)

Base 50; HTTPS `+10` / no-HTTPS `-20`; domain older than 365 days `+15`;
domain newer than 30 days `-20`; title longer than 5 chars `+5`;
`og:description` present `+5`; redirect is a reason note with no points;
levels **safe ≥ 70, caution ≥ 40** (risky below 40).

Rationale: the neutral operating point with equal aversion to false-safe and
false-risky. The feature set mirrors empirically validated phishing
predictors [MOH2015] with credibility-cue support [FOGG2002]. Byte-identical
to the frozen `lib/score.ts` weights (regression-pinned); choose it unless a
documented reason below applies.

### strict (elder-protection opt-in)

Base 45; HTTPS `+10` / no-HTTPS `-30`; domain older than 365 days `+10`;
domain newer than **90 days** `-30`; title `+5`; `og:description` `+5`;
levels **safe ≥ 80, caution ≥ 50**.

Rationale: minimize false-safe. Adults 60+ are less likely to report fraud
but suffer higher median losses (FTC estimates up to ~$61.5B in older-adult
losses, 2023) [FTC2024]; operator guidance is to treat suspicious as hostile
[CISA]. The harm asymmetry (a false-safe costs an elder far more than a
false-risky costs in inconvenience) justifies harsher missing-HTTPS and
new-domain penalties, a widened 90-day suspicion window covering fresh-domain
abuse [CISA-JOINT2023], and higher bars — accepting more false-risky flags to
catch more real traps. Deliberate behavior change vs balanced; select
explicitly via `SCORING_PRESET=strict`.

### lenient (bulk-triage opt-in)

Base 60; HTTPS `+5` / no-HTTPS `-10`; domain older than 365 days `+10`;
domain newer than 30 days `-10`; title `+5`; `og:description` `+5`; levels
**safe ≥ 65, caution ≥ 35**.

Rationale: minimize false-risky. Bulk triage needs high precision on `risky`
flags so analysts chase likely phish only; the decision threshold is moved
along the documented precision/recall curve [PHISHML2024], accepting more
false-safe in exchange for few false alarms. Deliberate behavior change vs
balanced; select explicitly via `SCORING_PRESET=lenient`.

## 4. Full citations

- **[FOGG2002]** Fogg, B.J. (Stanford Persuasive Technology Lab), 2002,
  "Stanford Guidelines for Web Credibility" (research summary; 3 years,
  4,500+ participants; underlying studies CHI 1999/2000/2001).
  <https://credibility.stanford.edu/guidelines/>
- **[MOH2015]** Mohammad, R.M.; Thabtah, F.; McCluskey, L., 2015, "Phishing
  Websites Features" (feature documentation for "Predicting phishing websites
  based on self-structuring neural network", Neural Computing & Applications;
  UCI Phishing Websites dataset, 30 categorical features, ~11k sites).
  <https://eprints.hud.ac.uk/id/eprint/24330/6/MohammadPhishing14July2015.pdf>
  and <https://archive.ics.uci.edu/dataset/327/phishing+websites>
- **[CISA]** Cybersecurity and Infrastructure Security Agency, current
  guidance, "Recognize and Report Phishing" (plus joint CISA/NSA/FBI/MS-ISAC
  "Phishing Guidance: Stopping the Attack Cycle at Phase One", 2023-10-18).
  <https://www.cisa.gov/secure-our-world/recognize-and-report-phishing>
- **[CISA-JOINT2023]** CISA, NSA, FBI, MS-ISAC, 2023-10-18, "Phishing
  Guidance: Stopping the Attack Cycle at Phase One".
  <https://www.cisa.gov/resources-tools/resources/phishing-guidance-stopping-attack-cycle-phase-one>
- **[FTC2024]** U.S. Federal Trade Commission, 2024, "Protecting Older
  Consumers 2023–2024" (Annual Report to Congress, Oct 18, 2024; estimates up
  to ~$61.5B in older-adult losses, 2023).
  <https://www.ftc.gov/system/files/ftc_gov/pdf/federal-trade-commission-protecting-older-adults-report_102024.pdf>
- **[PHISHML2024]** Comparative-evaluation study of ML phishing classifiers,
  2024, "Comparative evaluation of machine learning algorithms for phishing
  detection" (representative of the threshold-tradeoff literature; ensembles
  such as RF/XGB dominate single models but the tradeoff persists).
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC11232597/>

Signal-to-source map: HTTPS → [MOH2015] §SSL + [CISA]; domain age →
[MOH2015] §age + [CISA-JOINT2023]; metadata quality → [FOGG2002] G1/G2/G5/G6/
G8/G10 + [MOH2015] content ratios; redirect behavior → [MOH2015] §redirect +
[CISA-JOINT2023]; fail-closed → [CISA] + [FTC2024]; preset operating points →
[FTC2024] (strict) and [PHISHML2024] (curve), balanced anchored on [MOH2015]
+ [FOGG2002].
