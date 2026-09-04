# ReFi Investor Profile — PRD + Decision Specification

**Status:** canonical product specification, v2, 2026-08-26. Supersedes
[design-investor-profile-alpha-gate.md](design-investor-profile-alpha-gate.md),
preserving its good decisions (immutable profile versions, banded net worth,
disclosure versioning, backend ownership of alpha policy). Authored from
Zeshan's 2026-08-26 research direction, parts I–XXVII (SEC fiduciary
interpretation IA-5248; SEC robo-adviser guidance IM 2017-02 and the 2017
staff bulletin; Form CRS/ADV delivery requirements; Reg S-P as amended 2024;
Rule 203A-2(e) as amended 2024; Betterment / Wealthfront / Vanguard Digital
Advisor / Schwab / CIRO methodology review — references in §22).

**Regulatory posture:** every regulatory statement here is an engineering-side
reading — **DRAFT, confirm with counsel** — per `compliance/README.md`.
Counsel/CCO sign-off decisions are collected in §20; nothing there is decided
silently by product or engineering.

**The architectural change this document makes canonical:**

> **The questionnaire collects facts and behavioral answers. A separate
> deterministic policy engine derives risk capacity, risk willingness, product
> fit, alpha readiness and consistency flags.** `riskTolerance` ceases to be a
> user-entered field.

**Naming:** the **Investor Profile + Product Fit system** — "Your Investor
Profile" in the UI. Never "Risk Quiz", "Risk Test", "Suitability Test",
"Trading Personality", or "Investor Score".

---

## 1. Purpose and governing principles

The SEC's fiduciary interpretation says a retail adviser should make
reasonable inquiry into the client's financial situation, financial
sophistication, investment experience and financial goals; the robo-adviser
guidance emphasizes whether questionnaires gather enough information, explain
questions clearly, and address inconsistent answers. This system therefore
measures separately and reconciles:

```
Goal → Time horizon → Liquidity → Financial capacity
    → Risk willingness → Knowledge/experience → Restrictions → Product fit
```

Governing rules:

1. **Constraints, never averages.**
   `permittedRisk = MIN(riskCapacity, riskWillingness)`, with hard
   constraints layered before and after. Willingness "Aggressive" with
   capacity "Conservative" resolves to the Conservative constraint with a
   reason code — never to "Balanced". Averaging is exactly how advisers
   accidentally over-risk financially fragile clients.
2. **Experience measures understanding. It never increases a client's
   ability to absorb financial loss.** A derivatives trader who needs the
   money next year is still a short-horizon investor.
3. **Segmentation never overrides the risk engine.**
   `segment = TIME_POOR_PROFESSIONAL` cannot imply `risk = HIGH`.
4. **The system must be capable of all four outcomes:**
   "ReFi fits you." · "ReFi fits you, but with constraints." · "We need to
   clarify something." · "This product isn't appropriate for this money."
   The fourth answer is what makes the first three credible — otherwise the
   questionnaire is a conversion funnel disguised as suitability.
5. **Optimization target:** not "how many users qualify?" but "how
   accurately can ReFi determine what it knows about the client, what it
   does not know, whether the product fits, and why?"
6. **Deterministic and interpretable.** No ML/RL in the client-risk
   classification loop. AI may later help flag inconsistencies or suggest
   clarifications; the suitability decision itself stays reproducible and
   policy-versioned unless a future compliance-reviewed model is
   specifically validated for it.

The best version of this onboarding is not a survey that finds the
customer's risk score. It is **a digital advisory conversation that converts
customer circumstances into an explainable, versioned investment profile.**

---

## 2. Canonical onboarding flow

```
WELCOME
   ↓
WHO / ACCOUNT TYPE
   ↓
BASIC ELIGIBILITY
   ↓
GOAL
   ↓
TIME HORIZON
   ↓
FINANCIAL CAPACITY
   ↓
INVESTMENT EXPERIENCE
   ↓
RISK WILLINGNESS
   ↓
RESTRICTIONS
   ↓
PRODUCT INTENT
   ↓
ALPHA BRANCH, IF RELEVANT
   ↓
CONSISTENCY ENGINE
   ├── clean → continue
   └── conflict → clarification screen → recompute
   ↓
PROFILE RESULT
   ↓
REVIEW YOUR ANSWERS
   ↓
REQUIRED ADVISORY / PRIVACY DISCLOSURES
   ↓
ADVISORY RELATIONSHIP / ACCOUNT CONNECTION
   ↓
PERSONALIZED SIGNAL
```

Form CRS must generally be delivered before or at the time the firm enters
the advisory contract; ADV brochure delivery has its own timing
requirements. **The exact point at which ReFi crosses from
educational/profile information into personalized investment advice is
signed off by securities counsel and reflected MECHANICALLY in the
onboarding state machine** — a state the code enforces, not a convention.

**Identity/KYC separation:** identity and KYC data (SSNs, ID images — the
broker's CIP domain) are never copied into the advisory profile. The FinCEN
investment-adviser AML rule is delayed to 2028-01-01 and the adviser CIP
proposal is not final, but the connected broker's CIP obligations stand —
the data domains stay separate regardless.

**Performance target:** median completion 4–6 minutes; normal retail path
roughly 17–20 answered screens; branching means users only see questions
relevant to them.

---

## 3. The questionnaire — exact screens

Enum values are the machine-stored spellings. All copy is shipping copy
(brand voice §17) written against the `scan-copy` blocked-terms list.
"Why we ask" renders behind a consistent affordance on sensitive screens.

### Screen 0 — Welcome

> **Let's build your investor profile.**
>
> A few questions help ReFi understand what this money is for, when you may
> need it, and how much market risk makes sense for your situation.
>
> Most people finish in about five minutes. Estimates are fine.

Expandable — _Why we ask:_

> ReFi uses your answers to determine whether our service fits your needs
> and to shape the investment guidance we provide. You can update your
> profile when your circumstances change.

CTA: **Start** (never "Take the risk quiz").

### Screen 1 — Who will own this account?

| Answer                                  | Branch                                                        |
| --------------------------------------- | ------------------------------------------------------------- |
| Me                                      | Standard retail flow                                          |
| Me and another person                   | Joint-owner future flow / collect both relevant circumstances |
| A trust                                 | Dedicated trust flow                                          |
| A business or organization              | Institutional/entity flow                                     |
| I'm investing professionally for others | Stop retail questionnaire; institutional/adviser flow         |

A fund manager, corporation or professional adviser is never squeezed
through a consumer robo-adviser questionnaire — the SEC itself distinguishes
a retail client's investment profile from an institutional client's
investment mandate. Non-retail exits carry reason `ENTITY_ROUTED` and copy:

> **ReFi for entities works differently.** Business, trust, and fund
> accounts have their own onboarding. Leave your details and we'll be in
> touch.

### Section 1 — What is this money for?

**Screen 2 · `goal`** — _What is the main job of this money?_

| Card                            | Enum                |
| ------------------------------- | ------------------- |
| Build long-term wealth          | `long_term_wealth`  |
| Retirement                      | `retirement`        |
| A major future purchase         | `major_purchase`    |
| Education or family goal        | `education_family`  |
| Generate investment income      | `income_generation` |
| General investing               | `general_investing` |
| Emergency or near-term expenses | `near_term_reserve` |
| Something else                  | `other`             |

Underneath:

> Different money has different jobs. This helps us avoid treating a
> long-term portfolio like a savings account—or vice versa.

**Critical branch:** `near_term_reserve` does NOT immediately reject —
continue through timing/liquidity and let the product-fit engine make the
determination.

### Section 2 — Timeline

**Screen 3 · `horizon`** — _When might you first need a meaningful amount of
this money?_
Helper: _Think about roughly 25% or more of the account._

`lt_1y` (Within a year) · `1_3y` · `3_5y` · `5_10y` · `gt_10y` (More than
10 years) · `unknown` (I'm not sure)

**Screen 4 · `withdrawalPattern`** — _When you begin taking money out, how
do you expect to use it?_

`lump_sum` (Most or all at once) · `few_years` (Over a few years) ·
`gradual` (Gradually over many years) · `none_expected` (I don't currently
expect to withdraw it) · `unsure`

A retirement account beginning withdrawals in ten years is economically
different from a house down payment liquidated on one date in ten years.

### Section 3 — Financial capacity

Section introduction:

> **A little context about your finances**
>
> We use ranges wherever possible. We don't need exact balances to
> understand whether investment losses could interfere with your plans.

(Reg S-P makes protecting customer information a material operating
obligation; collecting only information that contributes to the advisory
decision reduces sensitive-data exposure.)

**Screen 5 · `incomeBand`** — _About how much do you earn in a typical year
before taxes?_

`lt_25k` · `25_50k` · `50_100k` · `100_200k` · `200_500k` · `gt_500k` ·
`prefer_not`

Income alone never determines risk.

**Screen 6 · `incomeStability`** — _How predictable is your income right
now?_

`very_predictable` · `mostly_predictable` · `varies_considerably` ·
`between_sources` (I'm currently between regular income sources) ·
`prefer_not`

A $250,000 salaried executive and a founder with variable income can have
very different short-term capacity.

**Screen 7 · `netWorthBand`** — _About how much is your total net worth?_
Tooltip: _Your assets minus what you owe. A range is enough._

`lt_50k` · `50_100k` · `100_250k` · `250_500k` · `500k_1m` · `1_5m` ·
`gt_5m` · `prefer_not`

**Screen 8 · `liquidNetWorthBand`** — _About how much of your net worth
could reasonably be used or accessed for investing?_
Tooltip:

> Include cash and investments you could reasonably access. Don't include
> your home or other assets you would not realistically sell to fund this
> account.

Same bands as Screen 7. **[COUNSEL]** approves the exact liquid-net-worth
definition wording. More useful for alpha exposure than total net worth.

**Screen 9 · `accountShareOfLiquidAssets`** — _Roughly how much of your
liquid savings and investments would this ReFi account represent?_

`lt_10pct` · `10_25pct` · `25_50pct` · `gt_50pct` · `unsure`

Often more informative than the raw net-worth band: a $100,000 account
belonging to someone with $3 million liquid is very different from a
$100,000 account containing someone's entire investable wealth.

**Screen 10 · `emergencyReserveBand`** — _If something unexpected happened,
how long could your current cash savings cover normal expenses?_

`lt_1mo` · `1_3mo` · `3_6mo` · `gt_6mo` · `unsure` · `prefer_not`

**Screen 11 · `debtSignal`** — _Do you carry high-interest debt that you
don't normally pay off each month?_

`none` · `manageable` (Yes, but it is manageable) · `significant` (Yes, and
it is significant) · `prefer_not`

Never ask exact balances unless the policy engine genuinely requires them.

**Screen 12 · `liquidityLikelihood`** — _How likely are you to need an
unexpected withdrawal from this account?_

`very_unlikely` · `possible` · `likely` · `unsure`

Replaces the vague existing `liquidityNeed` string with something
measurable.

### Section 4 — Investment knowledge and experience

Never ask "How sophisticated are you?" — people grade themselves poorly.

**Screen 13 · `knowledgeLevel`** — _Which description sounds most like
you?_

| Enum                 | Card                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| `learning`           | **I'm learning** — I understand some basics but don't regularly make investment decisions.               |
| `comfortable`        | **I'm comfortable with the basics** — I understand stocks, ETFs, diversification and normal market risk. |
| `experienced`        | **I'm experienced** — I've managed investments through different market conditions.                      |
| `highly_experienced` | **I'm highly experienced** — I regularly evaluate portfolios, investment strategies and risk.            |

**Screen 14 · `experienceYears`** — _How long have you been making your own
investment decisions?_

`lt_1y` · `1_3y` · `3_5y` · `5_10y` · `gt_10y`

**Screen 15 · `productExperience[]`** — _Which investments or strategies
have you personally used?_ Multi-select:

`stocks` (Individual stocks) · `funds` (ETFs or mutual funds) · `bonds` ·
`options` · `margin_leverage` · `digital_assets` · `automated_services`
(Automated investment services) · `quant_strategies` (Quantitative or
algorithmic strategies) · `none`

> **Experience measures understanding. It does not increase a client's
> ability to absorb financial loss.**

### Section 5 — Risk willingness

The single `riskTolerance` input disappears here — replaced by four
independent behavioral observations. No answer is ever visually rewarded;
no green-for-gains/red-for-losses nudging.

**Screen 16 · `drawdownBehavior`** — _Markets fall sometimes. Imagine your
ReFi account started at $50,000 and fell to $40,000 over several months.
What would you most likely do?_

`sell_all` (Sell most or all of it) · `sell_some` (Sell some and reduce my
exposure) · `stay` (Stay invested) · `buy_more` (Invest more) · `unsure`
(I'm genuinely not sure)

**Screen 17 · `lossThreshold`** — _At what decline would you seriously
reconsider staying invested?_

`pct_5` · `pct_10` · `pct_20` · `pct_30` · `gt_30` · `unsure`

**Screen 18 · `growthProtectionPreference`** — _Which matters more for this
money?_ Five-position forced choice:

```
Protecting the value              Maximizing long-term
of my investment    ○──○──○──○──○ growth
```

Stored `1`–`5`. Never label the right side "better returns".

**Screen 19 · `riskTradeoffChoice`** — _Which investment experience would
you rather live with?_ Card set (differently framed than Screen 18 — the
consistency observation):

| Enum     | Card                                                                     |
| -------- | ------------------------------------------------------------------------ |
| `plan_a` | **Plan A** — Smaller market swings · Lower expected long-term growth     |
| `plan_b` | **Plan B** — Moderate market swings · Moderate expected long-term growth |
| `plan_c` | **Plan C** — Larger market swings · Greater long-term growth potential   |

No promised returns. The illustrative figures behind these cards come from
the Investment Committee / model governance and are policy-versioned.
**[COUNSEL]** + investment policy approve values and presentation.

### Section 6 — Restrictions and circumstances

**Screen 20 · `restrictions[]`** — _Are there investments ReFi should avoid
for you?_

`none` · `employer_securities` · `legally_restricted` (Securities I'm
legally or professionally restricted from trading) · `specific_companies` ·
`specific_industries` · `other` — conditional detail fields follow.
Extremely valuable for direct indexing; feeds the restriction set and
`excludedAssets`.

**Screen 21 · `expectedFinancialChange`** — _Do you expect a major
financial change in the next 12 months that could affect this money?_

`no` · `maybe` · `yes` → if yes: _What kind of change?_
`income_employment` · `retirement` · `major_purchase` · `major_expense` ·
`savings_change` (Significant change in available savings) · `other`

> You don't need to provide personal details—only the financial impact that
> could affect your investment plan.

Never solicit medical or other sensitive personal details.

### Section 7 — Product intent (segmentation, not risk)

**Screen 22 · `productIntent[]`** — _What are you hoping ReFi helps you
do?_ Multi-select:

`disciplined_long_term` (Build a disciplined long-term portfolio) ·
`personalized_signals` · `reduce_emotional_decisions` (Reduce emotional
investment decisions) · `diversify_existing` · `less_time` (Spend less time
managing investments) · `understand_systematic` (Understand how a
systematic strategy works) · `explore_alpha` (Explore experimental or alpha
strategies)

Commercially useful — identifies which ICP the customer resembles —
**without contaminating the suitability logic**. `explore_alpha` triggers
the alpha branch (§10).

---

## 4. The decision engine

Five independent outputs — never one score, never an average of everything:

| Output                | Question it answers                                                    |
| --------------------- | ---------------------------------------------------------------------- |
| `riskCapacityBand`    | How much investment loss can this client's circumstances absorb?       |
| `riskWillingnessBand` | How much volatility/loss is the client actually willing to experience? |
| `knowledgeBand`       | How well does the client understand investing/product complexity?      |
| `productFitStatus`    | Does this particular ReFi strategy fit the purpose and circumstances?  |
| `profileConfidence`   | Are the answers sufficiently complete and internally consistent?       |

Derived:

```
permittedRiskBand = MIN(riskCapacityBand, riskWillingnessBand)
```

with hard constraints layered before and after.

### 4.1 Risk capacity — v1 model (deterministic, policy-versioned)

Factor weights (product-policy choices, **not SEC rules** — approved by
counsel and the owner of ReFi's investment policy before release):

| Factor                                   | Approx. importance |
| ---------------------------------------- | -----------------: |
| Time horizon (Screens 3–4)               |                30% |
| Liquidity need (Screen 12)               |                20% |
| Account as % of liquid assets (Screen 9) |                20% |
| Emergency reserve (Screen 10)            |                10% |
| Income stability (Screen 6)              |                10% |
| High-interest debt (Screen 11)           |                10% |

Hard constraints (evaluated regardless of the weighted result):

| Condition                           | Constraint                                               |
| ----------------------------------- | -------------------------------------------------------- |
| Needs most funds < 1 year           | `productFitStatus = not_fit` for the equity direct index |
| Horizon 1–3 years                   | Maximum risk generally constrained                       |
| Emergency-fund purpose              | `not_fit` or strong product-fit constraint               |
| Account > 50% of liquid investments | Capacity constrained                                     |
| < 1 month emergency reserve         | Capacity heavily constrained                             |
| Significant high-interest debt      | Capacity constrained                                     |
| Very high liquidity need            | Capacity constrained                                     |

### 4.2 Risk willingness — v1 ordinal maps (never exposed to the user)

| `drawdownBehavior` | Internal |
| ------------------ | -------: |
| `sell_all`         |        0 |
| `sell_some`        |       25 |
| `unsure`           |       40 |
| `stay`             |       70 |
| `buy_more`         |       90 |

| `lossThreshold` | Internal |
| --------------- | -------: |
| `pct_5`         |       10 |
| `pct_10`        |       30 |
| `pct_20`        |       55 |
| `pct_30`        |       75 |
| `gt_30`         |       95 |
| `unsure`        |       40 |

Screens 18–19 map analogously (policy-versioned). The **consistency
relationship matters more than the score**: "I'd invest more after a 20%
decline" + "I'd seriously reconsider after a 10% decline" creates
`INCONSISTENT_LOSS_BEHAVIOR` — it is never silently averaged to 55.

### 4.3 Knowledge

`knowledgeBand` from Screens 13–15. Gates complexity of presentation and is
an alpha input. **Can never override a capacity constraint.**

### 4.4 Product fit — four states

| Result                | Meaning                                          |
| --------------------- | ------------------------------------------------ |
| `fit`                 | Product appears consistent with profile          |
| `fit_with_constraint` | Product fits, but profile limits risk/exposure   |
| `needs_clarification` | Cannot conclude yet                              |
| `not_fit`             | Product should not be recommended for this money |

A good fiduciary questionnaire must be capable of producing "we don't think
this product is appropriate for this money" — otherwise it is a conversion
funnel disguised as suitability.

### 4.5 Profile confidence

`profileConfidence = complete | limited | unresolved`

Refusals and unresolved inconsistencies lower it; nuanced outcomes are
allowed — e.g.:

```
coreProductFit    = fit
alphaReadiness    = unavailable
profileConfidence = limited
reason            = LIQUID_CAPACITY_NOT_ESTABLISHED
```

---

## 5. Consistency engine

The SEC specifically highlighted whether an automated adviser addresses
apparently inconsistent questionnaire responses. Explicit rule → flag pairs
(policy-versioned; v1 set):

| Rule                                                     | Flag                             |
| -------------------------------------------------------- | -------------------------------- |
| Horizon < 3 years + very-high risk willingness           | `SHORT_HORIZON_HIGH_WILLINGNESS` |
| Emergency goal + low liquidity concern                   | `GOAL_LIQUIDITY_CONFLICT`        |
| Sell at 10% + choose highest-volatility plan             | `RISK_BEHAVIOR_CONFLICT`         |
| Very low experience + advanced-strategy self-description | `EXPERIENCE_CONFLICT`            |
| Account > 50% liquid wealth + aggressive alpha interest  | `CONCENTRATION_ALPHA_CONFLICT`   |
| No emergency reserve + very high risk willingness        | `CAPACITY_WILLINGNESS_GAP`       |
| Buy-more-after-crash + reconsider-at-10%                 | `INCONSISTENT_LOSS_BEHAVIOR`     |

The user sees a **clarification screen, not a compliance error**:

> **Let's double-check one thing.**
>
> You told us you may need this money within three years, but you're also
> comfortable with large market declines.
>
> A shorter timeline can leave less time for a portfolio to recover.
>
> Which answer would you like to revisit?
>
> **When I need the money** · **How I think about market losses**

After revisiting, the engine recomputes. Both answers' history persists
(immutable versions). Unresolved → `profileConfidence: unresolved` and the
§4.4/§6 gates govern what may proceed.

---

## 6. Customer-facing outcomes

Never `Risk score: 74`. Render:

> ## Your investor profile
>
> **Growth**
>
> ### Your timeline
>
> **Long-term**
> You don't expect to need a meaningful portion of this money for more than
> 10 years.
>
> ### Your financial capacity for market risk
>
> **Moderate**
> Your long timeline supports investment risk, while the amount this account
> represents relative to your liquid savings keeps us from using the highest
> risk level.
>
> ### Your comfort with market movement
>
> **High**
> Your responses indicate you're prepared to remain invested through
> meaningful market declines.
>
> ### Your investing experience
>
> **Experienced**
> You've invested through multiple market environments and have experience
> with stocks and diversified funds.
>
> ## What shaped your profile
>
> Your comfort with investment risk is higher than your financial capacity
> for it. We use the more cautious constraint.

That last sentence is the product's honesty made visible — generated from
the binding constraint's reason code, explainable and auditable.

Where a client may override toward more aggressive than recommended
(**[COUNSEL]** decides whether/how — §20), the caution is plain-language and
the override is itself a receipted, versioned record.

**Not-fit copy:**

> **This money may have a different job.**
>
> Based on your timeline and need to access these funds, a stock-focused
> ReFi strategy may not be the right fit for this money right now.
>
> Your profile can change as your circumstances change.

A not-fit outcome is a saved, versioned, receipted result the user can
revisit — not a dead end.

---

## 7. Risk labels

| Band | Label        |
| ---- | ------------ |
| 1    | Preservation |
| 2    | Conservative |
| 3    | Balanced     |
| 4    | Growth       |
| 5    | High Growth  |

Never "Aggressive", "Speculative", or "Expert" — unnecessary
emotional/status signaling. Internally the numbers and reason codes outrank
the labels (§13).

---

## 8. ICP segmentation — a separate object

Segmentation lives in its own object, never inside the advisory assessment,
and **never overrides the risk engine**.

| Segment                            | What identifies them                                       | ReFi implication                          |
| ---------------------------------- | ---------------------------------------------------------- | ----------------------------------------- |
| Long-Term Builder                  | Long horizon, ordinary experience, disciplined growth goal | Core direct-index/Signal                  |
| Time-Poor Professional             | Strong income/capacity, wants systematic decisions         | Strong ReFi ICP                           |
| Experienced Self-Directed Investor | High knowledge, already manages portfolio                  | Signal + deeper evidence/explanation      |
| Concentrated Equity Holder         | Employer stock / concentrated holdings                     | Strong direct-index/exclusion use case    |
| Quant-Curious Investor             | Interested in system/AI/strategy mechanics                 | Education + Signal                        |
| Alpha Explorer                     | Explicit experimental-strategy interest                    | Alpha readiness branch                    |
| Near-Term Saver                    | Short horizon / high liquidity need                        | Not-fit or alternative future product     |
| Capital-Preservation Investor      | Low capacity or low willingness                            | Likely not fit for current equity product |

---

## 9. Fringe cases — each needs a test fixture

| Fringe case                                          | ReFi behavior                                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| High net worth, 12-month horizon                     | Short horizon still constrains                                                |
| Low net worth, 20-year horizon                       | Don't reject merely for low wealth; assess actual capacity                    |
| Experienced trader, no emergency savings             | Experience does not override capacity                                         |
| Young investor with variable founder income          | Long horizon helps; unstable cash flow constrains                             |
| Retired investor with no salary                      | Income question must not misclassify; retirement assets/income matter         |
| User refuses net-worth answer                        | May continue where possible; confidence reduced; alpha may become unavailable |
| User temporarily unemployed                          | Not automatically unsuitable; evaluate reserves/liquidity                     |
| Very high income + substantial debt                  | Capacity reflects debt/liquidity                                              |
| "Buy more after crash" + "sell at 10%"               | Clarification                                                                 |
| Wants alpha, account > 50% of liquid wealth          | Alpha capacity restriction                                                    |
| Goal changes                                         | New immutable profile version                                                 |
| Multiple financial goals                             | Choose primary goal for this account (goal-specific accounts later)           |
| Employer trading restrictions                        | Capture exclusion/restriction                                                 |
| Entity account                                       | Exit retail flow                                                              |
| Needs emergency funds                                | Product-fit rejection, not a "Conservative" portfolio                         |
| Picks highest risk believing it means better returns | Behavioral inconsistency / education                                          |

---

## 10. Alpha branch

An extension of this profile, not an isolated questionnaire. Trigger:
`productIntent` includes `explore_alpha`. Ordinary direct-index clients
never see experimental-risk questions.

**Alpha screen 1 · `alphaLossImpact`**

> Experimental strategies can lose substantially more than you expect.
> Would losing the full amount you allocate to an experimental strategy
> interfere with your normal expenses or financial obligations?

`yes` · `no` · `unsure`

`yes` → `alphaReadiness = capacity_failed`; the current Signal path may
still allow education/paper exposure where appropriate.

**Alpha screen 2 — exposure policy (no question).** The backend computes
from `liquidNetWorthBand` + `accountShareOfLiquidAssets` + current
reconciled account value and returns:

```
alphaPolicyVersion
alphaExposureGuidance
alphaEligibilityStatus
alphaReasonCodes[]
```

The frontend **never contains** `0.02` or `2%` as policy logic — the
principle the superseded design correctly established.

**Alpha screen 3 — disclosure (separate record).** Draft copy
(**[COUNSEL]** writes the final text):

> **Before joining the alpha**
>
> Alpha features are experimental. Performance may differ materially from
> simulations, historical tests or expectations. Models, market conditions
> and infrastructure may behave unexpectedly.

The questionnaire records **financial suitability facts**; the disclosure
system records **informed acknowledgment**. Different functions, different
records — never merged.

**Signal-only boundary (current frozen interpretation):** alpha capacity is
**informational / eligibility / segmentation — not execution authority**.
The profile may say:

> Based on the information you've provided, we suggest keeping any future
> experimental allocation limited relative to your liquid investments.

It must not imply ReFi is currently executing that capital. That
distinction stands until the Managed/execution architecture is explicitly
authorized (D-LAUNCH-06, Managed gates).

---

## 11. Refusal policy

Not everything is mandatory; sensitive questions offer **Prefer not to
answer** rather than forcing fake answers. Classification:

| Type                  | Example               | Refusal effect                                   |
| --------------------- | --------------------- | ------------------------------------------------ |
| Essential             | goal, horizon         | Cannot personalize                               |
| Important             | liquid asset share    | Lower confidence / restrict certain outcomes     |
| Product-specific      | employer restrictions | May assume none only after explicit confirmation |
| Optional segmentation | product intent        | No compliance impact                             |

Consequences shown honestly:

> We can continue without this answer, but we may not be able to determine
> whether experimental strategies are appropriate for your situation.

---

## 12. Data architecture

Three persisted objects; answers, derived assessment, and consent are never
merged.

```
InvestorProfileAnswers                 // raw facts and answers; immutable versions
  questionnaireVersion
  goal, horizon, withdrawalPattern
  incomeBand, incomeStability
  netWorthBand, liquidNetWorthBand
  accountShareOfLiquidAssets, emergencyReserveBand, debtSignal
  liquidityLikelihood
  knowledgeLevel, experienceYears, productExperience[]
  drawdownBehavior, lossThreshold
  growthProtectionPreference, riskTradeoffChoice
  restrictions[], expectedFinancialChange
  productIntent[]

InvestorProfileAssessment              // derived, deterministic
  assessmentPolicyVersion
  riskCapacityBand, riskWillingnessBand, permittedRiskBand
  knowledgeBand
  productFitStatus, alphaReadiness
  profileConfidence
  constraintReasonCodes[], consistencyFlags[]
  assessedAt

AdvisoryConsentRecord                  // disclosures out of the questionnaire snapshot
  documentId, documentVersion, contentHash
  acknowledgedAt, profileVersion
```

### 12.1 Version provenance — every assessment reproducible

Persist with every assessment:

```
profileVersion · questionnaireVersion · assessmentPolicyVersion
answerSnapshotHash · result · reasonCodes · timestamp
```

When the policy engine changes, ReFi must be able to answer both "what
would policy v3 have concluded?" and "what did policy v2 actually conclude
at the time?" — and **never retroactively rewrite the historical profile**.
The existing immutable-snapshot machinery already supports exactly this,
and the SEC's robo-adviser guidance specifically calls attention to
explaining how client information is used to generate advice and when it
should be updated.

---

## 13. Reason-code architecture

Never store only `risk = GROWTH`. Store:

```
risk = GROWTH
constraints:        LONG_HORIZON · MODERATE_LIQUID_CAPACITY · HIGH_MARKET_WILLINGNESS
bindingConstraint:  LIQUID_CAPACITY
```

Code families (closed, versioned vocabulary):

```
HORIZON_* · LIQUIDITY_* · CAPACITY_* · INCOME_* · CONCENTRATION_* ·
EXPERIENCE_* · WILLINGNESS_* · CONSISTENCY_* · RESTRICTION_* ·
PRODUCT_FIT_* · ALPHA_* · PROFILE_CONFIDENCE_*
```

Invaluable for audit, customer explanation, compliance review, debugging,
analytics, model changes, and support.

---

## 14. Analytics

Business analytics stay separate from the advisory record. Events (no
detailed financial answers into PostHog or any general analytics — bands
and states only where explicitly reviewed):

```
profile_started
profile_section_completed
profile_question_skipped
profile_why_we_ask_opened
profile_conflict_triggered
profile_conflict_resolved
profile_completed
product_fit_not_fit
alpha_branch_entered
profile_abandoned
```

Avoid telemetry like `netWorthBand = 5m_plus` or `debt = significant`
unless there is an explicitly reviewed need and privacy design. (The
POSTHOG-CSP launch-backlog decision still governs whether analytics ships
in the production artifact at all.)

---

## 15. Profile refresh

Not one-and-done. Annual:

> ## Still accurate?
>
> Has anything important changed since you last updated your investor
> profile?

Show current facts, then **Everything still looks right** or **Something
changed**.

Event-driven refresh triggers: significant changes to goal · horizon ·
withdrawal behavior · liquidity · financial capacity · account
concentration · requested product · alpha enrollment · restrictions.

Each refresh writes a new immutable profile version.

---

## 16. UX specification (mandatory)

One principal question per screen. Section progress, never raw question
count (branching makes "Question 13 of 22" misleading):

```
● Goal   ● Timeline   ● Finances   ○ Experience   ○ Risk   ○ Review
```

| UX rule               | ReFi requirement                                               |
| --------------------- | -------------------------------------------------------------- |
| Autosave              | Every answered screen                                          |
| Back                  | Always available without losing answers                        |
| Resume                | Allow later completion                                         |
| Mobile-first          | Primary design target                                          |
| No preselection       | Especially risk answers                                        |
| Clear ranges          | Avoid free-form financial amounts; no sliders for dollar bands |
| Why-we-ask            | Available beside sensitive questions                           |
| Definitions           | Inline, not legal-footnote dependent                           |
| Accessibility         | WCAG 2.2 AA target; full keyboard/screen-reader support        |
| Tap targets           | Large card-based controls                                      |
| Review screen         | Full editable summary before submission                        |
| No dark patterns      | No pressure toward aggressive answers                          |
| Neutral colors        | Higher risk is never "green/better"                            |
| No countdown          | No urgency                                                     |
| No gamified score     | No "you unlocked aggressive investing"                         |
| Error recovery        | Explain what is missing instead of wiping state                |
| No hidden disclosures | No lengthy disclosure text inside questionnaire screens        |

---

## 17. Brand voice

**Smart · Human · Precise · Calm · A little conversational — never cute
about loss.**

| Instead of                                  | Use                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------- |
| Please provide your liquidity requirements. | **How likely are you to need money from this account unexpectedly?** |
| Select investment objective.                | **What is the main job of this money?**                              |
| Risk tolerance inconsistent.                | **Let's double-check one thing.**                                    |
| You are unsuitable.                         | **This money may have a different job.**                             |
| High Risk Investor                          | **Growth**                                                           |

All copy passes the `pnpm scan-copy` blocked-terms gate (no "guaranteed
return", "risk-free", approval/operator language).

---

## 18. Testing invariants (property-level, not merely UI tests)

| Invariant                                                                     |
| ----------------------------------------------------------------------------- |
| `permittedRisk <= riskCapacity`                                               |
| `permittedRisk <= riskWillingness`                                            |
| Marketing/ICP segment can never increase permitted risk                       |
| Experience can never override a capacity constraint                           |
| Missing essential profile data cannot produce a personalized recommendation   |
| `not_fit` cannot be converted to `fit` by choosing higher-risk answers        |
| Alpha readiness cannot override core capacity constraints                     |
| Contradictory responses generate a consistency flag                           |
| Changing an answer generates a new immutable profile version                  |
| Assessment policy version is always persisted                                 |
| Frontend cannot own alpha percentage policy                                   |
| Signal-only launch cannot turn profile output into executable trade authority |

These are mechanically tested (the repo's property-based invariant pattern
— `account-prefs-invariants.test.ts` — is the template).

---

## 19. Migration from today's seven-field profile

| Existing         | New treatment                                                                                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `goal`           | Keep, convert to enum                                                                                                                                                                                                                                   |
| `horizon`        | Keep, convert to enum                                                                                                                                                                                                                                   |
| `incomeBand`     | Keep                                                                                                                                                                                                                                                    |
| `liquidityNeed`  | Replace with liquidity likelihood + withdrawal pattern                                                                                                                                                                                                  |
| `riskTolerance`  | **Remove as direct input; make derived**                                                                                                                                                                                                                |
| `experience`     | Split into knowledge + years + product experience                                                                                                                                                                                                       |
| `accountPurpose` | Merge conceptually with goal/product intent where appropriate                                                                                                                                                                                           |
| `restrictions`   | Convert free text into structured restrictions + conditional detail                                                                                                                                                                                     |
| —                | Add: income stability · net-worth band · liquid-net-worth band · account share of liquid assets · emergency reserve · debt signal · multiple behavioral-risk responses · consistency flags · product-fit outcome · profile confidence · alpha readiness |

Existing snapshots are retained unchanged (immutability is the point); new
versions write under `questionnaireVersion: 2`; existing users flow through
v2 on next sign-in after launch — their first §15 refresh. Until v2 ships,
`POST /api/v1/investor/profile` remains the live surface (any route/method
change goes through the CM-04 manifest review).

---

## 20. Counsel / CCO sign-off register

The SEC does not prescribe a specific 20-question survey; the duty is
principles-based. These decisions are therefore **not** silently decided by
product or engineering:

| #   | Decision                                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Which answers are required before personalized advice                                                                                                                                                                                                                                                   |
| 2   | Product-fit exclusion rules                                                                                                                                                                                                                                                                             |
| 3   | Risk-capacity policy (weights + hard constraints)                                                                                                                                                                                                                                                       |
| 4   | Risk-willingness mapping (ordinal values, plan-card figures)                                                                                                                                                                                                                                            |
| 5   | Inconsistency handling                                                                                                                                                                                                                                                                                  |
| 6   | Profile-refresh frequency                                                                                                                                                                                                                                                                               |
| 7   | Whether/how a client can override ReFi's recommended risk level                                                                                                                                                                                                                                         |
| 8   | Documentation of override                                                                                                                                                                                                                                                                               |
| 9   | Alpha financial-capacity policy                                                                                                                                                                                                                                                                         |
| 10  | Alpha disclosure language                                                                                                                                                                                                                                                                               |
| 11  | CRS / ADV / advisory-agreement sequencing (the state-machine gate)                                                                                                                                                                                                                                      |
| 12  | How refusals / incomplete answers are treated                                                                                                                                                                                                                                                           |
| 13  | Records-retention requirements                                                                                                                                                                                                                                                                          |
| 14  | Exact wording defining liquid net worth                                                                                                                                                                                                                                                                 |
| 15  | Whether direct-index restrictions create additional suitability obligations                                                                                                                                                                                                                             |
| 16  | Draft retention/expiry: abandoned server-side questionnaire drafts hold banded financial-profile information indefinitely if never submitted — counsel/privacy set the retention period and deletion trigger (recorded at PR #65 round-2 review rather than silently choosing a long retention in code) |

Rule 203A-2(e) is principally about qualifying as an internet investment
adviser for SEC registration; it does not replace the underlying fiduciary,
disclosure, privacy and compliance obligations.

---

## 21. Implementation slices (after spec approval)

1. **Schema + engine:** the three §12 objects, deterministic policy engine
   under `assessmentPolicyVersion`, all §18 invariants as property-based
   tests, §9 fringe cases as fixtures.
2. **Questionnaire UI:** screens 0–22 with branching, autosave, resume,
   review screen, WCAG 2.2 AA; e2e coverage for entity exit, branch,
   clarification, and not-fit paths.
3. **Result + review screens** with reason-code-driven explanations —
   stopping mechanically BEFORE personalized advice pending the §20 #11
   counsel gate.
4. **Alpha branch** (screens 1–3, backend policy render, disclosure gate) —
   execution authority stays behind D-LAUNCH-06 and Managed gates.
5. **Refresh machinery** (annual + event triggers).

Slices 1–3 are valid under every reading of the September launch. Nothing
here changes the Signal no-execution boundary.

## 22. References

- SEC, Commission Interpretation Regarding Standard of Conduct for
  Investment Advisers (IA-5248, 2019).
- SEC IM Guidance Update 2017-02, "Robo-Advisers", and the 2017 staff
  guidance / investor bulletin (press release 2017-52).
- SEC, Form CRS Relationship Summary; Amendments to Form ADV (small-entity
  compliance guide).
- SEC, amendments to Regulation S-P (press release 2024-58).
- SEC, Exemption for Certain Investment Advisers Operating Through the
  Internet (S7-13-23, amended 203A-2(e), 2024).
- Betterment, "How Betterment manages risk"; Wealthfront risk-score
  methodology support articles and blog; Vanguard Digital Advisor
  methodology; Schwab Intelligent Portfolios risk documentation; CIRO
  suitability questionnaire methodology.
