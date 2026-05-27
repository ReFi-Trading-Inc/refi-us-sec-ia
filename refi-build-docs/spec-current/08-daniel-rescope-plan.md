# 08 — Daniel Rescope Plan (P2.5R)

> **⚠️ 2026-05-20 — sprint sequencing is now in `12-daniel-2026-05-20-guidance.md §3`** (Sprints A–E). The ticket numbers (`P2.5R-NN`) and dependency graph in this doc remain authoritative; the sprint mapping reorganizes them per the product-owner discipline directive. The integration audit (`11-integration-audit-post-p2.5r-04.md`) found 11 wire-shape drifts that must be resolved in Sprint A/B before lineage UI (P2.5R-05).

**Author:** file-search/research pass against Daniel's actual backend code  
**Date:** 2026-05-19  
**Status:** Draft for `refi-build-docs/spec-current/08-daniel-rescope-plan.md`  
**Reading scope (honest):** Full file listings of `refinity-main-main/{apps,docs,contracts,openapi,packages,libs}`; full reads of all 10 `docs/IOs/*.md`, all 10 `docs/as-built/v2/*.md` (deeply sampled), `docs/architecture/trade_lifecycle_contract.md` (~120 lines), `docs/architecture/conventions.md` (titles only), `contracts/fixtures/*.json` (listing), our `packages/api-clients/openapi/refi-api.yaml` paths + `generated/api.ts` head; targeted reads of ChatGPT rescope doc head + tail (sections 11–18). I did **not** open every Python source file across 16 implemented services — I relied on the as-built v2 + IO docs which are authoritative per `trade_lifecycle_contract.md` lines 33–41 ("Any code change … must update this document in the same change"). Source files were inventoried by count and directory to verify which services are implemented vs skeleton.

---

## 1. Daniel's actual backend surface inventory

The single most important fact about Daniel's backend, derived from `find apps/*/src -name "*.py" | wc -l`:

| Service                  | Status                    | LOC signal (py files) | Implemented surface                                                                                                                                                                       |
| ------------------------ | ------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin-portal`           | **Implemented**           | 105                   | FastAPI `/api/v1/*` REST + SSE; Next.js operator UI mounted internally; PubSub pull subscriber                                                                                            |
| `portfolio-manager`      | **Implemented**           | 81                    | Cloud Run service + jobs; nightly/walk-forward batch; PubSub publisher (template targets upstream)                                                                                        |
| `inference-worker`       | **Implemented**           | 65                    | Flask `/tasks/*`; PubSub publisher of `signals`                                                                                                                                           |
| `asset-initializer`      | **Implemented**           | 55                    | HTTP `/api/v1/jobs/{command}` (OIDC-auth)                                                                                                                                                 |
| `account-intent-builder` | **Implemented**           | 38                    | FastAPI; `/pubsub/template.rebalance.intent`, `/pubsub/account.admin`, `/v1/healthz`, `/v1/account_intents/{intent_id}` (Not Implemented), `/v1/account_intents/replay` (Not Implemented) |
| `data-loader`            | **Implemented**           | 30                    | Batch + Cloud Tasks                                                                                                                                                                       |
| `common`                 | **Implemented**           | 30                    | Shared lifecycle helpers (`trade_lifecycle/states.py`, `canonical_order_status`)                                                                                                          |
| `risk-engine`            | **Implemented**           | 28                    | Flask `/pubsub/account-intent-ready` only                                                                                                                                                 |
| `trainer`                | **Implemented**           | 23                    | Batch/job                                                                                                                                                                                 |
| `exec-gateway`           | **Implemented**           | 22                    | FastAPI `/v1/pubsub/risk.approved`, `/v1/pubsub/orders.evt`, `/healthz`, `/readyz`, `/`                                                                                                   |
| `portfolio-engine`       | **Implemented**           | 20                    | FastAPI `/pubsub/signals`, `/pubsub/template.admin`, `/health_test`                                                                                                                       |
| `trade-manager`          | **Implemented**           | 16                    | Flask `/pubsub/orders-cmd`, `/broker/webhook`, `/tasks/poll`, `/`                                                                                                                         |
| `parity-runner`          | **Implemented**           | 14                    | (testing/parity)                                                                                                                                                                          |
| `portfolio-analyzer-web` | **Partial**               | 6                     | (analyzer view)                                                                                                                                                                           |
| `training-scheduler`     | **Implemented**           | 5                     | scheduler                                                                                                                                                                                 |
| `auth-siwe`              | **SKELETON (0 py)**       | 0                     | README only: "Skeleton… Add source, Dockerfile, and CI when you begin implementing."                                                                                                      |
| `identity-ccid`          | **SKELETON (0 py)**       | 0                     | README only (same)                                                                                                                                                                        |
| `compliance-adapter`     | **SKELETON (0 py)**       | 0                     | README only (same)                                                                                                                                                                        |
| `audit-writer`           | **SKELETON (0 py)**       | 0                     | README only (same)                                                                                                                                                                        |
| `explorer-api`           | **SKELETON (0 py)**       | 0                     | README only (same)                                                                                                                                                                        |
| `routing-api`            | **SKELETON (0 py)**       | 0                     | README only (same) — _this was supposed to be our BFF_                                                                                                                                    |
| `refin-indexer`          | **SKELETON (0 py)**       | 0                     | README only                                                                                                                                                                               |
| `anchor-job`             | **SKELETON (0 py)**       | 0                     | README only                                                                                                                                                                               |
| `merkle-builder`         | **SKELETON (0 py)**       | 0                     | README only                                                                                                                                                                               |
| `node`                   | **SKELETON (0 py)**       | 0                     | README only (chain node)                                                                                                                                                                  |
| `pubsub-bus`             | **SKELETON (0 py)**       | 0                     | README only                                                                                                                                                                               |
| `token-policy-api`       | **SKELETON (0 py)**       | 0                     | README only                                                                                                                                                                               |
| `apps/web`               | **SKELETON (4 .gitkeep)** | 0                     | `app/{landing,auth,admin,explorer}/.gitkeep` only                                                                                                                                         |

**This is the load-bearing fact for the entire rescope:** _every service the investor-facing frontend was supposed to talk to does not exist yet._ SIWE auth, CCID KYC, compliance verdict envelope, audit writer, explorer-api, routing-api/BFF, on-chain anchor — all skeletons. What IS implemented is the **internal trade lifecycle pipeline**, which is entirely Pub/Sub-driven and has no investor-facing HTTP surface.

**Per-service inputs/outputs (cited):**

- **portfolio-manager** — Batch Cloud Run job. Publishes upstream template targets. Source: `apps/portfolio-manager/src/{app.py,run_job.py,core/,jobs/}`; README at `apps/portfolio-manager/README.md`. As-built doc missing from v2 (only v1 has `portfolio-analyzer-web`). 81 Python files — most complex service. Owns return-stream refresh, D-CQL active stream selection, walk-forward backtests, daily profile portfolios, template target publication (per ChatGPT 122–135, validated against test list: `test_walkforward_runner.py`, `test_d_cql.py`, `test_reference_artifact_build.py`, `test_portfolio_constructor.py`, `test_nightly_orchestrator.py`).

- **inference-worker** — Flask app at `apps/inference-worker/src/flask_app.py`. Components `component_b/` (indicators, BOCPD, lacunarity) and `component_e/` (mint-once RF threshold artifacts). Publishes `signals` via `src/bus.py`. As-built: `docs/as-built/v2/inference-worker_AS_BUILT.md` (360 lines).

- **portfolio-engine** — FastAPI at `apps/portfolio-engine/src/app.py`. Inputs: `POST /pubsub/signals`, `POST /pubsub/template.admin`. Outputs: `TemplateTargets` (Spanner) + `dev-template.rebalance.intent` (Pub/Sub). Cited `docs/IOs/portfolio-engine_IO_details.md:126-161` and `docs/as-built/v2/portfolio-engine_AS_BUILT.md:60-83`.

- **account-intent-builder** — FastAPI at `apps/account-intent-builder/src/{app.py,main.py}`. Inputs: `POST /pubsub/template.rebalance.intent`, `POST /pubsub/account.admin`. Outputs: `AccountIntents` (Spanner) + `dev-account.intent.ready` (Pub/Sub). Cited `docs/IOs/account_intent_builder_IO_details.md:96-176`. **Important:** `GET /v1/account_intents/{intent_id}` and `POST /v1/account_intents/replay` are declared but explicitly "Not Implemented" (line 187-189).

- **risk-engine** — Flask. Inputs: `POST /pubsub/account-intent-ready` only. Outputs: `RiskSnapshots` (Spanner) + `dev-risk.approved` / `dev-risk.rejected` + `dev-audit.evt`. Cited `docs/IOs/risk-engine_IO_details.md:8-13, 124-194` and `docs/as-built/v2/risk-engine_AS_BUILT.md:26-34`. There is **no `compliance-adapter` verdict envelope service** — the only "compliance" verdict shipped is the `RiskDecision` JSON inside `RiskSnapshots`.

- **exec-gateway** — FastAPI. Inputs: `POST /v1/pubsub/risk.approved`, `POST /v1/pubsub/orders.evt`. Outputs: `ExecutionPlans`, `Orders`, `OrderIdMap`, `ExecutionSagas` (Spanner) + `dev-orders.cmd` + `dev-audit.evt`. Cited `docs/IOs/exec-gateway_IO_details.md:21-176`. NO investor HTTP routes — only `/healthz`, `/readyz`, `/`.

- **trade-manager** — Flask. Inputs: `POST /pubsub/orders-cmd`, `POST /broker/webhook` (SnapTrade signature-verified), `POST /tasks/poll`. Outputs: `Orders`, `OrderIdMap`, `ExecutionSagas`, `Fills`, `BrokerInteractions` (Spanner) + `dev-orders.evt` + `dev-audit.evt`. External: SnapTrade API. Cited `docs/IOs/trade-manager_IO_details.md:53-101`.

- **admin-portal** — FastAPI + Next.js. Only service with a real HTTP REST API. Routes prefixed `/api/v1/*`: `/accounts/populate`, `/risk/simulate`, `/operations/rollback`, `/assets/initialize`, `/assets/status`, `/pricing-rules/relax-all`, `/internal/launch-init`, `/internal/launch-ss`, plus SSE event stream. **This is internal operator surface, not investor surface.** Cited `docs/as-built/v2/admin-portal_AS_BUILT.md:32-77, 268-374`.

- **auth-siwe / identity-ccid / compliance-adapter / audit-writer / explorer-api / routing-api / refin-indexer / anchor-job / merkle-builder / node / pubsub-bus / token-policy-api** — All skeletons. README boilerplate identical: _"Skeleton for the X service. Add source, Dockerfile, and CI when you begin implementing."_ Verified for all 6 priority skeletons.

**Pub/Sub topics (canonical):** `dev-template.rebalance.intent`, `dev-account.intent.ready`, `dev-risk.approved`, `dev-risk.rejected`, `dev-orders.cmd`, `dev-orders.evt`, `dev-audit.evt`, `dev-template.admin`, `dev-account.admin`, `training.requested`. Confirmed via env var defaults in IO docs and `contracts/fixtures/{account.intent.ready,risk.approved,orders.cmd,orders.evt,audit.evt,template.rebalance.intent,signals,models.evt,training.cmd,training.requested}.json`.

**Spanner tables (canonical):** Per `trade_lifecycle_contract.md:91-108`: `AccountPrefs, AccountIntents, AccountIntentHistory, RiskSnapshots, ExecutionPlans, Orders, OrderIdMap, OrderEvents, BrokerOrderAttempts, BrokerInteractionsLog, Fills, Positions, PositionSnapshots, TradeInputSnapshots, TradeReconciliationRuns, TradeReconciliationDiscrepancies, TradingControlStates, TradingControlEvents, ExecutionSagas`. Plus pipeline-side: `templates, template_rules, template_membership, TemplateTargets, signals, signals_last, portfolio_actions_history, AccountSnapshots, AccountSettings, AccountConsents, UserConsents, AssetMetadata, RoundingRules, BrokerApiConfigs, PricingRules, RiskLimits, raw_price_data, model_registry, inference_state, ActiveAssets, selected_strategies, available_strategies, strategy_returns_hr, training_runs, training_plans, run_locks, SystemConfig, data_loader_runs`. Full DDL: `docs/architecture/spanner_ddl_all.txt`.

---

## 2. The canonical decision chain — backed by code citations

ChatGPT's chain hypothesis (line 17–30 of rescope doc):

```
portfolio-manager → portfolio-engine → TemplateTargets → account-intent-builder
→ AccountIntents → risk-engine → RiskSnapshots → exec-gateway → ExecutionPlans
→ trade-manager → Orders/Fills → AuditEvents
```

**Verdict: CONFIRMED, with two refinements.**

Trace, with citations:

1. **portfolio-manager** runs nightly batch / walk-forward, refreshes `strategy_returns_hr`, selects D-CQL active streams, produces template membership. Triggers downstream via admin command. (No as-built v2 doc; inferred from `apps/portfolio-manager/src/jobs/` directory + ChatGPT rescope 124–135.)

2. **inference-worker** publishes per-asset `signals` to Pub/Sub (`apps/inference-worker/src/bus.py`; outputs to portfolio-engine per `docs/IOs/portfolio-engine_IO_details.md:10-37`).

3. **portfolio-engine** receives `/pubsub/signals` and `/pubsub/template.admin`. Solves target vector (Equal Weight rebalance or Direction Flip signal flip per `docs/as-built/v2/portfolio-engine_AS_BUILT.md:23-25`). Writes `TemplateTargets` + `portfolio_actions_history`. Publishes `dev-template.rebalance.intent`. Payload at `docs/IOs/portfolio-engine_IO_details.md:128-149`.

4. **account-intent-builder** receives `/pubsub/template.rebalance.intent`. Fans out per-account, fetches live broker truth via DriverFactory (per `docs/as-built/v2/account-intent-builder_AS_BUILT.md:23-25`), writes `AccountIntents` + `AccountIntentHistory` + refreshes `AccountSnapshots`. Publishes `dev-account.intent.ready`. Payload at `docs/IOs/account_intent_builder_IO_details.md:114-154` (full `AccountIntent` schema with legs).

5. **risk-engine** receives `/pubsub/account-intent-ready`. Evaluates against `RiskLimits`, `PricingRules`, `AssetMetadata`. Simulates post-trade state, computes VaR, exposure, single-name caps. Writes `RiskSnapshots` (with `snapshot_hash`). Publishes `dev-risk.approved` OR `dev-risk.rejected` + `dev-audit.evt`. Payload at `docs/IOs/risk-engine_IO_details.md:174-193`.

6. **exec-gateway** receives `/v1/pubsub/risk.approved` (note: `approved` only — rejection terminates here). Acquires `exec:lock:{account_id}`, generates plan + orders, detects asset conflicts (sets `WAITING_ON_CANCELS` / `BLOCKED_BY_CONFLICT` per `docs/as-built/v2/exec_gateway_AS_BUILT.md:17`), persists `ExecutionPlans` + `Orders` + `OrderIdMap` + `ExecutionSagas`. Publishes `dev-orders.cmd` and `dev-audit.evt`. Schema at `docs/IOs/exec-gateway_IO_details.md:91-145`.

7. **trade-manager** receives `/pubsub/orders-cmd`. Calls broker (SnapTrade via DriverFactory) using `execute_order_safe`/`cancel_order`. Persists `Orders` (upsert), `OrderIdMap`, `BrokerInteractions`, `Fills`. Receives broker truth via `/broker/webhook` (HMAC-verified) and `/tasks/poll`. Publishes `dev-orders.evt` (which loops back into exec-gateway for reconciliation per `docs/IOs/exec-gateway_IO_details.md:45-64`) + `dev-audit.evt`. Schema at `docs/IOs/trade-manager_IO_details.md:57-68`.

8. **AuditEvents** — Here ChatGPT's chain is **partially incorrect**. There is NO `audit-writer` service implemented (skeleton only). Every service publishes to `dev-audit.evt` directly. There is no consumer of that topic in implemented services — only `admin-portal`'s in-memory SSE subscriber (`dev-audit.evt-admin-sub` per `docs/as-built/v2/admin-portal_AS_BUILT.md:46-52`). So **AuditEvents today = Pub/Sub topic with no durable persistence besides operator's in-memory queue**. The lifecycle contract calls for `OrderEvents`, `BrokerOrderAttempts`, `BrokerInteractionsLog`, `ExecutionSagas` to serve as the actual immutable ledger (`trade_lifecycle_contract.md:63-75`).

**Refinements to ChatGPT's chain:**

- (a) Insert **inference-worker → signals → portfolio-engine** at the head; portfolio-manager is upstream research, not the per-cycle decision driver. ChatGPT acknowledges this in section 3.1 (lines 99–118) but the chain header on line 17 omits it.
- (b) The "AuditEvents" step is **aspirational** today — the chain's durable evidence trail actually lives in `OrderEvents + BrokerOrderAttempts + BrokerInteractionsLog + ExecutionSagas + AccountIntentHistory + portfolio_actions_history + RiskSnapshots`. There is no `audit-writer` consumer.

**Correlation spine** (per `trade_lifecycle_contract.md:43-61`): `action_id, intent_id, plan_id, order_id, client_order_id, broker_order_id, fill_id, broker_execution_id, attempt_id, reconciliation_run_id, correlation_id`. **This is what the frontend lineage MUST surface.**

---

## 3. Endpoint-by-endpoint mapping — Daniel's truth vs our frontend

Our 21 paths (from `packages/api-clients/openapi/refi-api.yaml`) vs Daniel's implemented surface:

| Frontend path                                               | Daniel canonical                                                                                                                                                                                                                     | Verdict                                                                                                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /auth/session`                                         | None — `auth-siwe` skeleton                                                                                                                                                                                                          | **NO DANIEL EQUIVALENT — UI-invented; BFF must originate**                                                                                               |
| `POST /siwe/nonce`                                          | None — `auth-siwe` skeleton                                                                                                                                                                                                          | **NO DANIEL EQUIVALENT**                                                                                                                                 |
| `POST /siwe/verify`                                         | None — `auth-siwe` skeleton                                                                                                                                                                                                          | **NO DANIEL EQUIVALENT**                                                                                                                                 |
| `POST /auth/refresh`                                        | None — `auth-siwe` skeleton                                                                                                                                                                                                          | **NO DANIEL EQUIVALENT**                                                                                                                                 |
| `POST /auth/revoke-all` (legacy `/auth/logout` in P2.5 fix) | None — `auth-siwe` skeleton                                                                                                                                                                                                          | **NO DANIEL EQUIVALENT**                                                                                                                                 |
| `GET /ccid/status`                                          | None — `identity-ccid` skeleton                                                                                                                                                                                                      | **NO DANIEL EQUIVALENT**                                                                                                                                 |
| `POST /ccid/start`                                          | None — `identity-ccid` skeleton                                                                                                                                                                                                      | **NO DANIEL EQUIVALENT**                                                                                                                                 |
| `GET /v1/brokers/supported`                                 | None — list lives in `BrokerApiConfigs` Spanner; admin-portal reads                                                                                                                                                                  | **NO DANIEL EQUIVALENT (investor-facing); BFF projects from BrokerApiConfigs**                                                                           |
| `GET /v1/brokers/connection`                                | None — `AccountSettings.snaptrade_user_id/secret` per `docs/IOs/trade-manager_IO_details.md:37`; populated by `admin-portal POST /api/v1/accounts/populate`                                                                          | **DANIEL HAS DIFFERENT NAME (Spanner row, admin write)**                                                                                                 |
| `POST /v1/brokers/connect/start`                            | None — SnapTrade `register_snap_trade_user` happens server-side inside admin-portal populate flow                                                                                                                                    | **NO DANIEL EQUIVALENT (investor-facing)**                                                                                                               |
| `POST /v1/brokers/disconnect`                               | None                                                                                                                                                                                                                                 | **NO DANIEL EQUIVALENT**                                                                                                                                 |
| `GET /v1/brokers/account`                                   | None (broker truth fetched on demand inside risk-engine/builder via DriverFactory)                                                                                                                                                   | **NO DANIEL EQUIVALENT**                                                                                                                                 |
| `GET /v1/brokers/positions`                                 | None (cache: Redis `positions:{account_id}` TTL 180s per `docs/IOs/trade-manager_IO_details.md:79`; canonical: `Positions` + `PositionSnapshots` tables)                                                                             | **DANIEL ROUTES VIA SPANNER NOT REST**                                                                                                                   |
| `GET /v1/brokers/orders`                                    | None — Spanner `Orders` table; admin-portal `/orders` UI is operator-only                                                                                                                                                            | **NO INVESTOR REST; BFF must project Orders**                                                                                                            |
| `POST /orders/preview`                                      | None — preview is implicit inside `risk-engine` simulate (Spanner `RiskSnapshots` write); admin-portal has `/api/v1/risk/simulate` for operators (per `docs/as-built/v2/admin-portal_AS_BUILT.md:292`)                               | **DANIEL HAS DIFFERENT SHAPE (RiskDecision, not OrderPreview)**                                                                                          |
| `POST /orders`                                              | None — investor cannot place raw orders. Order origination flows from `template.admin` admin command → AccountIntent → RiskApproved → ExecutionPlan                                                                                  | **REJECT AS INVESTOR-FACING — UI must request advisory action, not place orders**                                                                        |
| `GET /orders`                                               | None — Spanner `Orders`                                                                                                                                                                                                              | **NO INVESTOR REST**                                                                                                                                     |
| `DELETE /orders/{id}`                                       | `admin-portal POST /api/v1/orders/cancel` publishes `dev-orders.cmd action=cancel` to trade-manager (per `docs/as-built/v2/admin-portal_AS_BUILT.md:325-327`)                                                                        | **DANIEL HAS DIFFERENT SHAPE (Pub/Sub command, not REST DELETE)**                                                                                        |
| `GET /v1/recommendations`                                   | None — closest is `AccountIntents` + `RiskSnapshots` + `ExecutionPlans` joined by `intent_id`                                                                                                                                        | **DRIFT — recommendation is not a Daniel concept; it's a UI projection over the decision chain**                                                         |
| `GET /v1/recommendations/{id}`                              | None                                                                                                                                                                                                                                 | **DRIFT — must be projection over (TemplateTarget, AccountIntent, RiskSnapshot, ExecutionPlan, Orders, Fills) keyed by `correlation_id` or `intent_id`** |
| `GET /v1/activity`                                          | None — closest is `OrderEvents` + `AuditEvents` topic + `ExecutionSagas` + `portfolio_actions_history`                                                                                                                               | **DRIFT — BFF projection over multiple tables**                                                                                                          |
| `POST /v1/us/eligibility`                                   | None — eligibility evaluation lives in `account-intent-builder` gating logic (per `docs/as-built/v2/account-intent-builder_AS_BUILT.md:25-27`: "Gating: Checks for missing consents and blockages") — but no investor query endpoint | **NO DANIEL EQUIVALENT — UI-invented or BFF-computed from AccountConsents + UserConsents + AccountPrefs**                                                |

**Summary:** 21 of 21 frontend endpoints have **no equivalent investor-facing endpoint** in Daniel's backend. Every single one will be served by a BFF that we build, that translates to one of:

- Spanner SELECT (read projections),
- Pub/Sub publish (write actions),
- admin-portal API call (operator path, not investor),
- SIWE/CCID/Compliance service we must build ourselves or stub.

---

## 4. Schema deltas — Daniel's actual shapes vs ours

### 4.1 Auth (SIWE)

- **Daniel:** Nothing. `auth-siwe` is a skeleton.
- **Ours (`generated/api.ts:15-47`):** `AuthSession`, `SiweNonceResponse`, `SiweVerifyRequest`, `SiweErrorCode`.
- **Delta:** 100% UI-invented. **Keep as-is** and ratify when Daniel implements; expect Daniel to add binding fields like `chain_id`, `domain`, `uri`, `nonce_ttl`.

### 4.2 KYC (CCID)

- **Daniel:** Nothing. `identity-ccid` is a skeleton.
- **Ours:** `KycStatusValue = not_started | pending | incomplete | under_review | approved | denied`.
- **Delta:** 100% UI-invented. Expect Daniel to integrate a real KYC provider (Persona/Sumsub) and to add `provider_reference`, `webhook_url`, `documents_required[]`.

### 4.3 Recommendation

- **Daniel canonical shape — the closest analog is `AccountIntent`** (`docs/IOs/account_intent_builder_IO_details.md:114-154`):

```json
{
  "intent_id", "action_id", "intent_kind": "rebalance|signal_flip",
  "template_id", "template_version", "account_id", "ts", "base_currency",
  "equity_estimate": {...},
  "notional_summary": {"gross_delta_notional", "net_delta_notional", "legs_dropped", "drop_reasons"},
  "status": "ready|blocked|error", "blocked_reason", "legs_hash", "correlation_id",
  "legs": [{
    "asset_id", "symbol", "target_weight", "direction", "target_notional",
    "current_notional_est", "delta_notional", "delta_qty_est",
    "side": "buy|sell|sell_short|buy_to_cover",
    "price_est", "rounding": {...}, "constraints_hint": {...},
    "reason_codes": [...]
  }]
}
```

- **Ours (`api.ts` + fixtures):** `Recommendation { id, symbol, action: BUY|SELL|HOLD, confidence, rationale }` plus richer `RecommendationDetail` in persona fixtures.
- **Delta:** Our model is per-symbol. Daniel's is per-account multi-leg with a portfolio target rationale. We must reframe:
  - Add `intent_id`, `action_id`, `correlation_id`, `template_id`, `template_version`, `legs_hash`.
  - Replace single `symbol+action` with `legs[]`.
  - Replace `confidence` (model-level) with `template_target.target_weight` + `RiskSnapshot.decision`.
  - `status`: align to `ready | blocked | error`.
  - Add `notional_summary`, `equity_estimate`.
  - Side enum: add `sell_short | buy_to_cover`.

### 4.4 Order

- **Daniel canonical:** `docs/IOs/exec-gateway_IO_details.md:74` columns:  
  `order_id, plan_id, client_order_id, account_id, intent_id, asset, side, qty, order_type, limit_price, stop_price, tif, venue, split_idx, status, filled_qty, avg_fill_price, updated_at, meta`.
  Status vocabulary per `trade_lifecycle_contract.md:114-120`: `planned, pending_submit, blocked_by_conflict, blocked_dependency, submit_started, submitted, acknowledged, working, partially_filled, filled, canceled, rejected, expired, replaced, failed_retry, unknown` (broader than what we modeled).
- **Ours:** Simpler — Order has `id, symbol, side, qty, status, client_order_id`. Status enum `submitted|mined|reverted|acked|partial|filled|cancelled|rejected`.
- **Delta:**
  - **`mined`, `reverted`, `acked` do NOT exist in Daniel.** Those are L1-chain semantics. Daniel uses Web2 Spanner-only — no on-chain orders today (refin-indexer, anchor-job, merkle-builder all skeleton).
  - Add: `plan_id`, `intent_id`, `split_idx`, `venue`, `filled_qty`, `avg_fill_price`, `meta` (lineage carrier per `trade_lifecycle_contract.md:82`).
  - Status canonical set is the lifecycle contract's; map `partial → partially_filled`, `cancelled → canceled` (American spelling), add `planned, pending_submit, blocked_by_conflict, blocked_dependency, submit_started, acknowledged, working, expired, replaced, failed_retry, unknown`.
  - Note: our prior P2.5 fix used British `cancelled` — **revert to American `canceled`** per `apps/common/trade_lifecycle/states.py` (`canonical_order_status` helper).

### 4.5 Compliance verdict

- **Daniel:** No `compliance-adapter`. The verdict envelope **is the `RiskDecision`** (`docs/IOs/risk-engine_IO_details.md:174-193`):

```json
{
  "decision": "approved|rejected", "intent_id", "account_id", "correlation_id", "ts",
  "snapshot_hash", "constraints": [...], "reasons": [...],
  "metrics": {"equity", "positions_age_ms", "prices_age_ms_max"},
  "retry_hint": {...}
}
```

Persisted as `RiskSnapshots.snapshot` JSON + `snapshot_hash`.

- **Ours (`fixtures/compliance/verdicts.ts`):** 10 named verdicts including ALLOW / REVIEW / DENY / UNAVAILABLE / RATE_LIMITED / etc. with `policy_version`, `evaluated_at`, `expiry_at`.
- **Delta:**
  - Daniel has TWO decisions only: `approved | rejected`. There is no `review` state in risk-engine; "review" maps to lifecycle `blocked_by_conflict` / `blocked_dependency` (exec-gateway) or `AccountIntent.status="blocked"` (account-intent-builder).
  - Daniel has `snapshot_hash` (cryptographic-style proof) — we don't. **Adopt it.**
  - Daniel has `metrics.positions_age_ms`, `prices_age_ms_max` — we don't surface freshness. **Adopt.**
  - We have `policy_version` (good) — Daniel calls it `template_version` + `model_version` per `portfolio_actions_history` / `RiskLimits` row.
  - We have UNAVAILABLE/RATE_LIMITED — Daniel handles those via Pub/Sub Nack + retry (no synchronous verdict). Map to our fail-closed UI by surfacing "decision pending" via correlation_id polling.

### 4.6 Activity

- **Daniel:** No single source. Composite of `OrderEvents` (append-only), `dev-audit.evt` topic, `ExecutionSagas` milestones, `portfolio_actions_history`, `AccountIntentHistory`.
- **Ours:** Generic activity feed.
- **Delta:** Replace with typed event stream where each row carries `correlation_id` + `event_type ∈ {portfolio_action, intent_built, risk_decided, plan_created, order_submitted, order_filled, order_cancelled, broker_interaction, control_state_changed, ...}`.

### 4.7 Position

- **Daniel canonical:** `Positions` table + `PositionSnapshots` (proof) + cache `Redis positions:{account_id}` TTL 180s. Shape per `docs/IOs/risk-engine_IO_details.md:86-103`:

```json
{
  "account_id", "as_of_ts", "last_orders_evt_ts", "base_currency",
  "cash": "string (decimal)", "equity", "buying_power",
  "positions": [{"asset_id", "qty", "avg_price", "notional"}]
}
```

- **Ours (`api.ts:83`):** `Position { symbol, qty, market_value, unrealized_pl, unrealized_plpc, current_price, avg_entry_price, side }`.
- **Delta:** Daniel uses string decimals (not float) for `cash/equity/qty/notional`. Daniel uses `asset_id` not `symbol`. Daniel has no unrealized P&L (BFF computes from `Fills.avg_price + current price`). Add `as_of_ts` for freshness. **String decimals throughout** to match.

### 4.8 Broker

- **Daniel:** `BrokerApiConfigs` (HTTP template registry, admin-portal-managed) + `AccountSettings.snaptrade_user_id/snaptrade_user_secret`. Only broker today: **SnapTrade**.
- **Ours:** Broker registry with multiple providers, connection-state UI.
- **Delta:** Today there is exactly one broker provider (SnapTrade). Our supported-brokers list is aspirational — pare back to SnapTrade for cutover, expose `BrokerApiConfigs` rows as supported list via BFF.

### 4.9 Profile

- **Daniel:** `AccountPrefs` (drift_thresholds, min_order_sizes, excluded_assets, fractional setting), `AccountConsents`, `UserConsents`, `AccountSettings`. All admin-portal-written via `/api/v1/accounts/populate` per `docs/as-built/v2/admin-portal_AS_BUILT.md:122`.
- **Ours:** Profile object capturing risk tolerance, goals, etc.
- **Delta:** Daniel has no risk-tolerance questionnaire schema in code; ours is fine but must be persisted to `AccountPrefs.preferences` JSON. Versioning concept needed (we have `profile_version`, Daniel does not — propose adding to `AccountPrefs`).

### 4.10 Strategy / Template

- **Daniel canonical:** `templates`, `template_rules`, `template_membership`, `TemplateTargets`. `templates` columns per `docs/IOs/portfolio-engine_IO_details.md:64-71`: `template_id, status, weighting_policy, gross_target, net_target, leverage`. Rules per :74-81: `min_change_threshold, turnover_throttle, cooldown_window_hours, max_single_asset_weight`.
- **Ours:** Strategy fixtures.
- **Delta:** Strategy = subscribed template membership. Our "strategy" object should project from `templates` + `selected_strategies` + `available_strategies` + latest `TemplateTargets`.

### 4.11 Activation

- **Daniel canonical:** `ActiveAssets.enabled` (per-asset toggle, admin-set) + `AccountTemplates.active` (per-account-template membership) + `TradingControlStates` (halt/reduce-only/etc per `trade_lifecycle_contract.md:107`).
- **Ours:** Local boolean AND of gates.
- **Delta:** ChatGPT rescope MIG-P2.5-29 (rescope doc 1968–1996) is correct: activation is NOT a frontend boolean. It must read `TradingControlStates` and the union of `AccountConsents + UserConsents + AccountPrefs + AccountSettings.snaptrade_user_id != null + AccountTemplates.active + ActiveAssets`.

### 4.12 Support / Boundary

- **Daniel:** None implemented. No support service in repo.
- **Ours:** `apps/web/app/us/_lib/support-boundary/*` client-side classifier — 100% UI-owned.
- **Delta:** Keep entirely. Daniel has no plan for this; SEC Rule 203A-2(e)(3) classifier is our domain.

---

## 5. New concepts Daniel ships that the frontend has no UI for today

Beyond `Recommendation` and `Order`, the lineage objects we currently hide and must surface:

1. **TemplateTarget** — `target_vector[]`, `template_version`, `action_ts`, `inputs_fingerprint`, `intent_kind`. The "model said so" rationale. (Per `docs/IOs/portfolio-engine_IO_details.md:177-190`.)
2. **AccountIntent (multi-leg)** — per-account fan-out with `legs_hash`, `notional_summary`, `drop_reasons`. (Per `docs/IOs/account_intent_builder_IO_details.md:114`.)
3. **RiskSnapshot** — `snapshot_hash`, `constraints[]`, `reasons[]`, `metrics{positions_age_ms, prices_age_ms_max}`. The "compliance verdict" today. (Per `docs/IOs/risk-engine_IO_details.md:131-144`.)
4. **ExecutionPlan** — `plan_id`, `driver`, status with conflict states. (Per `docs/IOs/exec-gateway_IO_details.md:72`.)
5. **ExecutionSaga** — `saga_id, milestone` ledger for plan lifecycle. (Per `trade_lifecycle_contract.md:108`.)
6. **OrderEvents** — append-only order ledger separate from `Orders` current-state projection.
7. **BrokerOrderAttempts** — every outbound broker submit/cancel/amend/replace + lookups.
8. **BrokerInteractionsLog** — redacted raw payloads for forensic export.
9. **TradeInputSnapshots** — pre-trade input proof.
10. **TradeReconciliationRuns / Discrepancies** — broker-truth diff records.
11. **TradingControlStates / TradingControlEvents** — halt, reduce-only, broker-degraded, asset-halt.
12. **PortfolioActionsHistory** — every portfolio-engine decision (action_id, intent_payload, publish_status).
13. **PositionSnapshots** — before/after/broker-truth position proof.
14. **AccountIntentHistory** — append-only per-intent history.
15. **Stream lineage** — `stream_id` like `AAPL~rf` (per `trade_lifecycle_contract.md:76-86`) carried in `AccountIntents.legs`, `RiskSnapshots.snapshot`, `Orders.meta`. Display only — NEVER use as trading symbol.
16. **`snapshot_hash` / `inputs_fingerprint` / `legs_hash` / `stream_fingerprint`** — cryptographic proof fields.
17. **`signals_last`** — global signal high-water mark (gating).
18. **`model_registry`** — model lineage per asset (`current_version`, `data_end`).
19. **`inference_state`** — per-asset `last_predicted_ts`, paused/active.

These 19 are the substrate for the lineage panel, evidence strip, records center, exception review queue, and the "see the exact RiskSnapshot that triggered this" product moves.

---

## 6. SEC Rule 203A-2(e) compliance posture

Cross-checking Daniel's implementation against Internet Adviser Exemption requirements:

| 203A-2(e) Element                   | Daniel state                                                                                                                                                                                                                                                                                                                     | Frontend implication                                                                                                                                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Internet-only delivery**          | Daniel's pipeline is fully automated end-to-end (signals → portfolio-engine → intent → risk → exec → broker). No human-in-loop in implemented services. `admin-portal` has operator levers (`pricing-rules/relax-all`, `operations/rollback`, manual `template.admin rebalance`) but these are config/ops not per-client advice. | UI must NEVER expose operator-driven recommendation paths. The "Trigger Manual Rebalance" capability (admin-portal `/portfolio` page) must not be exposed to clients. Wave-1/2/3 already correct on this. |
| **Platform-only advice**            | All client-specific advice originates from `portfolio-manager → portfolio-engine`. Admin can `target_account_id` an init-rebalance via `template.admin` (per `docs/as-built/v2/portfolio-engine_AS_BUILT.md:55-56`), but this is account onboarding, not per-client advice.                                                      | Evidence Strip (MIG-P2.5-24, rescope 1812–1836) must show `generated_by: software`, `template_version`, `model_version`. Implement.                                                                       |
| **Records preservation**            | Records canonical store: Spanner. Hashed proofs: `snapshot_hash`, `inputs_fingerprint`, `legs_hash`, `stream_fingerprint`. On-chain anchor: `anchor-job` + `merkle-builder` are SKELETON — no chain commitments today.                                                                                                           | Records Center (MIG-P2.5-26) must read Spanner via BFF, NOT on-chain. Defer on-chain proof UX until anchor-job ships.                                                                                     |
| **Disclosure delivery**             | Daniel has no Document Registry service in implemented code.                                                                                                                                                                                                                                                                     | Keep our `apps/web/app/us/_lib/document-acks.ts` client-side tracker. Must push acks to BFF → eventually a Daniel doc service. Versioning model is ours to set.                                           |
| **Advisory personnel boundary**     | Daniel has no support service. `admin-portal` is operator UI, not client-facing.                                                                                                                                                                                                                                                 | Keep entirely our `support-boundary/{categories,blocked-patterns,classifier}` 203A-2(e)(3) classifier. This is the most valuable frontend-owned compliance asset.                                         |
| **Multi-client ongoing service**    | Provable via `Accounts WHERE status='active' AND autopilot_enabled=true` count.                                                                                                                                                                                                                                                  | Evidence Console (MIG-P2.5-27) must query this.                                                                                                                                                           |
| **Operational interactive website** | Daniel has no uptime/outage tracking.                                                                                                                                                                                                                                                                                            | Frontend health page + outage log + status badge. Owned by us.                                                                                                                                            |

**Critical SEC posture point:** Daniel's `admin-portal` has `/api/v1/risk/simulate` (per `docs/as-built/v2/admin-portal_AS_BUILT.md:292`) — an operator who can construct a mock `AccountIntent`. This is fine for ops. But it MUST NOT become a frontend path; we are not advising via operator simulation.

---

## 7. BFF question

**The biggest architectural finding of this report.**

`routing-api` is a SKELETON (0 .py files; `apps/routing-api/src/.gitkeep` only). It was supposed to be the BFF. It does not exist.

**Daniel does NOT ship an investor-facing BFF.** Every implemented service is either:

- An internal Pub/Sub consumer/producer (no investor HTTP), OR
- The `admin-portal` operator surface (`/api/v1/*`), OR
- A batch job.

**Recommendation:** The frontend team owns the BFF. Place it at `apps/web/app/api/*` (Next.js Route Handlers) inside `refi-us-sec-ia`. This is consistent with our existing Next.js app structure and gives us:

- Zero coordination cost (one repo, one deploy).
- Direct Spanner read access via a Google Auth Cloud Run sidecar OR a thin Cloud Run "refi-bff" service we write in TypeScript/Python.
- Pub/Sub publish for write actions (place advisory action) using the same project topics.
- Mock-first development (our MSW handlers stand in until live).

**Proposed BFF routes** (initial cut, all `/api/v1/...`):

| Route                                            | Reads                                                                                                                             | Writes                                                                                           |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET /api/v1/session`                            | (own auth state)                                                                                                                  | —                                                                                                |
| `GET /api/v1/profile`                            | `AccountPrefs`, `UserConsents`, `AccountConsents`, `AccountSettings`                                                              | —                                                                                                |
| `PATCH /api/v1/profile`                          | —                                                                                                                                 | `AccountPrefs` (via Pub/Sub `account.admin` action `update_prefs`)                               |
| `GET /api/v1/dashboard`                          | composite: see §9 ticket P2.5R-08                                                                                                 | —                                                                                                |
| `GET /api/v1/recommendations`                    | `AccountIntents JOIN RiskSnapshots JOIN ExecutionPlans` keyed by `account_id` ORDER BY ts DESC                                    | —                                                                                                |
| `GET /api/v1/recommendations/:intent_id`         | all 4 lineage tables + `portfolio_actions_history`, `TemplateTargets`, `Orders`, `Fills` joined by `correlation_id` / `intent_id` | —                                                                                                |
| `POST /api/v1/recommendations/:intent_id/accept` | —                                                                                                                                 | Pub/Sub `account.admin action=force_rebuild target_account_id=X` (or new topic, TBD with Daniel) |
| `GET /api/v1/orders`                             | `Orders WHERE account_id=X`                                                                                                       | —                                                                                                |
| `GET /api/v1/orders/:client_order_id/lineage`    | `Orders + OrderEvents + OrderIdMap + Fills + BrokerOrderAttempts + ExecutionSagas`                                                | —                                                                                                |
| `POST /api/v1/orders/:client_order_id/cancel`    | —                                                                                                                                 | Pub/Sub `dev-orders.cmd action=cancel` (mirrors admin-portal pattern)                            |
| `GET /api/v1/positions`                          | `Positions` + cache `Redis positions:{account_id}`                                                                                | —                                                                                                |
| `GET /api/v1/activity`                           | `OrderEvents` + `dev-audit.evt`-sourced rows + `portfolio_actions_history`                                                        | —                                                                                                |
| `GET /api/v1/eligibility`                        | gates union (see §4.11)                                                                                                           | —                                                                                                |
| `POST /api/v1/eligibility/activate`              | —                                                                                                                                 | `TradingControlStates` write + audit event                                                       |
| `GET /api/v1/broker/connection`                  | `AccountSettings`, `BrokerApiConfigs`                                                                                             | —                                                                                                |
| `POST /api/v1/broker/connect`                    | SnapTrade `register_snap_trade_user` proxy                                                                                        | `AccountSettings` write                                                                          |
| `GET /api/v1/records/:type/:id`                  | per-type Spanner lookup                                                                                                           | —                                                                                                |
| `POST /api/v1/records/export`                    | composite                                                                                                                         | —                                                                                                |
| `GET /api/v1/disclosures`                        | (BFF-owned doc registry initially)                                                                                                | —                                                                                                |
| `POST /api/v1/disclosures/:doc_id/ack`           | —                                                                                                                                 | (BFF-owned doc registry initially)                                                               |
| `GET /api/v1/auth/siwe/nonce`                    | (own)                                                                                                                             | —                                                                                                |
| `POST /api/v1/auth/siwe/verify`                  | (own)                                                                                                                             | —                                                                                                |
| `GET /api/v1/ccid/status`                        | (BFF-owned shim until identity-ccid implemented)                                                                                  | —                                                                                                |
| `POST /api/v1/ccid/start`                        | (BFF-owned shim)                                                                                                                  | —                                                                                                |
| `POST /api/v1/support/classify`                  | (own classifier)                                                                                                                  | `SupportEvents` (BFF-owned table initially)                                                      |

This list is the new authoritative OpenAPI surface to replace `refi-api.yaml`.

---

## 8. ChatGPT's rescope doc — accept / reject / amend per section

| Section                                                     | ChatGPT recommendation                                                                                                                        | Verdict                                                                                                                                                                                                                        |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| §1 Executive decision (rescope doc 11–44)                   | Don't codify UI-invented OpenAPI; align to Daniel's lifecycle; product is digital adviser with managed execution, not trade approval app      | **ACCEPT AS-IS.** Verified by code.                                                                                                                                                                                            |
| §2.1 Backend truth (47–68)                                  | Daniel owns market data → audit events list                                                                                                   | **ACCEPT WITH AMENDMENT:** "audit events" is aspirational (no audit-writer service); truth lives in `OrderEvents + BrokerInteractionsLog + ExecutionSagas + portfolio_actions_history + AccountIntentHistory + RiskSnapshots`. |
| §3.1 Production execution boundary (99–118)                 | Lifecycle chain                                                                                                                               | **ACCEPT WITH AMENDMENT:** Insert `inference-worker → signals` at head; AuditEvents is aspirational.                                                                                                                           |
| §3.2 portfolio-manager scope (122–141)                      | Upstream research + construction; doesn't place trades                                                                                        | **ACCEPT AS-IS.** Validated by `tests/test_walkforward_runner.py`, etc.                                                                                                                                                        |
| §3.3 RL/live inference model evidence (143–168)             | Model lineage display (family, version, feature bundle, stream id)                                                                            | **ACCEPT AS-IS.** Sourced from `model_registry`, `inference_state`, `signals_last`.                                                                                                                                            |
| §3.4 account-intent-builder personalization (170–199)       | "Model target / Account intent / Risk-approved plan / Broker order" distinction                                                               | **ACCEPT AS-IS — this is THE central UX framing.**                                                                                                                                                                             |
| MIG-P2.5-04R BFF OpenAPI (1701–1738)                        | Required schemas list                                                                                                                         | **ACCEPT WITH AMENDMENTS:** add `OrderEventEntry`, `BrokerAttemptEntry`, `ControlState`, `StreamLineage` to required schemas.                                                                                                  |
| MIG-P2.5-19R RecommendationDetail lineage (1742–1780)       | Lineage bridge w/ all correlation IDs                                                                                                         | **ACCEPT AS-IS.** Field list matches `trade_lifecycle_contract.md:43-61` exactly.                                                                                                                                              |
| MIG-P2.5-20R lifecycle scenario engine (1784–1808)          | ≥22 deterministic scenarios                                                                                                                   | **ACCEPT WITH AMENDMENT:** scenarios must map to Daniel's actual status enum (lifecycle contract :114-120), not our prior P2.5 OrderStatus.                                                                                    |
| MIG-P2.5-24 Evidence Strip (1812–1836)                      | Compact strip                                                                                                                                 | **ACCEPT AS-IS.**                                                                                                                                                                                                              |
| MIG-P2.5-25 Dashboard lifecycle cards (1840–1868)           | 10 cards (Account / Managed Exec / Latest Run / Recommendation / Risk / Plan / Broker Freshness / Open Exceptions / Records / Data Freshness) | **ACCEPT WITH AMENDMENT:** add an 11th card "Control State" (halt / reduce-only / degraded) from `TradingControlStates`.                                                                                                       |
| MIG-P2.5-26 Records Center v2 (1872–1899)                   | User + internal records                                                                                                                       | **ACCEPT AS-IS.** Initial implementation reads Spanner; defer on-chain anchor display until anchor-job ships.                                                                                                                  |
| MIG-P2.5-27 Internet Adviser Evidence Console (1903–1933)   | ADV / multi-client / digital-only / outages / staff-boundary                                                                                  | **ACCEPT AS-IS.** Internal-only surface; gated behind admin auth.                                                                                                                                                              |
| MIG-P2.5-28 Support boundary hardening (1937–1964)          | Tie classifier to records + console                                                                                                           | **ACCEPT AS-IS.** Owned entirely by us.                                                                                                                                                                                        |
| MIG-P2.5-29 Managed Execution Activation rewire (1968–1996) | Activation is gate-union from backend, not local AND                                                                                          | **ACCEPT AS-IS.** Critical SEC posture.                                                                                                                                                                                        |
| MIG-P2.5-30 E2E proof suite (2000–2031)                     | 14 Playwright tests                                                                                                                           | **ACCEPT WITH AMENDMENT:** add test 15 "Order lineage panel shows all 11 correlation IDs"; add test 16 "TradingControlState halt blocks all actions".                                                                          |
| §14 Remove/demote (2035–2059)                               | Drop per-trade approval default, UI-invented OpenAPI, P&L-first dashboard, crypto/options/margin/shorts/futures                               | **ACCEPT AS-IS.**                                                                                                                                                                                                              |
| §15 Execution waves A–F (2063–2140)                         | 6 waves, ~22–34 days                                                                                                                          | **ACCEPT WITH AMENDMENT:** add Wave 0 (1 day): BFF host decision (Next.js routes vs separate Cloud Run) + Spanner read auth strategy. Without this, Wave B can't start.                                                        |
| §16 Definition of done (2143–2161)                          | 14 conditions                                                                                                                                 | **ACCEPT AS-IS.**                                                                                                                                                                                                              |
| §17 Final product definition (2164–2176)                    | "Two modes: Signal + Managed"                                                                                                                 | **ACCEPT AS-IS.** Clean north star.                                                                                                                                                                                            |
| §18 Immediate next actions (2180–2191)                      | 10 steps                                                                                                                                      | **ACCEPT WITH AMENDMENT:** insert step 0 "Decide BFF host" before step 4 "Rewrite OpenAPI".                                                                                                                                    |

**REJECT:** Nothing outright. ChatGPT's doc is well-grounded.

**DEFER:** Anything that depends on `audit-writer`, `explorer-api`, `anchor-job`, `merkle-builder`, `node`, `refin-indexer`, `compliance-adapter`, `identity-ccid`, `auth-siwe`, `routing-api`, `token-policy-api`, `pubsub-bus` shipping. That's ~10 of 26 services. Specifically defer:

- On-chain audit hash UX (anchor + merkle skeleton).
- "Verify any decision against its on-chain audit hash" product moves (§12 below).
- Explorer UI (explorer-api skeleton; admin-portal serves operator explorer).
- Real CCID KYC integration (identity-ccid skeleton — use stubs).
- Real SIWE auth (auth-siwe skeleton — use BFF-owned SIWE today).

---

## 9. New ticket plan — MIG-P2.5R (Daniel Rescope)

Sized S/M/L. All paths absolute under `/Users/za/Library/CloudStorage/Dropbox/Nature Of Commerce LLC/ReFi/Website/refi-us-sec-ia`.

### Wave 0 — Foundation (2 days)

**P2.5R-00 — BFF host decision and Spanner read auth strategy** (S)

- Daniel source: N/A — we own BFF.
- Files touched: new ADR at `refi-build-docs/spec-current/09-bff-architecture-decision.md`.
- Acceptance: ADR picks Next.js route handlers vs separate Cloud Run; defines Spanner read service-account flow (likely workload-identity from Cloud Run); defines Pub/Sub publish auth.
- Owner: platform.
- Blockers: requires Daniel sign-off on which Spanner project/instance we read.

**P2.5R-01 — Backend contract map rewrite** (M)

- Daniel source: `docs/IOs/*.md`, `docs/as-built/v2/*.md`, `docs/architecture/trade_lifecycle_contract.md`.
- Files touched: `refi-build-docs/spec-current/06-backend-contract-map.md` (rewrite), `07-daniel-blueprint-alignment.md` (mark superseded by this doc).
- Acceptance: every BFF endpoint in §7 above is mapped to (Spanner SELECT | Pub/Sub publish | external) with citations.
- Owner: UI architect.

### Wave A — Contract (5 days)

**P2.5R-02 — Replace `refi-api.yaml` with BFF projection OpenAPI** (L)

- Daniel source: §7 routes above.
- Files touched: `packages/api-clients/openapi/refi-api.yaml` (full rewrite), `packages/api-clients/src/generated/api.ts` (regenerate).
- Acceptance: 25+ paths matching §7; each schema's `description` carries `source_backend: <service>.<table>` citation; OpenAPI lints clean; existing MSW handlers stub the new shapes.
- Owner: UI architect + Daniel review.
- Blockers: P2.5R-00, P2.5R-01.

**P2.5R-03 — Schemas: AccountIntent, RiskSnapshot, ExecutionPlan, Order (lifecycle status set), OrderEvent, BrokerOrderAttempt, ControlState, TemplateTarget, StreamLineage** (L)

- Daniel source: `docs/IOs/account_intent_builder_IO_details.md:114-154`, `docs/IOs/risk-engine_IO_details.md:174-193`, `docs/IOs/exec-gateway_IO_details.md:91-145`, `docs/architecture/trade_lifecycle_contract.md:63-120`.
- Files touched: `packages/api-clients/src/generated/api.ts`, new `packages/api-clients/src/lineage.ts`.
- Acceptance: all 19 concepts from §5 have TS types; string-decimal fields preserved as strings; status enums match `apps/common/trade_lifecycle/states.py`.
- Owner: UI.

**P2.5R-04 — MSW handlers per new BFF surface** (M)

- Files touched: rewrite `packages/api-clients/src/mocks/handlers.{auth,ccid,brokers,orders,recommendations,activity,documents,support,eligibility,account}.ts` and add `handlers.lineage.ts`, `handlers.records.ts`, `handlers.controlstate.ts`.
- Acceptance: each BFF path has happy + fail-closed + control-halted variant.
- Owner: UI.

### Wave B — Lineage product surface (7 days)

**P2.5R-05 — RecommendationDetail lineage bridge** (L) — replaces MIG-P2.5-19R verbatim.

- Daniel source: full chain per §2.
- Files touched: `apps/web/app/us/app/recommendations/[id]/page.tsx`, new `apps/web/app/us/app/recommendations/[id]/_components/{LineagePanel,EvidenceStrip,RiskDecisionTable,ExecutionTable,StreamLineageChip}.tsx`.
- Acceptance: lineage panel shows all 11 correlation IDs from `trade_lifecycle_contract.md:43-61`; plain-language summary first; evidence panel expandable; `snapshot_hash`, `inputs_fingerprint`, `legs_hash` visible.
- Owner: UI + product.

**P2.5R-06 — Evidence Strip component** (S) — MIG-P2.5-24.

- Files touched: new `apps/web/app/us/app/_components/EvidenceStrip.tsx`; mount on `recommendations/[id]/page.tsx` + managed execution detail page.
- Acceptance: 7 fields (software-generated, profile_version, template_version, model_version, execution_policy_version, risk_decision, broker_status, record_status); never names a staff approver; links to Records Center.
- Owner: UI + compliance.

**P2.5R-07 — Dashboard lifecycle cards (11 cards)** (L) — MIG-P2.5-25 amended.

- Files touched: rewrite `apps/web/app/us/app/home/_components/dashboard.tsx` plus 11 new card components in `apps/web/app/us/app/home/_components/cards/`.
- Acceptance: cards `AccountState, ManagedExecutionState, LatestPortfolioRun, LatestRecommendation, LatestRiskDecision, LatestExecutionPlan, BrokerFreshness, OpenExceptions, RecordsComplete, DataFreshness, ControlState`; each maps to BFF endpoint field; plain-language one-sentence meaning; no fake P&L.
- Owner: UI + product.

**P2.5R-08 — Dashboard BFF projection** (M)

- Daniel source: composite Spanner reads.
- Files touched: BFF `/api/v1/dashboard` (location TBD per P2.5R-00).
- Acceptance: single fetch returns all 11 card payloads; Redis-cached 60s (mirrors admin-portal `admin:kpis:latest` pattern per `docs/as-built/v2/admin-portal_AS_BUILT.md:141-145`).
- Owner: BFF.

**P2.5R-09 — Managed Execution Activation rewire** (M) — MIG-P2.5-29.

- Daniel source: §4.11.
- Files touched: rewrite eligibility flow under `apps/web/app/us/app/activate/`, BFF `/api/v1/eligibility`.
- Acceptance: backend returns gate-level state union; UI shows exact blocker; activation writes `TradingControlStates` + audit event.
- Owner: UI + BFF.

### Wave C — Scenarios + Records + Console (10 days)

**P2.5R-10 — Lifecycle scenario engine** (L) — MIG-P2.5-20R amended.

- Files touched: `apps/web/app/_simulation/scenario-engine.ts` (rewrite), `apps/web/app/_simulation/scenarios/*.ts`, `apps/web/app/us/app/_components/ScenarioSwitcher.tsx`, MSW handlers, Playwright specs.
- Acceptance: ≥22 scenarios mapped to Daniel lifecycle states (`planned, pending_submit, blocked_by_conflict, blocked_dependency, submit_started, submitted, acknowledged, working, partially_filled, filled, canceled, rejected, expired, replaced, failed_retry, unknown` + `risk: approved/rejected` + `intent: ready/blocked/error` + `control: active/halt/reduce_only/degraded`); switcher hidden in production build.
- Owner: UI.

**P2.5R-11 — Records Center v2** (L) — MIG-P2.5-26.

- Files touched: new `apps/web/app/us/app/records/{page,layout,recommendation,execution,broker,disclosure,support,export}/` tree; BFF `/api/v1/records/*`.
- Acceptance: every recommendation has a record from `AccountIntents`+`RiskSnapshots`+`portfolio_actions_history`; export package returns manifest; no on-chain field until anchor-job ships (placeholder marker).
- Owner: UI + BFF + compliance.

**P2.5R-12 — Internet Adviser Evidence Console** (L) — MIG-P2.5-27.

- Files touched: new `apps/web/app/us/internal/evidence-console/` (admin-gated).
- Acceptance: ADV badge, active-client count (from `Accounts WHERE status='active' AND autopilot_enabled=true`), digital-only proof, outage log, staff-boundary events, exports.
- Owner: product + compliance + UI.

**P2.5R-13 — Support boundary hardening** (M) — MIG-P2.5-28.

- Files touched: extend `apps/web/app/us/_lib/support-boundary/*` to write `SupportEvents` to BFF; surface stats in Evidence Console.
- Acceptance: classifier results carry correlation_id; never logs message text to analytics; complaints allowed through.
- Owner: UI + compliance.

### Wave D — E2E proof + cutover (5 days)

**P2.5R-14 — E2E proof suite (16 tests)** (L) — MIG-P2.5-30 amended.

- Files touched: `apps/web/e2e/proofs/*.spec.ts`.
- Acceptance: 14 ChatGPT tests + (15) lineage panel shows all 11 correlation IDs + (16) ControlState halt blocks all actions.
- Owner: UI + QA.

**P2.5R-15 — Mock-to-live cutover guide** (S)

- Files touched: new `refi-build-docs/spec-current/10-mock-to-live-cutover.md`.
- Acceptance: per-endpoint cutover checklist; staging URL fields; rollback plan.
- Owner: UI architect.

### Sequencing dependency graph

```
P2.5R-00 → P2.5R-01 → P2.5R-02 → (P2.5R-03, P2.5R-04) → (P2.5R-05, P2.5R-06)
                                  → (P2.5R-07 → P2.5R-08)
                                  → P2.5R-09
                                  → P2.5R-10 → P2.5R-14
                                  → P2.5R-11 → P2.5R-12 → P2.5R-13
                                  → P2.5R-15
```

Total: ~29 working days, single full-stack engineer; ~17 days with parallel BFF + UI tracks.

---

## 10. What of our existing work survives unchanged

| Asset                                                                                                                                  | Survival                       | Notes                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Persona fixtures (`packages/api-clients/src/mocks/fixtures/personas/*`)                                                                | **Mostly yes**                 | Structure survives; extend with lineage fields (intent_id, correlation_id, snapshot_hash, etc.) per P2.5R-05.                                                                                                                                                      |
| Compliance verdicts (`fixtures/compliance/verdicts.ts`)                                                                                | **Partial**                    | Concept survives; remap to `RiskDecision` shape (approved/rejected only); ALLOW/REVIEW/DENY/UNAVAILABLE become UI tiers projecting lifecycle states.                                                                                                               |
| CompliancePreview fail-closed component (`apps/web/app/us/app/_components/CompliancePreview.tsx`)                                      | **Yes**                        | Backing data swaps from our verdict shape to RiskSnapshot. Visual layer survives.                                                                                                                                                                                  |
| Dashboard structure (`apps/web/app/us/app/home/_components/dashboard.tsx`)                                                             | **Concept yes, cards rewrite** | 8-card → 11-card. Status-first framing keeps.                                                                                                                                                                                                                      |
| Lifecycle PATCH pattern (P2.5 work)                                                                                                    | **Yes**                        | Useful for `/api/v1/profile` updates.                                                                                                                                                                                                                              |
| Support classifier (`_lib/support-boundary/*`)                                                                                         | **Yes, entirely**              | Owned by us. Daniel has no plan here.                                                                                                                                                                                                                              |
| Disclosure ack tracker (`_lib/document-acks.ts`)                                                                                       | **Yes**                        | Backing store may swap to BFF later.                                                                                                                                                                                                                               |
| RecommendationDetail page (`recommendations/[id]/page.tsx`)                                                                            | **UI yes, schema rewrite**     | Add lineage panel + evidence strip (P2.5R-05, P2.5R-06).                                                                                                                                                                                                           |
| MSW handlers                                                                                                                           | **Rewrite**                    | New shapes per P2.5R-04.                                                                                                                                                                                                                                           |
| OpenAPI `refi-api.yaml`                                                                                                                | **Rewrite**                    | Per P2.5R-02.                                                                                                                                                                                                                                                      |
| Generated TS types                                                                                                                     | **Rewrite**                    | Per P2.5R-03.                                                                                                                                                                                                                                                      |
| `06-backend-contract-map.md`                                                                                                           | **Rewrite**                    | Per P2.5R-01.                                                                                                                                                                                                                                                      |
| `07-daniel-blueprint-alignment.md`                                                                                                     | **Supersede**                  | Mark superseded by this doc + P2.5R-01.                                                                                                                                                                                                                            |
| `MIG-P2.5-audit.md`                                                                                                                    | **Keep as historical record**  |                                                                                                                                                                                                                                                                    |
| Pre-P2.5 alignment fixes (OrderStatus enum, client_order_id, expiry_at, /auth/logout, /compliance/.../invalidate, SIWE nonce bindings) | **Most invalidated**           | OrderStatus enum is wrong (no `mined/reverted/acked`); revert `cancelled → canceled`; everything compliance/SIWE/CCID was UI-invented anyway and gets re-specified by P2.5R-02. The `client_order_id`, `expiry_at`, and SIWE binding fields survive as good ideas. |

**Estimate:** ~50% of Wave 1/2/3 code survives. ~35% is reshape (schema swaps under same components). ~15% is replaced (handlers, OpenAPI, generated types).

---

## 11. Open questions for the user

These block full cutover and must be answered with Daniel:

1. **Is there a staging URL today?** No service deployed visibly to us. The IO docs reference `us-west1-docker.pkg.dev/$PROJECT_ID/apps/trade-manager:latest` and project `refinity-dev`. Need: dev BFF deploy target + Spanner read auth path.
2. **Which Spanner project + instance + database can the BFF read?** Defaults across docs: `refinity-dev / refinity-spanner / refinity-db` (exec-gateway) vs `refin-main / refin-db` (trade-manager) vs `refinity-dev-sp / core` (admin-portal). Three different conventions — Daniel must say which is current.
3. **Will Daniel ratify our BFF endpoints**, or will Daniel build `routing-api` himself? If Daniel builds it, we wait. If we build it, we need (a) Spanner read credentials, (b) Pub/Sub publish credentials, (c) topic naming environment, (d) admin-portal cross-call permissions for any operator paths we forward.
4. **Will Daniel implement `auth-siwe` and `identity-ccid` in the P2.5R timeline?** If no, we build BFF-owned SIWE (web3.js library) and CCID stub. If yes, we wait for shape. Confirm SIWE binding fields (chain_id, domain, uri).
5. **What is the canonical investor "place an action" command?** Daniel uses `template.admin action=rebalance target_account_id=X` for admin-init. For an investor accepting a recommendation, do we (a) reuse that with the investor's account, (b) need a new topic `account.action.requested`, or (c) is acceptance implicit (Managed mode = auto-execute every approved intent)? **This determines whether the frontend has an "accept" button at all.**
6. **Records: is the Spanner read sufficient for SEC records or do we need on-chain proof?** `anchor-job`, `merkle-builder`, `node` are skeletons. Confirm we can ship Records Center v2 reading Spanner alone, with on-chain field deferred.
7. **Are admin-portal and explorer-api surfaces in P2.5R scope?** Admin-portal is already shipped (operator only). Explorer-api is skeleton. ChatGPT defers explorer — confirm.
8. **Disclosure delivery — does Daniel plan a Document Registry service?** None exists. We can own it, but acks need a Spanner table. Propose name + columns.
9. **What's the canonical `correlation_id` policy?** Per `trade_lifecycle_contract.md:57` it spans logs + Pub/Sub + Spanner + operator views. Confirm BFF must generate one per investor action and propagate.
10. **Should the frontend distinguish `stream_id` (e.g., `AAPL~rf`) from asset symbol (`AAPL`) in user-facing copy?** Per `trade_lifecycle_contract.md:84-86` Admin Portal may show streams. Investor UI should probably hide and show only asset symbol — confirm.

---

## 12. Top 0.01% product framing

The decision-chain pipeline gives us product moves that competitor robo-advisers (Wealthfront, Betterment, Schwab Intelligent) cannot show because they don't have an evidence trail of this depth. Five concrete capabilities to design for:

### 12.1 "Show me the exact moment a recommendation was born"

Surface `portfolio_actions_history.action_id` + `inputs_fingerprint` + `signals_last` snapshot at decision time. UI: "On May 19 at 09:32:14, your portfolio template `crypto_large_cap_v20240212` solved a new target because `BTC-USD` signal flipped to +1 (model `rf_v2.3`, fingerprint `a4f7b9…`). Your account intent was computed at 09:32:18 using broker-truth balance $48,231.40 and 4 positions."

### 12.2 "Verify any decision against its cryptographic proof"

Surface `snapshot_hash`, `legs_hash`, `inputs_fingerprint`, `stream_fingerprint` on every recommendation. UI: a copy-paste hash with a "verify locally" button that re-computes against displayed payload. Today this is Spanner-anchored only; when `anchor-job` + `merkle-builder` ship, upgrade to on-chain Merkle proof with a block explorer link. Competitors literally cannot do this.

### 12.3 "See the ExecutionPlan before it leaves the platform"

Between `risk.approved` and `orders.cmd`, exec-gateway writes `ExecutionPlans` + `Orders` (status `planned`/`pending_submit`). Expose a "preview" tab on every Managed-mode recommendation showing: planned orders, conflict detection results, split_idx breakdown, dependency graph. UI: a flow diagram of "intent → 3 child orders, ordered by dependency, 1 blocked by existing position cancel".

### 12.4 "Watch every broker interaction with the broker"

`BrokerInteractionsLog` stores redacted request/response per `docs/as-built/v2/trade-manager_AS_BUILT.md:20-25`. UI: per-order timeline showing every outbound submit/cancel/poll attempt with broker latency, HTTP status, and the canonical broker_order_id once known. This is the answer to "did my order really go through" — auditable down to the millisecond.

### 12.5 "Replay the reconciliation"

`TradeReconciliationRuns` + `TradeReconciliationDiscrepancies` ledger lets us show: "Yesterday at 16:30, broker said your `AAPL` qty was 12.0 but our records said 12.0. No discrepancy." Or: "Discrepancy detected at 16:31: broker has 11.5, we have 12.0. Repaired at 16:32 by trusting broker truth. Position snapshot updated. Audit event #aud-29871." Most brokerages do reconciliation silently; we make it visible.

**Other lower-tier moves enabled:**

- "Why didn't I trade?" panel: shows last `RiskSnapshot.decision='rejected'` with `reasons[]` plain-language, `metrics.positions_age_ms`, and exactly which `RiskLimits` row blocked.
- "Strategy lineage": every recommendation links to `selected_strategies.model_version` + walk-forward backtest summary from portfolio-manager.
- "Drift transparency": per-account "your current portfolio drift" vs `template_rules.min_change_threshold` — answer to "why isn't my portfolio rebalancing".
- "Control state badge": permanent header indicator showing `TradingControlStates` (active / halt / reduce-only / degraded). When a global halt fires, every user sees the same banner — no silent failures.
- "Stream lineage chip" on each leg: tiny "rf | rl | composite" indicator showing which model family contributed.

The unifying thesis: **most fintechs hide their pipeline. We expose ours and turn that into trust.** Every Spanner table Daniel ships is a product surface, not just a backend artifact.

---

_End of report._ This document supersedes `07-daniel-blueprint-alignment.md` for forward planning and folds the remaining MIG-P2.5 ticket plan into MIG-P2.5R. ChatGPT's `ReFi_US_P2_5R_Daniel_Alignment_Rescope.md` remains useful as the narrative/product thesis source; this report is the source for what the code actually implements and what BFF surface must be built.
