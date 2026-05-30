# Phase 2.6 Contract V3 Plan

**Date:** 2026-05-30
**Source of truth:** [`phase2-6-authoritative-source-of-truth.md`](phase2-6-authoritative-source-of-truth.md)
**Supersedes:** [`phase2-5-signal-to-investor-product-contract.md`](phase2-5-signal-to-investor-product-contract.md) (V2).
**Status:** **Plan** for Contract V3. Detailed authoring happens in PR-B.

> **Status update (2026-05-30):** Final Contract V3 has been authored in [`docs/phase2-6-signal-to-investor-product-contract-v3.md`](phase2-6-signal-to-investor-product-contract-v3.md). This plan is retained as planning evidence.

This doc plans the replacement of Phase 2.5 Contract V2 with a Contract V3 that aligns to `refinity-main` authoritative docs at commit `9f9dfc9`. It enumerates fields to remove, rename, preserve, and add; the new object model; and the implementation impact.

---

## 1. Removals (drop from V3)

### Removed objects

- `ExecutionPolicyDecision`
- `ExecutionPolicyVersion`
- `ExecutionPolicyActivation`
- `AggregationStatus` enum
- the per-trade `BrokerSubmission` adapter object (replaced by direct consumption of `Orders` + `OrderEvents` from Admin Portal)

### Removed fields

- `policy_id` (everywhere)
- `policy_version` (everywhere)
- `strategy_id` (everywhere)
- `aggregation_status` on `SignalCandidate`
- `decision: "RECORD_ONLY" | "BLOCK" | ...` on the BFF side (decisions live in `RiskSnapshots`)
- `reason_codes: REVIEW | DENY partition` on the BFF side (risk is binary)

### Removed enums / values

- `RecommendationProjection.action: "hold"` → replaced by `"neutral"` or no projection
- `EligibilityCheck.status: REVIEW` from the risk-driven path (preserved on the BFF-owned path; see §3 below)

## 2. Renames (semantic clarification)

| V2                                                       | V3                        | Reason                                                                                           |
| -------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------ |
| `SignalCandidate.strategy_id`                            | (removed)                 | Strategy identity = `stream_id + strategy_source`                                                |
| `SignalCandidate.confidence_score`                       | `proba`                   | Match `signals` table column name                                                                |
| `RecommendationProjection.recommendation_id`             | `intent_id`               | Match `AccountIntents.intent_id` — the actual canonical identity                                 |
| `RecommendationProjection.created_at`                    | `ts_utc`                  | Match wire field                                                                                 |
| "Automation Center" (Surface 4 product name)             | "Account Controls Center" | No `ExecutionPolicy` exists; the surface composes `AccountPrefs` + `RiskLimits` + `UserConsents` |
| `ExceptionReview.exception_type: "out_of_policy_intent"` | `"risk_rejected_intent"`  | Reframed: a risk reject is terminal, never "out of policy"                                       |

## 3. Preserved (V2 was correct)

- The SEC 203A-2(e) boundary lock (no per-trade Accept, no investor-accept, no staff approval, no founder review, no support-led advice, `template.admin` / `target_account_id` admin-only)
- Signal vs Managed subscription mode (frontend product framing — backend doesn't differentiate)
- BFF-owned `EligibilityCheck` ternary `ALLOW | REVIEW | DENY` **for non-risk gates only** (REVIEW means: missing disclosure ack, incomplete profile, stale broker connection, missing consent, missing preference record, blocking trading-control state)
- `InvestorActionReceipt` vs `RecordAccessLog` separation (memory contract `contract_receipt_vs_access_log.md` holds)
- The correlation spine concept (now grounded in trade_auditability_contract.md §71-89)

## 4. New backend-aligned objects (V3)

### `SignalRow` (was `GitLabSignalRow` / `DanielSignalRaw`)

Direct projection of the `signals` Spanner row:

```ts
interface SignalRow {
  stream_id: string; // {ASSET_ID}~{strategy_source}, canonical: apps/common/stream_identity.make_stream_id
  asset_id: string;
  strategy_source: string;
  signal: -1 | 0 | 1; // 0 is neutral, NOT hold
  proba?: number;
  label_rf?: -1 | 0 | 1;
  label_rl?: -1 | 0 | 1;
  ts_utc: string; // ISO-8601
}
```

Frontend never auto-closes on `signal: 0`. Close evidence lives in `AccountIntents.legs`.

### `TemplateDescriptor` (V3, replaces `RecommendationProjection.strategy_id`)

Read from `GET /api/v1/portfolio/templates` and joined with `portfolio_registry`:

```ts
interface TemplateDescriptor {
  template_id: string;
  display_name: string; // templates.name OR portfolio_registry.display_name
  status: string;
  risk_class?: string;
  profile?: string; // portfolio_registry.profile (investor segmentation)
  weighting_policy?: string;
  gross_target?: number;
  net_target?: number;
  leverage?: number;
  rules?: {
    // from template_rules
    min_change_threshold?: number;
    turnover_throttle?: number;
    cooldown_window_hours?: number;
    max_single_asset_weight?: number;
  };
  membership: Array<{
    // from template_membership (active only)
    stream_id: string;
    asset_id: string;
    strategy_source: string;
    membership_weight: number;
  }>;
  created_at: string;
}
```

### `AccountIntentLegProjection` (replaces parts of `RecommendationProjection`)

Direct projection of `AccountIntents.legs` (single leg):

```ts
interface AccountIntentLegProjection {
  intent_id: string;
  account_id: string;
  asset_id: string; // broker-tradable asset, NOT stream_id
  delta_notional: number; // positive = increase exposure, negative = reduce
  delta_qty?: number;
  source_streams: string[]; // stream lineage for advisory display
  stream_contributions?: Record<string, number>;
  status:
    | "ready"
    | "approved"
    | "rejected"
    | "executed"
    | "expired"
    | "blocked";
  template_id: string;
  template_version: string;
  action_id: string; // PE action this intent came from
  ts: string;
  blocked_reason?: string;
}
```

### `RiskDecisionProjection` (replaces `EligibilityCheck` for risk path)

Direct projection of `RiskSnapshots`:

```ts
interface RiskDecisionProjection {
  intent_id: string;
  account_id: string;
  decision: "approved" | "rejected"; // binary
  snapshot_hash: string;
  reasons: Array<{
    // only when rejected
    code:
      | "LEVERAGE_LIMIT"
      | "SINGLE_NAME_CONC_LIMIT"
      | "SECTOR_CONC_LIMIT"
      | "VAR_LIMIT";
    detail?: string;
  }>;
  constraints?: unknown; // only when approved
  metrics: unknown; // exposure/VaR metrics for display
  stream_lineage?: Array<{ stream_id: string; weight: number }>;
  ts: string;
  correlation_id: string;
}
```

### `BffEligibilityState` (BFF-owned, REVIEW lives here only)

```ts
interface BffEligibilityState {
  account_id: string;
  status: "ALLOW" | "REVIEW" | "DENY";
  reasons: Array<
    | "kyc_pending"
    | "kyc_expired"
    | "profile_incomplete"
    | "profile_stale"
    | "disclosure_outstanding"
    | "consent_missing"
    | "broker_disconnected"
    | "broker_credentials_invalid"
    | "broker_stale_snapshot"
    | "trading_control_blocking" // halt_all / halt_new_orders / reconciliation_block / reduce_only / degraded — see TradingControlStates
    | "subscription_mode_signal" // for routes that require Managed mode
  >;
  checked_at: string;
  source_evidence: {
    // each reason's underlying backend source
    risk?: RiskDecisionProjection;
    consent?: { missing_consent_keys: string[] };
    profile?: { stale_since?: string };
    broker?: { last_validated_at?: string };
    control?: { active_states: string[] };
  };
}
```

REVIEW is **product-driven**, not risk-driven. The risk layer is binary; the BFF composes risk + BFF gates into a single eligibility view for the investor.

### `OrderLifecycleProjection` (replaces `BrokerSubmission`)

Direct projection of `Orders` + `OrderEvents` + `BrokerOrderAttempts` + `Fills`:

```ts
interface OrderLifecycleProjection {
  order_id: string;
  client_order_id: string;
  broker_order_id?: string | null;
  account_id: string;
  asset_id: string;
  status: OrderStatus; // canonical from apps/common/trade_lifecycle/states.py
  intent_id: string;
  plan_id: string;
  action_id: string;
  correlation_id: string;
  events: Array<{
    status: OrderStatus;
    ts: string;
    reason?: string;
  }>; // from OrderEvents (append-only ledger)
  attempts: Array<{
    // from BrokerOrderAttempts
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
  }>;
  fills: Array<{
    // from Fills
    fill_id: string;
    qty: number;
    price: number;
    ts: string;
  }>;
  trade_input_snapshot_ref?: string; // pointer to TradeInputSnapshots
}

type OrderStatus =
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
```

### `ControlStateProjection` (new, source of REVIEW for control-state blockers)

Direct projection of `TradingControlStates`:

```ts
interface ControlStateProjection {
  account_id: string;
  active_states: Array<{
    control_id: string;
    mode:
      | "halt_all"
      | "halt_new_orders"
      | "reduce_only"
      | "reconciliation_block"
      | "degraded";
    scope: "account" | "asset" | "global";
    target_asset?: string;
    activated_at: string;
    reason?: string;
  }>;
  history_ref: string; // pointer to TradingControlEvents
}
```

### `ReconciliationDiscrepancyProjection` (new, fuels Exception Review)

Direct projection of `TradeReconciliationDiscrepancies`:

```ts
interface ReconciliationDiscrepancyProjection {
  discrepancy_id: string;
  reconciliation_run_id: string;
  account_id: string;
  asset_id: string;
  kind:
    | "position_mismatch"
    | "fill_mismatch"
    | "order_mismatch"
    | "balance_mismatch";
  blocking: boolean; // blocks new exposure?
  detected_at: string;
  status: "open" | "resolved_auto" | "resolved_operator" | "stale";
}
```

### `AccountPrefsProjection` + `AccountPrefsHistoryEntry` (new + new scope)

```ts
interface AccountPrefsProjection {
  account_id: string;
  drift_threshold: number;
  min_order: number;
  excluded_assets: string[];
  fractional_enabled: boolean;
  updated_at: string;
}

interface AccountPrefsHistoryEntry {
  history_id: string; // append-only ledger id (BFF-managed until backend ships)
  account_id: string;
  changed_at: string;
  changed_by_auth_id: string;
  source: "investor_ui" | "admin_portal";
  before: Partial<AccountPrefsProjection>;
  after: Partial<AccountPrefsProjection>;
  diff_fields: string[];
  reason_code?: string;
  correlation_id: string;
}
```

Long-term home is TBD per [`phase2-6-account-prefs-history-options.md`](phase2-6-account-prefs-history-options.md). BFF owns the ledger writes today.

### `ConsentAcceptance` + `ConsentRequirement` (new, replaces `disclosure-acknowledgement` entity)

Projections over `UserConsents` and `AccountConsents`:

```ts
interface ConsentRequirement {
  consent_key: string; // e.g. "form-adv-2a", "tos"
  required_version: string;
  effective_at: string;
  display_title: string;
  display_link: string;
}

interface ConsentAcceptance {
  consent_key: string;
  consent_version: string;
  accepted_at: string;
  acceptance_source: string;
  ip_hash: string;
  user_agent_hash: string;
  correlation_id: string;
}
```

## 5. Adapter chain (V3)

```
Admin Portal API (Spanner-backed projections over signals/intents/risk/exec/lifecycle/control/prefs/consents)
    └─▶ BFF investor-scoped ACL proxy
        └─▶ AccountIntentLegProjection      (from /accounts/{id}/flow + /risk/intents)
            └─▶ BffEligibilityState         (compose: RiskDecisionProjection + BFF gates)
                ├─▶ Managed: OrderLifecycleProjection (live tail via /api/v1/stream)
                ├─▶ Signal: record-only projection (no orders ever emitted)
                └─▶ ExceptionReview entries:
                    ├─ from ControlStateProjection (active blocking control)
                    ├─ from /api/v1/orders/blocked
                    ├─ from ReconciliationDiscrepancyProjection (blocking)
                    └─ from BFF-owned gates (broker reconnect, consent re-ack, profile reactivation)
```

## 6. Mapping table — fields by backend source

(High-level; full mapping in PR-B contract V3 doc.)

| V3 field                                       | Backend source                                                             | Notes                                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `SignalRow.*`                                  | `signals` Spanner row                                                      | Latest-state per `stream_id`                                                       |
| `TemplateDescriptor.*`                         | `templates`, `template_membership`, `template_rules`, `portfolio_registry` | Joined via `/api/v1/portfolio/*`                                                   |
| `AccountIntentLegProjection.*`                 | `AccountIntents` + history                                                 | `/api/v1/risk/intents`, `/accounts/{id}/flow`                                      |
| `RiskDecisionProjection.*`                     | `RiskSnapshots` immutable                                                  | `/api/v1/risk-engine/pipeline/occurrences/{procedure_id}` (decision detail)        |
| `BffEligibilityState.*`                        | BFF compose                                                                | Combines RiskDecisionProjection + BFF gates                                        |
| `OrderLifecycleProjection.*`                   | `Orders`+`OrderEvents`+`BrokerOrderAttempts`+`Fills`                       | `/api/v1/execution/orders/{order_id}`, `/api/v1/orders`                            |
| `ControlStateProjection.*`                     | `TradingControlStates`+`TradingControlEvents`                              | `/api/v1/settings/trading-controls`                                                |
| `ReconciliationDiscrepancyProjection.*`        | `TradeReconciliationDiscrepancies`                                         | `/api/v1/ops/reconciliation/discrepancies`                                         |
| `AccountPrefsProjection.*`                     | `AccountPrefs`                                                             | `/api/v1/accounts/{id}` (current; needs investor-scoped endpoint)                  |
| `AccountPrefsHistoryEntry.*`                   | BFF-owned ledger; migrates to backend per `account-prefs-history-options`  | TBD                                                                                |
| `ConsentAcceptance.*` + `ConsentRequirement.*` | `UserConsents` + `AccountConsents` + disclosure registry                   | Mix of BFF-owned (current disclosure docs) and backend-owned (acceptance evidence) |

## 7. AccountPrefs history requirement (Contract V3 scope)

See [`phase2-6-account-prefs-history-options.md`](phase2-6-account-prefs-history-options.md) for the full design. Contract V3 reserves the field shapes (`AccountPrefsHistoryEntry` above) so types are stable across the BFF-owned / backend-owned migration.

## 8. Admin Portal API consumption model (Contract V3 scope)

See [`phase2-6-admin-portal-api-consumption-map.md`](phase2-6-admin-portal-api-consumption-map.md) for per-endpoint mapping. Summary: 35 routers, BFF proxies the investor-relevant subset with strict account-id scoping; admin-only endpoints (cancel-order, force-inference, etc.) are unreachable from the investor surface and remain tripwire-blocked.

## 9. Exception Review reframing

Replaces Phase 2.5 §3.9 `ExceptionReview` with a multi-source exception inbox:

```ts
type ExceptionSource =
  | { kind: "control_state_blocking"; state: ControlStateProjection }
  | { kind: "blocked_order"; order: OrderLifecycleProjection }
  | {
      kind: "reconciliation_discrepancy";
      discrepancy: ReconciliationDiscrepancyProjection;
    }
  | { kind: "broker_disconnected"; last_validated_at: string }
  | { kind: "consent_outstanding"; requirement: ConsentRequirement }
  | { kind: "profile_stale"; stale_since: string }
  | {
      kind: "preference_change_pending";
      proposed_changes: Partial<AccountPrefsProjection>;
    };
```

Each `ExceptionSource` has a resolution path. Risk rejects (`RiskDecisionProjection.decision = "rejected"`) are **NOT** an `ExceptionSource` — they go to Records Center as terminal evidence with a "Why this didn't execute" lineage view.

## 10. Records Center correlation spine

Records Center renders the trade-auditability spine: for any executed (or terminal) intent, the investor sees:

`SignalRow → TemplateTargets → AccountIntents → RiskSnapshots → ExecutionPlans → Orders → OrderEvents → BrokerOrderAttempts → Fills → Positions → reconciliation`

Linked by `correlation_id`, `action_id`, `intent_id`, `plan_id`, `order_id`, `client_order_id`, `broker_order_id`, `attempt_id`, `fill_id`, `reconciliation_run_id`. (Per `trade_auditability_contract.md:71-89`.)

## 11. SEC 203A-2(e) boundary statements (unchanged from V2)

All Phase 2.5 boundary lock items hold without change in Contract V3:

- No per-trade investor Accept.
- No `investor-accept` topic or action.
- No "approve for execution" / "accept and execute" / "submit trade" affordance.
- No staff approval / founder review / support-led advice path.
- `template.admin`, `target_account_id`, manual rebalance — backend / admin only; tripwire-blocked in frontend.
- `force_rebuild`, `rebalance` (operator actions on `account.admin`) — tripwire-blocked in frontend.
- Signal tier is record-only; never emits `orders.cmd`.
- Managed tier uses standing `AccountPrefs` + signed `UserConsents` + risk-engine verdict; no per-trade investor approval.

## 12. Test plan (V3)

(Drafted; full test plan in PR-B.)

- Adapter unit tests against fixture envelopes for `signals`, `AccountIntents`, `RiskSnapshots`, `Orders`, `Fills`, `TradingControlStates`, `TradeReconciliationDiscrepancies`.
- Contract assertion additions: `risk verdict is binary`; `BffEligibilityState REVIEW excludes risk-rejected reasons`; `RecommendationProjection.action excludes 'hold'`; `OrderLifecycleProjection.events monotonic by status transition rules`.
- E2E additions: assert `signal: 0` never renders a hold affordance; assert `risk.rejected` never renders a clear-review affordance; assert `AccountPrefs` edit creates a history entry.

## 13. Migration plan (V2 → V3)

(Drafted; full sequence in PR-C through PR-H of `phase2-6-next-pr-sequence.md`.)

1. Generate Contract V3 doc (PR-B)
2. Regenerate OpenAPI client without `execution_policy_*` / `strategy_id` (PR-C)
3. Replace `EligibilityCheck` ternary on risk side; introduce `BffEligibilityState` (PR-C)
4. Replace `RecommendationProjection` shape and remove `"hold"` action (PR-C)
5. Update fixtures in `apps/web/src/lib/prototype-store` (PR-C)
6. Build Admin Portal proxy + ACL (PR-E)
7. Build AccountPrefs editor + history (PR-D agrees, PR-F builds)
8. Rebuild Exception Review around `ControlState` / blocked-orders / reconciliation (PR-H)
9. Rebuild Records Center around correlation spine (PR-G)

## 14. Scope lock

No code changes from this doc alone. No backend changes. No SEC 203A-2(e) boundary weakened. No new surface added. PR-B authors the full V3 contract doc; PR-C through PR-H realign code.
