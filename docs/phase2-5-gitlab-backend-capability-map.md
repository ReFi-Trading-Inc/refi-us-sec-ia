# Phase 2.5 GitLab Backend Capability Map

**Date:** 2026-05-29
**Audit branch:** `phase2-5-gitlab-surface-alignment-audit`
**Source-of-truth:** `gitlab.com/refinity_dev/refinity-main`, branch `main`, commit `0a7d64d`
**Audit mode:** read-only.
**Companion docs:** `phase2-5-gitlab-branch-inventory.md`, `phase2-5-frontend-surface-inventory.md`, `phase2-5-surface-to-gitlab-alignment-register.md`, `phase2-5-core-alignment-decision.md`.

All field shapes, file paths, line numbers, topic names, and table column names below are grounded in code reads of the cloned repo. Where a capability is **partially observed** (e.g. test fixtures show a shape but not all code paths), the row says so.

---

## 0. Service implementation depth (orientation)

| Service                       | Py files | TS files | README? | Implemented?                                    |
| ----------------------------- | -------: | -------: | :-----: | :---------------------------------------------- |
| `apps/inference-worker`       |       65 |        0 |    ✓    | **yes**                                         |
| `apps/portfolio-engine`       |       20 |        0 |    ✓    | **yes**                                         |
| `apps/portfolio-manager`      |       81 |        0 |    ✓    | **yes**                                         |
| `apps/account-intent-builder` |       38 |        0 |    ✓    | **yes**                                         |
| `apps/risk-engine`            |       28 |        0 |    ✓    | **yes**                                         |
| `apps/exec-gateway`           |       22 |        0 |    ✓    | **yes**                                         |
| `apps/trade-manager`          |       16 |        0 |    ✓    | **yes**                                         |
| `apps/admin-portal`           |      105 |      201 |   n/a   | **yes (full stack)**                            |
| `apps/asset-initializer`      |       55 |        0 |   n/a   | **yes**                                         |
| `apps/data-loader`            |       30 |        0 |    ✓    | **yes**                                         |
| `apps/trainer`                |       23 |        0 |    ✓    | **yes**                                         |
| `apps/training-scheduler`     |        5 |        0 |    ✓    | **yes**                                         |
| `apps/parity-runner`          |       14 |        0 |    ✓    | **yes**                                         |
| `apps/common`                 |       30 |        0 |   n/a   | **yes (shared)**                                |
| `apps/portfolio-analyzer-web` |        6 |        0 |   n/a   | **yes (legacy)**                                |
| `apps/audit-writer`           |        0 |        0 |    ✓    | **skeleton only**                               |
| `apps/compliance-adapter`     |        0 |        0 |    ✓    | **skeleton only**                               |
| `apps/auth-siwe`              |        0 |        0 |    ✓    | **skeleton only**                               |
| `apps/identity-ccid`          |        0 |        0 |    ✓    | **skeleton only**                               |
| `apps/anchor-job`             |        0 |        0 |    ✓    | **skeleton only**                               |
| `apps/merkle-builder`         |        0 |        0 |    ✓    | **skeleton only**                               |
| `apps/refin-indexer`          |        0 |        0 |    ✓    | **skeleton only**                               |
| `apps/routing-api`            |        0 |        0 |    ✓    | **skeleton only**                               |
| `apps/token-policy-api`       |        0 |        0 |    ✓    | **skeleton only**                               |
| `apps/pubsub-bus`             |        0 |        0 |    ✓    | **skeleton only**                               |
| `apps/explorer-api`           |        0 |        0 |    ✓    | **skeleton only**                               |
| `apps/web`                    |        0 |        0 |    ✓    | **skeleton only** (their planned Next.js shell) |
| `apps/node`                   |        0 |        1 |   n/a   | trivial                                         |

---

## 1. Signals and model outputs

| Capability                                  | Service          | Module / file path                                                          | Input shape                                                              | Output shape                                                    | Event / topic                                 | Pub/Sub or storage                                                                    | State transition                                                                         | Test coverage                                                         | Frontend currently maps to it?                                       | SEC 203A-2(e) boundary impact                                                   |
| ------------------------------------------- | ---------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Hourly signal generation per asset+strategy | inference-worker | `apps/inference-worker/src/orchestrator/orchestrator.py`                    | bars (data-loader)                                                       | `signals` row                                                   | (Spanner table primarily; Pub/Sub mirror TBD) | Spanner `signals` table + Pub/Sub                                                     | `Ready for Inference → Inference in Progress → Ready for Inference / Needs Model Update` | `apps/inference-worker/tests/test_stream_signal_publishing.py`        | **no** (frontend persona fixtures simulate `Recommendation` objects) | None directly; signal must pass through chain before reaching investor surface. |
| Multi-stream signal row shape               | inference-worker | `apps/inference-worker/src/orchestrator/orchestrator.py:upsert_live_signal` | `(asset, ts_utc, source, model_version, strategy, label, proba, signal)` | `signals` row keyed by `(stream_id="{asset}~{source}", ts_utc)` | n/a (Spanner)                                 | Spanner upsert via `DELETE ... WHERE stream_id=@stream_id` then `INSERT INTO signals` | n/a                                                                                      | `apps/inference-worker/tests/test_stream_signal_publishing.py:74-110` | **no**                                                               | None; the multi-stream identity is upstream of any boundary.                    |

**Critical fact (verified):** the wire signal shape is `signal: -1 | 1` (with `0` plausible but not confirmed in inspected tests). The legacy `live-components-main`'s `position: -1 | 0 | 1` field name does NOT exist in the GitLab schema.

**Critical fact (verified):** `model_version: STRING`, `strategy_source: STRING`, `strategy: STRING`, `label: INT64`, `proba: FLOAT64` are all **wire columns on `signals`**. The prior contract corrections that classified them as "derived" or "out-of-band" are wrong against this evidence.

---

## 2. Portfolio and account-intent generation

| Capability                                   | Service                               | Module / file path                                            | Input shape                                                                                                                                                     | Output shape                        | Event / topic                                                                                                                                                           | State transition                                         | Test coverage                                                                                           | Frontend currently maps to it?                                                                                                                                                      | SEC impact                                                                                                                                                  |
| -------------------------------------------- | ------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Portfolio target construction (per template) | portfolio-engine                      | `apps/portfolio-engine/src/`                                  | `signals` rows + `Templates`                                                                                                                                    | `template.rebalance.intent` event   | `{env}-template.rebalance.intent`                                                                                                                                       | n/a                                                      | (TBD; deeper read pending)                                                                              | **no**                                                                                                                                                                              | None directly; downstream of signal, upstream of account binding.                                                                                           |
| Auto-portfolio management orchestration      | portfolio-manager                     | `apps/portfolio-manager/src/`                                 | scheduling + `signals` + `available_strategies`-equivalent                                                                                                      | template-management events          | (multiple topics)                                                                                                                                                       | (TBD)                                                    | (TBD)                                                                                                   | **no**                                                                                                                                                                              | None directly.                                                                                                                                              |
| Account-bound intent generation              | account-intent-builder                | `apps/account-intent-builder/src/interface/pubsub.py`         | `template.rebalance.intent` OR `account.admin`                                                                                                                  | `account.intent.ready` event        | `{env}-template.rebalance.intent.account-intent-builder.sub` (consume), `{env}-account.admin.account-intent-builder.sub` (consume), `{env}-account.intent.ready` (emit) | per-account validation + dedupe; emits `proc_id` history | `apps/account-intent-builder/tests/test_builder_rebalance.py`, `test_account_admin.py` (multiple files) | **partially** — frontend's `AccountIntent` schema lines up at the `account_id + intent_id + partition_key` level; full event-loop binding is BFF-side and not yet wired.            | Critical: per-account intent is the load-bearing personalization boundary.                                                                                  |
| Account-admin command set                    | account-intent-builder + admin-portal | `apps/account-intent-builder/src/domain/processor.py:384-470` | `account.admin` event with `action ∈ {join_template, leave_template, pause_autopilot, resume_autopilot, liquidate_all, update_prefs, force_rebuild, rebalance}` | downstream intents or state changes | `{env}-account.admin` (admin-portal emits, account-intent-builder consumes)                                                                                             | per-action state machine                                 | `apps/account-intent-builder/tests/test_account_admin*.py` (multiple)                                   | **partially** — frontend has Phase 2 Surface 5 (pause/resume managed) which maps to `pause_autopilot`/`resume_autopilot` at the semantic level; not yet wired to the Pub/Sub event. | Critical: these are the admin-init account lifecycle commands. The frontend's BFF must wrap them; investor UI must never expose them as direct affordances. |

### `account.admin` action vocabulary (verified)

From `apps/account-intent-builder/src/domain/processor.py:384-470`:

- `join_template` — subscribe an account to a strategy template (≈ Strategy selection / Managed activation)
- `leave_template` — unsubscribe
- `pause_autopilot` — pause managed execution (≈ Phase 2 Surface 5 "Pause Managed")
- `resume_autopilot` — resume managed execution (≈ Phase 2 Surface 5 "Resume Managed")
- `liquidate_all` — close all positions (no frontend equivalent today)
- `update_prefs` — update per-account preferences
- `force_rebuild` — admin-only intent rebuild
- `rebalance` — manual rebalance for one account

### Manual rebalance command shape (verified)

From `apps/admin-portal/backend/pubsub_mgr.py:109-138` (`publish_manual_rebalance`):

```python
payload = {"action": "rebalance", "template_id": template_id, "target_account_id": target_account_id}
topic = settings.TOPIC_TEMPLATE_ADMIN  # default "dev-template.admin"
attributes = {
  "template_id": template_id,
  "action": "rebalance",
  "target_account_id": target_account_id,
  "partition_key": template_id,
}
```

`target_account_id` is optional; when set, rebalance is account-scoped, otherwise template-scoped.

---

## 3. Risk and eligibility

| Capability                       | Service                                   | Module / file path                                                              | Input shape                                                                                        | Output shape                                                 | Event / topic                                                                            | State transition                           | Test coverage     | Frontend currently maps to it?                                                                                                       | SEC impact                                                                                                               |
| -------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ----------------------------------------------------- |
| Risk decision per intent         | risk-engine                               | `apps/risk-engine/src/decision_builder.py`, `risk_rules_engine.py`, `models.py` | `account.intent.ready` event + per-account positions (Redis cache or broker refresh) + market data | `RiskDecision` (`decision = "approved"                       | "rejected"`, `constraints[]`, `reasons[]`, `metrics`, `stream_lineage`, `snapshot_hash`) | `dev-risk.approved` OR `dev-risk.rejected` | per-intent binary | (TBD)                                                                                                                                | **partially** — frontend assumes `automation_eligibility.status ∈ {ALLOW, REVIEW, DENY}`; backend emits binary `approved | rejected`. Mapping rule needed. | Critical: this is the SEC 203A-2(e) fail-closed gate. |
| Risk reason codes                | risk-engine                               | `apps/risk-engine/src/risk_rules_engine.py:32-118`                              | n/a                                                                                                | `RiskReason.code` set                                        | n/a                                                                                      | n/a                                        | (in code)         | **no** mapping table from `LEVERAGE_LIMIT` / `SINGLE_NAME_CONC_LIMIT` / `SECTOR_CONC_LIMIT` / `VAR_LIMIT` to investor-facing labels. | High — investor-facing exception labels must derive from these codes.                                                    |
| Trading controls (kill switches) | risk-engine (write) + exec-gateway (read) | `apps/risk-engine/src/spanner_repo.py:92` (`set_trading_control`)               | scope + control_id + mode + reason_code + reason_message + payload                                 | Spanner `TradingControlStates` + `TradingControlEvents` rows | n/a                                                                                      | per-scope state machine                    | (TBD)             | **no** — frontend has no parallel concept yet.                                                                                       | High — global / account / asset halts must propagate to the Exception Review surface.                                    |

### Reason codes (verified)

From `apps/risk-engine/src/risk_rules_engine.py`:

```
LEVERAGE_LIMIT
SINGLE_NAME_CONC_LIMIT
SECTOR_CONC_LIMIT
VAR_LIMIT
```

(Other codes likely exist; deeper read pending.)

### `RiskDecision` schema (verified — `apps/risk-engine/src/models.py:132-144`)

```python
class RiskDecision(BaseModel):
    decision: Literal['approved', 'rejected']
    intent_id: str
    account_id: str
    correlation_id: str
    ts: int  # decision ts
    snapshot_hash: str
    constraints: Optional[List[RiskConstraint]] = None
    reasons: Optional[List[RiskReason]] = None
    metrics: RiskMetrics
    stream_lineage: Optional[List[Dict[str, Any]]] = None
    retry_hint: Optional[Dict[str, Any]] = None
```

**Critical mapping fact:** backend decision is binary (`approved | rejected`). Frontend uses ternary (`ALLOW | REVIEW | DENY`). The adapter must:

- `risk.approved` → `ALLOW`
- `risk.rejected` + recoverable `reason.code` + `retry_hint` set → `REVIEW`
- `risk.rejected` + hard `reason.code` (e.g. `LEVERAGE_LIMIT`, `VAR_LIMIT`) → `DENY`
- no response / stale → `UNAVAILABLE`

The exact recoverable-vs-hard partition needs Daniel's confirmation.

---

## 4. Execution and broker path

| Capability                  | Service                               | Module / file path                                                                                                        | Input shape                      | Output shape                                                                           | Event / topic           | State transition                                                                                                                                                                                                                                                                                   | Test coverage | Frontend currently maps to it?                                                                                                    | SEC impact                                                                                                          |
| --------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Execution plan construction | exec-gateway                          | `apps/exec-gateway/src/models/domain.py:67` (`ExecutionPlan`)                                                             | `risk.approved` event            | `ExecutionPlan` rows in Spanner                                                        | `dev-orders.cmd` (emit) | `PlanStatus`: `pending_submit → waiting_on_cancels → in_flight → completed / completed_with_errors`                                                                                                                                                                                                | (TBD)         | **partially** — frontend has `ExecutionPlan` schema with `plan_id, account_id, intent_id, status`; backend matches at this level. | Critical: execution plans must reflect the activated `ExecutionPolicy` version (frontend-owned today; mapping TBD). |
| Order command emission      | exec-gateway                          | `apps/exec-gateway/src/models/dtos.py:50` (`OrdersCmd`)                                                                   | `ExecutionPlan` + child `Order`s | `dev-orders.cmd` Pub/Sub message                                                       | `dev-orders.cmd`        | n/a                                                                                                                                                                                                                                                                                                | (TBD)         | **partially** — frontend `Order` schema field names align.                                                                        | Critical.                                                                                                           |
| Order state machine         | exec-gateway + trade-manager + common | `apps/exec-gateway/src/models/domain.py:14` (`OrderStatus`); `apps/common/trade_lifecycle/states.py` (canonical statuses) | broker events                    | `Orders` Spanner row state                                                             | `dev-orders.evt`        | 15-state lifecycle: `planned → pending_submit → blocked_dependency / blocked_by_conflict → submit_started → submitted → acknowledged → working → partial_fill / cancel_requested / cancel_acknowledged / cancel_rejected / amend_requested / replace_requested → unknown / reconciliation_pending` | (TBD)         | **partially** — frontend `OrderStatus` enum has a subset of these; mapping needs explicit reconciliation.                         | Critical.                                                                                                           |
| Broker submission           | trade-manager                         | `apps/trade-manager/src/` (16 Python files)                                                                               | `Order` rows                     | broker API calls (SnapTrade per risk-engine README + others) + `dev-orders.evt` events | `dev-orders.evt`        | broker-truth-driven                                                                                                                                                                                                                                                                                | (TBD)         | **no** direct mapping; frontend has the `/api/v1/orders` schema as a target shape.                                                | Critical — broker submission is the boundary endpoint.                                                              |

### `Order` schema (verified — `apps/exec-gateway/src/models/domain.py:78-101`)

Backend `Order` is **richer** than frontend OpenAPI's. Field-name alignment:

| Frontend OpenAPI `Order` | Backend `Order`                                                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                     | one of `order_id` / `client_order_id` / `broker_order_id` (TBD which is canonical for the BFF)                                                                                                                                                   |
| `symbol`                 | `asset`                                                                                                                                                                                                                                          |
| `qty`                    | `qty` ✓                                                                                                                                                                                                                                          |
| `side`                   | `side` ✓                                                                                                                                                                                                                                         |
| `type`                   | `order_type`                                                                                                                                                                                                                                     |
| `status`                 | `status` ✓ (richer 15-state enum)                                                                                                                                                                                                                |
| `limit_price`            | `limit_price` ✓                                                                                                                                                                                                                                  |
| `created_at`             | `submitted_at`                                                                                                                                                                                                                                   |
| —                        | `plan_id`, `account_id`, `intent_id`, `broker_order_id`, `stop_price`, `tif`, `venue`, `split_idx`, `raw_status`, `filled_qty`, `avg_fill_price`, `updated_at`, `meta`, `depends_on_client_order_id`, `last_error_reason` (all extra on backend) |

### Pub/Sub topic constants (verified — `apps/exec-gateway/src/config.py:21-24`)

```python
PUBSUB_TOPIC_ORDERS_CMD = "dev-orders.cmd"
PUBSUB_TOPIC_ORDERS_EVT = "dev-orders.evt"
PUBSUB_TOPIC_AUDIT_EVT = "dev-audit.evt"
PUBSUB_TOPIC_RISK_APPROVED = "dev-risk.approved"
```

(Other env prefixes via env vars at runtime.)

---

## 5. Orders and trade lifecycle (canonical)

Source: `docs/architecture/trade_lifecycle_contract.md` (GitLab).

### Correlation spine (verified)

The trade lifecycle preserves these identifiers across services:

- `action_id` (upstream action / procedure)
- `intent_id` (account/template intent)
- `plan_id` (execution plan)
- `order_id` (internal order)
- `client_order_id` (platform-generated broker idempotency)
- `broker_order_id` (broker/venue order, populated once known)
- `fill_id` (internal fill)
- `broker_execution_id` (broker execution)
- `attempt_id` (durable outbound broker call attempt)
- `reconciliation_run_id`
- `correlation_id` (cross-service trace ID)

**Frontend OpenAPI alignment:** the frontend's `Order`, `OrderLineage`, `BrokerOrderAttempt`, `Fill`, `ExecutionPlan`, `ExecutionSagaMilestone` schemas all use these exact field names. The `intent_id` field in the frontend maps directly. ✓

### Canonical Spanner tables (named in `docs/architecture/trade_lifecycle_contract.md`)

- `Orders` (current order state, fast read model)
- `OrderEvents` (append-only lifecycle ledger)
- `BrokerOrderAttempts` (every outbound broker call attempt)
- `BrokerInteractionsLog` (raw/redacted broker evidence)
- `Fills` (normalized execution records)
- `Positions` (current durable position)
- `PositionSnapshots` (before/after/broker-truth)
- `TradeInputSnapshots` (immutable validation inputs)
- `TradeReconciliationRuns`, `TradeReconciliationDiscrepancies`
- `TradingControlStates`, `TradingControlEvents`

### Frontend OpenAPI alignment with lifecycle (verified)

| Frontend schema          | Backend table                                                            | Status                                       |
| ------------------------ | ------------------------------------------------------------------------ | -------------------------------------------- |
| `Order`                  | `Orders`                                                                 | aligned (field names match where they exist) |
| `OrderEvent`             | `OrderEvents`                                                            | aligned (semantic)                           |
| `BrokerOrderAttempt`     | `BrokerOrderAttempts`                                                    | aligned (semantic)                           |
| `Fill`                   | `Fills`                                                                  | aligned (semantic)                           |
| `OrderLineage`           | (derived view across `Orders` + `OrderEvents` + `BrokerOrderAttempts`)   | aligned (semantic)                           |
| `ExecutionPlan`          | (no single backend table; constructed from `Orders` joined on `plan_id`) | aligned (semantic)                           |
| `ExecutionSagaMilestone` | `OrderEvents` rows of certain types                                      | likely aligned                               |

---

## 6. Audit and records

| Capability                                                         | Service                                                                                  | Status                                                  |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Execution-side audit ledger                                        | `OrderEvents`, `BrokerOrderAttempts`, `BrokerInteractionsLog`, `TradeReconciliationRuns` | **implemented** as Spanner tables.                      |
| `audit.evt` Pub/Sub topic + writer                                 | `apps/audit-writer/`                                                                     | **skeleton only** (0 Python files; README placeholder). |
| Investor-side records (`InvestorActionReceipt`, `RecordAccessLog`) | (n/a — BFF-owned)                                                                        | n/a                                                     |

**Critical gap:** investor-side record retention (`InvestorActionReceipt` per `memory/contract_receipt_vs_access_log.md`) has no GitLab-side service. It must remain BFF-owned indefinitely OR the BFF must consume `audit.evt` once it ships.

---

## 7. Admin workflows

| Capability                            | Service                                                                    | Status                                                                                                                              |
| ------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Admin portal frontend (Next.js)       | `apps/admin-portal/frontend` (201 TS files)                                | **implemented**. Top-level pages: `accounts`, `execution`, `governance`, `market`, `ops`, `pipeline`, `portfolio`, `risk`, `trace`. |
| Admin portal backend (Flask/FastAPI?) | `apps/admin-portal/backend` (~105 Python files)                            | **implemented**. Owns `template.admin` and `account.admin` event publishing.                                                        |
| `template.admin` topic                | `apps/admin-portal/backend/pubsub_mgr.py:109` (`publish_manual_rebalance`) | **implemented**.                                                                                                                    |
| `account.admin` topic                 | `apps/admin-portal/backend/pubsub_mgr.py:140` (`publish_account_admin`)    | **implemented**.                                                                                                                    |

**Critical SEC boundary fact:** every admin command flows through `admin-portal` only. None of them is reachable from the investor-facing surfaces this repo (`refi-us-sec-ia`) builds. The frontend's tripwire blocks `template.admin` and `target_account_id` and per-trade `accept_trade` / `investor-accept` etc. at source level. The boundary is intact by construction so long as the investor app never imports admin-portal routes.

---

## 8. Compliance and disclosures

| Capability                      | Service                    | Status                                 |
| ------------------------------- | -------------------------- | -------------------------------------- |
| Pre-trade compliance adapter    | `apps/compliance-adapter/` | **skeleton only** (0 files).           |
| SIWE auth                       | `apps/auth-siwe/`          | **skeleton only** (0 files).           |
| KYC (CCID provider integration) | `apps/identity-ccid/`      | **skeleton only** (0 files).           |
| Disclosure delivery             | (no dedicated service)     | **not in backend**; remains BFF-owned. |

**Critical gap:** SIWE, KYC, disclosure, and compliance-adapter are all skeletons on the GitLab side. They are entirely BFF-owned in the current frontend. This is correct posture for Phase 2.5 (BFF-owned identity is the right architecture for SEC 203A-2(e) recordkeeping) but means the BFF cannot offload these to Daniel's backend in Phase 3 without those services shipping.

---

## 9. Investor identity and account binding

| Capability                                  | Status                                                                                                                                                                                        |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `account_id` semantics on backend           | **implemented**: every Pub/Sub event (`account.intent.ready`, `risk.approved`, `orders.cmd`, `orders.evt`, `audit.evt`, `account.admin`) carries `account_id` + `partition_key = account_id`. |
| `account_id` ↔ investor SIWE wallet mapping | **not implemented on backend** (auth-siwe skeleton). Identity binding must remain BFF-owned today.                                                                                            |
| `account_id` opacity                        | backend uses opaque strings (`"acc_123"`, `"acc-1"` in fixtures). Frontend uses opaque ULIDs. Format compatible.                                                                              |

---

## 10. Missing or skeletal services (summary)

These remain blockers for production:

1. `audit-writer` — required for `audit.evt` consumption and 7-year regulatory record retention.
2. `compliance-adapter` — pre-trade compliance checks (KYC freshness, suitability, disclosure currency) before order submission.
3. `auth-siwe` — required if SIWE auth ever moves off the BFF onto the backend.
4. `identity-ccid` — required if KYC integration ever moves off the BFF onto the backend.
5. `anchor-job` — blockchain anchoring (Merkle proofs) for legal-hold evidence.
6. `merkle-builder`, `refin-indexer`, `routing-api`, `token-policy-api`, `pubsub-bus`, `explorer-api` — token/on-chain integration. Out of scope for the SEC 203A-2(e) Phase 2 product (Signal + Managed brokered equity execution); relevant later for token issuance / settlement.

---

## Scope lock — re-affirmed

No GitLab file modified. No frontend code changes. No SEC 203A-2(e) boundary weakened. Audit was strictly read-only.
