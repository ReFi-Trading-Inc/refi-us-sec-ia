<!-- Tracked canonical copy, committed 2026-08-22. Originated as a session working paper; this file is now the authoritative version. -->

# September 13 Release Candidate Contract — PROVISIONAL

> **STATUS: PROVISIONAL — NOT YET IMPLEMENTATION AUTHORITY.** Drafted 2026-08-22
> against two of Daniel's governing documents (`arch_migration_overview.md`,
> `exec_overview_v2.md`). The remaining governing checklists and numbered
> specifications have **not** been received. Every clause marked
> **[UNRESOLVED]** is a placeholder for those files or Daniel's direct answer —
> not a decision we have made. Daniel's migration architecture remains the north
> star; this document is the short-term execution authority.

## Milestone definition

> **September 13, 2026 — Client-Onboarding-Ready Signal Release Candidate**
>
> ReFi Signal is technically complete enough to onboard advisory clients **once**
> securities counsel and the applicable registration/compliance process
> authorize that step. **No advisory clients are onboarded merely because the
> release candidate exists.**

September 13 is an **engineering** milestone, not a client-activation date.
Registration effectiveness, Form ADV/CRS completion, executed advisory
agreements, and counsel sign-off are **PRE-CLIENT-ONBOARDING GATES (Gate B)** —
they are not prerequisites to producing the September 13 artifact. What the
artifact must provide is the technical hooks and evidence counsel needs in order
to evaluate them against a real product rather than a mockup.

**Target:** September 13, 2026 release candidate (freeze September 12)
**Product boundary:** Signal only
**Initial product:** U.S. long-only, unlevered direct index intended to follow the S&P 500, measured against SPY
**Initial broker:** Alpaca
**Custody:** investor assets remain at the broker; the platform is non-custodial
**Managed execution:** explicitly outside this release

---

## 1. What a launch user CAN do

1. Establish an email-first identity and an authenticated session.
2. Complete eligibility, KYC, advisory profile, disclosures, and consents.
3. Connect an Alpaca brokerage account for the account information advice requires.
4. Join the single launch product — the ReFi direct-index product.
5. Set the four supported preferences: `driftThreshold`, `minOrder`, `excludedAssets`, `fractionalEnabled`.
6. Receive an immutable, account-specific **Signal recommendation**.
7. View a recommendation summary: account value, target coverage, direct/proxy/unavailable exposure, exclusions, residual cash, expected turnover, tracking difference, freshness/status, and exact portfolio / membership / valuation lineage.
8. Drill into constituent-level **legs**: current value, desired value, delta, explanatory outcome.
9. Change preferences and receive **new** advice — prior advice is preserved, never mutated.
10. View disclosures, consent and action receipts, and retained records.

Grounding: `exec_overview_v2.md` §7.4 defines exactly this output — desired account value, current value, raw and rounded delta, post-recommendation position, explanatory outcome, holdings that left the target, below-threshold decisions, exclusions, unavailable assets, residual cash, coverage, expected turnover, tracking difference — with `AccountRecommendation` and child legs **immutable and deterministic for their economic inputs**.

## 2. What a launch user CANNOT do

No investor-accessible capability to: place or submit an order · approve a recommendation for execution · create an executable account intent · activate Managed mode · pause/resume Managed · change reduce-only controls · liquidate · resolve an exception into a broker action · reach Admin Portal or operator routes · access broker credentials · cause a broker mutation through any hidden, unused, or undocumented route.

This is **structural, not a UI promise.** `arch_migration_overview.md` §17: _"Deferral means the associated route, publisher, subscription, scheduler, permission, credential, or configuration is absent or disabled. A reachable but supposedly unused feature is not safely deferred."_ §14 adds that the absence of an execution path is _"a structural property of deployment and IAM, not a product promise enforced only by a frontend flag."_

## 3. What must be REAL (not fixtures)

```text
credible/canonical index state
  -> active direct-index portfolio target
  -> real reconciled Alpaca account valuation
  -> current investor preferences + authorization
  -> current prices / actionability
  -> real account recommendation
  -> Investor API -> BFF -> frontend
```

**The backend-produced recommendation is on the critical path.** The redesigned recommendation screen is not the constraint; the chain that feeds it is. This is Daniel's Signal Dev Release 1 end-to-end behaviour (§14) and it spans his checklists 01–05.

## 4. What MAY remain manual

Rule: **compromise automation, not truth.**

Operator-initiated is acceptable where the resulting state is durable, versioned, attributable, and reproducible — candidates: source reconciliation, canonical membership promotion, portfolio construction, portfolio activation, recommendation regeneration.

Never fabricated by hand: account holdings · portfolio weights · recommendation economics · leg deltas · authorization status · freshness · tracking metrics · audit lineage.

**[UNRESOLVED — D-LAUNCH-03]** Which of the first list Daniel accepts as operator-initiated for a bounded alpha.

## 5. Structural Signal boundary for the artifact

```text
PRESENT                          ABSENT OR HARD-DISABLED
identity / session               Managed promoter
eligibility / KYC                executable intent creation
disclosures / consent            risk -> execution handoff
account                          order-write endpoints
product membership               execution-policy mutations
preferences                      Managed pause/resume/reduce-only
valuation                        broker-write credentials
recommendations + legs           execution publishers/subscriptions
records / receipts               broker mutation capability
account event stream
```

This is stronger than gating existing Managed endpoints behind `REFI_RELEASE_STAGE=signal`. A runtime refusal leaves the route reachable; §17 requires it absent or disabled.

## 6. Acceptance — two gates

### Gate A — September 13 technical acceptance (engineering)

- [ ] end-to-end Signal product works
- [ ] the real backend recommendation path can be integrated and tested
- [ ] onboarding flow exists
- [ ] disclosure and consent **machinery** exists and is exercisable — registry,
      versioning, `contentHash`, acknowledgment, re-acknowledgment. Placeholder
      document _content_ is acceptable at Gate A; the mechanism is not.
- [ ] the no-execution boundary is **structurally** proven
- [ ] production-artifact E2E runs in CI
- [ ] records and audit evidence are reconstructable
- [ ] cross-account access is mechanically blocked
- [ ] legs reconcile mathematically to the summary
- [ ] exclusions and unavailable assets stay explicit — never silently redistributed
- [ ] a preference change creates new advice and preserves prior advice
- [ ] stale/expired state is backend-owned, never silently treated as current
- [ ] no deployed Signal identity holds broker-write authority
- [ ] **counsel can review the actual product rather than mockups or speculation**
- [ ] the artifact reviewed is the exact artifact that passed the gates

### Gate B — pre-client-onboarding (legal / compliance)

- [ ] securities counsel approves the implemented advisory flow
- [ ] registration posture confirmed and effective as applicable
- [ ] Form ADV 2A, Form CRS, advisory agreement, privacy notice, e-delivery
      consent, and fee schedule finalized as applicable
- [ ] source, benchmark, and naming licensing cleared
- [ ] any further compliance conditions satisfied
- [ ] **only then are real advisory clients admitted**

All six disclosure documents are `status: "pending"` on `main` today. Under this
split that is correct for Gate A and blocking for Gate B.

## 7. Explicitly deferred

Managed paper · live Managed · investor order submission · execution-policy UI · investor liquidation · multi-broker · tax-loss harvesting and tax claims · custom/equal weighting and periodic rebalancing · international markets, FX, local calendars · SIWE/wallet-first identity · ML/RL/RF/D-CQL strategy infrastructure · destructive deletion of the legacy backend.

Consistent with `arch_migration_overview.md` §17.

---

## 8. UNRESOLVED — decisions only Daniel can close

**D-LAUNCH-00 — SEC Rule 203A-2(e) alignment.** Confirmation required from
Daniel and ultimately securities counsel that: the Signal-only direct-index
product fits the intended Internet Adviser path; personalized advice is
generated and delivered **through the interactive software platform**; any
operator-driven alpha process is system administration rather than a human
determining or communicating investment advice to an investor; and the client
experience satisfies whatever operational-client requirements counsel
determines apply. This is the question that decides how "manual" may be read in
§4 — it is not merely a launch-readiness checkbox.

**D-LAUNCH-01 — release classification.** `exec_overview_v2.md` §13 numbers promotion: 1 Signal Dev Release 1 → 2 Managed paper → 3 Staging → 4 Production Signal alpha → 5 Live Managed. Reframed by the milestone definition above: September 13 targets a **release
candidate**, not advisory-client activation, so the apparent conflict with
step 2 may dissolve. The question for Daniel becomes: _does treating September 13
as a client-onboarding-ready release candidate remove the §13 sequencing
conflict, or do you still regard Managed-paper completion as a prerequisite even
for calling the Signal product technically release-ready?_ Do not infer it.

**D-LAUNCH-02 — environment and hostname.** §13 keeps `refinity-dev` the sole active backend environment; §14 provisions staging only after Dev is reproducible and cost/ownership are approved. What serves external September users?

**D-LAUNCH-03 — manual alpha operations.** See §4.

**D-LAUNCH-04 — frontend connection contract.** Authoritative schemas and routes for: approved products/templates · membership · recommendation summary · paged recommendation legs · records · event stream · valuation and freshness fields. Needed before any schema is frozen in code.

**D-LAUNCH-05 — source and naming rights.** Which sources are approved for commercial canonical membership and weights, and what use of "S&P 500" and benchmark data is approved. The documents treat source provenance, permitted use, and licensing as release requirements — this must not surface on September 12.

---

## 9. Known repository gap against this contract

`main` carries **15 reachable Managed/execution surfaces** — 10 API routes, 5 pages (inventory in the companion impact report). Under §17 these require structural removal or hard disablement, not navigation hiding. This is the largest net-new workstream the contract implies and the most likely target of an external audit.

> **STATE CORRECTION (2026-08-22): the fixed count above is superseded.** The
> C0 capability audit proved this inventory materially incomplete — it counted
> BFF routes and pages while missing the browser-direct `apiFetch` surface
> entirely (~25 external endpoints bypassing every server in this repository),
> and one closure slice (#49) has since merged. No replacement fixed total is
> stated here, deliberately: the current inventory is
> [`c0-capability-audit.md`](c0-capability-audit.md) and the live state is
> [`open-items.md`](open-items.md).
