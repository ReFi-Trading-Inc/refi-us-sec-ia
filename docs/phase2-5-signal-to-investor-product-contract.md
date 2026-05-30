# Phase 2.5 Signal-to-Investor-Product Contract (V2 — GitLab-aligned)

> **Superseded note:** This document reflects Phase 2.5 alignment against `refinity-main main @ 0a7d64d`. Phase 2.6 supersedes it using `refinity-main main @ 9f9dfc9` and `docs/authoritative/*` as the backend source of truth. Retain this file as historical audit evidence. See [`phase2-6-authoritative-source-of-truth.md`](phase2-6-authoritative-source-of-truth.md).

**Date:** 2026-05-29
**Branch:** `phase2-5-contract-gap-v2-gitlab`
**Status:** Phase 2.5 merge-gate contract. **Not** a Phase 3 implementation design.
**Canonical backend:** `gitlab.com/refinity_dev/refinity-main` branch `main` @ `0a7d64d`.
**Supersedes:** the local-backend assumptions from the 2026-05-28 revision (MongoDB `live_signals`, `position`, UNIX `date`, `source_collection`, derived `model_version` / `strategy_id` / `confidence_score`). Those assumptions were based on `…/Daniels Back End/live-components-main`, which is now confirmed to be a **subset** (inference-worker + portfolio-analyzer-web only) of the GitLab monorepo.
**Controlling inputs:**

- `docs/phase2-5-gitlab-branch-inventory.md`
- `docs/phase2-5-gitlab-refinity-main-source-verification.md`
- `docs/phase2-5-gitlab-backend-capability-map.md`
- `docs/phase2-5-gitlab-contract-delta.md`
- `docs/phase2-5-surface-to-gitlab-alignment-register.md`
- `docs/phase2-5-core-alignment-decision.md`

**Sibling docs:** `phase2-5-gap-register-v2-against-gitlab.md`, `phase2-5-handoff.md`, `phase2-5-replacement-e2e-backlog.md`.

This document is the authoritative bridge between Daniel's GitLab backend (signal + portfolio + intent + risk + execution + admin services) and the ReFi US SEC 203A-2(e) investor-product shell (frontend + BFF). It defines a **contract boundary**, not an implementation. No code is being written against it in this branch.

---

## 1. Source of truth

### 1.1 Canonical backend

- **Repo:** `gitlab.com/refinity_dev/refinity-main`
- **Branch:** `main` (only branch; trunk-based)
- **Commit anchor:** `0a7d64d`
- **Local clone path used for verification:** `…/GitLab/refinity-main`

The local `…/Daniels Back End/live-components-main` folder is **superseded** as a contract source. It contains only `inference-worker` and `portfolio-analyzer-web` and is now treated as a secondary read-only reference. Any field, table, topic, or service named in the prior contract that resolved to a MongoDB collection, a `position` integer, or a UNIX `date` integer is superseded by the GitLab wire shape in §3.

### 1.2 Ownership boundary

#### GitLab backend owns

- signal generation and persistence (`inference-worker`, Spanner `signals` table; multi-stream)
- portfolio analytics (`portfolio-engine`, `portfolio-manager`)
- account-level intent generation (`account-intent-builder`, topic `account.intent.ready`)
- risk verdict (`risk-engine`, topic `risk.approved` / `risk.rejected`, binary `approved | rejected` with `reasons[]`)
- execution policy enforcement (`exec-gateway`, topic `orders.cmd`)
- broker lifecycle (`trade-manager`, topic `orders.evt`)
- admin commands (`admin-portal`, topic `template.admin`)
- trade-lifecycle Spanner tables (`Orders`, `OrderEvents`, `BrokerOrderAttempts`, `Fills`, `Positions`, `TradeReconciliationRuns`, `TradingControlStates`, etc.)
- correlation spine (`action_id`, `intent_id`, `plan_id`, `order_id`, `client_order_id`, `broker_order_id`, `fill_id`, `broker_execution_id`, `attempt_id`, `reconciliation_run_id`, `correlation_id`)

Skeletal in GitLab (named but empty / placeholder):

- `audit-writer` (skeletal)
- `compliance-adapter` (skeletal)
- `auth-siwe`, `identity-ccid`, `anchor-job`, `merkle-builder`, `refin-indexer`, `routing-api`, `token-policy-api`, `pubsub-bus`, `explorer-api`, `web` (skeletal)

#### ReFi BFF / investor-product layer owns

- investor identity (SIWE, `us_session_v1` cookie; persona dev fixtures)
- investor profile (`/api/v1/profile`)
- KYC / CCID (`/api/v1/ccid/*`)
- disclosures + acknowledgements (`/api/v1/disclosures/*`)
- subscription mode (`Tier ∈ {Signal, Managed}`)
- Signal vs Managed branching (Surface 1 + `mode-branching.spec.ts`)
- execution policy (versioned, BFF-owned today — see §7 confirmation item 4)
- pause / resume managed lifecycle (Surface 6 → `account.admin pause_autopilot / resume_autopilot`)
- eligibility presentation (`automation_eligibility.status ∈ {ALLOW, REVIEW, DENY}`)
- exception presentation (Surface 10; maps to GitLab `risk.rejected` + `TradingControlStates` + lifecycle blocked states)
- records center presentation (Surface 11; maps to GitLab Spanner lifecycle tables)
- broker submission policy presentation (Surface 13)
- SEC 203A-2(e) tripwire (admin-shape exclusion, no per-trade Accept)
- support boundary (Surface 12; §D classifier)

### 1.3 Critical rule

**The GitLab signal stream is never directly executable from the investor UI.**

Every transition from GitLab event → investor-visible artifact must pass through the adapter chain in §2. Any code path that reads `signals` rows, `account.intent.ready` envelopes, or `orders.evt` envelopes and shortcuts directly to a per-trade investor action is a SEC 203A-2(e) boundary violation by construction and must be prevented at the architecture level.

---

## 2. Adapter boundary

### 2.1 Backend workflow chain (GitLab)

```
signals  (Spanner; multi-stream: AAPL~rf, AAPL~rl, …)
  └─▶ template.rebalance.intent  (template-level rebalance intent)
      └─▶ account.intent.ready   (per-account materialized intent)
          └─▶ risk.approved | risk.rejected  (risk-engine verdict)
              └─▶ orders.cmd     (exec-gateway, policy-bound order command)
                  └─▶ orders.evt (trade-manager, broker lifecycle events)
                      └─▶ audit.evt (audit-writer; SKELETAL today)
```

### 2.2 Adapter chain (BFF-owned)

```
GitLab event stream
    └─▶ SignalCandidate          (normalized; stream-aware; freshness-checked)
        └─▶ RecommendationProjection  (investor-facing; account-bound; mode-bound)
            └─▶ EligibilityCheck       (per-account ALLOW | REVIEW | DENY)
                └─▶ ExecutionPolicyDecision  (ROUTE_TO_BROKER | ROUTE_TO_EXCEPTION | RECORD_ONLY | BLOCK)
                    ├─▶ BrokerSubmission     (when ROUTE_TO_BROKER; correlates to orders.cmd / orders.evt)
                    ├─▶ ExceptionReview      (when ROUTE_TO_EXCEPTION; correlates to risk.rejected / TradingControlStates)
                    └─▶ RecordArtifact       (every transition emits one)
```

**Adapter name:** `SignalToInvestorProductAdapter`. **Contract boundary**, not an implementation task in this branch.

The adapter MUST:

- consume the GitLab `signals` wire shape (§3.1) and the downstream envelope shapes
- honor multi-stream semantics (§3.3); never silently collapse `AAPL~rf` and `AAPL~rl` rows
- enforce freshness via `ts_utc` (§3.4)
- map per-account context via `account.intent.ready` to determine open vs close
- map binary `risk.approved | risk.rejected` (with `reasons[]`) to ternary `ALLOW | REVIEW | DENY` (Daniel-confirmation item 1)
- gate Signal-tier projections to `decision = RECORD_ONLY` regardless of risk verdict
- gate Managed-tier projections to the verdict-driven decision matrix (§9.4)
- prevent any path from a backend admin command (`template.admin action=rebalance target_account_id=X`) to an investor-facing affordance
- prevent any per-trade investor Accept / Approve / Submit
- emit `InvestorActionReceipt` for state changes and `RecordAccessLog` for views — never mixed (see `memory/contract_receipt_vs_access_log.md`)

---

## 3. Required contract objects

TypeScript-style interfaces. The GitLab field names below are taken from the verified GitLab capability map; the prior local-backend shape (`live_signals`, `position`, `date`) is superseded.

### 3.1 GitLabSignalRow (wire intake)

```ts
interface GitLabSignalRow {
  /**
   * Multi-stream identity. Format: "{asset_id}~{strategy_source}".
   * Examples: "AAPL~rf", "AAPL~rl". Two rows at the same `ts_utc`
   * for the same `asset_id` but different `strategy_source` are
   * allowed and MUST coexist (verified at
   * `apps/inference-worker/tests/test_stream_signal_publishing.py:74-110`).
   */
  stream_id: string;

  /** Uppercase ticker. e.g. "AAPL", "IBM". */
  asset_id: string;

  /**
   * Bar timestamp. ISO-8601 (or whatever GitLab convention is — see
   * `phase2-5-gitlab-backend-capability-map.md`). NOT a UNIX integer.
   * Freshness is derived from this field; no separate `last_prediction_ts`
   * sibling read is required.
   */
  ts_utc: string;

  /**
   * Strategy family identifier. e.g. "rf", "rl".
   * Carried on the wire as a column; NOT derived.
   */
  strategy_source: string;

  /**
   * Specific strategy within the family. Carried on the wire.
   * Example: "rf_momentum_v3", "rl_cql_v2".
   */
  strategy: string;

  /** Model classifier output (categorical). e.g. -1, 0, 1. */
  label: -1 | 0 | 1;

  /** Calibrated probability. 0.0 to 1.0. */
  proba: number;

  /**
   * Model registry version. Carried on the wire (column).
   * NOT derived from a joblib file path. The prior "derived /
   * unknown fallback" rule is superseded.
   */
  model_version: string;

  /**
   * Terminal signal at this bar. e.g. -1, 0, 1.
   * Signal: 0 (flat / hold) preservation is a Daniel-confirmation
   * item — see §7 confirmation item 3. Until confirmed, the adapter
   * MUST defensively assume 0 may or may not be emitted.
   */
  signal: -1 | 0 | 1;
}
```

#### Fields removed from prior contract

The following fields appeared in the prior local-backend contract and are now **removed** as superseded:

- `position` (replaced by `signal`)
- `date` (replaced by `ts_utc`)
- `pipeline: "live_inference"`, `script: "generate_final_signal.py"` (live-components-main artifacts; not on GitLab wire)
- `source_collection: "live_signals"` (MongoDB-era; superseded)
- `asset_status.last_prediction_ts`, `asset_status.status` (sibling MongoDB collection; superseded by `ts_utc` freshness)
- `strategy_id` as derived from `available_strategies.collection` (now carried on the wire as `strategy_source` + `strategy`)
- `model_version` as derived from joblib path (now carried on the wire)
- `confidence_score` and `sharpe_metric` out-of-band aggregation (probability is now `proba` on the wire; risk metric remains TBD via downstream `risk-engine`)

### 3.2 SignalCandidate (adapter-normalized)

```ts
interface SignalCandidate {
  signal_id: string; // adapter-assigned ULID; deterministic from raw_source_ref
  source_repo: "gitlab.com/refinity_dev/refinity-main";
  source_table: "signals";

  // Wire fields (carried through)
  stream_id: string;
  asset_id: string;
  ts_utc: string;
  strategy_source: string;
  strategy: string;
  label: -1 | 0 | 1;
  proba: number;
  model_version: string;
  signal: -1 | 0 | 1;

  // Adapter-derived
  received_at: string; // ISO-8601; set at adapter intake
  freshness_status: "fresh" | "stale" | "expired"; // see §3.4

  /**
   * Whether this candidate represents a single stream, an
   * unresolved multi-stream cluster, an aggregated result, or
   * a rejected conflicting cluster. See §3.3.
   */
  aggregation_status:
    | "single_stream"
    | "multi_stream_unaggregated"
    | "aggregated"
    | "rejected_conflicting_streams";

  normalization_status: "accepted" | "rejected";
  rejection_reason?: string;

  raw_source_ref: {
    // identity for dedupe
    stream_id: string;
    asset_id: string;
    ts_utc: string;
    strategy_source: string;
    strategy: string;
    model_version: string;
  };
}
```

### 3.3 Multi-stream semantics

A single `(asset_id, ts_utc)` pair may produce multiple rows differentiated by `strategy_source`. The canonical example is:

- `AAPL~rf` at `ts_utc=T0`
- `AAPL~rl` at `ts_utc=T0`

These rows coexist on the wire. The adapter MUST NOT silently collapse them.

#### Allowed `aggregation_status` values

| Value                          | Meaning                                                                                                                 | Executable? |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ----------- |
| `single_stream`                | Only one stream for this `(asset_id, ts_utc)` is present. Pass through as candidate.                                    | Yes         |
| `multi_stream_unaggregated`    | Multiple streams present; no aggregation policy applied yet. **Must never become executable.**                          | **No**      |
| `aggregated`                   | Multiple streams resolved via an explicit aggregation policy (e.g. agreement, weighted vote). Adapter records the rule. | Yes         |
| `rejected_conflicting_streams` | Multiple streams disagree under the configured policy. Adapter rejects and records the conflict for the records center. | No          |

#### Hard rule

`multi_stream_unaggregated` candidates MUST NEVER be promoted to `RecommendationProjection` with an executable status. The adapter must either:

1. apply an explicit aggregation policy and transition to `aggregated` or `rejected_conflicting_streams`, or
2. emit a `RecordArtifact` only (record-only, no projection) and wait for the policy to be defined.

Until an aggregation policy is defined, the safe default is **record-only**.

### 3.4 Freshness

Freshness is derived from `ts_utc` directly. The prior `asset_status.last_prediction_ts` sibling read is removed.

Provisional SLA (per-strategy tolerances TBD — Daniel-confirmation item; see §7 carry-overs):

- **fresh:** `now - ts_utc ≤ 2h` → eligibility may return `ALLOW`
- **stale:** `2h < now - ts_utc ≤ 24h` → routes to `REVIEW` or exception
- **expired:** `> 24h` → routes to `DENY` or no projection emitted

### 3.5 RecommendationProjection

`RecommendationProjection` is **NOT** created directly from a raw `signals` row. It is created only after the following adapter steps have all succeeded:

1. stream handling — `aggregation_status ∈ {single_stream, aggregated}` (never `multi_stream_unaggregated`)
2. asset resolution — `asset_id` is in the platform-supported set
3. account-intent binding — there is a corresponding `account.intent.ready` envelope (per-account context for open/close)
4. risk verdict — `risk.approved` (or a `risk.rejected` that the adapter maps to `REVIEW` rather than `DENY`)
5. execution-policy check — the investor has an active policy of the relevant version
6. subscription-mode check — Signal vs Managed determines downstream decision

```ts
interface RecommendationProjection {
  recommendation_id: string; // ULID; the frontend's `intent_id` reference
  signal_id: string; // back-reference to SignalCandidate
  account_id: string; // from account.intent.ready
  account_intent_id: string; // from account.intent.ready envelope
  asset_id: string;
  side: "long" | "short";

  /**
   * Open vs close is determined by per-account context from
   * `account.intent.ready`. Daniel's raw `signal` cannot drive
   * this enum directly.
   */
  recommendation_type:
    | "open_long"
    | "open_short"
    | "close_long"
    | "close_short"
    | "hold";

  advisory_context: {
    summary: string;
    why_now: string;
    model_factors: string[];
    decision_record_ref: string; // e.g. "gitlab://signals/{stream_id}/{ts_utc}"
  };
  model_factors: { factor: string; weight: number }[];
  risk_summary: {
    risk_metric: number | null;
    horizon: string;
  };
  created_at: string;
  status:
    | "draft"
    | "active"
    | "rejected"
    | "review_required"
    | "executed"
    | "expired";
  eligibility_required: true; // always true
  execution_policy_required: true; // always true
}
```

### 3.6 EligibilityCheck

```ts
interface EligibilityCheck {
  eligibility_id: string;
  recommendation_id: string;
  account_id: string;
  status: "ALLOW" | "REVIEW" | "DENY";
  reason_codes: string[]; // mapped from risk.rejected reasons[] + BFF-side reasons
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

Mapping from GitLab `RiskDecision` (`apps/risk-engine/src/models.py:132-144`):

- `decision = "approved"` → `status = "ALLOW"`
- `decision = "rejected"` + `reasons[].code ∈ {VAR_LIMIT, LEVERAGE_LIMIT}` and freshness `stale` → `status = "REVIEW"`
- `decision = "rejected"` + `reasons[].code ∈ {SINGLE_NAME_CONC_LIMIT, SECTOR_CONC_LIMIT}` → `status = "DENY"` (provisional; Daniel-confirmation item 1)

### 3.7 ExecutionPolicyDecision

```ts
interface ExecutionPolicyDecision {
  decision_id: string;
  recommendation_id: string;
  account_id: string;
  subscription_mode: "signal" | "managed";
  managed_state:
    | "not_activated"
    | "active"
    | "paused"
    | "pending_profile_update"
    | "pending_disclosure_ack"
    | "deactivated";
  policy_id: string;
  policy_version: string;
  eligibility_status: "ALLOW" | "REVIEW" | "DENY";
  decision: "ROUTE_TO_BROKER" | "ROUTE_TO_EXCEPTION" | "RECORD_ONLY" | "BLOCK";
  reason_codes: string[];
  decided_at: string;
}
```

### 3.8 BrokerSubmission

`BrokerSubmission` correlates to GitLab `orders.cmd` and tracks `orders.evt` lifecycle.

```ts
interface BrokerSubmission {
  broker_submission_id: string;
  decision_id: string;
  account_id: string;
  broker_account_id: string;
  intent_id: string; // correlation to account.intent.ready
  plan_id: string; // correlation to exec-gateway plan
  client_order_id: string;
  broker_order_id: string | null;
  correlation_id: string;
  order_intent: {
    asset_id: string;
    side: "buy" | "sell";
    quantity: number;
    time_in_force: "day" | "gtc";
  };
  order_preview: {
    estimated_fill_price: number | null;
    estimated_notional: number | null;
    risk_check_summary: string | null;
  };
  /**
   * Maps to GitLab 15-state OrderStatus enum
   * (`apps/exec-gateway/src/models/domain.py:78`).
   */
  submission_status:
    | "planned"
    | "pending_submit"
    | "blocked_dependency"
    | "blocked_by_conflict"
    | "submit_started"
    | "submitted"
    | "acknowledged"
    | "working"
    | "partial_fill"
    | "filled"
    | "cancel_requested"
    | "cancelled"
    | "rejected"
    | "expired"
    | "error";
  submitted_at: string;
}
```

### 3.9 ExceptionReview

Maps to GitLab `risk.rejected` + `TradingControlStates` + lifecycle blocked states (`blocked_dependency`, `blocked_by_conflict`).

```ts
interface ExceptionReview {
  exception_id: string;
  decision_id: string;
  account_id: string;
  recommendation_id: string;
  exception_type:
    | "stale_broker_data"
    | "missing_disclosure_ack"
    | "concentration_limit"
    | "kyc_expired"
    | "profile_update_required"
    | "signal_freshness"
    | "leverage_limit"
    | "var_limit"
    | "single_name_conc_limit"
    | "sector_conc_limit"
    | "control_state_blocked";
  reason_codes: string[];
  status: "open" | "resolved" | "dismissed"; // UI; backend = approve/reject (Surface 10 aliasing)
  created_at: string;
  resolved_at: string | null;
}
```

### 3.10 RecordArtifact

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
  source_object_type:
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

## 4. Mapping table — GitLab wire to ReFi product

| GitLab field / topic                                                                                                                                                                                 | GitLab service / file                                                       | Status                  | Normalized BFF field                                                       | Investor-facing field                                                 | Record artifact field                       | Failure behavior                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `stream_id`                                                                                                                                                                                          | `signals` table column; format `{asset}~{strategy_source}`                  | wire                    | `SignalCandidate.stream_id`                                                | indirect (lineage)                                                    | `RecordArtifact` lineage                    | reject if missing → `rejection_reason = "STREAM_ID_MISSING"`                                                |
| `asset_id`                                                                                                                                                                                           | `signals` column                                                            | wire                    | `SignalCandidate.asset_id`                                                 | `RecommendationProjection.asset_id`                                   | `RecordArtifact.display_title` input        | reject if missing → `"ASSET_MISSING"`                                                                       |
| `ts_utc`                                                                                                                                                                                             | `signals` column                                                            | wire                    | `SignalCandidate.ts_utc` + drives `freshness_status`                       | `RecommendationProjection.created_at`                                 | `RecordArtifact.event_time`                 | reject if missing / unparseable → `"INVALID_TIMESTAMP"`                                                     |
| `strategy_source` (`"rf"`, `"rl"`, …)                                                                                                                                                                | `signals` column                                                            | wire                    | `SignalCandidate.strategy_source`                                          | `RecommendationProjection.advisory_context.model_factors`             | `RecordArtifact` lineage                    | reject if not in platform-supported set                                                                     |
| `strategy`                                                                                                                                                                                           | `signals` column                                                            | wire                    | `SignalCandidate.strategy`                                                 | indirect via advisory_context                                         | `RecordArtifact` lineage                    | warn-and-continue if missing                                                                                |
| `label` (`-1 \| 0 \| 1`)                                                                                                                                                                             | `signals` column                                                            | wire                    | `SignalCandidate.label`                                                    | indirect                                                              | `RecordArtifact` lineage                    | reject if not in domain                                                                                     |
| `proba` (`0.0..1.0`)                                                                                                                                                                                 | `signals` column                                                            | wire                    | `SignalCandidate.proba`                                                    | `RecommendationProjection.risk_summary`                               | `RecordArtifact` lineage                    | reject if not in range                                                                                      |
| `model_version`                                                                                                                                                                                      | `signals` column (NOT derived from a joblib path)                           | wire                    | `SignalCandidate.model_version`                                            | `RecommendationProjection.advisory_context.decision_record_ref` input | `RecordArtifact` lineage                    | reject if missing — production audit requires it                                                            |
| `signal` (`-1 \| 0 \| 1`)                                                                                                                                                                            | `signals` column                                                            | wire                    | `SignalCandidate.signal` → mapped to `side`                                | `RecommendationProjection.side`                                       | indirect                                    | `1 → "long"`, `-1 → "short"`, `0` defensive — see §7 confirmation item 3                                    |
| `template.rebalance.intent` envelope                                                                                                                                                                 | Pub/Sub topic published by `portfolio-engine`                               | wire                    | adapter consumes; not surfaced                                             | n/a                                                                   | `RecordArtifact` lineage                    | adapter must dedupe by `intent_id`                                                                          |
| `account.intent.ready` envelope                                                                                                                                                                      | Pub/Sub topic published by `account-intent-builder`                         | wire                    | drives `RecommendationProjection.account_id` / `account_intent_id`         | `RecommendationProjection.recommendation_type` open/close             | `RecordArtifact` lineage                    | required for projection; without it adapter holds candidate as `record_only`                                |
| `risk.approved` envelope                                                                                                                                                                             | Pub/Sub topic published by `risk-engine`                                    | wire                    | `EligibilityCheck.status = "ALLOW"`                                        | indirect                                                              | `RecordArtifact` (exception or decision)    | adapter must respect `intent_id` correlation                                                                |
| `risk.rejected` envelope + `reasons[].code`                                                                                                                                                          | Pub/Sub topic published by `risk-engine`                                    | wire                    | `EligibilityCheck.status ∈ {REVIEW, DENY}` per partition rule              | Surface 10 (Exception Review)                                         | `RecordArtifact` (exception)                | Daniel-confirmation item 1                                                                                  |
| `orders.cmd` envelope                                                                                                                                                                                | Pub/Sub topic published by `exec-gateway`                                   | wire                    | `BrokerSubmission` correlation (`plan_id`, `client_order_id`)              | Surface 13                                                            | `RecordArtifact` (broker_submission)        | adapter records lifecycle in records center                                                                 |
| `orders.evt` envelope (`OrderStatus` 15-state)                                                                                                                                                       | Pub/Sub topic published by `trade-manager`                                  | wire                    | `BrokerSubmission.submission_status`                                       | Surface 13                                                            | `RecordArtifact` (broker_submission)        | adapter must walk through every state; no state may be skipped silently                                     |
| `audit.evt` envelope                                                                                                                                                                                 | Pub/Sub topic; `audit-writer` SKELETAL                                      | skeletal                | not yet consumed                                                           | n/a                                                                   | future `RecordArtifact` enrichment          | until `audit-writer` ships, BFF records remain authoritative for investor-visible records                   |
| `template.admin action=rebalance target_account_id=X`                                                                                                                                                | `admin-portal` → topic `template.admin` (verified `pubsub_mgr.py:109-138`)  | wire — **backend-only** | adapter accepts as a record-only lineage attribute; NEVER as an affordance | **NEVER surfaced**                                                    | `RecordArtifact` (lineage only)             | tripwire blocks any investor UI reference to `template.admin`, `target_account_id`, or `manual_rebalance`   |
| `account.admin action=pause_autopilot \| resume_autopilot`                                                                                                                                           | `account-intent-builder` action vocabulary (`processor.py:384-470`)         | wire                    | Surface 6 emits these on investor pause / resume                           | Surface 6 affordances                                                 | `RecordArtifact` (investor_action_receipt)  | **aligned 1:1** with frontend pause/resume — see `phase2-5-surface-to-gitlab-alignment-register.md`         |
| `account.admin action=join_template \| leave_template`                                                                                                                                               | same                                                                        | wire                    | Surface 5 (Managed activation) / deactivation                              | Surface 5                                                             | `RecordArtifact`                            | adapter must require fresh disclosure ack before emitting                                                   |
| `account.admin action=liquidate_all`                                                                                                                                                                 | same                                                                        | wire                    | Surface 6 deactivation path                                                | Surface 6 advanced                                                    | `RecordArtifact`                            | adapter must require explicit investor confirmation; no support staff path                                  |
| `account.admin action=update_prefs`                                                                                                                                                                  | same                                                                        | wire                    | Surface 4 (Automation Center) policy updates                               | Surface 4                                                             | `RecordArtifact`                            | versioned policy — Daniel-confirmation item 4                                                               |
| `account.admin action=force_rebuild \| rebalance`                                                                                                                                                    | same                                                                        | wire — **admin-only**   | NEVER reached from investor UI                                             | **NEVER surfaced**                                                    | `RecordArtifact` (lineage only)             | tripwire blocks                                                                                             |
| Spanner `Orders`, `OrderEvents`, `Fills`, `BrokerOrderAttempts`                                                                                                                                      | `trade-manager` (`docs/architecture/trade_lifecycle_contract.md` in GitLab) | wire                    | drives Surface 11 (Records) + Surface 13 (Broker submission)               | Surface 11, Surface 13                                                | `RecordArtifact` (broker_submission, fills) | adapter reads via BFF; no direct Spanner exposure to UI                                                     |
| Spanner `TradeReconciliationRuns`, `TradeReconciliationDiscrepancies`                                                                                                                                | `trade-manager`                                                             | wire                    | drives Surface 11 reconciliation entries                                   | Surface 11                                                            | `RecordArtifact`                            | adapter must surface discrepancies as record-only entries                                                   |
| Spanner `TradingControlStates`, `TradingControlEvents`                                                                                                                                               | `exec-gateway` / `trade-manager`                                            | wire                    | drives Surface 10 (Exception) `control_state_blocked` exceptions           | Surface 10                                                            | `RecordArtifact` (exception)                | adapter maps lifecycle blocked states to ExceptionReview                                                    |
| correlation spine (`action_id`, `intent_id`, `plan_id`, `order_id`, `client_order_id`, `broker_order_id`, `fill_id`, `broker_execution_id`, `attempt_id`, `reconciliation_run_id`, `correlation_id`) | every GitLab envelope                                                       | wire                    | adapter MUST preserve every value through every artifact                   | not directly surfaced                                                 | `RecordArtifact` lineage                    | tripwire-style assertion: every `BrokerSubmission` MUST resolve back through correlation to a `signals` row |

### Fields removed from prior mapping table

Every prior row that named `live_signals`, `position`, `date` (UNIX int), `pipeline`, `script`, `model_version` (derived), `strategy_id` (derived), `confidence_score`, `sharpe_metric`, `asset_status.status`, `asset_status.last_prediction_ts`, `available_strategies`, `selected_features`, or Cloud Run `/get-upload-url` is **superseded**. The local-backend MongoDB-era mapping is no longer authoritative.

---

## 5. Execution semantics

### 5.1 Managed mode

Managed mode means:

- investor has a standing, versioned execution policy (BFF-owned today; see §7 confirmation item 4)
- backend emits account-level intent via `account.intent.ready`
- `risk-engine` approves or rejects per intent (binary verdict + `reasons[]`)
- BFF maps the binary verdict + `reasons[]` to ternary `ALLOW | REVIEW | DENY` (Daniel-confirmation item 1)
- `exec-gateway` emits a policy-bound `orders.cmd` only when the verdict is `approved` AND policy gates pass
- `trade-manager` handles broker lifecycle via `orders.evt` (15-state)
- records layer captures full correlation spine

### 5.2 Signal mode

Signal mode means:

- no `orders.cmd` is ever emitted on the investor's behalf
- adapter sets `ExecutionPolicyDecision.decision = "RECORD_ONLY"` regardless of risk verdict
- investor receives recommendation visibility only; no broker submission

### 5.3 Forbidden affordances (boundary lock)

The following are **never reachable from the investor UI**:

- per-trade investor Accept
- `investor-accept` command or topic
- AcceptButton / approve-execution / accept-and-execute / submit-trade
- staff approval / staff-approve-button
- founder review / founderApproveRecommendation
- support-led individualized advice
- `template.admin` topic publish
- `target_account_id` parameter exposure
- `manual_rebalance` / `manual_rebalance_requested` event name
- `account.admin action=force_rebuild | rebalance` (admin-only)

---

## 6. Admin command section

### 6.1 `template.admin` is admin-only

Verified at `apps/admin-portal/backend/pubsub_mgr.py:109-138`:

```python
def publish_manual_rebalance(self, template_id: str, target_account_id: str = None):
    payload = {"action": "rebalance", "template_id": template_id}
    if target_account_id:
        payload["target_account_id"] = target_account_id
    return self._publish(
        settings.TOPIC_TEMPLATE_ADMIN,
        payload,
        event_name="manual_rebalance_requested",
        # ...
    )
```

This publisher lives in the GitLab `admin-portal` service. It is **backend / admin only**. The investor UI MUST NEVER expose:

- `template.admin` topic name
- `target_account_id` parameter
- `manual_rebalance` / `manual_rebalance_requested` event name
- any "rebalance" command issued on behalf of an account
- any "approve execution" / "accept trade" affordance

The tripwire script `scripts/tripwire-investor-boundary.ts` enforces this at source level (0 violations / 144 files at last run).

### 6.2 `account.admin` action partition

`account-intent-builder` (`apps/account-intent-builder/src/domain/processor.py:384-470`) exposes these actions:

| Action             | Reachable from investor UI?           | Surface                        |
| ------------------ | ------------------------------------- | ------------------------------ |
| `join_template`    | Yes (gated)                           | Surface 5 (Managed activation) |
| `leave_template`   | Yes (gated)                           | Surface 6 deactivation         |
| `pause_autopilot`  | **Yes — aligned 1:1**                 | Surface 6 pause                |
| `resume_autopilot` | **Yes — aligned 1:1**                 | Surface 6 resume               |
| `liquidate_all`    | Yes (advanced; confirmation required) | Surface 6 advanced             |
| `update_prefs`     | Yes                                   | Surface 4 (Automation Center)  |
| `force_rebuild`    | **No — admin-only**                   | none                           |
| `rebalance`        | **No — admin-only**                   | none                           |

---

## 7. Fixture requirements

Fixtures MUST use the GitLab wire field names: `stream_id`, `asset_id`, `ts_utc`, `strategy_source`, `strategy`, `label`, `proba`, `model_version`, `signal`.

### 7.1 Required fixture families

1. **RF-only signal** — single `AAPL~rf` row; no `AAPL~rl` for the same `ts_utc`. `aggregation_status = "single_stream"`.
2. **RL-only signal** — single `AAPL~rl` row. `aggregation_status = "single_stream"`.
3. **RF and RL agree** — both rows at the same `(asset_id, ts_utc)`, same `signal` direction. `aggregation_status = "aggregated"` under the agreement policy.
4. **RF and RL conflict** — both rows, opposite `signal`. `aggregation_status = "rejected_conflicting_streams"`.
5. **Stale `ts_utc`** — `ts_utc` older than the 2h SLA boundary. `freshness_status = "stale"` → REVIEW or exception.
6. **Missing `asset_id`** — adapter rejects with `rejection_reason = "ASSET_MISSING"`.
7. **Missing `stream_id`** — adapter rejects with `rejection_reason = "STREAM_ID_MISSING"`.
8. **Unknown asset resolution** — `asset_id` not in platform-supported set. Adapter rejects with `rejection_reason = "ASSET_UNAVAILABLE"`.
9. **`template.rebalance.intent` envelope** — golden envelope with `intent_id`, `template_id`, `partition_key`, `correlation_id`.
10. **`account.intent.ready` envelope** — golden envelope with `account_id`, `account_intent_id`, `intent_id`, `correlation_id`.
11. **`risk.approved` envelope** — for the same `intent_id`.
12. **`risk.rejected` envelope with each `RiskReason.code`** — `LEVERAGE_LIMIT`, `SINGLE_NAME_CONC_LIMIT`, `SECTOR_CONC_LIMIT`, `VAR_LIMIT`. Each must map to the correct REVIEW vs DENY classification (Daniel-confirmation item 1).
13. **`orders.cmd` envelope** — policy-bound command with `plan_id`, `client_order_id`, `correlation_id`.
14. **`orders.evt` envelope** — every 15-state transition, each with the correlation spine.
15. **`audit.evt` missing** — adapter operates with BFF-side records only; behavior must be well-defined.
16. **Signal-tier record-only despite approved backend chain** — even with `risk.approved` + `orders.cmd` shape, Signal-tier projections produce `RECORD_ONLY` only.
17. **Managed-tier policy-bound broker submission** — full chain from `signals` to `orders.evt` filled state.
18. **Admin rebalance command hidden from investor UI** — `template.admin action=rebalance` envelope emitted; adapter records but never surfaces. Tripwire-enforced.

### 7.2 Open questions carried forward

Provisional rules that remain pending Daniel confirmation:

1. **Risk reason-code partition into REVIEW vs DENY** — provisional mapping in §3.6; canonical mapping is a Daniel-confirmation item.
2. **`template_id` registry shape and discovery surface** — frontend must list templates to investors; the GitLab discovery shape (table, RPC, topic) is unconfirmed.
3. **`signal: 0` preservation** — whether GitLab emits flat / hold rows or suppresses them. Until confirmed, adapter must defensively assume both behaviors are possible.
4. **ExecutionPolicy ownership** — frontend treats it as a versioned BFF-owned object today; production may require Daniel-side per-account policy storage. Confirmation needed.

### 7.3 Aggregation policy carry-overs

These remain unresolved and do not block Phase 2.5 docs:

- multi-stream agreement / weighted-vote rule (drives `aggregation_status = "aggregated"`)
- per-strategy freshness SLA (current 2h / 24h is provisional)
- `selected_features` machine-name → investor-readable factor-label translation

---

## 8. SEC 203A-2(e) product boundary

The software-generated recommendation must remain inside the operational interactive website.

### 8.1 Human staff must NOT

- create individualized recommendations
- alter individualized recommendations
- approve recommendations
- supplement recommendations outside the software path
- manually decide whether an investor gets a trade
- manually edit execution eligibility
- manually override policy outcome
- issue admin rebalance commands on behalf of an investor through any investor-visible path

### 8.2 The platform MAY support

- investor self-service settings (Subscription Mode, Execution Policy)
- investor pause / resume (Surface 6 → `account.admin pause_autopilot / resume_autopilot`)
- investor disclosure review (Surface 7)
- investor exception visibility (Surface 10)
- investor records visibility (Surface 11)
- support for technical, onboarding, and account issues (§D classifier `allowed_*` categories)

### 8.3 But

Support must not become investment-adviser staff discretion. The §D `support-boundary-preservation.spec.ts` enforces this by:

1. refusing any prompt matching SBR-\* patterns
2. asserting that the support surface never exposes per-trade or staff-approval testids or labels

This boundary applies to every path that flows through `SignalToInvestorProductAdapter`. There is no transition in §2 where a human staff member can inject, edit, or approve a recommendation, eligibility result, or execution policy decision.

---

## 9. Required test plan

### 9.1 GitLab `signals` row → `SignalCandidate`

1. valid GitLab row normalizes to `SignalCandidate` with `normalization_status = "accepted"`
2. malformed row rejects with `rejection_reason` populated
3. missing `asset_id` → `"ASSET_MISSING"`
4. missing `ts_utc` → `"INVALID_TIMESTAMP"`
5. missing `stream_id` → `"STREAM_ID_MISSING"`
6. missing `model_version` → `"MODEL_VERSION_MISSING"`
7. multi-stream rows at same `(asset_id, ts_utc)` produce `aggregation_status ∈ {multi_stream_unaggregated, aggregated, rejected_conflicting_streams}` — never silently collapsed
8. `signal = 0` candidate handled defensively (either passed as `hold` or suppressed per policy)

### 9.2 `SignalCandidate` → `RecommendationProjection`

1. candidate with `aggregation_status = "multi_stream_unaggregated"` MUST NOT produce an executable projection
2. valid candidate + matching `account.intent.ready` → `RecommendationProjection` with `status = "active"`
3. duplicate candidate dedupes via `raw_source_ref`
4. expired candidate (freshness `expired`) produces no projection OR a projection with `status = "expired"`
5. candidate without a matching `account.intent.ready` is held as record-only

### 9.3 `RecommendationProjection` → `EligibilityCheck`

1. valid profile + valid KYC + valid disclosure + `risk.approved` + fresh signal → `status = "ALLOW"`
2. stale broker data → `"REVIEW"`, `reason_codes` includes `"BROKER_DATA_STALE"`
3. missing disclosure ack → `"REVIEW"` or `"DENY"` per policy, includes `"DISCLOSURE_ACK_MISSING"`
4. `risk.rejected` with `LEVERAGE_LIMIT` → `"REVIEW"` (provisional; Daniel-confirmation item 1)
5. `risk.rejected` with `SINGLE_NAME_CONC_LIMIT` → `"DENY"` (provisional)
6. stale signal → `"REVIEW"`, includes `"SIGNAL_STALE"`
7. expired signal → `"DENY"` (or projection never advanced)

### 9.4 `EligibilityCheck` → `ExecutionPolicyDecision`

1. Signal tier always → `decision = "RECORD_ONLY"` regardless of eligibility
2. Managed `active` + `ALLOW` → `decision = "ROUTE_TO_BROKER"`
3. Managed `active` + `REVIEW` → `decision = "ROUTE_TO_EXCEPTION"`
4. Managed `active` + `DENY` → `decision = "BLOCK"`
5. Managed `paused` → `decision ∈ {"BLOCK", "RECORD_ONLY"}`
6. Managed `pending_profile_update` → `decision ∈ {"REVIEW", "BLOCK"}`

### 9.5 `ExecutionPolicyDecision` → downstream artifact

1. `ROUTE_TO_BROKER` emits a `BrokerSubmission` AND a `RecordArtifact`, both carrying the full correlation spine
2. `ROUTE_TO_EXCEPTION` emits an `ExceptionReview` AND a `RecordArtifact`
3. `BLOCK` emits a `RecordArtifact` only
4. `RECORD_ONLY` emits a `RecordArtifact` only

### 9.6 Boundary tests

1. no per-trade Accept code path exists at the adapter layer
2. no `investor-accept` command exists
3. no `approve for execution` copy is emitted by any adapter artifact
4. no staff-approval path exists in any contract object
5. support cannot override eligibility
6. support cannot change execution status
7. every `BrokerSubmission` MUST resolve through correlation spine back to a `signals` row — no orphans
8. `template.admin` topic publish MUST NEVER reach any investor surface (tripwire-enforced)
9. `target_account_id` parameter MUST NEVER appear in any investor-facing testid, copy, or URL (tripwire-enforced)
10. `manual_rebalance` / `manual_rebalance_requested` MUST NEVER appear in any investor-visible artifact

---

## 10. Merge rule

Phase 2.5 may remain PR-review-ready, but **merge into `main` remains blocked** until **all** of the following land:

1. lint tooling cleanup (per `phase2-5-gate-cleanup.md` §3.1) — **DONE**
2. stale E2E cleanup (per `phase2-5-gate-cleanup.md` §3.2) — pending
3. Daniel reconciliation audit committed — **DONE**
4. this contract V2 committed against GitLab as canonical — **this branch**
5. Gap Register V2 committed against GitLab — **this branch**
6. PR description states GitLab `refinity_dev/refinity-main` is canonical backend
7. PR description states the BFF/prototype-store is the investor-product shell pending adapter implementation
8. PR description names the four Daniel-confirmation items as production blockers

Any merge attempt that does not honor every item above contradicts the SEC 203A-2(e) boundary architecture this document codifies.

---

## 11. Cross-references

- `docs/phase2-5-gitlab-branch-inventory.md` — single-branch trunk verification
- `docs/phase2-5-gitlab-refinity-main-source-verification.md` — source-of-truth verification
- `docs/phase2-5-gitlab-backend-capability-map.md` — verified file paths, line numbers, topic names, table columns
- `docs/phase2-5-gitlab-contract-delta.md` — 12 contract deltas between prior local-backend assumptions and GitLab reality
- `docs/phase2-5-surface-to-gitlab-alignment-register.md` — 16-row surface-to-GitLab register
- `docs/phase2-5-core-alignment-decision.md` — direct answers to the 16 alignment questions
- `docs/phase2-5-gap-register-v2-against-gitlab.md` — Gap Register V2 (sibling to this doc)
- `docs/phase2-5-daniel-to-refi-alignment-gap-register.md` — superseded gap register (preserved for historical audit)
- `docs/phase2-5-signal-contract-live-backend-delta.md` — superseded delta (preserved for historical audit)
- `docs/phase2-5-daniel-live-backend-field-map.md` — superseded field map (preserved for historical audit)
- `docs/phase2-5-daniel-adapter-fixtures-required.md` — superseded fixture catalog (replaced by §7 above)

---

## 12. Scope lock — re-affirmed

No new product surfaces. No GitLab backend changes (`refinity_dev/refinity-main` remains untouched read-only reference). No frontend product code changes in this branch. No weakening of SEC 203A-2(e) boundary assertions. No per-trade Accept, Approve, Submit, investor-accept, staff approval, founder review, or support-led advice reintroduced. No implementation code written. This document is a contract, not a design or implementation.
