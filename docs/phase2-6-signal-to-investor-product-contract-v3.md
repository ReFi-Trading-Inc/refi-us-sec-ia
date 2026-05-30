# Phase 2.6 Signal-to-Investor-Product Contract (V3 — authoritative-aligned)

**Date:** 2026-05-30
**Branch:** `phase2-6-contract-v3`
**Status:** **Phase 2.6 merge-gate contract.** Final V3. Not a Phase 3 implementation design.
**Supersedes:** [`docs/phase2-5-signal-to-investor-product-contract.md`](phase2-5-signal-to-investor-product-contract.md) (V2).
**Source of truth:** [`docs/phase2-6-authoritative-source-of-truth.md`](phase2-6-authoritative-source-of-truth.md).

## Anchors

| Repo                                                    | Branch | Commit        |
| ------------------------------------------------------- | ------ | ------------- |
| Backend (`gitlab.com/refinity_dev/refinity-main`)       | `main` | **`9f9dfc9`** |
| Frontend (`github.com/ReFi-Trading-Inc/refi-us-sec-ia`) | `main` | **`590ab02`** |

Controlling backend docs (all in `refinity-main/docs/authoritative/`):

- `executive_overview.md` (system summary; mermaid pipeline)
- `frontend_integration_contract.md` (FIC — the consumption contract; canonical for this V3)
- `trade_lifecycle_contract.md` (lifecycle vocabulary and transitions)
- `trade_auditability_contract.md` (evidence layers + correlation spine)
- `trade_lifecycle_retention_legal_hold.md` (retention)
- `spanner_ddl_all.txt` (live DDL)
- `topics_subs_dlqs.txt` (Pub/Sub topology)
- `service_iam.txt` (runtime identities)

Plus `refinity-main/docs/scratch_pads/qa/email_qa_checklist.md` (Daniel's direct answers).

## Sibling Phase 2.6 docs

- [`phase2-6-gap-register-v3-against-authoritative.md`](phase2-6-gap-register-v3-against-authoritative.md) — Gap Register V3
- [`phase2-6-daniel-answer-resolution.md`](phase2-6-daniel-answer-resolution.md) — four-question resolution
- [`phase2-6-surface-reframing-map.md`](phase2-6-surface-reframing-map.md) — per-surface map
- [`phase2-6-admin-portal-api-consumption-map.md`](phase2-6-admin-portal-api-consumption-map.md) — endpoint mapping
- [`phase2-6-account-prefs-history-options.md`](phase2-6-account-prefs-history-options.md) — new scope

---

## 1. Source-of-truth hierarchy

| Rank | Source                                       | Where                                                            |
| ---- | -------------------------------------------- | ---------------------------------------------------------------- |
| 1    | Daniel's backend at current `main`           | `gitlab.com/refinity_dev/refinity-main`                          |
| 2    | `docs/authoritative/*`                       | the only authoritative doc folder                                |
| 3    | `docs/scratch_pads/qa/email_qa_checklist.md` | Daniel's direct answers                                          |
| 4    | Live-state docs                              | `spanner_ddl_all.txt`, `service_iam.txt`, `topics_subs_dlqs.txt` |
| 5    | Backend code                                 | `apps/*`, `apps/common/*`                                        |
| 6    | Frontend repo at current `main`              | this repo                                                        |
| 7    | Phase 2.5 docs                               | historical audit evidence only — superseded                      |

`refinity-main/docs/out_dated/*` is **not** controlling.

---

## 2. Ownership boundary

### Backend (`refinity-main`) owns

- Signal generation and persistence: `signals` Spanner table (PK `stream_id`; latest-state per stream)
- Stream identity: `stream_id = {ASSET_ID}~{strategy_source}`; canonical builder at `apps/common/stream_identity.make_stream_id`
- Multi-stream canonicalization at `AccountIntents.legs.source_streams` + `stream_contributions`
- Portfolio decisioning: `portfolio-engine`, `portfolio-manager`, `TemplateTargets`, `TemplateTargetAffectedStreams`, `portfolio_actions_history`
- Template registry: `templates`, `template_membership`, `template_rules`, `AccountTemplates`, `portfolio_registry`; exposed via Admin Portal `/api/v1/portfolio/*` projections
- Account-level intent: `account-intent-builder`, `AccountIntents`, `AccountIntentHistory`
- Risk: `risk-engine`, `RiskSnapshots` (immutable), binary `approved | rejected` with `reasons[]`
- Execution policy enforcement: `exec-gateway`, `ExecutionPlans`, pre-handoff `Orders`, `OrderIdMap`, `TradeInputSnapshots`
- Broker lifecycle: `trade-manager`, post-handoff `Orders`, `OrderEvents`, `BrokerOrderAttempts`, `BrokerInteractionsLog`, `Fills`, `Positions`, `PositionSnapshots`
- Reconciliation: `TradeReconciliationRuns`, `TradeReconciliationDiscrepancies`
- Trading controls: `TradingControlStates`, `TradingControlEvents`
- Audit: `AuditEvents`, `UiEventTimeline`, `AdminInterventions`
- Account state: `AccountPrefs`, `AccountConsents`, `UserConsents`, `RiskLimits`, `AccountSettings`, `AccountSnapshots`
- Admin commands: `admin-portal` over `template.admin`, `account.admin`, `orders.cmd` topics — **operator-only**

### Frontend / BFF (`refi-us-sec-ia`) owns

- Investor session (SIWE, `us_session_v1`, persona dev fixtures)
- Investor profile (`AdvisoryProfile` until a backend home arrives)
- Disclosures display + acceptance UI (writes through to `UserConsents`)
- Subscription mode (Signal vs Managed — frontend product framing)
- BFF-owned `EligibilityCheck` ternary `ALLOW | REVIEW | DENY` **for non-risk gates only**
- BFF investor-scoped ACL over Admin Portal API projections
- Tripwire enforcement (admin-shape exclusion, no per-trade Accept)
- Support boundary (Surface 12 + §D classifier)
- **NEW**: AccountPrefs History ledger writes (per Daniel's request; until the backend table ships)

### Critical rule

The Admin Portal API + correlation spine is the only path from raw backend state to investor-visible artifact. The BFF is a thin proxy + cache + ACL + product translation layer; it does **not** invent backend state, mutate lifecycle evidence tables, or shortcut to a per-trade investor action.

---

## 3. SEC 203A-2(e) boundary lock

The following are **never** reachable from the investor UI:

- per-trade Accept / Approve / Submit / Submit-trade
- `investor-accept` topic or command
- AcceptButton / approve-for-execution / accept-and-execute
- staff approval / staff-approve-button / `staffReviewAdvice`
- founder review / `founderApproveRecommendation`
- support-led individualized advice
- direct execution from raw `signals` rows
- `template.admin` topic publish
- `target_account_id` parameter exposure
- `manual_rebalance` / `manual_rebalance_requested` event name
- `account.admin action=force_rebuild | rebalance` (admin-only verbs)

Tripwire script at `scripts/tripwire-investor-boundary.ts` enforces this at source level (currently 0 violations / 144 scanned files).

Mode behavior:

- **Signal tier** is record-only. No `orders.cmd` is ever emitted on the investor's behalf.
- **Managed tier** uses a standing `AccountPrefs` set + signed `UserConsents` + risk verdict + execution-policy gates inside `exec-gateway`. No per-trade investor approval is required or possible.

---

## 4. Removals (dropped from V3)

| Item                                                                | Why dropped                                                                                           |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `policy_id` (wire / type / route)                                   | No such field in backend; Daniel confirmed (Q4)                                                       |
| `policy_version`                                                    | Same                                                                                                  |
| `execution_policy_id`                                               | Same; existing in `packages/api-clients/src/generated/api.ts:42,801` etc. — to be regenerated in PR-C |
| `execution_policy_version`                                          | Same                                                                                                  |
| `strategy_id` (wire / type / route)                                 | No standalone field; identity = `stream_id + strategy_source`                                         |
| `aggregation_status` enum                                           | Backend canonicalizes via `AccountIntents.legs.{source_streams, stream_contributions}`                |
| `ExecutionPolicyDecision` object                                    | No backend equivalent; replaced by `RiskDecisionProjection` + `BffEligibilityState`                   |
| `ExecutionPolicyVersion` object                                     | Same                                                                                                  |
| `ExecutionPolicyActivation` object                                  | Replaced by `InvestorTemplateActivationRequest`                                                       |
| Risk reason REVIEW / DENY partition                                 | Risk is binary at backend; Daniel confirmed (Q1)                                                      |
| `RecommendationProjection.action = "hold"` (as `signal: 0` meaning) | `0` is neutral / no new stance per FIC line 98; never "hold" framing                                  |
| Per-trade `BrokerSubmission` object as a BFF-created object         | Replaced by `OrderLifecycleProjection` reading `Orders`+`OrderEvents`+`BrokerOrderAttempts`+`Fills`   |

---

## 5. Renames

| V2                                                       | V3                                                     | Reason                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `SignalCandidate.strategy_id`                            | (removed; lineage via `stream_id` / `strategy_source`) | No standalone field                                                                   |
| `SignalCandidate.confidence_score`                       | `proba`                                                | Match `signals` column                                                                |
| `RecommendationProjection.recommendation_id`             | `intent_id`                                            | Match `AccountIntents.intent_id`                                                      |
| `RecommendationProjection.created_at`                    | `ts_utc`                                               | Match wire field                                                                      |
| Surface 4 product name                                   | "Account Controls Center" (was "Automation Center")    | No `ExecutionPolicy`; surface composes `AccountPrefs` + `RiskLimits` + `UserConsents` |
| `ExceptionReview.exception_type: "out_of_policy_intent"` | `"risk_rejected_intent"` (terminal, no resolution)     | Risk reject is terminal evidence, not a resolvable exception                          |

---

## 6. Preserved (V2 was correct)

- SEC 203A-2(e) boundary lock items (§3 above)
- Signal vs Managed subscription mode (frontend product framing)
- BFF-owned `EligibilityCheck` ternary `ALLOW | REVIEW | DENY` **for non-risk gates only**
- `InvestorActionReceipt` vs `RecordAccessLog` separation (memory contract holds)
- Correlation spine concept (now grounded in `trade_auditability_contract.md:71-89`)
- Three-bucket prototype-store rule (`docs/bff-prototype-state-contract.md`)
- Tripwire term lists for admin-shape exclusion

---

## 7. Contract objects (V3)

TypeScript-style. Every type's source is cited.

### 7.1 `StreamId`

```ts
/**
 * Canonical lineage identity for a signal stream.
 * Format: "{ASSET_ID}~{strategy_source}" (e.g. "AAPL~rf").
 * Backend builder: apps/common/stream_identity.make_stream_id (uppercases asset_id, lowercases strategy_source, joins with "~").
 * Frontend rule: never use as broker symbol or execution identity.
 */
export type StreamId = string;
```

### 7.2 `SignalRow`

Direct projection of the `signals` Spanner row (latest-state per `stream_id`).

```ts
export interface SignalRow {
  stream_id: StreamId;
  asset_id: string;
  strategy_source: string; // e.g. "rf", "rl"
  signal: -1 | 0 | 1; // 0 = NEUTRAL (never "hold")
  proba?: number;
  label_rf?: -1 | 0 | 1;
  label_rl?: -1 | 0 | 1;
  ts_utc: string; // ISO-8601
}
```

### 7.3 `TemplateDescriptor`

Joined view over `templates` + `template_membership` + `template_rules` + `portfolio_registry`, exposed via `GET /api/v1/portfolio/templates`.

```ts
export interface TemplateDescriptor {
  template_id: string;
  display_name: string; // templates.name OR portfolio_registry.display_name
  status: string; // templates.status
  risk_class?: string; // templates.risk_class
  profile?: string; // portfolio_registry.profile
  weighting_policy?: string;
  gross_target?: number;
  net_target?: number;
  leverage?: number;
  rules?: {
    min_change_threshold?: number;
    turnover_throttle?: number;
    cooldown_window_hours?: number;
    max_single_asset_weight?: number;
  };
  membership: Array<{
    stream_id: StreamId;
    asset_id: string;
    strategy_source: string;
    membership_weight: number;
  }>;
  created_at: string;
}
```

### 7.4 `AccountIntentProjection`

Direct projection of an `AccountIntents` row (header).

```ts
export interface AccountIntentProjection {
  intent_id: string;
  account_id: string;
  template_id: string;
  template_version: string;
  action_id: string; // PE action this intent came from
  intent_kind:
    | "rebalance"
    | "join"
    | "leave"
    | "liquidate"
    | "preference_change"
    | string;
  ts: string;
  status:
    | "ready"
    | "approved"
    | "rejected"
    | "executed"
    | "expired"
    | "blocked";
  blocked_reason?: string;
  legs_hash: string;
  correlation_id: string;
}
```

### 7.5 `AccountIntentLegProjection`

Single leg from `AccountIntents.legs`.

```ts
export interface AccountIntentLegProjection {
  intent_id: string;
  account_id: string;
  asset_id: string; // broker-tradable asset, NOT stream_id
  delta_notional: number;
  delta_qty?: number;
  source_streams: StreamId[]; // lineage display
  stream_contributions?: Record<StreamId, number>;
  status:
    | "ready"
    | "approved"
    | "rejected"
    | "executed"
    | "expired"
    | "blocked";
  template_id: string;
  template_version: string;
  action_id: string;
  ts: string;
  blocked_reason?: string;
}
```

### 7.6 `RiskDecisionProjection`

Direct projection of `RiskSnapshots`. Binary decision.

```ts
export interface RiskDecisionProjection {
  intent_id: string;
  account_id: string;
  decision: "approved" | "rejected";
  snapshot_hash: string;
  reasons: Array<{
    code:
      | "LEVERAGE_LIMIT"
      | "SINGLE_NAME_CONC_LIMIT"
      | "SECTOR_CONC_LIMIT"
      | "VAR_LIMIT";
    detail?: string;
  }>; // only when rejected
  constraints?: unknown; // only when approved
  metrics: unknown; // VaR / exposure metrics for display
  stream_lineage?: Array<{ stream_id: StreamId; weight: number }>;
  ts: string;
  correlation_id: string;
}
```

### 7.7 `BffEligibilityState`

BFF-owned ternary. **REVIEW lives here only**, not on the risk projection.

```ts
export type BffEligibilityReason =
  | "kyc_pending"
  | "kyc_expired"
  | "profile_incomplete"
  | "profile_stale"
  | "disclosure_outstanding"
  | "consent_missing"
  | "broker_disconnected"
  | "broker_credentials_invalid"
  | "broker_stale_snapshot"
  | "trading_control_blocking" // see ControlStateProjection
  | "blocked_order"
  | "reconciliation_discrepancy"
  | "unsupported_account_state"
  | "subscription_mode_signal"; // for routes that require Managed

export interface BffEligibilityState {
  account_id: string;
  status: "ALLOW" | "REVIEW" | "DENY";
  reasons: BffEligibilityReason[];
  checked_at: string;
  source_evidence: {
    risk?: RiskDecisionProjection;
    consent?: { missing_consent_keys: string[] };
    profile?: { stale_since?: string };
    broker?: { last_validated_at?: string };
    control?: { active_modes: string[] };
    reconciliation?: { open_discrepancy_ids: string[] };
  };
}
```

Mapping rule:

- `risk.approved` → `status = "ALLOW"` (composed with BFF-side checks)
- `risk.rejected` → `status = "DENY"` (terminal; never REVIEW)
- `REVIEW` arises only from BFF-side gates (consent missing, profile stale, broker disconnected, trading control blocking, blocked order, reconciliation discrepancy, etc.)

### 7.8 `ControlStateProjection`

Projection of `TradingControlStates` + recent `TradingControlEvents`.

```ts
export type TradingControlMode =
  | "halt_all"
  | "halt_new_orders"
  | "reduce_only"
  | "reconciliation_block"
  | "degraded";

export interface ControlStateProjection {
  account_id: string;
  active_states: Array<{
    control_id: string;
    mode: TradingControlMode;
    scope: "account" | "asset" | "global";
    target_asset?: string;
    activated_at: string;
    reason?: string;
    set_by: "operator" | "system" | "investor"; // see Daniel decision 4 below
  }>;
  history_ref: string; // pointer to TradingControlEvents
}
```

### 7.9 `ReconciliationDiscrepancyProjection`

Projection of `TradeReconciliationDiscrepancies`.

```ts
export interface ReconciliationDiscrepancyProjection {
  discrepancy_id: string;
  reconciliation_run_id: string;
  account_id: string;
  asset_id: string;
  kind:
    | "position_mismatch"
    | "fill_mismatch"
    | "order_mismatch"
    | "balance_mismatch";
  blocking: boolean;
  detected_at: string;
  status: "open" | "resolved_auto" | "resolved_operator" | "stale";
}
```

### 7.10 `OrderLifecycleProjection`

Joined projection of `Orders` + `OrderEvents` + `BrokerOrderAttempts` + `Fills`. Replaces V2's invented `BrokerSubmission`.

```ts
export type OrderStatus =
  | "planned"
  | "pending_submit"
  | "submit_started"
  | "blocked_by_conflict"
  | "blocked_dependency"
  | "acknowledged"
  | "working"
  | "partial_fill"
  | "unknown"
  | "filled"
  | "partially_filled_terminal"
  | "canceled"
  | "rejected"
  | "failed"
  | "reconciled_terminal";
// Canonical vocabulary from apps/common/trade_lifecycle/states.py

export interface OrderLifecycleProjection {
  order_id: string;
  client_order_id: string;
  broker_order_id?: string | null;
  account_id: string;
  asset_id: string;
  status: OrderStatus;
  intent_id: string;
  plan_id: string;
  action_id: string;
  correlation_id: string;
  events: Array<{
    status: OrderStatus;
    ts: string;
    reason?: string;
  }>; // OrderEvents (append-only ledger)
  attempts: Array<{
    attempt_id: string;
    kind:
      | "submit"
      | "cancel"
      | "amend"
      | "replace"
      | "status_lookup"
      | "fill_lookup"
      | "position_lookup";
    ok: boolean;
    ts: string;
    reason_code?: string;
  }>; // BrokerOrderAttempts
  fills: Array<{
    fill_id: string;
    qty: number;
    price: number;
    ts: string;
  }>; // Fills
  trade_input_snapshot_ref?: string;
}
```

### 7.11 `RecordArtifactProjection`

Investor-facing record artifact, anchored to the correlation spine.

```ts
export interface RecordArtifactProjection {
  record_id: string; // BFF-assigned ULID
  account_id: string;
  artifact_type:
    | "recommendation" // sourced from AccountIntents
    | "risk_decision" // sourced from RiskSnapshots
    | "execution_plan" // sourced from ExecutionPlans
    | "order_lifecycle" // sourced from Orders + OrderEvents
    | "broker_attempt" // sourced from BrokerOrderAttempts
    | "broker_interaction" // sourced from BrokerInteractionsLog (redacted)
    | "fill"
    | "position_snapshot"
    | "reconciliation_discrepancy"
    | "control_state_event"
    | "consent_acceptance"
    | "account_prefs_change" // sourced from AccountPrefsHistory
    | "investor_action_receipt" // BFF-owned
    | "record_access_log" // BFF-owned
    | "intervention_affecting_me"; // redacted view of AdminInterventions
  spine: {
    correlation_id?: string;
    action_id?: string;
    intent_id?: string;
    plan_id?: string;
    order_id?: string;
    client_order_id?: string;
    broker_order_id?: string;
    attempt_id?: string;
    fill_id?: string;
    reconciliation_run_id?: string;
  };
  event_time: string;
  display_title: string;
  investor_visible: boolean;
  retention_class: "regulatory_7y" | "operational_2y" | "ephemeral";
}
```

### 7.12 `AccountPrefsProjection`

Direct projection of `AccountPrefs` (current state).

```ts
export interface AccountPrefsProjection {
  account_id: string;
  drift_threshold: number;
  min_order: number;
  excluded_assets: string[];
  fractional_enabled: boolean;
  updated_at: string;
}
```

### 7.13 `AccountPrefsHistoryEntry`

**New scope, BFF-owned ledger until backend table ships.** Architecture ratified by Daniel as Option 3c (hybrid TS/Python with `apps/common` canonical writer); see Daniel Ratified Decisions §13.1 below.

```ts
export interface AccountPrefsHistoryEntry {
  history_id: string; // ULID
  account_id: string;
  changed_at: string;
  changed_by_auth_id: string;
  source: "investor_ui" | "admin_portal" | "system";
  before_payload: Partial<AccountPrefsProjection>;
  after_payload: Partial<AccountPrefsProjection>;
  diff_fields: string[];
  reason_code?: string;
  signed_consent_ref?: string; // pointer to UserConsents row, when material change
  ip_hash?: string; // investor change only
  user_agent_hash?: string; // investor change only
  device_fingerprint_hash?: string; // investor change only
  correlation_id: string;
}
```

### 7.14 `ConsentRequirement`

Projection of disclosure registry / requirement state.

```ts
export interface ConsentRequirement {
  consent_key: string; // e.g. "form-adv-2a", "tos"
  required_version: string;
  effective_at: string;
  display_title: string;
  display_link: string;
}
```

### 7.15 `ConsentAcceptance`

Direct projection of `UserConsents` / `AccountConsents`.

```ts
export interface ConsentAcceptance {
  consent_key: string;
  consent_version: string;
  accepted_at: string;
  acceptance_source: string; // e.g. "web"
  ip_hash: string;
  user_agent_hash: string;
  correlation_id: string;
}
```

### 7.16 `InvestorTemplateActivationRequest`

Investor-initiated Managed activation. Maps to backend `POST /api/v1/accounts/{account_id}/templates`.

```ts
export interface InvestorTemplateActivationRequest {
  account_id: string; // session-derived; BFF asserts match
  template_id: string;
  signed_consent_refs: string[]; // ConsentAcceptance rows acknowledging activation
  correlation_id: string;
}
```

### 7.17 `InvestorAccountActionRequest`

Investor-initiated `account.admin` verb request, gated by the BFF allowlist (Daniel decision §13.3).

```ts
export type InvestorAccountActionVerb =
  | "pause_autopilot"
  | "resume_autopilot"
  | "join_template"
  | "leave_template"
  | "update_prefs"
  | "liquidate_all";

export interface InvestorAccountActionRequest {
  account_id: string; // session-derived; BFF asserts match
  action: InvestorAccountActionVerb; // BFF allowlist enforced; any other verb is 403
  payload: Record<string, unknown>; // per-verb schema; see §13.3 mapping
  correlation_id: string;
}
```

Forbidden verbs (any presence is a 403 + tripwire violation): `force_rebuild`, `rebalance` (operator-only). Tripwire continues to block any frontend reference to these strings.

### 7.18 `AdminPortalProxyRoute`

Internal BFF type for routing Admin Portal proxy calls.

```ts
export interface AdminPortalProxyRoute<
  TRequest,
  TResponseRaw,
  TResponseInvestor,
> {
  bff_path: string; // BFF-facing path
  upstream_path: string; // Admin Portal path
  upstream_method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  scoping:
    | "route_account_id_match"
    | "inject_account_id_query"
    | "verify_response_account_id"
    | "tenant_projection";
  redaction_schema: unknown; // Zod schema for response sanitization
  cache_ttl_seconds?: number;
  investor_safe: true; // hard-coded; admin-only endpoints are NOT mounted on BFF
}
```

### 7.19 `InvestorScopedRoute`

Shape contract for every BFF route under `/api/v1/investor/*`.

```ts
export interface InvestorScopedRoute<TQuery, TBody, TResponse> {
  bff_path: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  requires_authenticated_session: true; // always — no anonymous investor routes
  requires_csrf_for_mutation: boolean;
  account_id_source: "session"; // never client-supplied; if path/body has account_id, BFF MUST verify match
  rate_limit?: { window_seconds: number; max: number };
  records_access_log?: boolean; // true for read routes that view sensitive data; emits RecordAccessLog
  records_action_receipt?: boolean; // true for mutation routes; emits InvestorActionReceipt
}
```

---

## 8. Contract V3 rules (numbered, normative)

1. **`stream_id` is lineage**, not the broker-tradable asset. Frontend must use asset-level fields (`asset_id`, `Orders.asset`, `Fills.asset`) for execution display.
2. **Broker execution uses asset-level fields.** A broker order for `AAPL` may be derived from `AAPL~rf`, `AAPL~rl`, or both; the broker-facing symbol remains `AAPL`.
3. **`signal: 0` means neutral / flat / no new stance.**
4. **`signal: 0` must not be displayed as "hold".** "Hold" implies active position management.
5. **Raw `signal: 0` must not infer close, flatten, sell, or any account action.**
6. **Account action evidence must come from `TemplateTargets`, `AccountIntents`, or downstream lifecycle objects** — never from raw signal alone.
7. **Risk is binary**: `risk.approved` → `ALLOW`; persisted `risk.rejected` → `DENY`. There is no risk-layer REVIEW.
8. **`REVIEW` is BFF-owned only**, and exclusively for non-risk gates (`consent_missing`, `profile_stale`, `disclosure_outstanding`, `broker_disconnected`, `broker_credentials_invalid`, `broker_stale_snapshot`, `trading_control_blocking`, `blocked_order`, `reconciliation_discrepancy`, `unsupported_account_state`).
9. **Exception Review must not override risk rejection.** Risk-rejected intents are terminal evidence routed to Records Center.
10. **Exception Review is for controls, blocked orders, reconciliation, broker / account-state issues** with a real resolution path.
11. **Template registry is Spanner-backed** and exposed through Admin Portal projections (`/api/v1/portfolio/templates`, `/memberships`, `/rules`).
12. **No standalone `strategy_id`.** Strategy identity is `stream_id + strategy_source`. `portfolio_registry.recipe_id` is a construction artifact, not a generic trading strategy id.
13. **`AccountPrefs` is the account control surface.** Investor-editable subset: `drift_threshold`, `min_order`, `excluded_assets`, `fractional_enabled`.
14. **`RiskLimits` are read-only for investors** unless Daniel later approves another path.
15. **`UserConsents` and `AccountConsents` are consent evidence.** Investor disclosure acceptance writes through to these tables.
16. **`AccountPrefsHistory` is new scope, not yet implemented.** BFF owns an interim ledger; long-term home per Daniel decision §13.1.
17. **Records Center uses the lifecycle correlation spine**: `correlation_id`, `action_id`, `intent_id`, `plan_id`, `order_id`, `client_order_id`, `broker_order_id`, `attempt_id`, `fill_id`, `reconciliation_run_id`.

---

## 9. Mapping table — V3 fields by backend source

| V3 field / projection                   | Backend source                                                                        | Admin Portal endpoint                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `SignalRow.*`                           | `signals` Spanner row                                                                 | not direct; consumed via `AccountIntents`                                                                    |
| `StreamId`                              | `stream_id` column (canonical from `apps/common/stream_identity`)                     | n/a (lineage display)                                                                                        |
| `TemplateDescriptor.*`                  | `templates` + `template_membership` + `template_rules` + `portfolio_registry`         | `GET /api/v1/portfolio/templates`, `/memberships`, `/rules`                                                  |
| `AccountIntentProjection.*`             | `AccountIntents`                                                                      | `GET /api/v1/risk/intents/{id}`, `/accounts/{id}/flow`                                                       |
| `AccountIntentLegProjection.*`          | `AccountIntents.legs[]`                                                               | same                                                                                                         |
| `RiskDecisionProjection.*`              | `RiskSnapshots` (immutable)                                                           | `GET /api/v1/risk-engine/pipeline/occurrences/{procedure_id}` (decision detail), joined via `intent_id`      |
| `BffEligibilityState.*`                 | BFF compose                                                                           | n/a (BFF-owned)                                                                                              |
| `ControlStateProjection.*`              | `TradingControlStates` + `TradingControlEvents`                                       | `GET /api/v1/settings/trading-controls` (filtered to account scope)                                          |
| `ReconciliationDiscrepancyProjection.*` | `TradeReconciliationDiscrepancies`                                                    | `GET /api/v1/ops/reconciliation/discrepancies`, `/{id}` (filtered)                                           |
| `OrderLifecycleProjection.*`            | `Orders` + `OrderEvents` + `BrokerOrderAttempts` + `Fills`                            | `GET /api/v1/execution/orders/{id}`, `/api/v1/orders/{id}`, `/api/v1/broker-interactions/{id}` (joined view) |
| `RecordArtifactProjection.*`            | composition over multiple lifecycle tables                                            | composed at BFF                                                                                              |
| `AccountPrefsProjection.*`              | `AccountPrefs`                                                                        | (today) `GET /api/v1/accounts/{id}` (subset); (Phase 3) dedicated investor projection                        |
| `AccountPrefsHistoryEntry.*`            | BFF-owned ledger; migrates to backend per `phase2-6-account-prefs-history-options.md` | n/a today; Phase 3 backend                                                                                   |
| `ConsentRequirement.*`                  | disclosure registry (BFF-owned + backend `UserConsents` versioning)                   | composed                                                                                                     |
| `ConsentAcceptance.*`                   | `UserConsents` + `AccountConsents`                                                    | (today) BFF write-through; (Phase 3) `POST /api/v1/accounts/{id}/consents`                                   |
| `InvestorTemplateActivationRequest`     | mutation envelope                                                                     | `POST /api/v1/accounts/{id}/templates` (via BFF, allowlist enforced)                                         |
| `InvestorAccountActionRequest`          | mutation envelope                                                                     | `POST /api/v1/accounts/{id}/admin-actions` (via BFF, allowlist enforced — see §13.3)                         |

---

## 10. Adapter chain (V3)

```
Admin Portal API (Spanner-backed projections)
    └─▶ BFF investor-scoped ACL + cache + redaction
        ├─▶ AccountIntentProjection / AccountIntentLegProjection (rec list/detail)
        ├─▶ RiskDecisionProjection (immutable verdict; display only)
        ├─▶ BffEligibilityState = compose(RiskDecisionProjection + BFF gates)
        │     ├─▶ Managed-active + ALLOW: standing policy enforces; investor sees lifecycle live
        │     ├─▶ DENY (from risk): record-only; routes to Records Center as terminal evidence
        │     └─▶ REVIEW (BFF gates): routes to Exception Review with resolution path
        ├─▶ OrderLifecycleProjection (live tail via /api/v1/stream → /api/v1/investor/stream SSE bridge)
        ├─▶ ControlStateProjection (Pause/Resume + Exception Review feed)
        ├─▶ ReconciliationDiscrepancyProjection (Exception Review feed)
        ├─▶ AccountPrefsProjection + AccountPrefsHistoryEntry (Account Controls Center)
        ├─▶ ConsentRequirement + ConsentAcceptance (Consent flow)
        └─▶ RecordArtifactProjection (Records Center)
```

The BFF does not invent state; it only composes, filters, redacts, and translates.

---

## 11. Fixture requirements

(Drafted at Contract V3 level; concrete fixtures land in PR-C.)

- `SignalRow` fixtures: RF-only, RL-only, RF+RL agreement, RF+RL conflict, `signal: 0` warmup, `signal: 0` ongoing, stale `ts_utc`, missing `asset_id`.
- `AccountIntentProjection` + `AccountIntentLegProjection` fixtures: rebalance with `legs.length > 0`, liquidation, preference-change intent, zero-weight closing leg.
- `RiskDecisionProjection` fixtures: approved, rejected with each `reasons[].code` (`LEVERAGE_LIMIT`, `VAR_LIMIT`, `SINGLE_NAME_CONC_LIMIT`, `SECTOR_CONC_LIMIT`).
- `BffEligibilityState` fixtures: ALLOW, REVIEW per each BFF reason, DENY (from risk).
- `OrderLifecycleProjection` fixtures: each of the 15 `OrderStatus` values, including `unknown` and `reconciled_terminal`.
- `ControlStateProjection` fixtures: operator-set `halt_all`, system-set `reconciliation_block`, investor-set `account_pause` (mapped to backend per Daniel decision §13.4), `reduce_only`.
- `ReconciliationDiscrepancyProjection` fixtures: open blocking, resolved auto, resolved operator.
- `AccountPrefsHistoryEntry` fixtures: investor edit (signed), admin-portal edit, system-set rollback.
- `ConsentRequirement` + `ConsentAcceptance` fixtures: required + outstanding, accepted with `ip_hash` / `ua_hash` / `correlation_id`.
- `RecordArtifactProjection` fixtures: each artifact_type with correct spine population.
- Tripwire fixtures: `template.admin`, `target_account_id`, `manual_rebalance` payloads MUST be filtered out by the BFF before any investor-facing render.

---

## 12. Test plan (V3)

(Drafted; concrete specs land in PR-C / PR-E / PR-F / PR-G / PR-H per `phase2-6-next-pr-sequence.md`.)

### Contract assertions to add (to `scripts/contract-assertions.ts`)

- `risk verdict is binary`: `RiskDecisionProjection.decision ∈ {"approved", "rejected"}`; no third value.
- `BffEligibilityState REVIEW excludes risk-rejected reasons`: REVIEW reasons[] never includes risk reason codes.
- `RecommendationProjection.action excludes "hold"`: no fixture or projection carries `action: "hold"`.
- `OrderLifecycleProjection.events monotonic` per `apps/common/trade_lifecycle/transitions.py`.
- `AccountPrefsHistoryEntry write produces exactly one history entry per AccountPrefs mutation`.
- `InvestorAccountActionRequest verb in allowlist` (see §13.3); any other value rejected at the contract layer.

### E2E to add

- `signal: 0` never renders a "hold" affordance on recommendation list/detail.
- `risk.rejected` projections render with no clear/override affordance.
- `BffEligibilityState REVIEW` per-reason resolution path renders for each BFF reason.
- Account Controls Center edit creates an `AccountPrefsHistoryEntry`.
- Exception Review never lists risk-rejected intents.
- Records Center deep-link by `correlation_id` resolves to the spine view.
- SSE bridge drops any event whose `account_id` ≠ session.

### Boundary tests (preserve V2 strictness)

- No per-trade Accept / Approve / Submit / Submit-trade affordance renders.
- `template.admin`, `target_account_id`, `manual_rebalance` NEVER appear in any investor-visible artifact (tripwire-enforced at source level; E2E-enforced at render level).
- `force_rebuild` / `rebalance` (operator-only `account.admin` verbs) NEVER reach an investor surface.
- Support cannot override eligibility, execution status, exception status, policy state.

---

## 13. Daniel Ratified Decisions

These are Daniel's explicit decisions, recorded at the date of this contract. Each row carries the decision, the implications for the BFF/contract, and the gap-register entry tracking implementation.

### 13.1 AccountPrefs History architecture

**Decision:** **Option 3c ratified.** Hybrid TS/Python with `apps/common` as the canonical writer location.

Implementation rules:

- `apps/common/account_prefs_history/*` (Daniel's repo) is the canonical write procedure.
- Python sidecar (Cloud Run or equivalent) wraps the canonical writer for cross-language consumers.
- BFF uses a TypeScript port for **reads** and **validation** (in `packages/common-ts/account-prefs-history/` once authored), with parity fixtures.
- Parity fixtures: TS and Python must agree on payload shape, diff logic, validation rules, and hash behavior.
- The BFF must not invent a separate AccountPrefs write procedure.
- All `AccountPrefs` mutations route through the canonical writer regardless of caller (BFF or admin-portal).
- `AccountPrefsHistoryEntry` is added to retention scope at `apps/common/trade_lifecycle/retention.py` for 7-year minimum and legal-hold rules.

Gap status: `GAP-PREFS-HISTORY-001` / `GAP-PREFS-WRITE-002` / `GAP-PREFS-AUDIT-003` move from "needs Daniel ratification" to **"architecture ratified, implementation still blocked pending Contract V3 + AccountPrefs History Contract."** Surface 4 remains blocked.

### 13.2 Admin Portal API ACL strategy

**Decision:** Phase 2.6 uses **BFF-side ACL filtering** with patterns 1 + 2 (route-scoped + account-filtered list filtering). Phase 3 migrates to dedicated `/api/v1/investor/*` Admin Portal projections.

Implementation rules:

- The BFF is the investor-scoped ACL layer in Phase 2.6.
- The BFF must assert authenticated `account_id` against the session.
- The BFF must inject `account_id=session.account_id` into list routes.
- The BFF must reject caller-supplied `account_id` values that do not match the authenticated investor (403).
- The BFF must redact admin-only fields before returning data (per Zod redaction schemas per route).
- Dedicated investor projections (`/api/v1/investor/*` on Admin Portal) are a Phase 3 backend hardening target, **not** a Phase 2.6 blocker.

Gap status: `GAP-ACL-005` moves from "needs Daniel ratification" to **"decision recorded, implementation required in PR-E."**

### 13.3 Investor-side `/admin-actions` verb allowlist

**Decision:** The investor-side allowlist is **confirmed** as the six verbs below.

| Verb               | Mapped product action                                                                                                            | BFF route                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `pause_autopilot`  | investor pause Managed                                                                                                           | `POST /api/v1/investor/managed/pause`                                                   |
| `resume_autopilot` | investor resume Managed                                                                                                          | `POST /api/v1/investor/managed/resume`                                                  |
| `join_template`    | Managed activation / template enrollment                                                                                         | `POST /api/v1/investor/managed/activate`                                                |
| `leave_template`   | Managed deactivation / template exit                                                                                             | `POST /api/v1/investor/managed/deactivate`                                              |
| `update_prefs`     | Account Controls Center preference update — **only after** AccountPrefs History write path exists                                | `PATCH /api/v1/investor/account-prefs`                                                  |
| `liquidate_all`    | high-risk account-level close-out — gated behind separate confirmation, counsel review, broker-state check, and full audit trail | `POST /api/v1/investor/managed/liquidate-all` (Phase 3 unless counsel approves earlier) |

**Forbidden verbs** (any presence is a 403 + tripwire violation):

- `force_rebuild`
- `rebalance`
- any `template.admin` action
- any `target_account_id` parameter exposure
- any manual rebalance variant
- any staff / founder / support-mediated individualized action

Implementation rules (enforced at the BFF):

- These are not raw `/admin-actions` calls. They are product-mediated investor actions behind BFF routes with ACL checks, consent checks, account-ownership checks, and record logging.
- BFF rejects all verbs outside the allowlist.
- BFF rejects any `account_id` mismatch.
- BFF logs every accepted investor action (emits `InvestorActionReceipt`).
- BFF never exposes raw `/admin-actions` to the frontend.
- `liquidate_all` requires separate high-risk confirmation and legal review before implementation lands.

Gap status: tracked in Gap Register V3 as part of `GAP-EXCEPTION-010` / `GAP-SURFACE4-009` scope.

### 13.4 Investor-initiable `TradingControlStates` modes

**Decision:** Investor-initiable controls are limited to the **account-scoped self-service subset**.

| Mode / action                                                                                                                            | Investor-initiable?                                 | Backend mapping                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Investor pause Managed                                                                                                                   | **Yes**                                             | Maps to a scoped account-level `account.admin pause_autopilot` action; NOT to a global `halt_all` |
| Investor resume Managed                                                                                                                  | **Yes** (only investor-requested pause states)      | `account.admin resume_autopilot`                                                                  |
| Investor reduce-only preference                                                                                                          | **Yes — conditional** on safe backend-state mapping | Mapping TBD with Daniel; tracked under `GAP-CONTROL-INIT-011`                                     |
| Investor leave template / deactivate Managed                                                                                             | **Yes**                                             | `account.admin leave_template`                                                                    |
| `halt_all`                                                                                                                               | **No (operator-only)**                              | —                                                                                                 |
| `halt_new_orders`                                                                                                                        | **No (operator-only)**                              | —                                                                                                 |
| `reconciliation_block`                                                                                                                   | **No (operator-only)**                              | —                                                                                                 |
| Global / asset-wide controls                                                                                                             | **No (operator-only)**                              | —                                                                                                 |
| Controls triggered by operational failure, compliance issue, reconciliation issue, broker state, pricing failure, or risk-engine failure | **No (system-only)**                                | —                                                                                                 |

Implementation rules:

- Investor pause must NOT create a global halt.
- Investor pause must map to a **scoped account-level** control state or account-admin action.
- Investor resume must ONLY resume investor-requested pause states.
- Investor must NOT clear operator-set or system-set controls.
- Investor must NOT clear risk rejection.
- Investor must NOT clear reconciliation block.
- Investor must NOT clear broker failure state.
- Operator / system controls render as **read-only** with status and next step.

Gap status: `GAP-CONTROL-INIT-011` moves from "needs Daniel ratification" to **"decision recorded, backend-state mapping required in PR-E + PR-H."**

### 13.5 Investor self-cancel of `pending_submit` orders

**Decision:** **Conditional.** Permitted only if SEC 203A-2(e), counsel review, broker rules, and lifecycle state allow.

Implementation posture:

- **Do not implement self-cancel yet.** Keep in Contract V3 as a conditional capability.
- Candidate state limited to `pending_submit` only.
- Excluded states: `submitted`, `acknowledged`, `working`, `partial_fill`, `filled`, `rejected`, `failed`, `canceled`, `reconciled_terminal`, `unknown`.
- Required: authenticated investor session; account ownership match; broker-state check; lifecycle-state check; cancelability check; `RecordArtifactProjection` capture; clear UI copy that this is a **cancellation request**, not a guarantee; broker response + order-lifecycle evidence required to confirm.

Gap status: `GAP-CANCEL-INIT-012` moves to **"conditional. Investor self-cancel of `pending_submit` orders is acceptable only after legal/counsel confirmation under SEC 203A-2(e) and only through an authenticated, account-scoped, lifecycle-safe flow."** Remains Phase 3 unless counsel explicitly approves earlier.

### 13.6 Investor audit-packet download

**Decision:** Investor may download their own `audit_packet` from `/api/v1/trace` only while authenticated.

Rules:

- Authenticated session required.
- `account_id` ownership required.
- Packet scope limited to investor's own account, order, intent, plan, fill, or reconciliation object.
- No cross-account lookup.
- No admin notes, no staff-only comments, no internal secrets, tokens, broker credentials, raw vendor secrets, or private operational payloads.
- Redact internal-only fields where needed.
- Log every download as a `RecordAccessLog` event.
- Support legal hold and retention rules.
- Support rate limiting.

Gap status: `GAP-AUDIT-PACKET-013` moves to **"decision recorded: investor may download own audit packet only in authenticated state and only after account-scoped authorization and redaction. Implementation still needs endpoint contract, redaction schema, retention alignment, and tests."**

### 13.7 Phase 3 target

Dedicated `/api/v1/investor/*` projections on Admin Portal (Daniel-owned) are the Phase 3 target. Until then, BFF-side ACL filtering + redaction is the boundary.

---

## 14. Migration plan (V2 → V3)

(Drafted; full sequence in `phase2-6-next-pr-sequence.md`.)

1. **This PR** (PR-B): Contract V3 + Gap Register V3 docs.
2. **PR-C**: regenerate OpenAPI client without `execution_policy_*` / `strategy_id`; replace `EligibilityCheck` ternary on risk side; introduce `BffEligibilityState`; replace `RecommendationProjection.action: "hold"` with `"neutral"` or no projection; update fixtures; update tripwire forbidden-term list.
3. **PR-D**: AccountPrefs History Contract (finalize per Daniel decision §13.1).
4. **PR-E**: Build Admin Portal proxy + ACL (per Daniel decision §13.2).
5. **PR-F**: Account Controls Center implementation (Surface 4 reframe).
6. **PR-G**: Records Center correlation-spine implementation.
7. **PR-H**: Exception Review reframe per Decision §13.4.

---

## 15. Merge rule

Phase 2.6 main-merge gate for downstream PRs (PR-C through PR-H):

1. PR-B (this Contract V3 + Gap Register V3) merged to `main`.
2. PR-D AccountPrefs History Contract Daniel-ratified.
3. Full CI green per project gates.
4. PR description states `refinity-main main @ 9f9dfc9` is the backend anchor.
5. PR description states which Daniel decision (§13.1 – §13.6) it implements or relies on.
6. SEC 203A-2(e) boundary tests remain strict.

---

## 16. Scope lock

No backend changes (`refinity-main` remains untouched read-only reference). No frontend product behavior changes from this doc alone (implementation lands in PR-C through PR-H). No SEC 203A-2(e) boundary weakened. No per-trade Accept, Approve, Submit, investor-accept, staff approval, founder review, or support-led advice reintroduced. No new product surface added (Surface 4's reframe is the same surface, not a new one). No implementation code written.
