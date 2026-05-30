# Phase 2.5 Surface-to-GitLab Alignment Register

> **Superseded note:** This document reflects Phase 2.5 alignment against `refinity-main main @ 0a7d64d`. Phase 2.6 supersedes it using `refinity-main main @ 9f9dfc9` and `docs/authoritative/*` as the backend source of truth. Retain this file as historical audit evidence. See [`phase2-6-authoritative-source-of-truth.md`](phase2-6-authoritative-source-of-truth.md).

**Date:** 2026-05-29
**Audit branch:** `phase2-5-gitlab-surface-alignment-audit`
**Audit mode:** read-only.
**Source-of-truth:** `gitlab.com/refinity_dev/refinity-main` branch `main` @ `0a7d64d` (per `phase2-5-gitlab-branch-inventory.md`).
**Companion docs:** `phase2-5-gitlab-backend-capability-map.md`, `phase2-5-frontend-surface-inventory.md`, `phase2-5-core-alignment-decision.md`.

This register pins every Phase 2 / Phase 2.5 frontend surface against the GitLab backend evidence and gives a single alignment verdict. Sixteen rows. Cross-reference column-by-column.

Alignment status legend:

- **aligned** — same shape, same wire identifier, end-to-end binding possible today.
- **partially aligned** — semantic overlap; mapping rule needed; same identifiers exist.
- **frontend-only shell** — entirely BFF + prototype-store; no backend dependency wired.
- **backend exists but adapter missing** — backend service and contract exist; BFF doesn't read them.
- **backend exists but branch unclear** — N/A here (single-branch backend).
- **misaligned** — concrete conflict (shape, semantic, or identifier).
- **blocked** — depends on a skeleton service or undecided product question.
- **unknown** — not enough evidence yet.

---

## Register

### Surface 1 — Signal vs Managed mode

| Field                             | Value                                                                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Current frontend route            | `/us/app/home`, `/us/app/recommendations`                                                                                                                      |
| Current BFF route                 | `/api/v1/investor/subscription-mode`, `/api/v1/investor/dashboard`, `/api/v1/investor/status`                                                                  |
| Current prototype-store entity    | `subscription-mode.ts`, `managed-execution-state.ts`                                                                                                           |
| Intended GitLab backend service   | `account-intent-builder` (consumes `account.admin`)                                                                                                            |
| Intended GitLab event/topic/table | `account.admin` actions `join_template`, `leave_template`, `pause_autopilot`, `resume_autopilot`                                                               |
| Backend branch                    | `main`                                                                                                                                                         |
| Backend file path                 | `apps/account-intent-builder/src/domain/processor.py:384-470`                                                                                                  |
| **Alignment status**              | **partially aligned**                                                                                                                                          |
| Misalignment                      | Backend has no "subscription mode" object; mode is emergent from per-account template subscriptions + autopilot state. Frontend's `SubscriptionMode = "signal" | "managed"` is a BFF-side projection. |
| Required adapter                  | Subscribe to `account.admin` decisions per account → derive `mode` per-account.                                                                                |
| Required test fixture             | `account.admin {join_template, pause_autopilot, resume_autopilot, leave_template}` → `SubscriptionMode` flip table.                                            |
| SEC 203A-2(e) risk                | medium                                                                                                                                                         |
| Blocks Surface 4?                 | No                                                                                                                                                             |
| Blocks Phase 2.5 merge?           | No                                                                                                                                                             |
| Blocks production?                | Yes (BFF must read real backend events)                                                                                                                        |
| Owner                             | ReFi BFF + product                                                                                                                                             |

---

### Surface 2 — Recommendations list

| Field                             | Value                                                                                                                                                                                                                                                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current frontend route            | `/us/app/recommendations`                                                                                                                                                                                                                                                                                   |
| Current BFF route                 | `/api/v1/investor/recommendations`                                                                                                                                                                                                                                                                          |
| Current prototype-store entity    | `recommendation-projection.ts`                                                                                                                                                                                                                                                                              |
| Intended GitLab backend service   | `inference-worker` (signals) → `portfolio-engine`/`portfolio-manager` → `account-intent-builder`                                                                                                                                                                                                            |
| Intended GitLab event/topic/table | Spanner `signals`; Pub/Sub `account.intent.ready`                                                                                                                                                                                                                                                           |
| Backend branch                    | `main`                                                                                                                                                                                                                                                                                                      |
| Backend file path                 | `apps/inference-worker/src/orchestrator/orchestrator.py`, `apps/account-intent-builder/src/interface/pubsub.py`                                                                                                                                                                                             |
| **Alignment status**              | **backend exists but adapter missing**                                                                                                                                                                                                                                                                      |
| Misalignment                      | Frontend builds `Recommendation` from `recommendation-projection.ts` (prototype store). The mapping rule from `account.intent.ready` event body + signal lineage → `RecommendationProjection` is unspecified. Multi-stream (`AAPL~rf` and `AAPL~rl` coexist) is unaddressed in the current frontend schema. |
| Required adapter                  | Subscribe to `account.intent.ready`; join with `signals` for stream lineage; project into `RecommendationProjection`.                                                                                                                                                                                       |
| Required test fixture             | Per `phase2-5-daniel-adapter-fixtures-required.md` (10 cases) — but with corrections from `phase2-5-gitlab-contract-delta.md`.                                                                                                                                                                              |
| SEC 203A-2(e) risk                | high                                                                                                                                                                                                                                                                                                        |
| Blocks Surface 4?                 | No (BFF can keep simulating)                                                                                                                                                                                                                                                                                |
| Blocks Phase 2.5 merge?           | No                                                                                                                                                                                                                                                                                                          |
| Blocks production?                | Yes                                                                                                                                                                                                                                                                                                         |
| Owner                             | ReFi BFF + Daniel (event contract owner)                                                                                                                                                                                                                                                                    |

---

### Surface 3 — Recommendation detail

| Field                             | Value                                                                                                                                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current frontend route            | `/us/app/recommendations/[id]`                                                                                                                                                               |
| Current BFF route                 | `/api/v1/investor/recommendations/[id]`                                                                                                                                                      |
| Current prototype-store entity    | `recommendation-projection.ts`, `decision-record.ts`, `exception-review.ts`                                                                                                                  |
| Intended GitLab backend service   | `risk-engine` (risk decision + reasons) + `account-intent-builder` (intent context)                                                                                                          |
| Intended GitLab event/topic/table | `risk.approved` OR `risk.rejected` + `account.intent.ready`                                                                                                                                  |
| Backend branch                    | `main`                                                                                                                                                                                       |
| Backend file path                 | `apps/risk-engine/src/decision_builder.py`, `apps/risk-engine/src/models.py:132-144` (`RiskDecision`)                                                                                        |
| **Alignment status**              | **partially aligned (with critical ternary-vs-binary mismatch)**                                                                                                                             |
| Misalignment                      | Backend `RiskDecision.decision` is binary (`approved                                                                                                                                         | rejected`); frontend `automation_eligibility.status` is ternary (`ALLOW | REVIEW | DENY`). Reason codes (`LEVERAGE_LIMIT`, `SINGLE_NAME_CONC_LIMIT`, `SECTOR_CONC_LIMIT`, `VAR_LIMIT`) need investor-facing-label mapping that does not exist yet. |
| Required adapter                  | Map `risk.approved → ALLOW`; `risk.rejected + retry_hint → REVIEW`; `risk.rejected + hard reason → DENY`; no response → `UNAVAILABLE`. Define the recoverable-vs-hard partition with Daniel. |
| Required test fixture             | One case per `RiskReason.code` showing the resulting `automation_eligibility.status` and `data-eligibility` attribute.                                                                       |
| SEC 203A-2(e) risk                | **critical** (this is the fail-closed gate)                                                                                                                                                  |
| Blocks Surface 4?                 | No (§A + §B + §C + §D guarantee structural boundary today)                                                                                                                                   |
| Blocks Phase 2.5 merge?           | No                                                                                                                                                                                           |
| Blocks production?                | Yes                                                                                                                                                                                          |
| Owner                             | ReFi BFF + Daniel (reason-code-to-verdict mapping requires both)                                                                                                                             |

---

### Surface 4 — Automation Center (Execution Policy)

| Field                             | Value                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Current frontend route            | `/us/app/settings/automation`                                                                                                                                                                                                                                                                                                                                                              |
| Current BFF route                 | `/api/v1/investor/execution-policy/{,draft,activate}`, `/api/v1/investor/managed/{state,pause,resume}`                                                                                                                                                                                                                                                                                     |
| Current prototype-store entity    | `execution-policy.ts`, `execution-policy-draft.ts`, `managed-execution-state.ts`                                                                                                                                                                                                                                                                                                           |
| Intended GitLab backend service   | none direct; `account.admin` actions cover the lifecycle changes but there is no single "ExecutionPolicy" object on the backend                                                                                                                                                                                                                                                            |
| Intended GitLab event/topic/table | `account.admin actions ∈ {pause_autopilot, resume_autopilot, update_prefs}`                                                                                                                                                                                                                                                                                                                |
| Backend branch                    | `main`                                                                                                                                                                                                                                                                                                                                                                                     |
| Backend file path                 | `apps/account-intent-builder/src/domain/processor.py`                                                                                                                                                                                                                                                                                                                                      |
| **Alignment status**              | **frontend-only shell + partially aligned at the action edges**                                                                                                                                                                                                                                                                                                                            |
| Misalignment                      | The versioned `ExecutionPolicy` record is a BFF construct that does not exist on the backend. Investor-side policy constraints (`maxSingleOrderUsd`, `maxPositionSizeBps`, etc.) are not parameters that admin-portal currently passes through `account.admin`. The backend's risk constraints (`LEVERAGE_LIMIT`, `VAR_LIMIT`, etc.) live in `risk-engine` config, not per-account policy. |
| Required adapter                  | (1) Map investor-edited policy params into either a new Daniel-side `account_policy` table OR keep BFF-owned. (2) Map pause/resume to `account.admin`. (3) Reconcile risk constraints vs. policy constraints.                                                                                                                                                                              |
| Required test fixture             | Activate flow: investor signs policy v3 → BFF stores → `account.admin action=resume_autopilot` emitted → backend confirms; pause flow: `account.admin action=pause_autopilot` emitted → backend `pause_managed` event echoed back.                                                                                                                                                         |
| SEC 203A-2(e) risk                | high                                                                                                                                                                                                                                                                                                                                                                                       |
| Blocks Surface 4?                 | n/a (this IS the surface scope)                                                                                                                                                                                                                                                                                                                                                            |
| Blocks Phase 2.5 merge?           | No                                                                                                                                                                                                                                                                                                                                                                                         |
| Blocks production?                | Yes (the policy version → activation persistence path needs a real backend commit)                                                                                                                                                                                                                                                                                                         |
| Owner                             | ReFi BFF + product (decide BFF-owned vs Daniel-owned policy)                                                                                                                                                                                                                                                                                                                               |

---

### Surface 5 — Managed activation

| Field                             | Value                                                                                                                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current frontend route            | `/us/app/settings/automation/activate`                                                                                                                                              |
| Current BFF route                 | `POST /api/v1/investor/execution-policy/activate`                                                                                                                                   |
| Current prototype-store entity    | `lifecycle.ts`, `activation-idempotency.ts`, `execution-policy.ts`, `managed-execution-state.ts`, `subscription-mode.ts`                                                            |
| Intended GitLab backend service   | `account-intent-builder` (consumes `account.admin`)                                                                                                                                 |
| Intended GitLab event/topic/table | `account.admin actions ∈ {join_template, resume_autopilot}` + downstream `account.intent.ready`                                                                                     |
| Backend branch                    | `main`                                                                                                                                                                              |
| Backend file path                 | `apps/account-intent-builder/src/domain/processor.py:384, 406`                                                                                                                      |
| **Alignment status**              | **backend exists but adapter missing**                                                                                                                                              |
| Misalignment                      | `join_template` requires `template_id`; investor's chosen strategy must map to a Daniel `template_id`. The strategy registry on the backend is not yet inspected at the wire level. |
| Required adapter                  | On activation, emit `account.admin action=join_template + resume_autopilot` (or two events).                                                                                        |
| Required test fixture             | "Maya activates Managed" → BFF posts to admin-portal → `account.admin` events emitted → `account.intent.ready` arrives → first recommendation flows.                                |
| SEC 203A-2(e) risk                | high                                                                                                                                                                                |
| Blocks Surface 4?                 | n/a (this is Surface 3 in our numbering; "Surface 4" in the user's directive is the next surface beyond Phase 2.5 — see §6 below)                                                   |
| Blocks Phase 2.5 merge?           | No                                                                                                                                                                                  |
| Blocks production?                | Yes                                                                                                                                                                                 |
| Owner                             | ReFi BFF + Daniel (template-id registry + activation event contract)                                                                                                                |

---

### Surface 6 — Pause / Resume Managed

| Field                             | Value                                                                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current frontend route            | `/us/app/settings/automation` (inline controls)                                                                                                                |
| Current BFF route                 | `/api/v1/investor/managed/{pause,resume}`                                                                                                                      |
| Current prototype-store entity    | `managed-execution-state.ts`                                                                                                                                   |
| Intended GitLab backend service   | `account-intent-builder` consuming `account.admin`                                                                                                             |
| Intended GitLab event/topic/table | `account.admin actions ∈ {pause_autopilot, resume_autopilot}`                                                                                                  |
| Backend branch                    | `main`                                                                                                                                                         |
| Backend file path                 | `apps/account-intent-builder/src/domain/processor.py:402-406`; admin-portal emitter at `apps/admin-portal/backend/pubsub_mgr.py:140` (`publish_account_admin`) |
| **Alignment status**              | **aligned (semantic 1:1)**                                                                                                                                     |
| Misalignment                      | None at the action vocabulary level. The frontend's pause/resume buttons map directly to `pause_autopilot`/`resume_autopilot`.                                 |
| Required adapter                  | BFF on pause/resume → POST to admin-portal (which emits the Pub/Sub event), or BFF emits directly if it gets publish credentials.                              |
| Required test fixture             | "Maya pauses Managed via UI" → emits `account.admin action=pause_autopilot` → state flips → frontend reflects.                                                 |
| SEC 203A-2(e) risk                | medium                                                                                                                                                         |
| Blocks Surface 4?                 | No                                                                                                                                                             |
| Blocks Phase 2.5 merge?           | No                                                                                                                                                             |
| Blocks production?                | Yes (wire-level binding required)                                                                                                                              |
| Owner                             | ReFi BFF                                                                                                                                                       |

---

### Surface 7 — Disclosure re-acknowledgement

| Field                             | Value                                                                                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current frontend route            | `/us/app/settings/automation/disclosures`                                                                                                                            |
| Current BFF route                 | `/api/v1/investor/disclosures/{reacknowledgement,reacknowledge,[id]/acknowledge}`                                                                                    |
| Current prototype-store entity    | `disclosure-acknowledgement.ts`, `disclosure-document.ts`                                                                                                            |
| Intended GitLab backend service   | **none**                                                                                                                                                             |
| Intended GitLab event/topic/table | n/a                                                                                                                                                                  |
| Backend branch                    | n/a                                                                                                                                                                  |
| Backend file path                 | n/a                                                                                                                                                                  |
| **Alignment status**              | **frontend-only shell**                                                                                                                                              |
| Misalignment                      | Disclosure delivery + ack are not on Daniel's backend at all. `audit-writer` (skeleton today) would eventually persist `audit.evt` records of acks for 7y retention. |
| Required adapter                  | none beyond persistence; remains BFF-owned.                                                                                                                          |
| Required test fixture             | n/a beyond what exists.                                                                                                                                              |
| SEC 203A-2(e) risk                | high (disclosures are regulatory record class)                                                                                                                       |
| Blocks Surface 4?                 | No                                                                                                                                                                   |
| Blocks Phase 2.5 merge?           | No                                                                                                                                                                   |
| Blocks production?                | Yes (durable storage needed; `audit-writer` integration when it ships)                                                                                               |
| Owner                             | ReFi BFF                                                                                                                                                             |

---

### Surface 8 — Profile staleness / reactivation

| Field                             | Value                                                                                                                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current frontend route            | `/us/app/settings/automation/profile`                                                                                                                                                          |
| Current BFF route                 | `/api/v1/investor/profile/{reactivation,reconfirm}`                                                                                                                                            |
| Current prototype-store entity    | `profile-confirmation.ts`, `advisory-profile.ts`                                                                                                                                               |
| Intended GitLab backend service   | **none direct**                                                                                                                                                                                |
| Intended GitLab event/topic/table | (optional) `account.admin action=update_prefs` if profile changes alter execution params                                                                                                       |
| Backend branch                    | `main`                                                                                                                                                                                         |
| Backend file path                 | `apps/account-intent-builder/src/domain/processor.py:414`                                                                                                                                      |
| **Alignment status**              | **frontend-only shell**                                                                                                                                                                        |
| Misalignment                      | Daniel's backend doesn't have a separate "advisory profile" concept; per-account prefs go through `account.admin update_prefs`. The investor's full profile (suitability fields) is BFF-owned. |
| Required adapter                  | none beyond persistence; profile is BFF-owned.                                                                                                                                                 |
| Required test fixture             | n/a beyond what exists.                                                                                                                                                                        |
| SEC 203A-2(e) risk                | high (profile = suitability inputs)                                                                                                                                                            |
| Blocks Surface 4?                 | No                                                                                                                                                                                             |
| Blocks Phase 2.5 merge?           | No                                                                                                                                                                                             |
| Blocks production?                | Yes (durable storage; cross-reference to `audit-writer`)                                                                                                                                       |
| Owner                             | ReFi BFF                                                                                                                                                                                       |

---

### Surface 9 — Eligibility presentation

| Field                             | Value                                             |
| --------------------------------- | ------------------------------------------------- |
| Current frontend route            | `/us/eligibility`                                 |
| Current BFF route                 | `POST /api/us/eligibility`                        |
| Current prototype-store entity    | none                                              |
| Intended GitLab backend service   | future `compliance-adapter` (skeleton today)      |
| Intended GitLab event/topic/table | n/a                                               |
| Backend branch                    | n/a                                               |
| Backend file path                 | n/a                                               |
| **Alignment status**              | **frontend-only shell**                           |
| Misalignment                      | none (intentionally BFF-owned for pre-auth flow). |
| Required adapter                  | none.                                             |
| Required test fixture             | covered by `e2e/eligibility.spec.ts` (WIP).       |
| SEC 203A-2(e) risk                | medium                                            |
| Blocks Surface 4?                 | No                                                |
| Blocks Phase 2.5 merge?           | No                                                |
| Blocks production?                | No                                                |
| Owner                             | ReFi BFF                                          |

---

### Surface 10 — Exception Review (Surface 7 in Phase 2 numbering)

| Field                             | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current frontend route            | `/us/app/exceptions`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Current BFF route                 | `/api/v1/investor/exceptions` (+ subroutes)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Current prototype-store entity    | `exception-review.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Intended GitLab backend service   | `risk-engine` (`risk.rejected` events) + `TradingControlStates`/`TradingControlEvents`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Intended GitLab event/topic/table | `dev-risk.rejected`; Spanner `TradingControlStates`, `TradingControlEvents`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Backend branch                    | `main`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Backend file path                 | `apps/risk-engine/src/decision_builder.py`, `apps/risk-engine/src/spanner_repo.py:92` (`set_trading_control`), `apps/exec-gateway/src/models/domain.py:14` (`OrderStatus`: `RECONCILIATION_PENDING`, `BLOCKED_BY_CONFLICT`, etc.)                                                                                                                                                                                                                                                                                                                                                  |
| **Alignment status**              | **partially aligned**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Misalignment                      | The frontend's Exception Review queue mixes risk-rejected items, trading-control blocks, broker-error states. Each has a different backend source. The "exception" concept must be assembled across `risk.rejected` events + `TradingControlEvents` + `OrderEvents` (lifecycle states like `BLOCKED_DEPENDENCY`, `RECONCILIATION_PENDING`). Surface 7's resolution categories (`update_profile`, `reconnect_broker`, `acknowledge_disclosure`, `pause_managed`) map to one of: BFF-side state mutation (profile/disclosure), broker-reconnect, OR `account.admin pause_autopilot`. |
| Required adapter                  | Construct an "Exception" view by joining `risk.rejected.reason.code` + active `TradingControlStates` + `OrderEvents.blocked_*` states → `ExceptionReview` queue items. Resolution actions map to either BFF-side mutations OR `account.admin` events.                                                                                                                                                                                                                                                                                                                              |
| Required test fixture             | Each `RiskReason.code` + each `TradingControl` scope → expected `Exception.exception_type` + resolution category.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| SEC 203A-2(e) risk                | **critical** (Exception Review is the safety surface in front of execution)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Blocks Surface 4?                 | No (§A + §B + §D enforce the boundary today)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Blocks Phase 2.5 merge?           | No                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Blocks production?                | Yes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Owner                             | ReFi BFF + Daniel (event-to-exception-type mapping table)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

---

### Surface 11 — Records Center

| Field                             | Value                                                                                                                                                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current frontend route            | `/us/app/portfolio`, `/us/app/activity`, `/us/app/documents`                                                                                                                                                     |
| Current BFF route                 | `/api/v1/investor/records*`, `/api/v1/investor/activity*`, `/api/v1/disclosures*`                                                                                                                                |
| Current prototype-store entity    | `receipt.ts`, `record-access-log.ts`, `decision-record.ts`, `disclosure-document.ts`                                                                                                                             |
| Intended GitLab backend service   | `audit-writer` (skeleton today) + Spanner lifecycle tables (`Orders`, `OrderEvents`, `Fills`, `BrokerOrderAttempts`, `BrokerInteractionsLog`, `TradeReconciliationRuns`)                                         |
| Intended GitLab event/topic/table | `dev-audit.evt` + lifecycle Spanner tables                                                                                                                                                                       |
| Backend branch                    | `main`                                                                                                                                                                                                           |
| Backend file path                 | `docs/architecture/trade_lifecycle_contract.md`; `apps/audit-writer/README.md`                                                                                                                                   |
| **Alignment status**              | **backend partially exists (lifecycle is there; audit-writer is a skeleton)**                                                                                                                                    |
| Misalignment                      | Execution-side records are real Spanner tables; investor-side `InvestorActionReceipt` + `RecordAccessLog` are BFF-only. `audit-writer` will need to ship before regulatory 7y retention is wire-level satisfied. |
| Required adapter                  | (1) Read execution records from `Orders`, `OrderEvents`, etc. (2) Persist investor-side receipts and access logs via the BFF + eventual `audit-writer`.                                                          |
| Required test fixture             | Every record class from `memory/contract_receipt_vs_access_log.md` × persistence path.                                                                                                                           |
| SEC 203A-2(e) risk                | **critical** (records are the regulatory product proof)                                                                                                                                                          |
| Blocks Surface 4?                 | No                                                                                                                                                                                                               |
| Blocks Phase 2.5 merge?           | No                                                                                                                                                                                                               |
| Blocks production?                | Yes (until `audit-writer` ships)                                                                                                                                                                                 |
| Owner                             | ReFi BFF + Daniel (`audit-writer` schedule)                                                                                                                                                                      |

---

### Surface 12 — Support boundary

| Field                             | Value                                                                                                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current frontend route            | `/us/app/support`                                                                                                                                                       |
| Current BFF route                 | `POST /api/v1/support/ticket`                                                                                                                                           |
| Current prototype-store entity    | none                                                                                                                                                                    |
| Intended GitLab backend service   | **none**                                                                                                                                                                |
| Intended GitLab event/topic/table | n/a                                                                                                                                                                     |
| Backend branch                    | n/a                                                                                                                                                                     |
| Backend file path                 | n/a                                                                                                                                                                     |
| **Alignment status**              | **frontend-only shell (by design)**                                                                                                                                     |
| Misalignment                      | Support is a BFF-owned concern by 203A-2(e) construction. The SBR-\* classifier blocks per-trade advice prompts; Daniel's backend has no support concept and shouldn't. |
| Required adapter                  | none.                                                                                                                                                                   |
| Required test fixture             | §D `support-boundary-preservation.spec.ts` (already 8/8 green).                                                                                                         |
| SEC 203A-2(e) risk                | **critical** but **boundary intact** today.                                                                                                                             |
| Blocks Surface 4?                 | No                                                                                                                                                                      |
| Blocks Phase 2.5 merge?           | No                                                                                                                                                                      |
| Blocks production?                | No                                                                                                                                                                      |
| Owner                             | ReFi BFF                                                                                                                                                                |

---

### Surface 13 — Broker submission path

| Field                             | Value                                                                                                                                                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current frontend route            | `/us/app/recommendations/[id]`, `/us/app/portfolio` (read-only positions), `/us/onboarding/broker`                                                                                                               |
| Current BFF route                 | `/api/v1/investor/orders`, `/api/v1/investor/orders/[client_order_id]/lineage`, `/api/v1/brokers/*`                                                                                                              |
| Current prototype-store entity    | `brokerage-connection.ts`                                                                                                                                                                                        |
| Intended GitLab backend service   | `trade-manager` (broker submission), `exec-gateway` (order command), `risk-engine` (approval gate)                                                                                                               |
| Intended GitLab event/topic/table | `dev-orders.cmd`, `dev-orders.evt`; Spanner `Orders`, `OrderEvents`, `BrokerOrderAttempts`, `Fills`, `OrderIdMap`                                                                                                |
| Backend branch                    | `main`                                                                                                                                                                                                           |
| Backend file path                 | `apps/exec-gateway/src/`, `apps/trade-manager/src/`                                                                                                                                                              |
| **Alignment status**              | **backend exists but adapter missing**                                                                                                                                                                           |
| Misalignment                      | Frontend's `/api/v1/orders` schema is far simpler than backend `Order` (15-state lifecycle, plan/intent/broker/attempt IDs). No per-trade Accept ever reaches this path on the frontend (tripwire + §A enforce). |
| Required adapter                  | (1) Don't expose `Order` for investor input — Order is system-generated downstream of `account.intent.ready`. (2) Expose READ-ONLY order lineage in Records Center.                                              |
| Required test fixture             | Read-only Order rendering with full lineage; per `phase2-5-daniel-adapter-fixtures-required.md`.                                                                                                                 |
| SEC 203A-2(e) risk                | **critical**                                                                                                                                                                                                     |
| Blocks Surface 4?                 | No (§A enforces structural absence)                                                                                                                                                                              |
| Blocks Phase 2.5 merge?           | No                                                                                                                                                                                                               |
| Blocks production?                | Yes                                                                                                                                                                                                              |
| Owner                             | ReFi BFF + Daniel                                                                                                                                                                                                |

---

### Surface 14 — Admin boundary

| Field                             | Value                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| Current frontend route            | **none** (intentionally absent from `apps/web`)                                           |
| Current BFF route                 | none                                                                                      |
| Current prototype-store entity    | none                                                                                      |
| Intended GitLab backend service   | `admin-portal` (separate Next.js + Python app)                                            |
| Intended GitLab event/topic/table | `template.admin`, `account.admin`                                                         |
| Backend branch                    | `main`                                                                                    |
| Backend file path                 | `apps/admin-portal/` (separate full-stack app in GitLab)                                  |
| **Alignment status**              | **aligned (vacuously — admin lives in a different app)**                                  |
| Misalignment                      | None at the boundary level. ReFi's investor-facing app never invokes admin-portal events. |
| Required adapter                  | none. Tripwire ensures no admin language leaks into investor UI.                          |
| Required test fixture             | tripwire scan + §A structural absence + §D forbidden-label check.                         |
| SEC 203A-2(e) risk                | **critical** but **boundary intact** by separation of apps.                               |
| Blocks Surface 4?                 | No                                                                                        |
| Blocks Phase 2.5 merge?           | No                                                                                        |
| Blocks production?                | No                                                                                        |
| Owner                             | ReFi (boundary maintenance) + Daniel (admin-portal owner)                                 |

---

### Surface 15 — Tripwire enforcement

| Field                             | Value                                                                                                                                                                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current frontend route            | n/a (build-time tool)                                                                                                                                                                                                        |
| Current BFF route                 | n/a                                                                                                                                                                                                                          |
| Current prototype-store entity    | n/a                                                                                                                                                                                                                          |
| Intended GitLab backend service   | n/a                                                                                                                                                                                                                          |
| Intended GitLab event/topic/table | n/a                                                                                                                                                                                                                          |
| Backend branch                    | n/a                                                                                                                                                                                                                          |
| Backend file path                 | `scripts/tripwire-investor-boundary.ts` (ReFi side); checks 144 files.                                                                                                                                                       |
| **Alignment status**              | **aligned**                                                                                                                                                                                                                  |
| Misalignment                      | None. Existing FORBIDDEN_LABELS / FORBIDDEN_ACTION_IDS already include `template.admin`, `target_account_id`, `manual_rebalance`, `approveRebalance`, `adminRebalance`, etc. — exactly the tokens GitLab admin-portal emits. |
| Required adapter                  | none.                                                                                                                                                                                                                        |
| Required test fixture             | `pnpm tripwire` — 0 violations / 144 files (current).                                                                                                                                                                        |
| SEC 203A-2(e) risk                | **critical** but **boundary intact**.                                                                                                                                                                                        |
| Blocks Surface 4?                 | No                                                                                                                                                                                                                           |
| Blocks Phase 2.5 merge?           | No                                                                                                                                                                                                                           |
| Blocks production?                | No (must remain load-bearing)                                                                                                                                                                                                |
| Owner                             | ReFi (frontend tooling)                                                                                                                                                                                                      |

---

### Surface 16 — Stale E2E coverage

| Field                             | Value                                                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Current frontend route            | n/a                                                                                                                                                                      |
| Current BFF route                 | n/a                                                                                                                                                                      |
| Current prototype-store entity    | n/a                                                                                                                                                                      |
| Intended GitLab backend service   | n/a                                                                                                                                                                      |
| Intended GitLab event/topic/table | n/a                                                                                                                                                                      |
| Backend branch                    | n/a                                                                                                                                                                      |
| Backend file path                 | `apps/web/e2e/eligibility.spec.ts`, `auth.spec.ts:21`, `onboarding.spec.ts`, `support.spec.ts`, `recommendations.spec.ts`                                                |
| **Alignment status**              | **frontend-only** (test infrastructure; not a product surface)                                                                                                           |
| Misalignment                      | The stale specs predate the BFF + persona + adapter work and assert against drifted copy. WIP rewrite on `phase2-5-stale-e2e-cleanup` (stashed; not yet on this branch). |
| Required adapter                  | none.                                                                                                                                                                    |
| Required test fixture             | the rewritten specs themselves.                                                                                                                                          |
| SEC 203A-2(e) risk                | low (boundary already enforced by §A–§D + tripwire)                                                                                                                      |
| Blocks Surface 4?                 | No                                                                                                                                                                       |
| Blocks Phase 2.5 merge?           | **Yes** (per `phase2-5-pr-description.md` §6)                                                                                                                            |
| Blocks production?                | No                                                                                                                                                                       |
| Owner                             | ReFi (test maintenance)                                                                                                                                                  |

---

## Scope lock — re-affirmed

No frontend product code changes. No backend touches. No SEC 203A-2(e) boundary weakened. Audit was strictly read-only.
