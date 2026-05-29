# Phase 2.5 Daniel Backend Alignment Decision Memo

**Date:** 2026-05-28
**Audit branch:** `phase2-5-daniel-live-backend-alignment`
**Companion docs (all in this branch):**

- `phase2-5-daniel-live-backend-field-map.md`
- `phase2-5-daniel-to-refi-alignment-gap-register.md`
- `phase2-5-signal-contract-live-backend-delta.md`
- `phase2-5-daniel-adapter-fixtures-required.md`

This memo answers each directive question directly. Every answer is grounded in the read-only audit of `…/Daniels Back End/live-components-main`, **not** in prior summaries or memory.

---

## Q1. Are we currently building the frontend / BFF in a way that matches Daniel's backend fundamentals?

**Answer:** **partially.**

- **The fundamentals we ARE matching:** the source-of-truth split (Daniel = signal/portfolio engine; ReFi = SEC 203A-2(e) investor-product shell), the principle that Daniel's raw output is never directly executable, the SEC 203A-2(e) boundary (no per-trade Accept, no investor-accept, no staff approval, no founder review, no support-led advice), the recommendation-projection / eligibility-check / execution-policy / broker-submission / record-artifact chain shape.
- **The fundamentals where we are AHEAD of Daniel:** the investor-product backend domain (40+ `/api/v1/*` routes, 50+ schemas, persona/tier/eligibility/disclosure/broker/exception/execution-policy/recommendation domain) is entirely a frontend/BFF construct because Daniel hasn't built the corresponding services (`account-intent-builder`, `risk-engine`, `exec-gateway`, `trade-manager`, `AuditEvents`).
- **The fundamentals where we have DRIFT:** the contract's `DanielSignalRaw` shape names `signal: -1 | 1` but Daniel emits `position: -1 | 0 | 1` (we miss the `0` case). The contract types `predicted_at` and `last_prediction_ts` as ISO-8601 strings but Daniel emits UNIX seconds. `strategy_id` and `model_version` are derivable (via `available_strategies` lookup and GCS path) but not on the wire — the contract names them as wire fields. `confidence_score` and `sharpe_metric` are not scalars on the wire; the contract under-specifies the aggregation rule. See `phase2-5-signal-contract-live-backend-delta.md` §8.1 for the 10 specific corrections.

---

## Q2. What must change before Surface 4?

**Answer:** Surface 4 (whichever surface that is — the user has not specified — likely Records Center v2 or Evidence Console per the sibling rescope doc §13) **must not start** until:

1. **The 10 contract corrections** in `phase2-5-signal-contract-live-backend-delta.md` §8.1 are applied to `phase2-5-signal-to-investor-product-contract.md`. These are doc-only corrections (no code change).
2. **The gap register** (`phase2-5-daniel-to-refi-alignment-gap-register.md`) is reviewed and accepted by product + backend lead.
3. **A decision is made on the `account-intent-builder` ownership and schedule.** Without it, Surface 4 will inevitably consume per-account signals that have no backend source. The BFF + prototype store can simulate, but production wire-level binding is missing.
4. **A decision is made on the `risk-engine` ownership.** Same reason: REVIEW / DENY verdicts need a real source.
5. **The lint gate** (`pnpm lint` → exit 0) is closed, OR explicitly classified into the lint-tooling + lint-findings + react-hooks-cleanup branch sequence (already done on the current stacked branches `phase2-5-lint-tooling`, `phase2-5-lint-findings-cleanup`, `phase2-5-react-hooks-cleanup`).

---

## Q3. What must change before Phase 2.5 main merge?

**Answer:** before merging Phase 2.5 into `main`:

1. **All three previously tracked cleanup branches must land:** `phase2-5-lint-tooling` (infra), `phase2-5-lint-findings-cleanup` (mechanical findings), `phase2-5-react-hooks-cleanup` (structural React hooks fixes). All three are now pushed; `pnpm lint` exits 0 on the head of the react-hooks branch.
2. **The stale-E2E cleanup branch** (`phase2-5-stale-e2e-cleanup`, not yet started) must land. Owns realigning `eligibility.spec.ts`, `auth.spec.ts:21`, `onboarding.spec.ts`, `support.spec.ts:39` per `phase2-5-gate-cleanup.md` §3.2.
3. **The PR description must state** that Daniel backend is signal infrastructure only, not the investor-product backend, AND that current Phase 2.5 coverage is frontend/BFF boundary coverage, not production wire-level backend coverage. Both of these requirements are already in `phase2-5-pr-description.md` (committed at `b647818`).
4. **The 5 docs in this audit branch** (this memo + the 4 companion docs) must be committed to record the alignment state. (This branch closes that requirement.)
5. **Contract corrections from `phase2-5-signal-contract-live-backend-delta.md` §8.1 are recommended** but not strictly required for the Phase 2.5 merge — they can be a follow-up. The audit identifies them as needed before the adapter is built.

---

## Q4. What must change before production?

**Answer:** before production launch:

1. **`account-intent-builder` service must ship on Daniel's side** (per the sibling rescope doc). Without it, the frontend cannot bind a Daniel signal to a specific investor account.
2. **`risk-engine` service must ship on Daniel's side.** Without it, REVIEW / DENY verdicts have no real source.
3. **`exec-gateway` service must ship on Daniel's side.** Without it, ExecutionPolicy activation has no execution-side counterpart.
4. **`trade-manager` service (broker submission, fills, broker interactions) must ship on Daniel's side.** Without it, no Order can flow.
5. **`AuditEvents` stream must ship on Daniel's side.** Without it, the SEC 203A-2(e) record set is incomplete.
6. **`SignalToInvestorProductAdapter` must be built** on the ReFi BFF side, satisfying all 10 fixture cases in `phase2-5-daniel-adapter-fixtures-required.md`.
7. **All 12 production blockers in `phase2-5-signal-to-investor-product-contract.md` §8** (durable profile storage, durable disclosure storage, durable execution policy storage, etc.) must be resolved.
8. **A real backend persistence layer** for investor product must replace the BFF prototype JSON store (`apps/web/.refi-prototype-store-e2e/`).
9. **The 10 contract corrections** must be applied (or the adapter is built without them and the deltas are documented in the implementation).

---

## Q5. Does the current frontend have any false assumption about Daniel backend?

**Answer:** **yes — six specific false assumptions**, all in `phase2-5-signal-to-investor-product-contract.md` §3 `DanielSignalRaw`:

1. **`signal: -1 | 1`** assumes a strict 2-state output. False: Daniel emits `position: -1 | 0 | 1`.
2. **`predicted_at: string` (ISO-8601)** assumes ISO-8601 wire shape. False: Daniel emits UNIX seconds (`int`).
3. **`last_prediction_ts: string` (ISO-8601)** same false assumption. False: UNIX seconds.
4. **`model_version: string`** assumes the field is on the wire. False: derivable only (from GCS path of `final_eval_model.joblib`).
5. **`strategy_id: string`** assumes the field is on the wire. False: derivable only (via `available_strategies` lookup).
6. **`confidence_score?: number` and `sharpe_metric?: number`** assume single-scalar values. False: `rl_predictions` carries Q-values (multi-action), `sharpe_series` carries multi-`(source, method, lookback)` per-bar values.

**None of these false assumptions is currently shipped as code** — they are documented in the contract. No frontend surface consumes them today (the BFF + MSW + prototype-store simulate the investor-product backend, not the Daniel signal layer). The corrections are documentation hygiene, not a runtime bug fix.

---

## Q6. Does the current frontend expose any action that Daniel backend does not support?

**Answer:** **vacuously, no — and intentionally so.** Daniel's backend exposes no investor-facing action surface at all. The frontend's full investor-product action catalog (pause, resume, acknowledge disclosure, request review, file support ticket, route to Exception Review, etc.) is entirely BFF-owned. None of these actions reach Daniel's code today because Daniel's code has no account / investor / execution-policy concept.

The forbidden actions (per `memory/rule_no_per_trade_accept.md`) — per-trade Accept, investor-accept, staff approval, founder review, support-led advice — are **not** exposed by the frontend (verified by tripwire + §A + §B + §C + §D test coverage). Daniel's backend, having no investor surface, also cannot expose them. Boundary intact on both sides.

---

## Q7. Does Daniel backend expose any action that the SEC 203A-2(e) investor product must hide, wrap, or reinterpret?

**Answer:** **today, no** (Daniel has no investor-facing actions). **In the future architecture (per the sibling rescope doc), yes — three categories:**

1. **`template.admin action=rebalance target_account_id=X`** (planned Daniel admin command per rescope doc §3.1). Must be wrapped: the BFF adapter consumes it as the trigger to construct a per-account `RecommendationProjection` → `EligibilityCheck` → `ExecutionPolicyDecision`. The admin shape must NEVER reach an investor-facing testid, label, or copy string.
2. **Raw `live_signals.position`** (already present). Must be wrapped: the adapter translates `position +1 → open_long`, `position -1 → open_short`, `position 0 → hold/no-projection`. The raw integer must never appear in investor UI.
3. **`asset_status.status ∈ {"Inference in Progress", "Needs Model Update"}`** (already present). Must be reinterpreted: investors see "fresh / stale / unavailable" terminology per the contract's `freshness_status` enum.

---

## Q8. Is `template.admin action=rebalance target_account_id=X` still the correct backend-init command?

**Answer:** **yes, per the sibling rescope doc** (`ReFi_US_P2_5R_Daniel_Alignment_Rescope.md` §3.1 and §10). It is **not yet implemented** in `live-components-main`; it is documented as Daniel's intended future admin command shape. The frontend's tripwire and §A test coverage already enforce that:

- the command can only be initiated by the backend (admin path),
- the investor UI never exposes a counterpart,
- any future BFF adapter consuming this command must produce only `RecordArtifact` + downstream `RecommendationProjection` chain, never an investor-facing button.

When the command lands on Daniel's side, no code change on the frontend is needed — only an adapter-layer wiring change in the BFF, plus a confirmation that the tripwire / §A coverage still rejects any leakage. Until then, the rule stands as written.

---

## Q9. Is `investor-accept` still forbidden?

**Answer:** **yes, unconditionally.**

- `scripts/tripwire-investor-boundary.ts` `FORBIDDEN_ACTION_IDS` blocks `accept_trade`, `investor-accept`, `acceptRecommendation`, etc. at source level.
- `apps/web/e2e/compliance-fail-closed-structural.spec.ts` (§A, 6 tests) enforces structural absence of every per-trade affordance.
- `apps/web/e2e/compliance-verdict-visibility.spec.ts` (§B, 6 tests) re-asserts absence on every verdict state (ALLOW, REVIEW, DENY, UNAVAILABLE).
- `apps/web/e2e/support-boundary-preservation.spec.ts` (§D, 8 tests) enforces that even the support surface refuses to expose `investor-accept` / `accept_trade` / `accept and execute` / etc.
- `memory/rule_no_per_trade_accept.md` carries the canonical rule.

Daniel's backend has no concept of investor-accept; the rule has no Daniel-side enforcement vector and doesn't need one. The boundary is preserved entirely on the ReFi side.

---

## Q10. Is Managed mode still: standing execution policy + system-generated recommendations + eligibility check + policy-bound execution, with no per-trade investor Accept?

**Answer:** **yes — that is the contract.** Specifically:

- **Standing execution policy:** `ExecutionPolicy` versioned record, activated via `/api/v1/execution-policy/activate` per Phase 2 Surface 3. State machine: `inactive → setup_incomplete → active → paused_by_user / paused_by_system / review_required`.
- **System-generated recommendations:** the future chain `Daniel live_signals → SignalCandidate → RecommendationProjection`. The recommendation is generated by software, never authored by staff or investor. Verified by tripwire + §A.
- **Eligibility check:** per-account `EligibilityCheck.status ∈ {ALLOW, REVIEW, DENY}`. Verified by §B `data-eligibility` attribute. Required inputs: KYC, profile, disclosures, broker connection, position concentration, signal freshness.
- **Policy-bound execution:** `ExecutionPolicyDecision.decision ∈ {ROUTE_TO_BROKER, ROUTE_TO_EXCEPTION, RECORD_ONLY, BLOCK}` keyed off `policy_id` + `policy_version`. `BrokerSubmission` MUST carry the policy version that authorized it.
- **No per-trade investor Accept:** verified at four redundant layers — tripwire (`FORBIDDEN_ACTION_IDS` + `FORBIDDEN_LABELS`), §A structural fail-closed, §B verdict-visibility-without-affordance, §D support-surface no-affordance.

All four constraints hold on the ReFi side today. Daniel's backend has no implementation of any of them; they are entirely BFF + frontend + tripwire enforcement. The rule is correct and the implementation matches it.

---

## Summary table

| Question                                                                                                    | Answer                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1. Building correctly?                                                                                     | Partially — fundamentals correct; 6 wire-shape false assumptions in the contract; Daniel's investor-product backend services are absent.                                                                                                                                          |
| Q2. Before Surface 4?                                                                                       | Apply 10 contract corrections; accept the gap register; decide on `account-intent-builder` + `risk-engine` ownership; close the lint gate.                                                                                                                                        |
| Q3. Before Phase 2.5 main merge?                                                                            | Land the 3 lint cleanup branches + the stale-E2E branch; ensure PR description states Daniel = signal-only and current coverage is frontend/BFF; commit this audit branch's 5 docs.                                                                                               |
| Q4. Before production?                                                                                      | `account-intent-builder`, `risk-engine`, `exec-gateway`, `trade-manager`, `AuditEvents` must ship on Daniel's side; `SignalToInvestorProductAdapter` must be built; 12 production blockers from the contract §8 resolved; real backend persistence replaces prototype JSON store. |
| Q5. Frontend false assumptions about Daniel?                                                                | 6 specific, documented in the contract; none ship as code today; corrections recommended.                                                                                                                                                                                         |
| Q6. Frontend exposes any action Daniel doesn't support?                                                     | Vacuously no. Frontend's investor-product actions are entirely BFF-owned; Daniel has no investor surface.                                                                                                                                                                         |
| Q7. Daniel exposes any action the investor product must hide / wrap / reinterpret?                          | Today no. In future: `template.admin action=rebalance target_account_id=X` (wrap), raw `live_signals.position` (translate), `asset_status` pipeline-state terminology (reinterpret).                                                                                              |
| Q8. `template.admin action=rebalance target_account_id=X` still correct?                                    | Yes per the rescope doc, not yet implemented in code.                                                                                                                                                                                                                             |
| Q9. `investor-accept` still forbidden?                                                                      | Yes, unconditionally; enforced by tripwire + §A + §B + §D.                                                                                                                                                                                                                        |
| Q10. Managed mode = policy + system-generated + eligibility + policy-bound execution + no per-trade Accept? | Yes — exact contract, verified at four redundant enforcement layers.                                                                                                                                                                                                              |

---

## Decision posture for this branch

- This branch lands **read-only audit documentation only**. No code shipped.
- The audit confirms the SEC 203A-2(e) boundary holds.
- The audit confirms Daniel's `live-components-main` is the signal/portfolio engine only — and that all production-blocking investor-product backend services (`account-intent-builder`, `risk-engine`, `exec-gateway`, `trade-manager`, `AuditEvents`) are missing on Daniel's side, exactly as already documented in prior Phase 2.5 docs.
- The audit identifies 10 specific contract corrections to apply to `phase2-5-signal-to-investor-product-contract.md` in a follow-up branch.
- The audit identifies 10 required adapter fixture cases for the future `SignalToInvestorProductAdapter`.
- **Surface 4 should not start until the gap register is reviewed and accepted.** The lint gate is now closed. The stale-E2E gate is next.

## Scope lock — re-affirmed

No code changes. No Daniel backend changes. No frontend changes. No new product surfaces. No SEC 203A-2(e) boundary weakened. No per-trade Accept, Approve, Submit, investor-accept, staff approval, founder review, or support-led advice reintroduced.
