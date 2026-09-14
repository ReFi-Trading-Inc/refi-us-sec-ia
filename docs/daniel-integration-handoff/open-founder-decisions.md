# Open founder decisions

Business, product and compliance policy requiring founder authority.

**Rule:** engineering does not choose these. Stripe may progress
architecturally, but every row below is `BLOCKED — FOUNDER DECISION REQUIRED`
until answered, and **Stripe's own defaults are not ReFi policy**.

**Do not mix backend contract questions into this file** — those live in
`open-daniel-decisions.md`.

Status vocabulary: `OPEN` · `ANSWERED` · `SUPERSEDED`.

---

## Commercial policy (Lane G)

These gate the _implementation_ of `CommercialEntitlement`. The provider-neutral
architecture can be specified without them; the runtime cannot be built without
them, because each one changes what the entitlement state machine must express.

| ID        | Question                                                                                                | Status | Why it blocks code                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| **F-G1**  | Plans and prices — how many plans, what does each cost?                                                 | `OPEN` | Determines the plan reference on the entitlement and whether plan identity must be modelled at all |
| **F-G2**  | Monthly, annual, or both?                                                                               | `OPEN` | Determines whether the model needs an interval and renewal anchor                                  |
| **F-G3**  | Is there a trial?                                                                                       | `OPEN` | Determines whether `TRIALING` exists as a state                                                    |
| **F-G4**  | If so, trial **duration**, and what **starts** it — checkout, admission, or first brokerage connection? | `OPEN` | Trial start is not a Stripe concept if it is anchored to admission; it changes who owns the clock  |
| **F-G5**  | Is there a grace period after a failed payment, and how long?                                           | `OPEN` | Determines whether `PAST_DUE` is distinct from `SUSPENDED` and how long automation continues       |
| **F-G6**  | Cancellation — effective at period end, or immediately?                                                 | `OPEN` | Determines whether entitlement expiry is scheduled or instant                                      |
| **F-G7**  | Refund policy                                                                                           | `OPEN` | Determines whether a refund retroactively changes entitlement                                      |
| **F-G8**  | Proration on upgrade/downgrade                                                                          | `OPEN` | Determines whether mid-period plan changes re-derive entitlement                                   |
| **F-G9**  | Promotional codes — supported at launch?                                                                | `OPEN` | Determines whether discount state must be projected                                                |
| **F-G10** | Which plans permit Alpha participation?                                                                 | `OPEN` | Directly feeds `MAY_AUTOMATE_PAPER_TRADING` (D-A5). **Highest priority of this group.**            |

### Locked decisions — 2026-09-13

#### F-G10 · `ANSWERED`

> Closed Alpha participation is free / invite-and-admission gated, not
> commercial-plan gated. All admitted Alpha members may access paper trading.
> Paper automation is a separate capability entitlement and must not be
> inferred solely from plan.

Alpha participation is **not subscription-plan gated**. Commercial plan
selection must never stand in for admission, eligibility, consents, brokerage
state or operational holds.

```text
MAY_PARTICIPATE_IN_ALPHA =
    CLOSED_ALPHA_MEMBERSHIP_ACTIVE
  + ADMISSION_STATE = ADMITTED
  + REQUIRED_CONSENTS_CURRENT
  + NO_BLOCKING_HOLD

MAY_AUTOMATE_PAPER_TRADING =
    MAY_PARTICIPATE_IN_ALPHA
  + PAPER_AUTOMATION_ENTITLEMENT
  + REQUIRED_TRADING_CONTROLS_SATISFIED
```

**`plan == PRO` (or similar) is never the authorization rule during Alpha.**
Automation may become plan-sensitive once commercial plans go live — a
recommendation-only product would not get automated execution where a Managed
product would — but that is a commercial entitlement layered **on top of**
regulatory and operational eligibility, never a substitute for it.

#### F-G3 · `ANSWERED`

> No commercial free trial. Closed Alpha is the free evaluation environment.
> Do not implement `TRIALING` in the entitlement model.

The Alpha **is** the evaluation period. A billing trial would create two
overlapping clocks — Alpha membership/expiry and trial/expiry — for no gain in
customer experience, and would drag in free-to-paid conversion mechanics that
attract specific regulatory attention around material terms, informed consent
and cancellation.

Entitlement states distinguish:

```text
ALPHA_ACCESS
ACTIVE_SUBSCRIPTION
PAST_DUE
CANCELED
```

and deliberately **not** `TRIALING`.

#### F-G4 · `ANSWERED`

> N/A. No trial exists. If introduced later, trial begins only on explicit
> subscription activation/checkout; never on admission, KYC, or brokerage
> connection.

Do not create a dormant trial clock "just in case." Admission, KYC approval and
brokerage connection are operational and compliance events — **billing owns the
billing clock**. Any future trial runs:

```text
explicit checkout → subscription created → trial_start → trial_end
→ explicit disclosed conversion/cancellation
```

never `ADMITTED → silently start billing trial`.

---

## Product access layers

The three decisions above establish a layering in which **no layer may
impersonate another**. This is the authority model the entitlement
implementation must express.

```text
PUBLIC GAME                 no KYC · no subscription · anonymous permitted
        ↓
REFI COMMUNITY IDENTITY     handle · leaderboard · profile · challenges
        ↓
CLOSED ALPHA                membership + admission · still no paid plan
        ↓
PAPER AUTOMATION            separate capability entitlement
                            + broker operational requirements
        ↓
COMMERCIAL REFI             subscription · formal product eligibility
```

Read as authority:

```text
MEMBERSHIP    Are you part of the closed Alpha?
ADMISSION     Are you allowed into the product?
CAPABILITIES  What may you do?
BROKER STATE  What can actually operate?
BILLING       What commercial product are you paying for?
```

The engineering consequence, and the reason this sits in the handoff package:
**a Stripe state must never become a compliance authorization state.** Public
game and community participation require neither subscription nor admission,
so neither may be gated on billing.

### Standing correction

`README.md` (lines 68–69) currently states _"trial duration is configurable with
a three-month default for Paper and live"_ while also saying billing rules need
finalization. That three-month default is **not** a recorded decision — it
predates the confirmed lifecycle. **F-G3 is now answered: there is no trial.** The README's three-month default
is therefore not merely unrecorded, it is **contradicted** by a locked
decision, and must be removed. Queued as a separate docs change so the
correction is reviewable on its own rather than buried here.

### Invariants already decided — do not re-open

These are settled and constrain any answer above:

- commercial entitlement expiry **may stop automated trading**;
- it must **not** block sign-in, erase history, close the brokerage account, or
  liquidate holdings;
- **no auto-liquidation**, ever;
- payment ≠ admission, payment ≠ AccountAuthorization, payment ≠ trading
  permission.

---

## Risk and compliance policy (Lane B)

| ID       | Question                                                                                                            | Status | Why it blocks                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| **F-B1** | When the assessment rule version changes, do existing results become stale, remain valid, or require re-evaluation? | `OPEN` | Determines whether a stored result can outlive its rule version. Needs compliance input, not an engineering default |
| **F-B2** | Retention for questionnaire answer snapshots                                                                        | `OPEN` | `LEGAL / COMPLIANCE DECISION REQUIRED` — we will not invent a retention period                                      |

---

## Contract and product surface (Lanes F, H) — raised and ANSWERED 2026-09-13

Evidence: `lane-f-alpha4-audit.md`, `lane-h-alpha4-audit.md`. All four answered
by the founder on 2026-09-13; recorded verbatim.

| ID       | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Status     | Consequence                                                                                                                                                                                                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F-F1** | `F-F1 — ANSWERED 2026-09-13: Closed Alpha is PAPER ONLY. LIVE remains disabled and unrepresentable at the Alpha frontend boundary.` The frontend rejects `account_environment = live`, AK/live credential forms, LIVE strategy activation and LIVE automation, even though alpha.4's generic contract can represent `paper \| live`. The contract's ability to represent LIVE is not product permission. **Closes D-LAUNCH-07 for the current Alpha policy.**                                                                                                    | `ANSWERED` | Read-path consequence (Lane F F-2): a LIVE connection unexpectedly returned by the backend is not an operable Alpha brokerage connection — surface a safe unsupported/held state, expose no LIVE economic actions, preserve the evidence for investigation, never delete backend history because its environment is LIVE. |
| **F-H1** | `F-H1 — ANSWERED 2026-09-13: render the contracted persistent funding notice for INSUFFICIENT funding in Alpha.` Smallest faithful UI using only contracted alpha.4 fields: the required/available funding figures and limiting constituents the contract supplies, with neutral explanatory copy. Never "guaranteed funding", "guaranteed execution", "approved to trade", or suitability inferred from funding. Funding sufficiency is informational precondition evidence, not trading authorization.                                                         | `ANSWERED` | H-PR4 unblocked.                                                                                                                                                                                                                                                                                                          |
| **F-H2** | `F-H2 — ANSWERED 2026-09-13: alpha.4 BFF allocation/subscription operations are canonical; P1 product surfaces converge onto that transport and are not a separate authority.` One transaction model: alpha.4 Investor API → BFF allocation/subscription operations → backend authoritative state. `SubscriptionPanel` / `/us/product/*` is a temporary UX/adapter surface. Browser percentage presentation → exact base-10 conversion → canonical decimal fraction → alpha.4 request; never float `/100`; never two independently persisted allocation systems. | `ANSWERED` | The future transport adapter targets the alpha.4 allocation routes only.                                                                                                                                                                                                                                                  |
| **F-H3** | `F-H3 — ANSWERED 2026-09-13: remove unsupported Last evaluated and Freshness policy fields; do not relabel other fields as substitutes.` `updated_at → "Last evaluated"` and `lineage.policy_version → "Freshness policy"` would be semantic inventions. `Updated` or policy provenance may be shown later under honest labels if product value warrants; evaluation/freshness-policy fields return only when contracted (D-A8a).                                                                                                                                | `ANSWERED` | H-PR1 unblocked.                                                                                                                                                                                                                                                                                                          |

### F-H2 follow-up decisions — ANSWERED 2026-09-14

Four items the convergence inventory could not settle as engineering choices.

| Item                            | Decision                                                                                                                                                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Strategy identity**           | Pin **one** backend-owned template id for Closed Alpha, sourced from configuration or backend authority; read its name and metadata through `getTemplate`. Do not hardcode `fixture-strategy-core`, and do not expose a strategy catalog yet.  |
| **Allocation unit**             | The investor-facing control stays a **percentage**; the canonical value is a decimal **fraction string**, converted with exact base-10 string arithmetic (`25` → `"0.25"`). Matches the contract without making investors reason in fractions. |
| **Allocation limits**           | alpha.4 exposes no usable min/max/step. Limits are backend-owned, so **delete** the invented 5% / 50% / 1% rules and rely on the backend preview and feasibility verdict. Ask Daniel to expose explicit bounds later if the UI needs them.     |
| **`allocation_percent` naming** | Keep the field name for compatibility. Ask Daniel to **document** that it holds a decimal fraction in (0, 1], not percentage points. No breaking rename.                                                                                       |

Consequence: the points↔fraction crossing is permanent, so exactness is a
standing requirement rather than a migration concern. `percentToFraction` is
the contract-asserted inverse of `fractionToPercent`, pinned by
`allocation-units.test.ts`.

---

Also recorded 2026-09-13: **`allUsers` Cloud Run invoker on the connected-dev
frontend** — `FOUNDER ACCEPTED — PUBLIC FRONTEND NETWORK ENTRY, APPLICATION AUTH
REQUIRED`; authorizes neither backend invocation nor trading
(`connected-dev-inventory.md` §3).

---

## Production activation (separate from handoff readiness)

Recorded so it is not confused with certification. Successful Daniel handoff
does **not** authorize any of these; each needs its own founder approval:

- Production Socure activation;
- real Stripe charging;
- real investor onboarding;
- Alpaca production brokerage operations;
- LIVE automated execution.

---

## How to answer

Short answers against the IDs are sufficient. F-G10 and F-G3/F-G4 unblock the
most downstream work. Answers are recorded here with status `ANSWERED` and the
date, then drive the Lane G implementation PR.
