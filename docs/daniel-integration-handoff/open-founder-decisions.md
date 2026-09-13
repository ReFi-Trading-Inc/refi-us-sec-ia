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

### Standing correction

`README.md` (lines 68–69) currently states _"trial duration is configurable with
a three-month default for Paper and live"_ while also saying billing rules need
finalization. That three-month default is **not** a recorded decision — it
predates the confirmed lifecycle. Until **F-G3/F-G4** are answered the README
should not assert a default. Correcting it is queued as a docs change and is
deliberately **not** done unilaterally, because removing a stated default is
itself a product statement.

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
