---
event_id: H-WMCP-002
name: VeriBrowse — WebMCP Challenge
platform: Devpost
status: committed
decision: commit
external_registration: confirmed
event_url: https://webmcp.devpost.com
registration_url: https://webmcp.devpost.com
worksheet_path: webmcp-challenge/triage/worksheet.md
discovered_at: 2026-08-27
registration_deadline: 2026-09-04T03:00:00+07:00
start_at: 2026-08-26T02:00:00+07:00
submission_deadline: 2026-09-04T03:00:00+07:00
timezone: UTC+07:00
source_timezone: PDT
priority_1_5: 5
opportunity_1_5: 4
urgency_1_5: 5
strategic_fit_1_5: 4
p_ship: 0.70
p_win: 0.22
confidence: low
evidence_state: researched
constraint_load_1_5: 4
constraint_flags: [time, required_stack, access, saturation]
estimated_hours: 35
capacity_status: reserved
next_action: Define 2-tool schemas (scoreWebsite, checkClaim) and deploy hello-tool; smoke-test on ChatGPT browser + Chrome 149 flag
next_action_due: 2026-08-31
last_reviewed: 2026-08-30
source_links:
  - https://webmcp.devpost.com
  - https://webmcp.devpost.com/rules
  - https://webmcp.devpost.com/details/dates
notes: >-
  Project VeriBrowse (narrowed from BlissBrowse proposal). Scope: 2-tool
  WebMCP site — scoreWebsite(url) for metadata/scam trust score and
  checkClaim(claim, contextUrl) for claims vs evidence; crossReferenceReviews
  is stretch. Elderly/non-power-user friendly summary + nerd verbose view.
  Logistics: Netlify free tier ready, OpenAI/compatible API key ready,
  CockroachDB ready on stretch. Must-have stack frozen: Next.js/React,
  WebMCP registerTool, Edge API, OpenAI API, Netlify hosting. Stored
  UTC+07:00; source deadline Sep 3 13:00 PDT.
---

# Event Triage Worksheet

> Copy this file per event: `<event-slug>/triage/worksheet.md`. Work top to bottom.
> Standalone by design. Full method and evidence appendix live in
> `__templates/triage/playbook.md`.

> **Timezone:** Store local timestamps in `UTC+07:00`; preserve published event
> timezone and conflicts in notes or source fields.
>
> **Score ownership:** AI owns `priority`, `opportunity`, `p_ship`, and `p_win`;
> keep evidence, confidence, assumptions, and review date with those values.
>
> **Portfolio link:** Keep summary fields above aligned with the matching row
> in root `TRIAGE.md`. Root register owns aggregate status/capacity; this file
> owns detailed event execution. Use `null` for unknown probabilities, never
> invented zeros.

**Event:** VeriBrowse — The WebMCP Challenge **Dates:** 2026-08-26 → 2026-09-04 **Format:** solo ☒ team ☐
**Total your-hours available:** 35 h _(portfolio reservation)_
**Event link / rubric URL:** https://webmcp.devpost.com

---

## Stage 0 — Recon (target: T-7d or ASAP)

### Judging criteria (copy verbatim from event page)

| Published criterion                                 | Weight if given         | My answer plan                            |
| --------------------------------------------------- | ----------------------- | ----------------------------------------- |
| Event criteria                                      | Weight if given         | My answer plan                            |
| Innovation, implementation, usability, and demo fit | Verify published rubric | Map each feature to exact WebMCP workflow |

_No published rubric? Use Devpost defaults: technological implementation · ease of use · demonstration · potential impact · quality of idea · design._

### Requirements screen (hard floor)

- [x] Eligibility (age/geo/affiliation) checked — supported OpenAI API countries and age of majority
- [ ] Required tech/platform listed — WebMCP `document.modelContext.registerTool`; I can satisfy all: yes ☐ no ☐
- [ ] Required APIs/sponsors tools identified: WebMCP API and browser test surface
- [ ] Submission artifacts required: video? ☒ under 3 min · links? ☒ public repo/license · deck? ☐ · other: free access
- [ ] Pre-existing code allowed? rules say: verify before submission

### Sponsor & prize map

| Sponsor | Prize/bounty                    | Fits my stack? | Category crowded? (L/M/H) |
| ------- | ------------------------------- | -------------- | ------------------------- |
| OpenAI  | Verify current prize categories | Yes            | M; specialist window      |

### Saturation forecast (re-check at T-24h!)

- Theme chatter (Discord/registrations): agents pending · my-theme 1,439 participants
- Near-identical builds already visible? describe: inspect project list; avoid generic tool wrapper

### Pre-event prep (boilerplate, deploy path, recording setup)

- [ ] Auth/deploy scaffold ready at: ****\_\_****
- [ ] Demo recording setup tested
- [x] Stack frozen at **5 technologies**: 1 Next.js/React 2 WebMCP registerTool 3 Edge API 4 OpenAI API 5 Netlify hosting — Netlify free tier ready, OpenAI key ready, CockroachDB on stretch

---

## Idea candidates (fill one row per candidate, aim 3–5)

| #   | Idea (one line)                                                                                            | Named user + pain                                                                                | Demo path in ≤90s?                                                                                               | Fresh window? Why                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | VeriBrowse: 2-tool WebMCP site — scoreWebsite + checkClaim for elderly/non-power-users, nerd verbose audit | Elderly/emotionally vulnerable + non-technical need safe browsing; nerds need audit transparency | Yes — ChatGPT visits site -> scoreWebsite(url) -> checkClaim on extracted claim -> elderly summary + nerd expand | Yes — narrow 2-tool scope, specialist WebMCP window, low clone vs generic analyzer |
| 2   |                                                                                                            |                                                                                                  |                                                                                                                  |                                                                                    |
| 3   |                                                                                                            |                                                                                                  |                                                                                                                  |                                                                                    |
| 4   |                                                                                                            |                                                                                                  |                                                                                                                  |                                                                                    |
| 5   |                                                                                                            |                                                                                                  |                                                                                                                  |                                                                                    |

---

## Gate A — kill-gates (pass/fail per idea; any FAIL = kill or reshape once)

| Gate                | Question                                                         | #1  | #2  | #3  | #4  | #5  |
| ------------------- | ---------------------------------------------------------------- | --- | --- | --- | --- | --- |
| A1 Requirements fit | every rule/artifact satisfiable in my hours?                     |     |     |     |     |     |
| A2 Saturation       | not a clone-flooded category under its own bounty?               |     |     |     |     |     |
| A3 Solo feasibility | one demo path, ≤60% of my hours?                                 |     |     |     |     |     |
| A4 Window alive     | edge not post-saturation decayed?                                |     |     |     |     |     |
| **Verdict**         | PASS → Gate B · FAIL-once-A2/A3 → reshape & re-enter · else KILL |     |     |     |     |     |

**Killed & why:** None yet; run live tool-discovery gate first.
**Reshaped ideas (one re-entry max):** **************\_\_\_\_**************

---

## Gate B — HackScore matrix (survivors only)

Anchors (1 / 3 / 5):

- **B1 Demo-path** = tour of features / one flow but fragile / one 90s path that survives failure
- **B2 Rubric balance** = one criterion strong others absent / covers all, thin on two / deliberate answer for every criterion
- **B3 Edge-window** = saturated default category / established, some differentiation / fresh specialist-sponsored category, low clones
- **B4 Judge-consensus** = polarizing / broadly liked, one skeptic persona / all personas score up
- **B5 Impact & story** = solution seeking problem / real pain personal only / named user + citable stat + visible before-state
- **B6 Feasibility margin** = new stack+domain+integration at once / known stack one unknown tight / known stack ≥40% buffer at measured pace

Scale each 1–5. Weights fixed.

| Criterion                  | Wt   | Idea \_\_\_\_ | Idea \_\_\_\_ | Idea \_\_\_\_ |
| -------------------------- | ---- | ------------- | ------------- | ------------- |
| B1 Demo-path strength      | 0.25 |               |               |               |
| B2 Rubric coverage balance | 0.20 |               |               |               |
| B3 Edge-window freshness   | 0.20 |               |               |               |
| B4 Judge-consensus breadth | 0.15 |               |               |               |
| B5 Impact & story shape    | 0.10 |               |               |               |
| B6 Feasibility margin      | 0.10 |               |               |               |
| **Weighted total**         | 1.00 |               |               |               |
| Any criterion = 1?         | —    |               |               |               |

**Kill bar: total < 3.5 OR any single 1.**

Quadrant check for remaining ties: x = B3 freshness, y = mean(B1,B2,B6). Upper-right wins; final tie → higher B1.

**CHOSEN IDEA:** VeriBrowse 2-tool site, after hello-tool discovery proof
**Predicted HackScore (log for post-mortem):** pending proof

---

## Build plan (time budget)

| Block                               | % of hours     | Hours | Output                                   |
| ----------------------------------- | -------------- | ----- | ---------------------------------------- |
| Skeleton (end-to-end thinnest path) | first 25%      | 9     | tool discovery → action → visible result |
| Core features (max 2–3 must-haves)  | 25→60%         |       | demo-ready flow                          |
| Polish + submission artifacts       | last 15%+slack |       | video, page, links                       |

Must-have features (write before coding): 1 scoreWebsite tool + elderly summary 2 checkClaim tool + evidence view 3 hello-tool discovery resilient on both browser surfaces
Explicitly NOT building: crossReferenceReviews, bulk history, full review aggregation, vector DB, auth system

## Checkpoint tracker (check honestly, on the clock)

| Clock | Checkpoint                                                    | Pass? | Notes (velocity felt vs actual?) |
| ----- | ------------------------------------------------------------- | ----- | -------------------------------- |
| T+25% | Working skeleton runs end-to-end                              | ☐     |                                  |
| T+40% | Mid-triage: re-score B1/B6 vs reality; kill off-path features | ☐     |                                  |
| T+60% | Feature freeze — copy only beyond this                        | ☐     |                                  |
| T−8h  | QA sweep started                                              | ☐     |                                  |
| T−4h  | CODE LOCK — docs/copy only; backup video recorded             | ☐     |                                  |
| T−2h  | Rehearsed demo ×5, timed                                      | ☐     |                                  |
| T−30m | SUBMITTED                                                     | ☐     |                                  |

AI-delegation log (what was AI-built, what did I personally verify?): **************\_\_\_\_**************

---

## Submission QA (all boxes before submit)

- [ ] Every required field filled; all URLs public and logged-out testable
- [ ] Required tech listed under Built With
- [ ] Video: problem (+ citable stat) → solution → user demo → tech how → close; ~60% explain / 40% demo; within length limit
- [ ] Backup video recorded & linked
- [ ] Description embeds GIF/images; markdown-formatted
- [ ] Honesty pass: what-works/what-doesn't stated plainly
- [ ] Submitted ≥30 min before deadline

---

## Post-mortem (within 48h of results — this is the compounding asset)

| Log                                                                  | Prediction | Actual | Lesson |
| -------------------------------------------------------------------- | ---------- | ------ | ------ |
| Gate A near-misses (which gate almost killed winner / passed loser?) |            |        |        |
| Per-criterion score vs judge feedback                                |            |        |        |
| Velocity: felt vs measured at checkpoints                            |            |        |        |
| Window verdict: edge alive at judging?                               |            |        |        |
| Placement / prizes                                                   |            |        |        |

Weight/bar changes proposed (need 3 consistent events before editing playbook): **************\_\_\_\_**************
