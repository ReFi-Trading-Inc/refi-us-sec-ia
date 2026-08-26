# ReFi Investor Profile — canonical specification

**Status:** canonical product specification, 2026-08-26. Supersedes
[design-investor-profile-alpha-gate.md](design-investor-profile-alpha-gate.md)
(which retains only its still-valid principles, noted in §1.2). Authored from
Zeshan's 2026-08-26 research direction (SEC robo-adviser guidance, fiduciary
interpretation, Rule 203A-2(e) as amended, Reg S-P as amended; Betterment /
Wealthfront / Vanguard Digital Advisor / Schwab / CIRO methodology review).

**Regulatory posture:** every regulatory statement here is an engineering-side
reading — **DRAFT, confirm with counsel** — consistent with
`compliance/README.md`. Nothing in this document is a legal determination.
Counsel checkpoints are marked `[COUNSEL]` throughout and collected in §14.

**Naming:** this system is the **Investor Profile + Product Fit system** —
"Your Investor Profile" in the UI. Never "Risk Quiz", "Risk Test",
"Suitability Test", "Trading Personality", or "Investor Score".

---

## 1. Purpose and principles

### 1.1 What this system is

Not a risk-tolerance questionnaire. The SEC expects an adviser to develop a
reasonable understanding of the client's objectives and circumstances, and its
robo-adviser guidance specifically warns that an automated adviser is limited
by what its questionnaire asks, whether questions are clear, and whether
contradictory responses are detected and resolved. This system therefore
measures **eight things separately** and reconciles them:

```
Goal → Time horizon → Liquidity → Financial capacity
    → Risk willingness → Knowledge/experience → Restrictions → Product fit
```

The governing rule of the whole design:

> **Final permissible risk cannot exceed the more restrictive of risk capacity
> and risk willingness.** Constraints, never averages. Willingness "Aggressive"
> with capacity "Conservative" resolves to the Conservative constraint with a
> reason code — never to "Balanced".

And the optimization target:

> Not "how many users qualify?" but "how accurately can ReFi determine what it
> knows about the client, what it does not know, whether the product fits, and
> why?"

### 1.2 Carried forward from the superseded design

- Banded financial data, never exact dollars (Reg S-P minimization).
- All allocation/threshold policy values are **backend-owned and
  policy-versioned**; the frontend renders them and never hardcodes a
  percentage (same class of rule the tripwire enforces for freshness).
- Immutable versioned snapshots with receipts — the existing profile
  machinery is the right substrate.
- The alpha risk disclosure lives in the existing disclosure/consent
  machinery, **separate from the questionnaire** (§10.3).

### 1.3 Six derived outputs (never one score)

| Output                              | Question                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| A. Risk capacity                    | How much loss can this client financially withstand?                                |
| B. Risk willingness                 | How much volatility/loss are they psychologically willing to accept?                |
| C. Investment sophistication        | Knowledge/experience — **never mechanically increases allowable risk**              |
| D. Product fit                      | Is THIS product right for THIS money right now? Includes a real "not a fit" outcome |
| E. Alpha readiness                  | Separate branch; guidance/segmentation only under Signal-only launch                |
| F. Profile confidence / consistency | "Willingness High + Capacity Low → needs clarification" beats averaging             |

---

## 2. Placement in onboarding — the sequencing constraint

```
Eligibility
  ↓
Investor Profile (this spec)
  ↓
Profile summary — facts and derived bands only, NO personalized security
  recommendation
  ↓
Form CRS / ADV brochure / privacy notice / advisory agreement
  ↓
Broker / account connection
  ↓
Personalized recommendation
```

The questionnaire must not accidentally create the personalized recommendation
before the disclosure/agreement sequencing is legally correct: for a
registered adviser serving retail investors, Form CRS and the ADV brochure
generally must be delivered before or at contract formation. **[COUNSEL]**
approves the exact transition between profile summary and investment advice.

**Identity/KYC separation:** identity and KYC data (SSNs, ID images — the
broker's CIP domain) are never copied into the advisory profile snapshot.
The FinCEN investment-adviser AML rule is delayed to 2028-01-01 and the
adviser CIP proposal is not final, but the connected broker's own CIP
obligations stand — keep the data domains separate regardless.

---

## 3. Entry, tone, and the entity split

### 3.0 Account-type gate (before Section 1)

**Who is this account for?**

- Just me
- Me and someone else (joint)
- A business, trust, or fund I manage

The third answer routes to a separate institutional-onboarding path (out of
scope here) with:

> **ReFi for entities works differently.** Business, trust, and fund accounts
> have their own onboarding. Leave your details and we'll be in touch.

Power retail traders and small fund managers must not flow through the retail
advisory questionnaire — split at the first decision, don't contaminate the
retail flow. Reason code: `ENTITY_ROUTED`.

### 3.1 Introduction screen

> **A few questions. Better recommendations.**
>
> Tell us what you're investing for, when you may need the money, and how you
> think about risk. Most people finish in about five minutes.
>
> There are no right answers. Estimates are fine, and you can update your
> profile whenever your circumstances change.

### 3.2 The path

Normal path: **15–18 answered questions**. Branching may expose 20–24 in
unusual cases. Six section markers (never "Question 14 of 23" — branching
changes the total):

`Your goal · Timeline · Financial cushion · Experience · Risk · Restrictions`

Progress renders as e.g. `Risk · Step 5 of 6`.

---

## 4. The questions — screen-by-screen

Every question ships with its protocol row (§12). Enum values are the
machine-stored spellings. Copy below is the shipping copy (brand voice §13);
"Why we ask" text renders behind a consistent affordance on each screen.

### Section 1 — Your goal

**Q1 · `objective`** — _What are you investing this money for?_
Large selectable cards:

| Enum                  | Card                            |
| --------------------- | ------------------------------- |
| `long_term_wealth`    | Building long-term wealth       |
| `retirement`          | Retirement                      |
| `major_purchase`      | A major purchase                |
| `education_family`    | Education or a family goal      |
| `income`              | Generating income               |
| `general`             | General investing               |
| `emergency_near_term` | Emergency or near-term expenses |
| `other`               | Something else                  |

_Why we ask:_ Your goal changes how much market movement your plan can
reasonably absorb.

**Branch:** `emergency_near_term` does NOT immediately reject — ask horizon
first. Near-term + high liquidity requirement resolves to the product-fit
constraint (§8), not a "conservative ReFi profile" the product cannot deliver.

### Section 2 — Timeline

**Q2 · `horizon`** — _When might you first need a meaningful amount of this
money?_
Helper: _Think about roughly a quarter or more of the account._

`lt_1y` · `1_3y` · `3_5y` · `5_10y` · `gt_10y` · `unsure`

**Q3 · `withdrawalPattern`** — _When you start taking money out, how do you
expect to use it?_

`lump_sum` (Most or all at once) · `few_years` (Over a few years) ·
`gradual` (Gradually over many years) · `none_expected` (I don't expect to
withdraw it) · `unsure`

Time-until-withdrawal and manner-of-withdrawal are different constraints.

### Section 3 — Your financial cushion

Section intro (before any financial question):

> **Now, a little context about your finances.**
>
> We use ranges rather than exact amounts where we can. This helps us
> understand how much investment risk your plan can absorb without asking for
> more information than we need.

**Q4 · `incomeBand`** — _About how much do you earn in a year?_

`lt_25k` · `25_50k` · `50_100k` · `100_200k` · `200_500k` · `gt_500k` ·
`prefer_not`

`prefer_not` is never automatic rejection: it lowers `profileConfidence` and
may block certain higher-risk eligibility outcomes (reason
`CONFIDENCE_LIMITED`).

**Q5 · `incomeStability`** — _How predictable is your income right now?_

`very_predictable` · `mostly_predictable` · `varies_significantly` ·
`between_sources` (I'm between income sources right now)

Two people earning the same amount can have completely different loss
capacity.

**Q6 · `netWorthBand`** — _About how much is your total net worth?_

`lt_25k` · `25_100k` · `100_500k` · `500k_1m` · `1_5m` · `gt_5m` ·
`prefer_not`

**Q7 · `liquidNetWorthBand`** — _About how much of that could you reasonably
access for investing?_
Definition shown inline:

> Include cash, savings and investments you could reasonably access. Don't
> include your home or other assets you would not sell to fund this
> investment.

Same bands as Q6. **[COUNSEL]** reviews this definition wording before
implementation.

**Q8 · `accountShareOfLiquidAssets`** — _How much of your liquid savings and
investments would this ReFi account represent?_

`lt_10pct` · `10_25pct` · `25_50pct` · `gt_50pct` · `unsure`

More useful than net worth alone — proportion of savings represented is a
direct concentration/capacity measure, and it drives alpha allocation.

**Q9 · `emergencyReserveBand`** — _If an unexpected expense came up, how much
of a cash cushion do you currently have?_

`lt_1mo` · `1_3mo` · `3_6mo` · `gt_6mo` · `unsure`
(Months of normal expenses.)

**Q10 · `debtSignal`** — _Do you currently carry high-interest debt that you
don't normally pay off each month?_

`none` · `manageable` (Yes, but it's manageable) · `significant` (Yes, and
it's significant) · `prefer_not`

Never ask exact balances.

### Section 4 — Your experience

**Q11 · `investmentKnowledge`** — _Which best describes your investing
knowledge?_
Behavioral descriptions, never "Beginner/Intermediate/Expert":

| Enum                 | Card                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `learning`           | I'm learning — I know the basics but don't regularly make investment decisions.                           |
| `comfortable`        | I'm comfortable with the basics — I understand stocks, ETFs, diversification and market risk.             |
| `experienced`        | I'm experienced — I've actively managed investments through different market conditions.                  |
| `highly_experienced` | I'm highly experienced — I regularly evaluate investment strategies, portfolio risk and market structure. |

**Q12 · `investmentExperienceYears`** — _How long have you been managing
investments?_

`lt_1y` · `1_3y` · `3_5y` · `5_10y` · `gt_10y`

**Q13 · `productExperience[]`** — _Which have you personally used?_
Multi-select:

`stocks` · `funds` (ETFs or mutual funds) · `bonds` · `options` ·
`margin_leverage` · `crypto` · `automated_strategies` · `none`

**Rule:** options/margin experience is an experience/complexity signal only.
**Experience never mechanically increases allowable risk.**

### Section 5 — How you experience risk

Replaces the current single `riskTolerance` self-rating with four independent
observations. No answer is ever visually presented as "better"; no
green-for-gains/red-for-losses nudging.

**Q14 · `riskScenarioDrawdown`** — _Imagine you invested $50,000 and markets
fell sharply. A few months later your account is worth $40,000. What would
you most likely do?_

`sell_all` (Sell most or all of it) · `sell_some` (Sell some and reduce
risk) · `stay` (Stay invested) · `buy_more` (Invest more) · `unsure`

**Q15 · `drawdownTolerance`** — _At what one-year decline would you seriously
reconsider staying invested?_

`pct_5` · `pct_10` · `pct_20` · `pct_30` · `gt_30` · `unsure`

**Q16 · `riskTradeoff`** — _Which outcome would you be more comfortable
living with for a year?_
Four mathematically calibrated pairs (policy-versioned; illustrative v1
values below — backend owns the numbers, **[COUNSEL]** + product calibrate):

| Enum     | Presented as (on $10,000)                |
| -------- | ---------------------------------------- |
| `band_1` | Typical year between −$300 and +$700     |
| `band_2` | Typical year between −$900 and +$1,400   |
| `band_3` | Typical year between −$1,800 and +$2,400 |
| `band_4` | Typical year between −$3,000 and +$3,600 |

Neutral presentation; identical typography for gain and loss figures.

**Q17 · `lossVsGrowthPriority`** — _Which matters more for this money?_
Five positions between:

_Avoiding a significant loss_ ←→ _Maximizing long-term growth_

`1` … `5` (stored as the position). Second, differently-framed observation —
the consistency check against Q14–Q16.

### Section 6 — Restrictions and circumstances

**Q18 · `restrictions[]`** — _Are there investments ReFi should not include
for you?_

`none` · `employer_securities` · `legally_restricted` (Securities I'm legally
or professionally restricted from trading) · `specific_companies` ·
`specific_industries` · `other`

Conditional detail (ticker/company/industry pickers) when any non-`none`
option is selected. For a direct-index product this feeds the existing
`excludedAssets` preference and a per-client restriction set. Reason code
where material: `RESTRICTED_SECURITIES`.

**Q19 · `expectedFinancialChange`** — _Do you expect a major financial change
in the next 12 months that could change when you need this money or how much
you can invest?_

`no` · `maybe` · `yes`

If `yes`: free-select from `retirement` · `job_income_change` ·
`home_purchase` · `large_expense` · `other`, with the instruction:

> Tell us what changes financially, not personal details.

Never solicit medical or other sensitive personal details.

### Section 6b — Product intent (segmentation, outside the risk model)

**Q20 · `productIntent[]`** — _What are you hoping ReFi helps you do?_
Multi-select:

`disciplined_long_term` · `personalized_signals` · `diversify_existing` ·
`less_decision_time` · `learn_system` · `explore_alpha` · `other`

Commercially valuable segmentation that must **never contaminate the risk
model**. `explore_alpha` sets `alphaInterest = true` and opens the Alpha
Readiness branch (§10) — it does not by itself change any band.

---

## 5. Derivation — the decision engine

Deterministic, interpretable, policy-versioned. **No ML/RL in the client-risk
classification loop.** AI may later help flag inconsistencies or suggest
clarifications, but the suitability decision itself stays reproducible unless
a future compliance-reviewed model is specifically validated for it.

Pipeline (order matters):

```
1. Check product fit                    (§8 — can exit here)
2. Calculate risk capacity              (§5.1)
3. Calculate risk willingness           (§5.2)
4. Check experience/complexity          (§5.3)
5. Detect inconsistencies               (§7)
6. Apply hard constraints               (§8 table)
7. Derive final profile                 (min(capacity, willingness) then constraints)
8. Generate reason codes                (§9)
```

All matrices below are **policy v1 drafts** — the backend owns the live
values under `policyVersion`; the frontend never reimplements them.

### 5.1 Risk capacity (`capacityBand` 1–5)

Points per answer, summed, then banded:

| Input                | 0 pts             | 1 pt                        | 2 pts                | 3 pts              | 4 pts          |
| -------------------- | ----------------- | --------------------------- | -------------------- | ------------------ | -------------- |
| Q2 horizon           | `lt_1y`           | `1_3y` / `unsure`           | `3_5y`               | `5_10y`            | `gt_10y`       |
| Q3 withdrawal        | `lump_sum`        | `few_years` / `unsure`      | `gradual`            | `none_expected`    | —              |
| Q5 income stability  | `between_sources` | `varies_significantly`      | `mostly_predictable` | `very_predictable` | —              |
| Q7 liquid NW         | `lt_25k`          | `25_100k`                   | `100_500k`           | `500k_1m`          | `1_5m`/`gt_5m` |
| Q8 account share     | `gt_50pct`        | `25_50pct` / `unsure`       | `10_25pct`           | `lt_10pct`         | —              |
| Q9 emergency reserve | `lt_1mo`          | `1_3mo` / `unsure`          | `3_6mo`              | `gt_6mo`           | —              |
| Q10 debt             | `significant`     | `manageable` / `prefer_not` | `none`               | —                  | —              |

Sum 0–22 → `capacityBand`: 0–4 → 1 · 5–8 → 2 · 9–13 → 3 · 14–18 → 4 ·
19–22 → 5. `prefer_not` on Q4/Q6/Q7 additionally caps `profileConfidence`
(§5.4); Q7 `prefer_not` caps `capacityBand` at 3 (`CONFIDENCE_LIMITED`).

### 5.2 Risk willingness (`willingnessBand` 1–5)

Normalize each observation to 1–5, then take the **median** of the four (not
the mean — one outlier answer shouldn't drag the band; disagreement is
handled by §7, not averaged away):

| Observation | 1          | 2                      | 3        | 4          | 5       |
| ----------- | ---------- | ---------------------- | -------- | ---------- | ------- |
| Q14         | `sell_all` | `sell_some` / `unsure` | `stay`   | `buy_more` | —       |
| Q15         | `pct_5`    | `pct_10` / `unsure`    | `pct_20` | `pct_30`   | `gt_30` |
| Q16         | `band_1`   | `band_2`               | `band_3` | `band_4`   | —       |
| Q17         | `1`        | `2`                    | `3`      | `4`        | `5`     |

### 5.3 Sophistication (`knowledgeBand` 1–4)

From Q11 (primary), Q12 and Q13 (supporting). `knowledgeBand` gates
**complexity of what may be shown/explained** and is an alpha input — it
never raises `finalRiskBand`. "Highly experienced + low tolerance": low
tolerance still controls.

### 5.4 Profile confidence

`profileConfidence`: `high` · `adequate` · `needs_clarification` · `limited`.
Lowered by: any `prefer_not` on Q4/Q6/Q7, unresolved §7 inconsistency,
`unsure` on ≥3 load-bearing questions. `limited` (e.g. material financial
questions refused) may mean **no personalized recommendation** until
clarified — stated to the user plainly, not silently degraded.

### 5.5 Final profile

`finalRiskBand = min(capacityBand, willingnessBand)`, then hard constraints
(§8) may lower it further or resolve to a not-fit outcome. Every lowering
emits a reason code. The band maps to the user-facing taxonomy (§11.2).

---

## 6. Result screen — explanation, not a score

Never `Risk Score: 73 — Aggressive`. Render:

> **Your investor profile**
> **Growth-oriented**
>
> Your ability to take risk — **Moderate**
> Your comfort with market risk — **High**
> Your investing experience — **Experienced**
> Your timeline — **10+ years**
> ReFi product fit — **Good fit for long-term investing**
>
> **What shaped this result**
> Your long investment horizon supports taking market risk. Your financial
> cushion supports moderate risk, but it is more restrictive than your stated
> comfort with market volatility, so we use the more cautious constraint.

The explanation paragraph is generated from the reason codes — explainable
and auditable, the same trail counsel and the audit spine need.

Users choosing to override toward more aggressive than recommended (where a
choice exists) see a plain-language caution — the Betterment pattern — and
the override is itself recorded with a receipt.

---

## 7. Inconsistency detection and reconciliation

Trigger examples (policy-versioned rule list):

- Q14–Q17 normalized spread ≥ 3 (willingness observations disagree);
- short horizon (Q2 ≤ `1_3y`) with high stated willingness (≥ 4);
- `emergency_near_term` objective with `gt_10y` horizon;
- `none_expected` withdrawal with `major_purchase` objective;
- high willingness + `between_sources` income + `lt_25k` liquid NW.

Reconciliation screen (never "your answers are wrong", never silently
averaged):

> **Let's double-check one thing.**
>
> Two of your answers point in different directions. You told us you may need
> this money within three years, but you're also comfortable with substantial
> market losses.
>
> Your timeline matters because a shorter period gives your portfolio less
> time to recover.
>
> Which would you like to revisit?
> · When I need the money
> · How I think about losses

Both answers' history is preserved (immutable snapshots). Unresolved
contradiction → `profileConfidence: needs_clarification`,
`INCONSISTENCY_UNRESOLVED`, and the §8 table governs what may proceed.

---

## 8. Product fit — including the honest exit

The system must have a real **"ReFi is not appropriate for this money right
now"** outcome. Hard decision-tree cases (v1):

| Condition                                                              | Outcome                                                         | Reason code                |
| ---------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------- |
| Needs substantial funds < 1 year                                       | Direct-index strategy likely not a fit                          | `NEAR_TERM_NOT_FIT`        |
| Emergency-fund purpose (+ short horizon / high liquidity need)         | Not a fit for an equity strategy                                | `EMERGENCY_FUND_NOT_FIT`   |
| Cannot tolerate material principal loss (Q15 `pct_5` + Q14 `sell_all`) | Not a fit                                                       | `LOSS_INTOLERANT_NOT_FIT`  |
| Very short horizon + high stated tolerance                             | Horizon/capacity constraint governs; reconciliation triggered   | `HORIZON_CONSTRAINT`       |
| High tolerance + unstable income + low liquid NW                       | Capacity controls                                               | `CAPACITY_CONTROLS`        |
| ReFi account > 50% of liquid assets                                    | Capacity reduction; alpha restricted                            | `CONCENTRATION_LIMIT`      |
| Low experience + very high risk answers                                | Clarification/education path — not simply classified aggressive | `CLARIFICATION_REQUIRED`   |
| Highly experienced + low tolerance                                     | Low tolerance controls                                          | `WILLINGNESS_CONTROLS`     |
| Employer/legal trading restrictions                                    | Personalized restriction set                                    | `RESTRICTED_SECURITIES`    |
| Alpha desired + limited loss capacity                                  | Signal/paper only                                               | `ALPHA_CAPACITY_LIMITED`   |
| Conflicting behavioral answers                                         | Reconciliation screen                                           | `INCONSISTENCY_UNRESOLVED` |
| Material financial questions refused                                   | Confidence limitation; possibly no personalized recommendation  | `CONFIDENCE_LIMITED`       |
| Entity / fund manager                                                  | Separate institutional onboarding                               | `ENTITY_ROUTED`            |
| Unsupported account type                                               | Product-fit exit, not questionnaire failure                     | `UNSUPPORTED_ACCOUNT`      |

Not-fit copy:

> **This money may have a different job.**
>
> Based on your timeline and need for access to these funds, a stock-focused
> ReFi strategy may not be the right fit for this money right now.
>
> Your profile can change as your circumstances change.

A not-fit outcome is a saved, versioned, receipted result — not a dead end;
the user can revisit when circumstances change (§15 refresh triggers).

---

## 9. Reason codes

Closed vocabulary (v1), stored on every assessment; the audit answer to "why
did the system conclude this":

`LIQUIDITY_CONSTRAINT` · `HORIZON_CONSTRAINT` · `CAPACITY_CONTROLS` ·
`WILLINGNESS_CONTROLS` · `CONCENTRATION_LIMIT` · `NEAR_TERM_NOT_FIT` ·
`EMERGENCY_FUND_NOT_FIT` · `LOSS_INTOLERANT_NOT_FIT` ·
`INCONSISTENCY_UNRESOLVED` · `CLARIFICATION_REQUIRED` · `CONFIDENCE_LIMITED`
· `RESTRICTED_SECURITIES` · `ALPHA_CAPACITY_LIMITED` ·
`ALPHA_DISCLOSURE_PENDING` · `ENTITY_ROUTED` · `UNSUPPORTED_ACCOUNT` ·
`USER_OVERRIDE_RECORDED`

Internally the numbers outrank the labels: retain
`capacity=2 · willingness=4 · final=2 · reason=LIQUIDITY_CONSTRAINT`, not
just "Conservative".

---

## 10. Alpha Readiness — a branch, not everyone's survey

Opens only when `alphaInterest = true` (Q20 `explore_alpha`). Ordinary
direct-index clients never see experimental-risk questions.

### 10.1 Branch questions

**A1 · `alphaLossImpact`** — _Could losing the entire amount you allocate to
an experimental strategy interfere with your normal expenses or financial
obligations?_

`yes` · `no` · `unsure`

`yes` or `unsure` → no execution-capable alpha; potentially Signal/paper
experience only (`ALPHA_CAPACITY_LIMITED`).

**A2 — exposure policy (no question).** The backend computes from account
value + `liquidNetWorthBand` + `accountShareOfLiquidAssets` and returns:

```
policyVersion · suggestedMaxExposure · policyBasis
```

Never ask "Would you like to invest 2%?" — the percentage lives in backend
policy, full stop.

**A3 — disclosure, separate from the questionnaire.** The
`alpha-program-risk` document rides the existing disclosure machinery
(registry, versioning, contentHash, acknowledgment). A suitability question
asks _what can you financially withstand_; a disclosure states _here are the
risks of this service_. Never turn one into the other.

### 10.2 Alpha eligibility (conjunction, never a single field)

```
eligible jurisdiction/account
AND adequate capacity           (capacityBand ≥ policy floor, A1 = no)
AND adequate experience         (knowledgeBand ≥ policy floor)
AND proposed exposure within backend policy
AND no unresolved profile contradiction
AND required disclosure version acknowledged
```

Never `riskTolerance === "aggressive"`. Under the current Signal-only launch
this produces **guidance/segmentation, not trade-execution authority**;
whether it ever permits execution depends on the final Managed/alpha
architecture (D-LAUNCH-06 and the Managed release gates).

---

## 11. Segments and taxonomy

### 11.1 Operational customer segments

| Segment                              | Typical profile                                       | Product path                              |
| ------------------------------------ | ----------------------------------------------------- | ----------------------------------------- |
| Core Builder                         | Long horizon, moderate+ capacity, moderate+ tolerance | Core Signal / direct index                |
| Experienced Self-Directed            | High sophistication, adequate capacity                | Core + advanced explanation               |
| Time-Constrained Professional        | Strong capacity, wants discipline/automation          | Core Signal                               |
| Concentrated/Restricted Investor     | Employer stock or legal restrictions                  | Personalized exclusions / direct indexing |
| Alpha-Curious, Qualified by Capacity | High capacity + knowledge + in-policy exposure        | Alpha branch                              |
| Alpha-Curious, Capacity Limited      | Wants risk, cannot financially absorb it              | Signal/paper only                         |
| Near-Term Investor                   | Short horizon / high liquidity need                   | Not-fit outcome                           |
| Capital-Preservation Investor        | Low tolerance or essential funds                      | Not-fit outcome                           |
| Entity / fund manager                | Business/institutional                                | Separate onboarding architecture          |

### 11.2 User-facing profile taxonomy

Five profiles: **Preservation · Conservative · Balanced · Growth · High
Growth** (mapping from `finalRiskBand` 1–5). Never "Aggressive Trader" —
this is an advisory relationship, not transaction-intensity encouragement.

---

## 12. Question protocol

Every question carries this internal protocol (full table maintained with
the implementation; the columns are mandatory):

| Field                       | Meaning                                                           |
| --------------------------- | ----------------------------------------------------------------- |
| Why do we ask this?         | The user-visible and internal rationale                           |
| What decision uses it?      | Capacity / willingness / fit / alpha / segmentation / restriction |
| Is it required?             | Required · optional · `prefer_not` allowed                        |
| What happens if unanswered? | Confidence effect, band caps, blocked outcomes                    |
| Where is it stored?         | `InvestorProfileSnapshot` field                                   |
| How is it updated?          | New immutable version via refresh (§15)                           |
| How long is it retained?    | Per books-and-records retention policy **[COUNSEL]**              |

A question that cannot fill this row honestly does not ship.

---

## 13. UI/UX and brand-voice rules (mandatory)

Structure: one principal question per screen · automatic save after every
answer · persistent Back with correct browser-Back behavior · mobile-first
radio cards, large tap targets · conditional branching (irrelevant questions
never render) · answer review before final submission · six section markers,
never absolute question counts.

Integrity: no preselected financial/risk answers · no sliders for
dollar-band questions · no celebratory animation for choosing higher risk ·
no colors suggesting aggressive = better · no artificial urgency · no
lengthy disclosure text hidden inside questionnaire screens · estimates
explicitly allowed · "Why we ask" on every sensitive question.

Accessibility: WCAG 2.2 AA · full keyboard and screen-reader support.

Voice — intelligent, calm, human. Not bureaucratic ("Please select your
aggregate liquid investable assets"), not gamified ("How spicy is your risk
appetite? 🔥"). ReFi:

> How much of your savings would this account represent?

> Markets move. How would a 20% decline feel for this money?

All copy must pass the existing `pnpm scan-copy` blocked-terms gate (no
"guaranteed return", "risk-free", approval/operator language, etc.) — the
copy in this spec was written against that list.

---

## 14. Counsel checkpoints (collected)

1. The Q7 liquid-net-worth definition wording (§4).
2. The exact transition point between profile summary and personalized
   advice; CRS/ADV/agreement delivery sequencing (§2).
3. Retention schedule per question class (§12).
4. Q16 calibrated trade-off values and their presentation (§4 Q16).
5. The alpha-program-risk disclosure text at Gate B (§10.3).
6. Whether the suitability record format meets the 203A-2(e) file needs
   (carried from the superseded design doc).
7. The not-fit outcome's status under the advisory relationship (is a
   not-fit user a "client"?) (§8).

---

## 15. Profile refresh — part of the product

Onboarding is not permanent. Retail profiles generally need updating as
circumstances change; each refresh writes a **new immutable profile version**
on the existing machinery.

- **Annual confirmation:** "Has anything important changed?"
- **Event-driven prompts** after: significant account-value change · unusual
  withdrawal · goal change · horizon change · liquidity-requirement change ·
  a request for a materially more aggressive profile · account concentration
  · alpha enrollment request · user-reported material financial change.

---

## 16. Data schema

Answers and derived results stored **separately**; consent separate from
both. Replaces the single `riskTolerance` field (which ceases to be
user-selected — see §17 migration).

```
InvestorProfileSnapshot            // immutable; new version per change
  profileVersion
  questionnaireVersion             // which question set produced it
  policyVersion                    // which scoring policy interpreted it
  accountType                      // §3.0 gate
  objective, horizon, withdrawalPattern
  incomeBand, incomeStability
  netWorthBand, liquidNetWorthBand
  accountShareOfLiquidAssets, emergencyReserveBand, debtSignal
  investmentKnowledge, investmentExperienceYears, productExperience[]
  riskScenarioDrawdown, drawdownTolerance, riskTradeoff, lossVsGrowthPriority
  restrictions[], expectedFinancialChange
  productIntent[], alphaInterest, alphaLossImpact?

InvestorProfileAssessment          // derived, deterministic, versioned
  capacityBand, willingnessBand, knowledgeBand, finalRiskBand
  productFit                       // fit | constrained | not_fit
  alphaReadiness                   // n/a | signal_paper_only | eligible_pending_policy
  consistencyFlags[]
  constraintReasonCodes[]
  profileConfidence
  policyVersion, assessedAt

ConsentRecord                      // existing disclosure machinery
  documentId, documentVersion, contentHash, acknowledgedAt
```

Frontend renders assessments; the backend owns derivation once the real
backend exists. In the interim BFF-prototype phase, the derivation runs
server-side in the BFF under the same `policyVersion` discipline — never in
client code.

---

## 17. Migration from the current seven-field profile

- Existing snapshots (goal, horizon, incomeBand, liquidityNeed,
  riskTolerance, experience, accountPurpose) are retained unchanged —
  immutability is the point. New versions are written under
  `questionnaireVersion: 2`.
- `riskTolerance` maps to nothing in v2 input; it is superseded by the four
  §5.2 observations. `liquidityNeed` is superseded by Q3/Q8/Q9.
- Until v2 ships, the current `POST /api/v1/investor/profile` remains the
  live surface (it is a manifested route — any route/method change goes
  through the CM-04 manifest review).
- Existing users are prompted through the v2 questionnaire on next
  sign-in after launch (this IS the first §15 refresh).

## 18. Analytics events

Snake_case, matching `apps/web/app/_lib/analytics.ts` conventions; no answer
VALUES in event payloads — only progress/derived-class metadata:

`profile_started` · `profile_section_completed` (section id) ·
`profile_branch_entered` (`alpha` | `entity` | `reconciliation`) ·
`profile_inconsistency_shown` / `profile_inconsistency_resolved` ·
`profile_completed` (finalRiskBand, productFit, profileConfidence — bands
only, never inputs) · `profile_not_fit_shown` · `profile_refresh_prompted` /
`profile_refresh_completed` · `profile_override_recorded`

(The POSTHOG-CSP decision in the launch backlog still governs whether any of
this ships in the production artifact.)

## 19. Implementation slices (after this spec is approved)

1. **Schema + engine:** v2 snapshot/assessment entities, deterministic
   scoring engine with `policyVersion`, property-based invariant tests
   (constraint rule: final ≤ min(capacity, willingness); no path where
   experience raises final; not-fit cases fire).
2. **Questionnaire UI:** sections 1–6b with branching, autosave, review
   screen, WCAG 2.2 AA; e2e coverage for branch/reconciliation/not-fit
   paths.
3. **Result + summary screen** with reason-code-driven explanations —
   stopping BEFORE personalized advice pending the §2 counsel gate.
4. **Alpha branch** (A1 + backend policy render + disclosure gate) — the
   execution half remains behind D-LAUNCH-06 and Managed gates.
5. **Refresh machinery** (annual + event triggers).

Slices 1–3 are valid under every reading of the September launch. Nothing
here changes the Signal no-execution boundary.
