# Phase 2.5 Gap Register V2 — Against GitLab Canonical Backend

> **Superseded note:** This document reflects Phase 2.5 alignment against `refinity-main main @ 0a7d64d`. Phase 2.6 supersedes it using `refinity-main main @ 9f9dfc9` and `docs/authoritative/*` as the backend source of truth. Retain this file as historical audit evidence. See [`phase2-6-authoritative-source-of-truth.md`](phase2-6-authoritative-source-of-truth.md).

**Date:** 2026-05-29
**Branch:** `phase2-5-contract-gap-v2-gitlab`
**Audit mode:** read-only.
**Canonical backend:** `gitlab.com/refinity_dev/refinity-main` branch `main` @ `0a7d64d`.
**Supersedes:** `docs/phase2-5-daniel-to-refi-alignment-gap-register.md` (the local-backend register; preserved for historical audit but no longer authoritative).
**Companion contract:** `docs/phase2-5-signal-to-investor-product-contract.md` (V2).

This register reclassifies the prior local-backend gaps against the verified GitLab monorepo. Status legend: **aligned** (semantic match), **partially aligned** (overlap with shape drift / mapping work needed), **misaligned** (concrete conflict), **adapter-pending** (backend exists; BFF adapter mapping not yet implemented), **skeletal** (GitLab service named but empty), **bff-owned** (frontend/BFF retains ownership; not a GitLab gap).

---

## 1. Account identity

| Gap ID  | Prior classification (local-backend register)                  | GitLab reality                                                                                                                                                                                                                        | V2 classification   | Blocks Surface 4?                       | Blocks main merge?             | Blocks production?                  |
| ------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------- | ------------------------------ | ----------------------------------- |
| GAP-001 | Daniel had no `account_id` concept; **misaligned**.            | `account_id` is carried on **every** envelope: `account.intent.ready`, `risk.approved`, `risk.rejected`, `orders.cmd`, `orders.evt`, `audit.evt`. Verified in `contracts/fixtures/*.json`. `account-intent-builder` exists.           | **adapter-pending** | No                                      | No                             | Yes (adapter mapping required)      |
| GAP-002 | No auth / session link; **missing**.                           | GitLab has skeletal `auth-siwe` and `identity-ccid`. Frontend remains the authoritative session owner via SIWE + `us_session_v1`.                                                                                                     | **bff-owned**       | No                                      | No                             | No (BFF-owned)                      |
| GAP-003 | `target_account_id` semantic undefined; **partially aligned**. | `target_account_id` exists today as a backend/admin-only field on `template.admin action=rebalance` envelopes, published from `admin-portal` (`apps/admin-portal/backend/pubsub_mgr.py:109-138`, event `manual_rebalance_requested`). | **adapter-pending** | No (boundary already tripwire-enforced) | Yes (tripwire must stay green) | Yes (tripwire enforces non-leakage) |

---

## 2. Mode semantics

| Gap ID       | Prior classification                                                 | GitLab reality                                                                                                                                                                                                       | V2 classification                     | Blocks Surface 4?              | Blocks main merge?   | Blocks production?              |
| ------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------ | -------------------- | ------------------------------- |
| GAP-MODE-001 | Signal vs Managed framing was frontend-only.                         | GitLab does not encode "Signal vs Managed" as a backend tier; it is still BFF-owned. The adapter must gate `RECORD_ONLY` for Signal tier irrespective of `risk.approved`.                                            | **bff-owned**                         | No (enforced)                  | No                   | Yes (adapter rule must persist) |
| GAP-MODE-002 | Admin-init rebalance had no concrete command; **partially aligned**. | `template.admin action=rebalance target_account_id=X` is now real and verified. Backend-only.                                                                                                                        | **adapter-pending + tripwire-locked** | Yes (must not leak)            | Yes (tripwire green) | Yes                             |
| GAP-MODE-003 | No-investor-accept; **aligned (vacuously)**.                         | Still vacuously aligned. GitLab exposes no investor surface; no investor-accept topic. Tripwire blocks.                                                                                                              | **aligned**                           | No                             | No                   | No                              |
| GAP-MODE-004 | Auto-execution / standing ExecutionPolicy entirely frontend-side.    | `exec-gateway` and `trade-manager` exist with policy-bound `orders.cmd` → `orders.evt`. **But** per-account ExecutionPolicy storage is not a GitLab record today; it is a BFF construct. Daniel-confirmation item 4. | **partially aligned**                 | Yes (pending policy ownership) | Yes                  | Yes                             |

---

## 3. Recommendation semantics

| Gap ID      | Prior classification                                            | GitLab reality                                                                                                                                                                                 | V2 classification                    | Blocks Surface 4?       | Blocks main merge? | Blocks production?             |
| ----------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------- | ------------------ | ------------------------------ |
| GAP-REC-001 | `position +1/-1/0` per `(symbol, date)`; **partially aligned**. | Superseded. GitLab wire: `signal` column on `signals` table, plus `stream_id`, `asset_id`, `ts_utc`, `strategy_source`, `strategy`, `label`, `proba`, `model_version`. Multi-stream by design. | **adapter-pending**                  | No                      | No                 | Yes (adapter mapping required) |
| GAP-REC-002 | `SignalCandidate` is adapter-owned; **missing on Daniel side**. | Still adapter-owned. GitLab `signals` rows are the intake; SignalCandidate is the BFF normalization layer.                                                                                     | **bff-owned**                        | No                      | No                 | Yes (adapter must implement)   |
| GAP-REC-003 | REVIEW verdict had no Daniel equivalent; **misaligned**.        | `risk-engine` exists and emits binary `risk.approved \| risk.rejected` + `reasons[]`. Mapping binary→ternary is Daniel-confirmation item 1.                                                    | **adapter-pending + Daniel-confirm** | Yes (mapping must land) | Yes                | Yes                            |
| GAP-REC-004 | DENY verdict had no Daniel equivalent; **misaligned**.          | Same — `risk-engine.reasons[]` partition decides DENY vs REVIEW.                                                                                                                               | **adapter-pending + Daniel-confirm** | Yes                     | Yes                | Yes                            |
| GAP-REC-005 | ALLOW verdict had no Daniel equivalent; **misaligned**.         | `risk.approved` envelope exists.                                                                                                                                                               | **adapter-pending**                  | No                      | No                 | Yes                            |

---

## 4. Portfolio construction

| Gap ID     | Prior classification                                                        | GitLab reality                                                                                                                                                                        | V2 classification                    | Blocks Surface 4?                                          | Blocks main merge?                              | Blocks production? |
| ---------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------- | ------------------ |
| GAP-PF-001 | Strategy-selector + `available_strategies` registry; **partially aligned**. | Superseded. GitLab `signals` carries `strategy_source` + `strategy` directly. Template registry (`template_id` registry shape) is Daniel-confirmation item 2.                         | **adapter-pending + Daniel-confirm** | No (Surface 4 uses ExecutionPolicy, not template registry) | Yes (template discovery required for Surface 5) | Yes                |
| GAP-PF-002 | Investor objective profile; **missing on Daniel side**.                     | Still BFF-owned. `account.intent.ready` carries `account_id` but not the advisory profile. The adapter passes profile metadata into account.admin update_prefs envelopes when needed. | **bff-owned**                        | No                                                         | No                                              | No (BFF-owned)     |
| GAP-PF-003 | Universe-level risk stats ≠ per-investor risk decisions; **misaligned**.    | `risk-engine` provides per-intent decisions via `risk.approved/rejected` with `RiskMetrics`. Per-investor decisions are real and on the wire.                                         | **adapter-pending**                  | Yes                                                        | Yes                                             | Yes                |
| GAP-PF-004 | Constraint families differed (universe vs per-account); **misaligned**.     | `exec-gateway` enforces per-account execution constraints inside `orders.cmd` derivation. Universe constraints upstream in `portfolio-engine`. Both families align.                   | **adapter-pending**                  | Yes                                                        | Yes                                             | Yes                |
| GAP-PF-005 | Suitability / eligibility check; **missing on Daniel side**.                | Still BFF-owned (regulatory boundary). `risk-engine` provides risk verdicts; eligibility composes risk + KYC + disclosure + profile + freshness on the BFF side.                      | **bff-owned**                        | No                                                         | No                                              | No (BFF-owned)     |

---

## 5. Execution boundary

| Gap ID     | Prior classification                                                           | GitLab reality                                                                                                                                                                                                                                                             | V2 classification                      | Blocks Surface 4? | Blocks main merge? | Blocks production? |
| ---------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------- | ------------------ | ------------------ |
| GAP-EX-001 | Rebalance pipeline missing; **missing on Daniel side**.                        | `portfolio-engine` → `portfolio-manager` → `account-intent-builder` → `risk-engine` → `exec-gateway` → `trade-manager` is real. `template.rebalance.intent` topic exists.                                                                                                  | **adapter-pending**                    | Yes               | Yes                | Yes                |
| GAP-EX-002 | ExecutionPolicy frontend-only; **misaligned**.                                 | `exec-gateway` enforces policy at `orders.cmd` derivation, but per-account versioned ExecutionPolicy storage is still BFF-owned today. Daniel-confirmation item 4: should it move to a GitLab table?                                                                       | **partially aligned + Daniel-confirm** | Yes               | Yes                | Yes                |
| GAP-EX-003 | Broker submission missing on Daniel; **missing**.                              | `trade-manager` exists and handles broker lifecycle via `orders.evt` (15-state). Spanner `Orders`, `OrderEvents`, `BrokerOrderAttempts`, `Fills` tables exist.                                                                                                             | **adapter-pending**                    | Yes               | Yes                | Yes                |
| GAP-EX-004 | Exception review missing on Daniel; **missing**.                               | Exceptions map to `risk.rejected` + `TradingControlStates` + lifecycle `blocked_dependency` / `blocked_by_conflict` states. Real on the wire; adapter mapping required.                                                                                                    | **adapter-pending**                    | Yes               | Yes                | Yes                |
| GAP-EX-005 | Record artifacts mismatched (model-state vs investor records); **misaligned**. | Spanner trade-lifecycle tables (`Orders`, `OrderEvents`, `BrokerOrderAttempts`, `Fills`, `Positions`, `PositionSnapshots`, `TradeInputSnapshots`, `TradeReconciliationRuns`, `TradeReconciliationDiscrepancies`, `TradingControlStates`, `TradingControlEvents`) are real. | **adapter-pending**                    | Yes               | Yes                | Yes                |

---

## 6. Records

| Gap ID         | Prior classification                                                                    | GitLab reality                                                                                                                                              | V2 classification               | Blocks Surface 4? | Blocks main merge? | Blocks production?                 |
| -------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------- | ------------------ | ---------------------------------- |
| GAP-REC-RC-001 | `decision_record_ref` should point to Daniel model output trace; **partially aligned**. | Now: `gitlab://signals/{stream_id}/{ts_utc}` with full correlation spine (`action_id`, `intent_id`, `plan_id`, `order_id`, …) on every downstream envelope. | **adapter-pending**             | No                | Yes                | Yes                                |
| GAP-REC-RC-002 | Decision record terminology missing; BFF-owned.                                         | Still BFF-owned for the investor-facing record artifact. Backend trade-lifecycle tables feed it.                                                            | **bff-owned + adapter-pending** | No                | No                 | Yes                                |
| GAP-REC-RC-003 | Broker submission record missing on Daniel; **missing**.                                | `BrokerOrderAttempts` + `BrokerInteractionsLog` + `Fills` Spanner tables are real.                                                                          | **adapter-pending**             | Yes               | Yes                | Yes                                |
| GAP-REC-RC-004 | Exception record missing on Daniel; **missing**.                                        | `TradingControlStates` + `TradingControlEvents` + `risk.rejected` envelopes are real.                                                                       | **adapter-pending**             | Yes               | Yes                | Yes                                |
| GAP-REC-RC-005 | Disclosure ack record missing on Daniel side; BFF-owned.                                | Still BFF-owned. GitLab `audit-writer` is skeletal, so durable disclosure-ack storage remains a BFF responsibility for now.                                 | **bff-owned**                   | No                | No                 | Yes (durable BFF storage required) |

---

## 7. Compliance boundary

| Gap ID      | Prior classification                                                                 | GitLab reality                                                                                                                                                                   | V2 classification             | Blocks Surface 4? | Blocks main merge? | Blocks production?                 |
| ----------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------- | ------------------ | ---------------------------------- |
| GAP-CMP-001 | No staff-authored individualized advice; **aligned (vacuously)**.                    | GitLab has no staff investor-facing surface. `admin-portal` is operator-only. Tripwire keeps any admin-shape out of investor UI.                                                 | **aligned**                   | No                | No                 | No                                 |
| GAP-CMP-002 | No founder review; **aligned (vacuously)**.                                          | Same.                                                                                                                                                                            | **aligned**                   | No                | No                 | No                                 |
| GAP-CMP-003 | No support override; **aligned (vacuously)**.                                        | Same.                                                                                                                                                                            | **aligned**                   | No                | No                 | No                                 |
| GAP-CMP-004 | No direct raw-signal-to-broker path; **aligned (vacuously); at risk going forward**. | GitLab has `exec-gateway` and `trade-manager` that move from intent → broker. The adapter is the only path that exposes any of this to the investor. Correlation spine enforced. | **aligned (architecturally)** | No                | No                 | Yes (architectural rule must hold) |
| GAP-CMP-005 | No per-trade Accept; **aligned (vacuously)**.                                        | Same. Tripwire blocks.                                                                                                                                                           | **aligned**                   | No                | No                 | No                                 |
| GAP-CMP-006 | No investor-accept topic; **aligned (vacuously)**.                                   | Same.                                                                                                                                                                            | **aligned**                   | No                | No                 | No                                 |

---

## 8. New rows surfaced by the GitLab audit

These gaps were not on the prior local-backend register because the corresponding services did not exist in `live-components-main`.

| Gap ID              | GitLab fact                                                                                                                                                                                                                                     | V2 classification   | Blocks Surface 4?               | Blocks main merge? | Blocks production?                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------- | ------------------ | ------------------------------------ |
| GAP-AUDIT-001       | `audit-writer` service exists by name in GitLab but is **skeletal** (0 Python files).                                                                                                                                                           | **skeletal**        | No                              | No                 | Yes (durable audit storage needed)   |
| GAP-COMPLY-001      | `compliance-adapter` service exists by name but is **skeletal**.                                                                                                                                                                                | **skeletal**        | No                              | No                 | Yes                                  |
| GAP-TEMPLATE-001    | `template_id` is referenced across `template.rebalance.intent`, `template.admin`, and `account.admin action=join_template/leave_template`. The discovery / registry shape (table, RPC, topic) is not yet documented.                            | **Daniel-confirm**  | Yes (Surface 5 needs discovery) | Yes                | Yes                                  |
| GAP-SIGNAL0-001     | `signal: 0` (flat / hold) preservation policy unconfirmed. Earlier local-backend `position: 0` was confirmed flat; GitLab behavior may suppress or preserve.                                                                                    | **Daniel-confirm**  | No                              | No                 | Medium (affects projection volume)   |
| GAP-MULTISTREAM-001 | Multi-stream rows for the same `(asset_id, ts_utc)` coexist. Aggregation policy (agreement / weighted vote / conflict rejection) is undefined.                                                                                                  | **adapter-pending** | No                              | No                 | Yes (without policy, record-only)    |
| GAP-CORRELATION-001 | Every GitLab envelope carries an 11-field correlation spine (`action_id`, `intent_id`, `plan_id`, `order_id`, `client_order_id`, `broker_order_id`, `fill_id`, `broker_execution_id`, `attempt_id`, `reconciliation_run_id`, `correlation_id`). | **adapter-pending** | Yes                             | Yes                | Yes (records center needs the spine) |
| GAP-CONTROL-001     | `TradingControlStates` / `TradingControlEvents` Spanner tables produce lifecycle blocked states (`blocked_dependency`, `blocked_by_conflict`).                                                                                                  | **adapter-pending** | Yes                             | Yes                | Yes (Surface 10 maps these)          |
| GAP-RECON-001       | `TradeReconciliationRuns` / `TradeReconciliationDiscrepancies` exist as records but have no Surface 11 mapping yet.                                                                                                                             | **adapter-pending** | No                              | No                 | Yes                                  |

---

## 9. Summary by classification

| V2 class          | Count                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------- |
| aligned           | 7 (GAP-MODE-003, GAP-CMP-001..006, GAP-CMP-004 architecturally aligned)                  |
| adapter-pending   | 13 (mapping required; backend exists)                                                    |
| bff-owned         | 6 (auth, profile, eligibility composition, decision record, disclosure ack, mode tier)   |
| partially aligned | 2 (ExecutionPolicy ownership, GAP-MODE-004)                                              |
| Daniel-confirm    | 4 (risk reason partition, template registry, signal:0 policy, ExecutionPolicy ownership) |
| skeletal          | 2 (audit-writer, compliance-adapter)                                                     |

**Net read:** No architectural misalignments remain. Every prior "misaligned / missing" classification has been reclassified as one of: aligned, adapter-pending, BFF-owned, partially aligned, Daniel-confirm, or skeletal. The frontend/BFF is acceptable as the investor-product shell. The missing layer is adapter mapping from GitLab events and tables into ReFi investor product objects, plus four Daniel-confirmation items.

---

## 10. Contract V2 and Gap Register V2 decision

### Decision

- **No rewrite is needed.** No product surface is architecturally misaligned with the GitLab backend.
- The frontend/BFF is acceptable as the investor-product shell.
- The missing layer is **adapter mapping** from GitLab events and tables into ReFi investor-product objects (SignalCandidate, RecommendationProjection, EligibilityCheck, ExecutionPolicyDecision, BrokerSubmission, ExceptionReview, RecordArtifact).
- Surface 4 (Automation Center / Execution Policy) remains **blocked** pending the four Daniel-confirmation items, the per-account ExecutionPolicy ownership decision, and contract-V2 review acceptance.
- Stale E2E cleanup is **next** after this docs gate lands.
- Production remains blocked by:
  - adapter implementation (13 adapter-pending rows)
  - durable BFF storage for profile, disclosure ack, execution policy, eligibility cache
  - `audit-writer` reaching production-ready state (currently skeletal)
  - `compliance-adapter` reaching production-ready state (currently skeletal)
  - the four Daniel-confirmation items below

### Daniel confirmation items

1. **Risk reason-code partition** — which `risk-engine` `reasons[].code` values map to `EligibilityCheck.status = "REVIEW"` vs `"DENY"`? Provisional partition is documented in the contract V2 §3.6 and §9.3 but is not authoritative.
2. **`template_id` registry / discovery shape** — how does the BFF enumerate the platform-supported templates for the investor to choose from at activation (Surface 5)? Is there a Spanner registry table, an admin-portal RPC, or a Pub/Sub topic?
3. **`signal: 0` preservation** — does GitLab's `signals` table preserve flat / hold rows (`signal = 0`) or suppress them? The adapter behavior for `0` (emit `hold` projection vs suppress) hinges on this.
4. **ExecutionPolicy ownership** — is per-account, versioned ExecutionPolicy a BFF-owned record (current) or should it move to a GitLab-side per-account policy storage table consumed by `exec-gateway`? Affects whether `policy_id` / `policy_version` on `orders.cmd` is authored upstream or carried through.

---

## 11. Scope lock — re-affirmed

No GitLab backend changes. No frontend product code changes in this branch. No new product surfaces. No SEC 203A-2(e) boundary weakened. Audit was strictly read-only. Tripwire / lint / typecheck / contract-test must remain green.
