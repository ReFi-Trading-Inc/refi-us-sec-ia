# D-LAUNCH-06 closure and execution-scope rebaseline — 2026-09-04

**Status:** governance / reconciliation slice. No execution, brokerage-connection,
allocation-preview, or account-action code is implemented by this change.
Implementation waits until this rebaseline is reviewed and merged.

## 0. The decision

**D-LAUNCH-06 — CLOSED 2026-09-04 — YES, by Zeshan.**

Exact previous wording (open-items register, 2026-08-24, CRITICAL):

> Launch-definition conflict: Daniel's verbal response describes an
> execution-capable alpha (live funds, "last x trades sent on their behalf",
> "managed fund following portfolio") while his own checklists and the Ship
> Contract define September 13 as Signal-only Dev Release 1 with no order
> effect. One written yes/no closes it: _does the September 13 artifact submit
> orders to any broker account (paper or live) on a user's behalf?_

Exact meaning of the closure:

> **The September artifact may submit orders to Alpaca on the investor's behalf,
> through the authoritative backend lifecycle, for investors who have been
> admitted to the closed Alpha by a ReFi human.**

What the closure does **not** decide:

- whether September acceptance uses Alpaca **paper**, **live**, or both — a
  separate exact decision, recorded below as **D-LAUNCH-07 (OPEN)**;
- any frontend order authority (see §3);
- any change to the 2026-09-04 product model: PUBLIC APPLICATION → AUTOMATED
  SCREENING → KYC / IDENTITY → INTERNAL REFI HUMAN APPROVAL → CLOSED ALPHA
  ADMISSION. Human approval remains mandatory; D-LAUNCH-06 = YES does not let
  an applicant self-admit.

Recorded in `docs/decisions/DECISION_LOG.md` as D-022 (closure) and D-023
(Alpaca environment, OPEN). Daniel's historical documents (`exec_overview_v2`,
`arch_migration_overview`, his checklists) are **not** rewritten; this document
records where our derived documents relied on the superseded reading.

## 1. Statements whose truth depended on the old reading

| Document                                                                                                                                                                                                                                                                     | Statement                                                                                                                                                                                                                                                                                                                                                                                                       | Disposition                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SHIP_CONTRACT.md` — Milestone definition                                                                                                                                                                                                                                    | "September 13, 2026 is a Signal Dev Release 1 Candidate … It is NOT … Managed paper, live Managed"                                                                                                                                                                                                                                                                                                              | **SUPERSEDED as milestone framing.** Amendment 1 added at the top of the Ship Contract; body kept verbatim as the historical record                                                                                                  |
| `SHIP_CONTRACT.md` — Required vertical slice                                                                                                                                                                                                                                 | "The release includes no paper or live order effect. The absence of an execution path is a structural property of deployment and IAM"                                                                                                                                                                                                                                                                           | **SUPERSEDED** for the artifact. Retained as a _frontend_ property: the frontend/BFF deployment still holds no execution path or broker-write credential (§3)                                                                        |
| `SHIP_CONTRACT.md` — Required September safety properties                                                                                                                                                                                                                    | "no executable AccountIntent · no Managed promotion · no execution-policy investor mutation · no investor mode activation · no order submission · no risk→execution publication · no Signal service identity with broker-write authority · no broker-write credential in the frontend, Investor API, or recommendation runtime · cross-account isolation · structural absence of deferred execution capability" | Classified item by item in §2 (A / B / C)                                                                                                                                                                                            |
| `SHIP_CONTRACT.md` — Explicitly deferred                                                                                                                                                                                                                                     | "Managed broker submission and Managed investor controls · Managed paper completion"                                                                                                                                                                                                                                                                                                                            | **PARTLY SUPERSEDED**: backend order submission is in scope; investor-facing Managed _controls_ (pause/resume/reduce-only/execution-policy) remain absent — the v1.1.0-alpha.2 contract exposes none                                 |
| `launch-contract.md` §2                                                                                                                                                                                                                                                      | "No investor-accessible capability to: place or submit an order · approve a recommendation for execution · create an executable account intent · activate Managed mode…"                                                                                                                                                                                                                                        | **REWRITTEN (C):** no _browser/frontend_ order or intent authority; the investor's only economic instruction is the canonical subscription (`createAccountAction`) after admission and authorization; no per-trade approval survives |
| `launch-contract.md` §5 structural boundary ("ABSENT OR HARD-DISABLED: Managed promoter, executable intent creation, risk→execution handoff, order-write endpoints, execution-policy mutations, broker-write credentials, execution publishers, broker mutation capability") | **REWRITTEN (C):** true of the _frontend/BFF deployment_; false of the _system_ — the backend owns every one of those. Investor-facing execution-policy mutation and Managed pause/resume stay absent (no contract op)                                                                                                                                                                                          |
| `launch-contract.md` §6 Gate A — "the no-execution boundary is structurally proven", "no deployed Signal identity holds broker-write authority"                                                                                                                              | **REWRITTEN:** see revised Gate A (§9): "no frontend/BFF identity holds broker-write authority; browser cannot construct or submit an order"                                                                                                                                                                                                                                                                    |
| `launch-contract.md` §7 deferred — "investor order submission"                                                                                                                                                                                                               | **A (retained):** investors never submit orders per trade; the backend submits under the accepted subscription                                                                                                                                                                                                                                                                                                  |
| `launch-audit-2026-08-24.md` Finding 1 (readings 1 vs 2)                                                                                                                                                                                                                     | Reading **2** is now the decided state. The audit is historical; not rewritten                                                                                                                                                                                                                                                                                                                                  |
| `open-items.md` D-LAUNCH-06 row                                                                                                                                                                                                                                              | **CLOSED** (register updated)                                                                                                                                                                                                                                                                                                                                                                                   |
| `open-items.md` D-SIGNAL-01 row ("inherits D-LAUNCH-06"; #49 live-key removal stands until superseded)                                                                                                                                                                       | **UPDATED:** mechanism is the package's — the BFF forwards a write-only Alpaca key pair once via `createBrokerageConnection`; the backend holds write authority in Secret Manager. #49's live-key removal stands **until D-LAUNCH-07** decides paper/live                                                                                                                                                       |
| `package-reconciliation-2026-09-03.md` §3 "D-LAUNCH-06 remains OPEN … The Ship Contract is not amended … No execution, brokerage-connection, or subscription surface is built"; §6 "three launch options still wait on D-LAUNCH-06"; §7 "Blocked until D-LAUNCH-06"          | **SUPERSEDED** by this document; the reconciliation is dated and left as written, with a pointer added                                                                                                                                                                                                                                                                                                          |
| `client-contract-diff-2026-09-03.md` §7 "Building UI on brokerage-connection, allocation-preview, or `createAccountAction` … stay blocked"                                                                                                                                   | **SUPERSEDED**; now in scope after gates (§4)                                                                                                                                                                                                                                                                                                                                                                   |
| `c1b2-browser-direct-reclassification.md` §4 "Parked until D-LAUNCH-06 (D: #10, #13, #14, #26)"; §6 blocked rows; §7 "Parked (D) … not to be implemented"; row 20 filter rationale                                                                                           | **RECLASSIFIED** in §4 below; C1b-2 doc amended                                                                                                                                                                                                                                                                                                                                                                 |
| `capability-dispositions.md` B2 "`orders` GET → REMOVE_FROM_SIGNAL: Signal produces no orders; the read implies an order domain that must not exist"                                                                                                                         | **SUPERSEDED as rationale**; order truth now arrives as backend `AccountRecord` variants (`order`, `fill`) read-only — the _legacy prototype_ orders route stays removed (it was never backend truth)                                                                                                                                                                                                           |
| `backend-observation-2026-08-30.md` §4 "D-LAUNCH-06 stays open"                                                                                                                                                                                                              | Historical; superseded by the closure                                                                                                                                                                                                                                                                                                                                                                           |
| `design-investor-profile-alpha-gate.md` §4                                                                                                                                                                                                                                   | The "execution-capable alpha" row is now the operative enforcement point: the cap is a backend risk input; the frontend renders the verdict                                                                                                                                                                                                                                                                     |
| `investor-profile-spec.md` §10 / §21 slice 4 "execution authority stays behind D-LAUNCH-06 and Managed gates"                                                                                                                                                                | Read as: behind **human Alpha admission + account authorization + backend lifecycle**. Spec not edited (counsel-facing document); pointer only                                                                                                                                                                                                                                                                  |
| PR #75 mapping — `trading_eligibility` can never be `eligible`                                                                                                                                                                                                               | **RETAINED (A) for now:** human admission is a separate gate and its backend representation is not pinned; not silently converted. Becomes a narrower rule once the admission/authorization contract is pinned                                                                                                                                                                                                  |
| PR #76 — five execution-chain record variants filtered from Signal activity                                                                                                                                                                                                  | **SUPERSEDED as rationale**; disposition per type in §7 (render read-only in a follow-up slice)                                                                                                                                                                                                                                                                                                                 |
| Code comments citing "parked behind D-LAUNCH-06" (`account-records.ts`, `recommendations.ts`, activity/recommendation routes, hooks, two E2E specs, `attestation-mapping.ts`)                                                                                                | Stale wording; updated in the follow-up implementation slices, not here (no code in this PR)                                                                                                                                                                                                                                                                                                                    |

## 2. Old Signal-only invariants — classification

**A = still required safety property · B = superseded by D-LAUNCH-06 · C = must be
rewritten as a narrower authority rule.**

| Invariant (as previously stated)                                                              | Class                             | Rule going forward                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| no executable `AccountIntent`                                                                 | **C**                             | The **frontend never constructs, submits, or references an executable intent.** The backend creates intents from an accepted subscription/action. Tripwire `EXECUTION_PATH_SEGMENTS` (intent/intents/account-intents) stays for browser-direct calls |
| no Managed promotion                                                                          | **C**                             | No promotion from the frontend, and no investor-facing Managed controls (pause/resume/reduce-only/execution-policy) — the contract exposes none. Backend automation under the accepted subscription is the product                                   |
| no execution-policy investor mutation                                                         | **A**                             | Unchanged — no contract operation exists; `MANAGED_PAPER_GATED_ACTIONS` remain denied; routes remain absent                                                                                                                                          |
| no investor mode activation                                                                   | **C**                             | The removed `subscription-mode` selector stays removed. "Activation" becomes the canonical `createAllocationPreview` → `createAccountAction(join_template)` after admission and authorization (§6)                                                   |
| no order submission                                                                           | **C**                             | **Browser and BFF never submit, place, or cancel a broker order** (IB-08/IB-11 retained). The backend submits orders inside its lifecycle; `202` on an action is never treated as order evidence                                                     |
| no risk→execution publication                                                                 | **B** (system) / **A** (frontend) | The backend publishes risk→execution; the frontend/BFF holds no publisher, topic, subscription, or scheduler                                                                                                                                         |
| no Signal service identity with broker-write authority                                        | **C**                             | **No frontend/BFF identity holds broker-write authority or credentials.** Alpaca keys are collected once, forwarded once through the BFF (`createBrokerageConnection`), never persisted, logged, or cached; the backend owns them in Secret Manager  |
| no broker-write credential in frontend / Investor API / recommendation runtime                | **C**                             | Frontend: retained. Investor API / recommendation runtime: Daniel's runtime separation — outside this repo's proof; recorded as connected-proof evidence, not asserted here                                                                          |
| cross-account isolation                                                                       | **A**                             | Unchanged; `resolveAccountScope` re-authorizes every account-scoped read/write against `listAccounts`                                                                                                                                                |
| structural absence of deferred execution capability                                           | **C**                             | Frontend routes for orders/intents/execute/cancel/execution-policy/managed pause-resume remain **absent**. The four canonical contract mutations become the only new mutation routes, each through `bffMutate` + CM-04 manifest + capability policy  |
| execution-chain records hidden from Signal activity                                           | **B**                             | Superseded; see §7                                                                                                                                                                                                                                   |
| per-trade Accept / Approve affordance                                                         | **A**                             | Unchanged (IB-04, tripwire labels, `signal-authority.spec.ts`). Subscription is the instruction; no per-trade approval exists in the product                                                                                                         |
| default-deny release-stage capability policy                                                  | **A**                             | Unchanged mechanism; the allowlist is extended explicitly per canonical action in later slices (`connectBrokerage`, `disconnectBrokerage`, `previewAllocation`, `submitAccountAction`) — never widened implicitly                                    |
| risk verdicts binary; backend DENY is a hard stop                                             | **A**                             | Unchanged (IB-07); a DENY is rendered, never overridden                                                                                                                                                                                              |
| idempotency on every mutation; ambiguous retries reuse body + Idempotency-Key with fresh auth | **A**                             | Unchanged (frozen client)                                                                                                                                                                                                                            |
| reconciliation authoritative; order/fill truth from backend Records/projections               | **A**                             | Unchanged; the UI never infers completion from an accepted request                                                                                                                                                                                   |
| `trading_eligibility` never `eligible` from the frontend                                      | **A** (interim)                   | Retained until the human-admission/authorization write contract is pinned; then rewritten as a narrower rule                                                                                                                                         |

## 3. Execution authority split (rebased)

| Owns                                                 | Backend (Daniel)                                                             | Frontend / BFF (this repo)                                                                                                                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Broker credentials                                   | Secret Manager versions, validation, rotation, revocation                    | Collect once, forward once via `createBrokerageConnection` / `rotateBrokerageCredentials`; never persist/log/cache; `broker: "alpaca"`, `account_environment: paper\|live` enum only, never a host URL     |
| Account ownership                                    | Authoritative (`listAccounts`, user assertion binding)                       | Re-authorize per request; browser supplies no account id                                                                                                                                                   |
| Intent / risk / plan / order / fill / reconciliation | Owns all                                                                     | Reads them as `AccountRecord` projections; never constructs or infers                                                                                                                                      |
| Subscription                                         | Accepts `createAccountAction` after preview; owns membership and automation  | Obtains a fresh `createAllocationPreview` immediately before, submits the same template/percentage with the preview id, deterministic Idempotency-Key, no automatic retry, follows `409` continuation only |
| Human Alpha admission                                | Operator-owned write (not in the 41 public routes — gap recorded 2026-09-04) | Reads `getOnboardingStatus` / `getAccountAuthorization`; never asserts admission                                                                                                                           |
| Risk DENY                                            | Hard stop                                                                    | Renders reason codes; no override control                                                                                                                                                                  |
| Order/fill truth                                     | Records, projections, SSE                                                    | Refreshes GET projections; `202` ≠ order                                                                                                                                                                   |

## 4. C1b-2 D-row reclassification (semantic, row by row)

| Row | Legacy                                                   | Old | New                                                                                              | Reason                                                                                                                                                                                                                                                                                                             |
| --- | -------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 10  | `useBrokerSupported` GET `/v1/brokers/supported`         | D   | **C — REMOVE_FROM_CURRENT_FLOW**                                                                 | The contract fixes `broker: const "alpaca"`; there is no registry operation. A broker picker is a UI fiction; remove rather than migrate                                                                                                                                                                           |
| 13  | `useBrokerConnectApiKey` POST `/v1/brokers/connect/keys` | D   | **A — MIGRATE (`createBrokerageConnection`)**                                                    | In release scope **after** human admission + `getAccountAuthorization` permits; BFF-only transport, one-shot credential forwarding, never persisted/logged, `paper\|live` enum (value gated by D-LAUNCH-07), Idempotency-Key, no auto-retry. The legacy browser-direct implementation remains wrong and is deleted |
| 14  | `useBrokerDisconnect` POST `/v1/brokers/disconnect`      | D   | **A — MIGRATE (`disconnectBrokerageConnection`)**                                                | In scope; DELETE with `AcknowledgmentConfirmationRequest {continuation_ref, consent_receipt_id}` — an acknowledged disconnect, not a bare click                                                                                                                                                                    |
| 26  | `useActivateAccount` POST `/v1/account/activate`         | D   | **C — REMOVE_FROM_CURRENT_FLOW**                                                                 | No canonical equivalent; an "activate" verb does not exist. The canonical subscription is tracked as a new backend item **26b**                                                                                                                                                                                    |
| 26b | — (new tracked backend item)                             | —   | **A — canonical subscription: `createAllocationPreview` → `createAccountAction(join_template)`** | After gates: admission · authoritative account · KYC/profile/consents · Alpaca connection CONNECTED · authorization AUTHORIZED · template selected · fresh preview · same template/percentage/preview id                                                                                                           |
| 25  | `useActivationStatus` GET `/v1/account/activation`       | A   | **A (unchanged)** — `getOnboardingStatus` + `getAccountAuthorization`                            | Now also the read side of the human-admission gate                                                                                                                                                                                                                                                                 |

**Counts (semantic truth).** Before: A 6 legacy + 3 backend (6b, 22b, 23b) ·
B 3 · C 4 · D 4. After: **A 8 legacy (11, 13, 14, 15, 16, 24, 25 + the remaining
A) + 4 backend (6b, 22b, 23b, 26b) · B 3 · C 6 · D 0.** Remaining legacy rows
stay 17 in total (8 + 3 + 6); the D class is now empty. C1b-2 remains open.

## 5. Human Alpha approval — unchanged, restated

Public application ≠ Alpha admission. No applicant self-approval; no frontend
`approved = true`; the operator write is backend-owned and absent from the 41
public routes (gap recorded 2026-09-04, `open-items` ALPHA-ADMISSION-READ). KYC
passed, Investor Profile fit, a connected Alpaca account, or an accepted
subscription are **not** substitutes for admission; each canonical mutation in
§4 is preceded by the admission/authorization read and refused otherwise.

## 6. `/us/onboarding/activation` — disposition (design only)

Legacy `useActivateAccount` → POST `/v1/account/activate` is **removed**, not
migrated. The page is reinterpreted as the **subscription step** at the end of
the canonical flow:

1. Alpha admitted (backend state, read) → 2. authoritative account available
   (`listAccounts`) → 3. KYC / profile / consents valid → 4. Alpaca connection
   `CONNECTED` (`listBrokerageConnections`) → 5. `getAccountAuthorization.status =
AUTHORIZED` → 6. template selected (`listTemplates`, single `SP500-Following`)
   → 7. `createAllocationPreview` (fresh, non-economic) → 8. investor submits
   `createAccountAction(join_template)` with the same template / percentage /
   preview id → 9. backend automated lifecycle owns trading; the page shows
   `getAccountActionReceipt` and refreshes memberships/records.

No per-trade approval anywhere. **Not implemented here**; each step maps to a
contract operation and lands in its own slice once this rebaseline is merged.

## 7. Execution-chain record visibility — disposition per type

Rationale for the PR #76 filter was "parked behind D-LAUNCH-06". That rationale
is gone. An execution-capable Alpha must show the investor what was done on
their behalf (Daniel: "last x trades sent on their behalf" are user-visible;
Ship Contract: records and reconstructable lineage). All five carry only the
`AccountRecordDetails` fields (`entity_id`, `status`, `reason_codes`,
`effective_at`, `completed_at`, `related_record_id`, `notional`, `quantity`,
`currency`) — no per-record control exists in the contract to render.

| Variant          | Disposition          | Notes                                                      |
| ---------------- | -------------------- | ---------------------------------------------------------- |
| `account_intent` | **RENDER read-only** | neutral type label; status + reason codes                  |
| `risk_decision`  | **RENDER read-only** | verdict + reason codes; a DENY is shown, never overridable |
| `execution_plan` | **RENDER read-only** |                                                            |
| `order`          | **RENDER read-only** | decimals as strings; status vocabulary from the record     |
| `fill`           | **RENDER read-only** |                                                            |

Implementation is a follow-up read-only slice (lift the `execution_chain`
exclusion in `account-records.ts`, keep the exhaustive map, update the E2E and
package regression tests to prove _inclusion_ and _no controls_). Not done here.

## 8. Alpaca environment — D-LAUNCH-07 (OPEN)

D-LAUNCH-06 = YES establishes order submission. It does **not** establish whether
September acceptance uses Alpaca **paper**, **live**, or both. Recorded as
**D-LAUNCH-07 — OPEN — owner Zeshan (with counsel for live)**. Until decided:
the package's `paper|live` enum stays intact end to end; the frontend asks and
forwards only the enum; **no live-capital acceptance is claimed**; PR #49's
removal of raw live-key acceptance stands. Gate B (counsel) remains the
precondition for real advisory clients with live capital.

## 9. Revised September 12 Gate A checklist (execution-capable)

Two evidence classes, never conflated: **[SIM]** = provable against Daniel's
deterministic simulator and this repo's gates today; **[CONN]** = requires
connected refinity-dev / Alpaca evidence from the backend side (connection
addendum), never claimed from this repo.

- [ ] identity / account ownership: user assertion binding; `listAccounts` re-authorization on every account-scoped call **[SIM]**; identity-ccid exchange **[CONN]**
- [ ] human Alpha admission gate: pending/waitlisted state read from `getOnboardingStatus` / `getAccountAuthorization`; no self-approval path (assertion) **[SIM]**; operator write path exists and is audited **[CONN]**
- [ ] KYC / profile / consent state: provider provenance gate, Investor Profile v2, `listEffectiveDisclosures` / `recordConsent` **[SIM]**; real KYC provider **[CONN + provider]**
- [ ] Alpaca connection: `createBrokerageConnection` via BFF, `paper|live` enum, one-shot credentials **[SIM]**; `CONNECTED` against Alpaca **[CONN]**
- [ ] credential isolation: no broker credential persisted/logged/cached in frontend/BFF (assertion + log review) **[SIM]**; Secret Manager ownership **[CONN]**
- [ ] account authorization: `AUTHORIZED` read and enforced before every canonical mutation **[SIM]**
- [ ] canonical valuation / positions: `getAccountValuation`, `listAccountPositions` projections **[SIM]**; reconciled against Alpaca **[CONN]**
- [ ] template / membership: `listTemplates`, `listAccountMemberships` **[SIM]**
- [ ] account preferences: four fields via `updateAccountPreferences` with If-Match **[SIM]**
- [ ] allocation preview: fresh, bound, non-economic **[SIM]**
- [ ] accepted subscription / action: `createAccountAction` with preview id; receipt read **[SIM]**; durable instruction observed by backend automation **[CONN]**
- [ ] AccountIntent · risk decision · execution plan · order lifecycle · fills: rendered read-only from `AccountRecord` projections **[SIM]**; produced by the backend against Alpaca **[CONN]**
- [ ] reconciliation: backend-authoritative; UI refreshes projections, never infers **[SIM/CONN]**
- [ ] recommendation / records lineage: recommendation → legs → records reconstructable **[SIM]**
- [ ] cross-account isolation: foreign-account fixture answers 404 **[SIM]**; Daniel's isolation user **[CONN]**
- [ ] no browser order authority: tripwire IB-11, IB-08, no per-trade control, no execution routes in the manifest **[SIM]**
- [ ] immutable / reconstructable evidence: receipts, records, correlation ids **[SIM]**
- [ ] deployment / IAM boundaries: BFF identity holds no broker-write role; runtime separation **[CONN]**
- [ ] exact artifact / version evidence: contract hash `v1.1.0-alpha.2`, immutable image digests, CI run ids **[SIM]** + deployed digests **[CONN]**
- [ ] Alpaca environment per **D-LAUNCH-07** recorded before acceptance

## 10. Recommended September milestone wording

> **September 12/13, 2026 — Closed-Alpha Automated Portfolio Management, Dev
> Release Candidate in `refinity-dev`.** Public U.S. application with automated
> screening, KYC/identity, and mandatory ReFi human admission; admitted Alpha
> investors connect an Alpaca account (`paper|live` per D-LAUNCH-07), subscribe
> to the single template through the canonical allocation-preview → account-
> action path, and the backend lifecycle submits and reconciles orders on their
> behalf. The frontend/BFF holds no order or broker-write authority. Supersedes
> the "Signal Dev Release 1 — no paper or live order effect" framing.

## 11. Tests and assertions impacted (inventory, no change in this PR)

| Artifact                                                                                                                                                                            | Current claim                                                  | Effect                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/tripwire-investor-boundary.ts` (`EXECUTION_PATH_SEGMENTS`, forbidden labels/ids)                                                                                           | browser-direct execution guard, per-trade labels               | **A — keep.** New BFF routes must avoid those segments in _browser_ `apiFetch` paths; the canonical routes (`/brokerage-connections`, `/allocation-previews`, `/actions`) do not collide |
| `scripts/contract-assertions.ts` "Signal-only: no broker submission or cancel path", "Order module exposes NO submission…", release-gate refuses Managed verbs, default-deny policy | frontend has no submission surface                             | **A — keep** (frontend truth unchanged)                                                                                                                                                  |
| `scripts/contract-assertions.ts` "signal activity: five execution-chain variants excluded"                                                                                          | filter present                                                 | **B — flips to an inclusion + no-controls proof** in the execution-reads slice                                                                                                           |
| `apps/web/e2e/signal-authority.spec.ts`, `c2a-structure.spec.ts`                                                                                                                    | Managed routes/pages absent; no accept/approve/execute control | **A — keep**; canonical subscription is not a Managed control                                                                                                                            |
| `apps/web/e2e/activity.spec.ts`, `signal-reads-projection.test.ts`                                                                                                                  | execution-chain variants never render                          | **B — rewrite** in the execution-reads slice                                                                                                                                             |
| `release-policy.ts` `SIGNAL_ALLOWED_ACTIONS`                                                                                                                                        | closed allowlist                                               | **A — keep mechanism**; extend explicitly per canonical action with compile-time exhaustiveness                                                                                          |
| `attestation-mapping.test.ts` `trading_eligibility` never eligible                                                                                                                  | retained                                                       | **A (interim)**                                                                                                                                                                          |
| `compliance/CONTROL_MATRIX.md` IB-08, IB-10, IB-11                                                                                                                                  | Signal-only wording                                            | IB-08/IB-11 **A**; IB-10 **C** (narrow to "Managed controls absent"; canonical subscription route is new, manifested, policy-gated) — rows updated when the code slices land             |

## 12. What this PR does not do

No Alpaca credentials, allocation preview, account action, or order code. No
route, manifest, tripwire, policy, or test change. No change to Daniel's
package or historical documents. No live-capital claim. No change to the human
admission gate.
