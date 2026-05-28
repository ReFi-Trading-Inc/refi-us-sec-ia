# Phase 2.5 Signal-to-Investor-Product Contract

**Date:** 2026-05-28
**Branch:** `phase2-5-wip-rebase`
**Status:** Phase 2.5 merge gate contract. **Not** a Phase 3 implementation design.
**Source-of-truth audit:** [`docs/phase2-5-daniel-backend-reconciliation.md`](./phase2-5-daniel-backend-reconciliation.md)
**Sibling docs:** [`phase2-5-handoff.md`](./phase2-5-handoff.md), [`phase2-5-gate-cleanup.md`](./phase2-5-gate-cleanup.md), [`phase2-5-replacement-e2e-backlog.md`](./phase2-5-replacement-e2e-backlog.md), [`phase2-5-post-rebase-checkpoint.md`](./phase2-5-post-rebase-checkpoint.md).

This document is the authoritative bridge between Daniel's `live-components-main` backend (the signal engine) and the ReFi US SEC 203A-2(e) investor-product shell (the frontend + BFF). It defines a **contract boundary**, not an implementation. No code is being written against it in this branch.

---

## 1. Source of Truth Split

The ownership boundary between Daniel's backend and the ReFi investor-product layer is hard.

### Daniel backend owns

- signal generation
- portfolio analysis
- model outputs
- asset data (raw price data, indicator data, processed indicators)
- strategy analytics (RF strategies, RL strategies, strategy selector)
- signal freshness metadata (`asset_status`, `last_prediction_ts`)
- ML pipeline output (`live_signals`, `rl_predictions`, `sharpe_series`)

### ReFi BFF / investor-product layer owns

- investor identity
- investor account context (`account_id`, `account_intent_id`)
- investor profile (`/api/v1/profile`)
- KYC state (`/api/v1/ccid/*`)
- disclosures (`/api/v1/disclosures`)
- disclosure acknowledgments (`/api/v1/disclosures/{doc_id}/ack`)
- subscription mode (Signal vs Managed; `Tier` enum)
- Signal vs Managed branching (Phase 2 Surface 1 + `mode-branching.spec.ts`)
- execution policy (`/api/v1/execution-policy/*`, `ExecutionPolicy` schema)
- pause / resume lifecycle (`/api/v1/execution-policy/pause`, Surface 5)
- eligibility logic (`automation_eligibility.status ∈ {ALLOW, REVIEW, DENY}`)
- exception flow (`/api/v1/exceptions/*`, Surface 7)
- records center (`/api/v1/records/*`)
- broker submission policy (`/api/v1/orders`, `/api/v1/broker/*`)
- SEC 203A-2(e) product boundaries (tripwire + §A + §B + §C + §D coverage)

### Critical rule

**Daniel's raw output is never directly executable.**

Daniel output must pass through the ReFi investor-product contract before anything becomes:

- investor-visible
- eligible for managed execution
- routed to broker
- routed to exception review
- stored as a record artifact

Any path that bypasses this contract — for example, a hypothetical Cloud Function that reads `live_signals` and calls a broker SDK directly — is a SEC 203A-2(e) boundary violation by construction and must be prevented at the architecture level, not detected after the fact.

---

## 2. Adapter Boundary

The contract boundary between the two source-of-truth domains is:

```
Daniel signal output
    └─▶ SignalCandidate           (normalized, deduped, freshness-checked)
        └─▶ RecommendationProjection   (investor-facing recommendation)
            └─▶ EligibilityCheck       (per-account ALLOW | REVIEW | DENY)
                └─▶ ExecutionPolicyDecision  (one of: ROUTE_TO_BROKER, ROUTE_TO_EXCEPTION, RECORD_ONLY, BLOCK)
                    ├─▶ BrokerSubmission    (when ROUTE_TO_BROKER)
                    ├─▶ ExceptionReview     (when ROUTE_TO_EXCEPTION)
                    └─▶ RecordCenter artifact  (always — every transition emits a RecordArtifact)
```

**Adapter name:** `SignalToInvestorProductAdapter`.

This is a **contract boundary**, not an implementation task in this branch.

The adapter must:

- normalize Daniel output into `SignalCandidate`
- reject malformed fields (missing symbol, missing timestamp, invalid side)
- dedupe repeated signals using deterministic signal identity (see §7 Question 4)
- enforce signal freshness (see §7 Question 3)
- attach strategy and model metadata (`strategy_id`, `model_version`)
- map signal direction (`+1 | -1`) into investor-facing recommendation intent (`buy | sell | hold | exit`)
- prevent direct broker execution
- prevent any per-trade investor-accept flow
- create the correct downstream audit trail (`InvestorActionReceipt` for state changes; `RecordAccessLog` for views; never mixed — see `memory/contract_receipt_vs_access_log.md`)

---

## 3. Required Contract Objects

TypeScript-style interfaces. Where Daniel field shapes are not confirmed from `live-components-main`, the field is marked `TODO(confirm-daniel-field)` and a sensible default is sketched.

### DanielSignalRaw

Shape inferred from `live-components-main/Inference Pipeline/generate_final_signal.py` writing to the `live_signals` MongoDB collection, plus `rl_predictions` and `sharpe_series` collections. Exact projection at the read boundary is `TODO(confirm-daniel-field)`.

```ts
interface DanielSignalRaw {
  symbol: string; // e.g. "IBM"
  signal: -1 | 1; // generate_final_signal.py output
  predicted_at: string; // ISO-8601, derived from MongoDB timestamp
  model_version: string; // TODO(confirm-daniel-field) — pipeline writes per-symbol RL models with weekly retrain cadence
  strategy_id: string; // TODO(confirm-daniel-field) — surfaces from `selected_features` / strategy selector
  confidence_score?: number; // TODO(confirm-daniel-field) — rl_predictions writes Q-values; mapping to a single scalar TBD
  sharpe_metric?: number; // TODO(confirm-daniel-field) — sharpe_series collection value
  asset_status?: // From `asset_status` collection
    "Ready for Inference" | "Needs Model Update" | "Inference in Progress";
  last_prediction_ts?: string; // From `asset_status.last_prediction_ts`
  source_collection:
    | "live_signals"
    | "rl_predictions"
    | "sharpe_series"
    | string;
  source_route?: string; // If transported via Pub/Sub or polled via a future Daniel-side HTTP endpoint
}
```

### SignalCandidate

Normalized internal form. Adapter-owned. This is the first object that lives entirely on the ReFi side.

```ts
interface SignalCandidate {
  signal_id: string; // Adapter-assigned ULID; deterministic from raw_source_ref
  source: "daniel-live-signals" | "daniel-rl-predictions" | string;
  symbol: string;
  side: "long" | "short"; // mapped from DanielSignalRaw.signal
  strategy_id: string;
  model_version: string;
  predicted_at: string; // ISO-8601
  received_at: string; // ISO-8601, set at adapter intake
  freshness_status: "fresh" | "stale" | "expired"; // computed per §7 Question 3
  confidence_score: number | null;
  risk_metric: number | null; // typically sharpe_metric
  raw_source_ref: {
    // identity for dedupe
    source: string;
    symbol: string;
    strategy_id: string;
    model_version: string;
    predicted_at: string;
    side: "long" | "short";
  };
  normalization_status: "ok" | "rejected";
  rejection_reason: string | null; // null when normalization_status === "ok"
}
```

### RecommendationProjection

The investor-product recommendation object. This is the contract surface §B's `data-eligibility` indirectly depends on, and the §A "no per-trade button" boundary structurally constrains.

```ts
interface RecommendationProjection {
  recommendation_id: string; // opaque ULID; the frontend's `intent_id`
  signal_id: string; // back-reference to SignalCandidate
  account_id: string;
  symbol: string;
  side: "long" | "short";
  recommendation_type: // mapped from side + strategy posture
    "open_long" | "open_short" | "close_long" | "close_short" | "hold";
  advisory_context: {
    // matches frontend `AdvisoryContext` schema
    summary: string;
    why_now: string;
    model_factors: string[];
    decision_record_ref: string;
  };
  model_factors: { factor: string; weight: number }[];
  risk_summary: {
    risk_metric: number | null;
    horizon: string;
  };
  created_at: string;
  status: // matches frontend `RecommendationStatus`
    | "draft"
    | "active"
    | "rejected"
    | "review_required"
    | "executed"
    | "expired";
  eligibility_required: true; // always true — no projection bypasses eligibility
  execution_policy_required: true; // always true — no projection bypasses ExecutionPolicy
}
```

### EligibilityCheck

```ts
interface EligibilityCheck {
  eligibility_id: string;
  recommendation_id: string;
  account_id: string;
  status: "ALLOW" | "REVIEW" | "DENY"; // exactly the §B `data-eligibility` values
  reason_codes: string[]; // e.g. ["KYC_OK", "SIGNAL_STALE", "BROKER_DATA_STALE"]
  kyc_status: "verified" | "pending" | "rejected" | "expired";
  profile_status: "complete" | "incomplete" | "outdated";
  disclosure_ack_status: "current" | "missing_acks" | "outdated";
  broker_connection_status:
    | "connected_fresh"
    | "connected_stale"
    | "disconnected"
    | "pending";
  position_concentration_status:
    | "within_limits"
    | "near_limit"
    | "over_limit"
    | "unknown";
  signal_freshness_status: "fresh" | "stale" | "expired";
  checked_at: string;
}
```

### ExecutionPolicyDecision

```ts
interface ExecutionPolicyDecision {
  decision_id: string;
  recommendation_id: string;
  account_id: string;
  subscription_mode: "signal" | "managed";
  managed_state: // matches Phase 2 Surface 3+5+6 lifecycle
    | "not_activated"
    | "active"
    | "paused"
    | "pending_profile_update"
    | "pending_disclosure_ack"
    | "deactivated";
  policy_id: string; // current ExecutionPolicy id
  eligibility_status: "ALLOW" | "REVIEW" | "DENY";
  decision: "ROUTE_TO_BROKER" | "ROUTE_TO_EXCEPTION" | "RECORD_ONLY" | "BLOCK";
  reason_codes: string[];
  decided_at: string;
}
```

### BrokerSubmission

```ts
interface BrokerSubmission {
  broker_submission_id: string;
  decision_id: string; // back-reference to ExecutionPolicyDecision
  account_id: string;
  broker_account_id: string;
  order_intent: {
    symbol: string;
    side: "buy" | "sell"; // mapped from RecommendationProjection.side
    quantity: number;
    time_in_force: "day" | "gtc";
  };
  order_preview: {
    estimated_fill_price: number | null;
    estimated_notional: number | null;
    risk_check_summary: string | null;
  };
  submission_status:
    | "queued"
    | "submitted"
    | "filled"
    | "partial_fill"
    | "rejected"
    | "cancelled";
  submitted_at: string;
  broker_response_ref: string | null;
}
```

### ExceptionReview

```ts
interface ExceptionReview {
  exception_id: string;
  decision_id: string;
  account_id: string;
  recommendation_id: string;
  exception_type: // matches Surface 7 fixture taxonomy
    | "stale_broker_data"
    | "missing_disclosure_ack"
    | "concentration_limit"
    | "kyc_expired"
    | "profile_update_required"
    | "signal_freshness";
  reason_codes: string[];
  status: "open" | "resolved" | "dismissed"; // UI: "resolve" / "dismiss"; backend: "approve" / "reject" (Surface 7 aliasing)
  created_at: string;
  resolved_at: string | null;
}
```

### RecordArtifact

```ts
interface RecordArtifact {
  record_id: string;
  account_id: string;
  artifact_type:
    | "recommendation"
    | "execution_plan"
    | "broker_submission"
    | "exception"
    | "disclosure_ack"
    | "support_ticket"
    | "investor_action_receipt"
    | "record_access_log";
  source_object_type: // which contract object this artifact records
    | "RecommendationProjection"
    | "ExecutionPolicyDecision"
    | "BrokerSubmission"
    | "ExceptionReview"
    | "DisclosureAck"
    | "SupportTicket";
  source_object_id: string;
  event_time: string;
  display_title: string;
  investor_visible: boolean;
  retention_class: "regulatory_7y" | "operational_2y" | "ephemeral";
}
```

---

## 4. Required Mapping Table

Every Daniel field surfaced by the reconciliation audit, mapped through to its downstream destinations. Unconfirmed fields carry `TODO(confirm-daniel-field)`; the downstream requirement is still pinned.

| Daniel field                                                                                           | Daniel route / source                                                                                                                                  | Normalized BFF field                                                            | Investor-facing field                                                         | Record artifact field                            | Transformation required                                                                          | Validation required                                                                              | Failure behavior                                                                               | Risk if missing                                                               |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `symbol`                                                                                               | `live_signals` collection; `rl_predictions.symbol`; `sharpe_series._id`                                                                                | `SignalCandidate.symbol`                                                        | `RecommendationProjection.symbol`                                             | `RecordArtifact.display_title` (rendering input) | uppercase, strip whitespace                                                                      | must be in `available_strategies` (Daniel's cached symbol list); else reject                     | `SignalCandidate.normalization_status = "rejected"`, `rejection_reason = "SYMBOL_UNAVAILABLE"` | High — without symbol there is no recommendation                              |
| `signal` (`+1 \| -1`)                                                                                  | `live_signals` collection (`generate_final_signal.py`)                                                                                                 | `SignalCandidate.side`                                                          | `RecommendationProjection.side` + `recommendation_type`                       | indirectly via `RecommendationProjection`        | `+1 → "long"`, `-1 → "short"`                                                                    | must be exactly `+1` or `-1`; else reject                                                        | `rejection_reason = "INVALID_SIDE"`                                                            | High — undefined side cannot become a recommendation                          |
| `predicted_at`                                                                                         | `live_signals.timestamp`; orchestrator passes `start_date/end_date` payloads                                                                           | `SignalCandidate.predicted_at`                                                  | `RecommendationProjection.created_at` (derived)                               | `RecordArtifact.event_time`                      | parse to ISO-8601 UTC                                                                            | must be parseable; must be in the past                                                           | `rejection_reason = "INVALID_TIMESTAMP"`                                                       | High — without timestamp, freshness cannot be evaluated                       |
| `model_version`                                                                                        | `TODO(confirm-daniel-field)` — pipeline retrains weekly per `Inference Pipeline/README.md` §"Weekly Prediction Cadence"; current write path is unclear | `SignalCandidate.model_version`                                                 | `RecommendationProjection.advisory_context.decision_record_ref` (input)       | `RecordArtifact` (for audit lineage)             | passthrough                                                                                      | required for production audit; warn-and-continue acceptable during Phase 2.5 BFF prototype phase | `SignalCandidate.model_version = "unknown"`, log warning                                       | Medium — without model_version, audit lineage is incomplete                   |
| `strategy_id`                                                                                          | `TODO(confirm-daniel-field)` — implied by `selected_features` collection keyed per asset                                                               | `SignalCandidate.strategy_id`                                                   | `RecommendationProjection.advisory_context.model_factors` (context)           | `RecordArtifact` (audit lineage)                 | passthrough                                                                                      | required for production audit                                                                    | `SignalCandidate.strategy_id = "unknown"`, log warning                                         | Medium — needed to explain "why" to the investor                              |
| `confidence_score`                                                                                     | `TODO(confirm-daniel-field)` — `rl_predictions` writes Q-values; scalar reduction is TBD                                                               | `SignalCandidate.confidence_score`                                              | `RecommendationProjection.risk_summary` (input)                               | not directly recorded                            | normalize to `[0,1]` if Daniel surface confirms a different range                                | optional; null acceptable                                                                        | `SignalCandidate.confidence_score = null`                                                      | Low — recommendation can ship without it                                      |
| `sharpe_metric`                                                                                        | `sharpe_series` collection                                                                                                                             | `SignalCandidate.risk_metric`                                                   | `RecommendationProjection.risk_summary.risk_metric`                           | not directly recorded                            | passthrough                                                                                      | optional; null acceptable                                                                        | `SignalCandidate.risk_metric = null`                                                           | Low                                                                           |
| `asset_status` (`Ready for Inference \| Needs Model Update \| Inference in Progress`)                  | `asset_status` collection                                                                                                                              | not stored on `SignalCandidate` directly; consulted at intake                   | indirectly affects `EligibilityCheck.signal_freshness_status`                 | not recorded                                     | if `Inference in Progress` → defer adapter intake; if `Needs Model Update` → freshness downgrade | adapter must skip signals whose asset is `Inference in Progress` to avoid races                  | adapter retries on next poll                                                                   | Medium — without this gate the adapter could ingest a half-written prediction |
| `last_prediction_ts`                                                                                   | `asset_status.last_prediction_ts`                                                                                                                      | used to compute `SignalCandidate.freshness_status`                              | indirectly via `EligibilityCheck.signal_freshness_status`                     | `RecordArtifact.event_time` (context)            | compare against now to derive freshness                                                          | required for freshness decision                                                                  | adapter falls back to `predicted_at`; if both missing, mark `expired`                          | High — freshness is a load-bearing eligibility input                          |
| `live_signals` collection write                                                                        | MongoDB; `generate_final_signal.py` writes `bulk_ops`                                                                                                  | adapter's primary intake source                                                 | n/a (intake side)                                                             | n/a                                              | dedupe by `raw_source_ref` identity                                                              | reads must be idempotent                                                                         | adapter retries on transient MongoDB errors with backoff                                       | High — primary signal channel                                                 |
| Pub/Sub topic (alternative published target)                                                           | `generate_final_signal.py` "Writes to a `live_signals` collection or publishes them to a Google Cloud Pub/Sub topic."                                  | adapter intake (transport-neutral)                                              | n/a                                                                           | n/a                                              | transport-neutral; same identity rule                                                            | at-least-once delivery → adapter MUST dedupe                                                     | adapter drops duplicates silently                                                              | Medium — only relevant if Pub/Sub is chosen over polling                      |
| `selected_features` collection                                                                         | per-asset feature list                                                                                                                                 | `RecommendationProjection.advisory_context.model_factors` (context, not values) | shown in detail page "Why now" / "Model factors" sections (Phase 2 detail UI) | not recorded directly                            | reduce to human-readable factor names                                                            | warn-and-continue if missing                                                                     | `RecommendationProjection.advisory_context.model_factors = []`                                 | Low — UI gracefully renders empty                                             |
| `available_strategies` collection                                                                      | strategy registry                                                                                                                                      | adapter intake guard (`SignalCandidate` reject if symbol not in set)            | n/a                                                                           | n/a                                              | passthrough                                                                                      | must be non-empty for adapter to function                                                        | adapter rejects all signals if registry empty                                                  | High — without this, adapter cannot validate symbols                          |
| `/get-upload-url`, `/process-upload`, `/get-upload-result`, `/assets`, `/analyze` (Daniel HTTP routes) | `Portfolio Analyzer/portfolio-service/app/api.py`                                                                                                      | **not consumed by the adapter**                                                 | n/a                                                                           | n/a                                              | n/a — these are research/upload workflow, not signal stream                                      | n/a                                                                                              | n/a                                                                                            | n/a — out of scope for signal-to-execution adapter                            |

---

## 5. SEC 203A-2(e) Product Boundary

The software-generated recommendation must remain inside the operational interactive website.

### Human staff must NOT

- create individualized recommendations
- alter individualized recommendations
- approve recommendations
- supplement recommendations outside the software path
- manually decide whether an investor gets a trade
- manually edit execution eligibility
- manually override policy outcome

### The platform MAY support

- investor self-service settings (Subscription Mode, Execution Policy)
- investor pause / resume (Surface 5)
- investor disclosure review (Surface 6)
- investor exception visibility (Surface 7)
- support for technical, onboarding, and account issues (§D classifier `allowed_*` categories)

### But

Support must not become investment-adviser staff discretion. The §D `support-boundary-preservation.spec.ts` enforces this by:

1. Refusing any prompt matching SBR-\* patterns (buy/sell advice, recommendation approval, portfolio change, custom strategy, model override) on a per-classifier-rule basis.
2. Asserting that the support surface never exposes per-trade or staff-approval testids or labels.

This boundary applies to every path that flows through `SignalToInvestorProductAdapter`. There is no transition in §2 where a human staff member can inject, edit, or approve a recommendation, eligibility result, or execution policy decision.

---

## 6. Explicit Non-Goals

This contract does NOT introduce:

- per-trade Accept
- investor-accept command
- AcceptButton
- approve for execution
- accept and execute
- staff approval
- founder review
- support-led advice
- direct execution from Daniel signal output
- mutation of Daniel backend
- admin rebalance command
- manual staff recommendation edits

If any future implementation work appears to require one of the above, the implementation is wrong, not the contract.

---

## 7. Open Questions, With Provisional Decisions

### Question 1: Where does per-account eligibility live?

**Provisional decision:**

Eligibility belongs to the ReFi investor-product backend boundary, not Daniel's signal engine.

Implementation may later be a separate compliance service, but the **contract owner** is ReFi BFF / investor-product backend.

Daniel provides signal inputs. ReFi decides investor-specific eligibility.

### Question 2: What is the source of truth for position concentration?

**Provisional decision:**

Production source of truth is broker account position data, with ReFi maintaining a cached position snapshot and audit record.

If broker position data is stale, unavailable, or inconsistent with cached state, the system fails closed:

- **Managed mode:** route to `REVIEW` or `BLOCK`.
- **Signal mode:** show record-only advisory state, no broker submission.

### Question 3: What is the signal freshness SLA?

**Provisional decision** until Daniel confirms strategy-specific tolerances:

- **Fresh:** `predicted_at <= 2 hours old` → eligibility may return `ALLOW`.
- **Stale:** `> 2 hours and <= 24 hours` → eligibility routes to `REVIEW`.
- **Expired:** `> 24 hours` → `BLOCK` or do not generate an executable recommendation at all.

This must be configurable per strategy later (Daniel's pipeline is currently hourly; some strategies may tolerate longer windows, others not).

### Question 4: Does translator poll or subscribe?

**Provisional decision:**

Phase 2.5 contract assumes **polling or fixture-based ingestion** for testability.

Future production path may use Pub/Sub, but the contract must be transport-neutral.

Dedupe must not depend on transport. It should use deterministic signal identity:

- `source`
- `symbol`
- `strategy_id`
- `model_version`
- `predicted_at`
- `side`

These six fields together form `SignalCandidate.raw_source_ref` and the dedupe key.

### Question 5: Backfill or forward-only after Managed activation?

**Provisional decision:**

**Forward-only.**

When an investor activates Managed mode, the system must not auto-execute historical signals created before activation.

Historical signals may appear as record-only or educational context in the activity feed, but not as executable managed recommendations.

This rule prevents an activation event from triggering a cascade of stale-but-eligible signals against a fresh account.

---

## 8. Production Blockers

Things the production launch is blocked on. Each is currently unfilled. None can be filled inside this branch.

- investor-product backend routes (§2.1 of the reconciliation audit; 40+ `/api/v1/*` routes)
- durable profile storage
- durable disclosure storage
- durable disclosure acknowledgment registry
- durable execution policy storage
- durable managed lifecycle state
- eligibility engine
- broker account position read path
- broker submission record path
- exception record path
- records center persistence
- support boundary records
- adapter contract tests (§9 below)
- Daniel signal fixture tests
- fail-closed E2E tests (already shipped at frontend layer as §A; need backend equivalents)
- OpenAPI ownership decision (frontend-versioned or backend-versioned?)
- Daniel field confirmation (every `TODO(confirm-daniel-field)` in §3 + §4)

---

## 9. Required Test Plan

Contract-level test plan. Each test runs at the adapter layer once an implementation exists; today these are the assertions the implementation will need to satisfy.

### 9.1 Daniel fixture → `SignalCandidate`

1. valid Daniel fixture normalizes to `SignalCandidate` with `normalization_status = "ok"`
2. malformed Daniel fixture rejects with `rejection_reason` populated
3. missing `symbol` rejects with `rejection_reason = "SYMBOL_MISSING"`
4. missing `predicted_at` (or equivalent timestamp) rejects with `rejection_reason = "INVALID_TIMESTAMP"`
5. invalid `side` (anything other than `+1 | -1`) rejects with `rejection_reason = "INVALID_SIDE"`

### 9.2 `SignalCandidate` → `RecommendationProjection`

1. valid candidate creates a `RecommendationProjection` with `status = "active"` and `eligibility_required = true`
2. duplicate candidate (same `raw_source_ref`) dedupes — no second projection created
3. expired candidate (`freshness_status = "expired"`) does not produce an executable recommendation (either no projection at all, or projection with `status = "expired"`)

### 9.3 `RecommendationProjection` → `EligibilityCheck`

1. valid profile + valid KYC + valid disclosure + fresh signal → `status = "ALLOW"`
2. stale broker data → `status = "REVIEW"`, `reason_codes` includes `"BROKER_DATA_STALE"`
3. missing disclosure acknowledgment → `status ∈ {"REVIEW", "DENY"}` per policy, `reason_codes` includes `"DISCLOSURE_ACK_MISSING"`
4. stale signal (`freshness_status = "stale"`) → `status = "REVIEW"`, `reason_codes` includes `"SIGNAL_STALE"`
5. expired signal → `status = "DENY"` (or candidate never advanced to projection per 9.2.3)

### 9.4 `EligibilityCheck` → `ExecutionPolicyDecision`

1. Signal tier always → `decision = "RECORD_ONLY"` regardless of eligibility
2. Managed `active` + `ALLOW` → `decision = "ROUTE_TO_BROKER"`
3. Managed `active` + `REVIEW` → `decision = "ROUTE_TO_EXCEPTION"`
4. Managed `active` + `DENY` → `decision = "BLOCK"`
5. Managed `paused` → `decision ∈ {"BLOCK", "RECORD_ONLY"}`
6. Managed `pending_profile_update` → `decision ∈ {"REVIEW", "BLOCK"}` (route to Exception Review or block; either honors fail-closed)

### 9.5 `ExecutionPolicyDecision` → downstream artifact

1. `ROUTE_TO_BROKER` emits a `BrokerSubmission` AND a `RecordArtifact`
2. `ROUTE_TO_EXCEPTION` emits an `ExceptionReview` AND a `RecordArtifact`
3. `BLOCK` emits a `RecordArtifact` only (no broker call, no exception entry)
4. `RECORD_ONLY` emits a `RecordArtifact` only

### 9.6 Boundary tests

1. no per-trade Accept code path exists at the adapter layer
2. no `investor-accept` command exists at the adapter layer
3. no `approve for execution` copy is emitted by any adapter artifact
4. no staff-approval path exists in any contract object
5. support cannot override eligibility (no API path from `SupportTicket` to `EligibilityCheck.status`)
6. support cannot change execution status (no API path from `SupportTicket` to `ExecutionPolicyDecision.decision`)
7. Daniel raw signal cannot reach `BrokerSubmission` directly — every `BrokerSubmission` MUST have a `decision_id` whose chain resolves back through `EligibilityCheck` and `RecommendationProjection` to a `SignalCandidate`

---

## 10. Merge Rule

Phase 2.5 may remain PR-review-ready, but **merge into `main` remains blocked** until **all** of the following land:

1. **lint tooling cleanup** lands (per `phase2-5-gate-cleanup.md` §3.1, branch `phase2-5-lint-tooling`)
2. **stale E2E cleanup** lands (per `phase2-5-gate-cleanup.md` §3.2, branch `phase2-5-stale-e2e-cleanup`)
3. **Daniel reconciliation audit is committed** (`docs/phase2-5-daniel-backend-reconciliation.md` — done, commit `1ffbd56`)
4. **this signal-to-investor-product contract is committed** (`docs/phase2-5-signal-to-investor-product-contract.md` — pending commit on this branch)
5. **PR description states that Daniel backend is signal infrastructure, not the investor-product backend**
6. **PR description states that the investor-product backend is still missing for production**
7. **PR description states that current Phase 2.5 coverage is frontend/BFF boundary coverage, not production wire-level backend coverage**

Any merge attempt that does not honor every item above contradicts the SEC 203A-2(e) boundary architecture this document codifies.

---

## 11. Scope lock — re-affirmed

No new product surfaces. No Daniel backend changes (`live-components-main` remains untouched read-only reference). No weakening of SEC 203A-2(e) boundary assertions. No per-trade Accept, Approve, Submit, investor-accept, staff approval, founder review, or support-led advice reintroduced. No implementation code written. This document is a contract, not a design or implementation.
