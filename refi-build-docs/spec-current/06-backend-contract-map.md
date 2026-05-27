# Backend Contract Map

**Owner of this doc:** UI team. **Updated by:** the person who lands a backend-dependency change.
**Last reviewed:** 2026-05-20 (full rewrite for MIG-P2.5R-01 — Daniel actual-code alignment)

> **⚠️ 2026-05-20 PM update — see `12-daniel-2026-05-20-guidance.md` for authoritative direction.** Key changes:
>
> - **`docs/architecture/spanner_ddl_all.txt` is the canonical DDL source** (not the IO docs). Every table reference in this map must cite the DDL.
> - **admin-portal is the integration reference** for endpoint patterns the public BFF should mirror.
> - **Auth account is separate from trading account** — new `AuthAccounts`/`AuthAccountLinks`/`AuthSessions`/`AuthSiweNonces` tables documented in `14-auth-account-design.md`.
> - **11 wire-shape drifts** documented in `11-integration-audit-post-p2.5r-04.md` must be resolved in Sprint A/B (per `12 §3`) before lineage UI.
>   **Source of truth:** Daniel's `refinity-main-main` codebase (Spanner schemas in `docs/architecture/spanner_ddl_all.txt`, IO contracts in `docs/IOs/*.md`, lifecycle in `docs/architecture/trade_lifecycle_contract.md`)

> **2026-05-20 — full rewrite.** Prior versions of this doc framed the backend as "endpoints Daniel will publish" against our UI-invented OpenAPI. After reading Daniel's actual code (`08-daniel-rescope-plan.md`), we now know:
>
> 1. **There is no investor-facing REST API in Daniel's backend.** The implemented services are an internal Pub/Sub pipeline (`portfolio-engine → account-intent-builder → risk-engine → exec-gateway → trade-manager`) with no HTTP surface for clients. `routing-api` (which would have been the BFF) is a 0-LOC skeleton.
> 2. **The frontend team owns the BFF**, deployed at `apps/web/app/api/v1/*` per `10-bff-architecture-decision.md`. Daniel will ratify our endpoint shapes.
> 3. **Every UI surface backs onto one of:** a Spanner SELECT, a Pub/Sub publish, or a UI-owned shim (until Daniel's `auth-siwe`, `identity-ccid`, etc. ship).
>
> This doc is now organized **by BFF endpoint** rather than by UI-invented contract. Each endpoint declares its Daniel source (Spanner table or Pub/Sub topic), the read or write semantics, and the cutover plan from MSW mock to live Spanner.

---

## 0. Coverage legend

- 🟢 **DANIEL-IMPLEMENTED** — concrete Daniel service / table / topic exists in code today. BFF translates.
- 🟡 **DANIEL-DOCUMENTED** — Daniel's IO/as-built docs name the shape but the service is a skeleton (0 LOC). BFF stubs against the documented shape; cutover when Daniel implements.
- 🔴 **UI-INVENTED** — no Daniel surface exists or is planned. BFF owns the storage (Spanner table TBD) or fully client-side.

## 1. Daniel service inventory (per `08 §1`)

**Implemented services (16):** portfolio-manager (81 .py files — most complex; nightly batch + walk-forward backtests), inference-worker (65; Flask `/tasks/*`, publishes `signals`), asset-initializer (55; HTTP `/api/v1/jobs/*` OIDC-auth), admin-portal (105; FastAPI `/api/v1/*` REST + SSE — operator-only), account-intent-builder (38; FastAPI Pub/Sub-pull), data-loader (30; batch), common (30; shared lifecycle helpers in `apps/common/trade_lifecycle/states.py`), risk-engine (28; Flask Pub/Sub-pull), trainer (23; batch), exec-gateway (22; FastAPI Pub/Sub-pull), portfolio-engine (20; FastAPI Pub/Sub-pull), trade-manager (16; Flask Pub/Sub-pull + `/broker/webhook` HMAC-verified), parity-runner (14), portfolio-analyzer-web (6; partial), training-scheduler (5).

**Skeleton services (10 — 0 .py files, README boilerplate only):** auth-siwe, identity-ccid, compliance-adapter, audit-writer, explorer-api, routing-api, refin-indexer, anchor-job, merkle-builder, node, pubsub-bus, token-policy-api. Plus `apps/web` (4 `.gitkeep` files).

**The 10 skeleton services include every investor-facing surface the UI was supposed to call.** Treat each as a "BFF must shim or wait for Daniel" decision per the per-endpoint sections below.

## 2. Canonical Spanner tables (per `trade_lifecycle_contract.md:91-108` + `docs/architecture/spanner_ddl_all.txt`)

**Project:** `refinity-dev-sp` (instance + database names pending Daniel — Q1 of the open-questions list).

**Trade lifecycle tables:**
`AccountPrefs, AccountIntents, AccountIntentHistory, RiskSnapshots, ExecutionPlans, Orders, OrderIdMap, OrderEvents, BrokerOrderAttempts, BrokerInteractionsLog, Fills, Positions, PositionSnapshots, TradeInputSnapshots, TradeReconciliationRuns, TradeReconciliationDiscrepancies, TradingControlStates, TradingControlEvents, ExecutionSagas`

**Pipeline-side tables:**
`templates, template_rules, template_membership, TemplateTargets, signals, signals_last, portfolio_actions_history, AccountSnapshots, AccountSettings, AccountConsents, UserConsents, AssetMetadata, RoundingRules, BrokerApiConfigs, PricingRules, RiskLimits, raw_price_data, model_registry, inference_state, ActiveAssets, selected_strategies, available_strategies, strategy_returns_hr, training_runs, training_plans, run_locks, SystemConfig, data_loader_runs`

**Correlation spine** (per `trade_lifecycle_contract.md:43-61`): `action_id, intent_id, plan_id, order_id, client_order_id, broker_order_id, fill_id, broker_execution_id, attempt_id, reconciliation_run_id, correlation_id`. **Every BFF endpoint that returns lineage MUST surface these.**

## 3. Canonical Pub/Sub topics (per `contracts/fixtures/*.json` + IO docs)

| Topic                           | Publisher                                | Subscribers                                               |
| ------------------------------- | ---------------------------------------- | --------------------------------------------------------- |
| `dev-template.rebalance.intent` | portfolio-engine                         | account-intent-builder                                    |
| `dev-account.intent.ready`      | account-intent-builder                   | risk-engine                                               |
| `dev-risk.approved`             | risk-engine                              | exec-gateway                                              |
| `dev-risk.rejected`             | risk-engine                              | (terminal — no consumer)                                  |
| `dev-orders.cmd`                | exec-gateway, admin-portal (cancel only) | trade-manager                                             |
| `dev-orders.evt`                | trade-manager                            | exec-gateway (reconciliation loop)                        |
| `dev-audit.evt`                 | every service emits                      | **NO durable consumer** (admin-portal SSE in-memory only) |
| `dev-template.admin`            | admin-portal                             | portfolio-engine                                          |
| `dev-account.admin`             | admin-portal                             | account-intent-builder                                    |
| `training.requested`            | training-scheduler                       | trainer                                                   |

**The `dev-` prefix is the non-prod convention.** Daniel will confirm prod prefix (Q7 in `09 §7`).

**New BFF-published topics proposed (Q7):**

- `client.execution_policy.activate` / `.pause` / `.update`
- `client.exception.approve` / `.reject`
- BFF may also reuse `dev-orders.cmd` for cancel actions (mirrors admin-portal pattern at `docs/as-built/v2/admin-portal_AS_BUILT.md:325-327`).

---

## 4. BFF endpoint → Daniel source mapping

Every endpoint in `08-daniel-rescope-plan.md §7` and `10-bff-architecture-decision.md`, mapped to its Daniel source (read or write) with cutover plan. All BFF routes live at `apps/web/app/api/v1/<domain>/` per `10`.

### 4.1 Auth (SIWE) — 🟡 DANIEL-DOCUMENTED, service skeleton

| BFF route                  | Method | Reads                                                                                                                   | Writes                                      | Cutover                                                 |
| -------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------- |
| `/api/v1/auth/siwe/nonce`  | GET    | (BFF-owned nonce store — Spanner table proposed `BFFNonces(nonce, domain, origin, uri, chain_id, expires_at, used_at)`) | —                                           | BFF-owned today; swap to `auth-siwe` when service ships |
| `/api/v1/auth/siwe/verify` | POST   | (BFF nonce store)                                                                                                       | (BFF session JWT — `SESSION_SECRET` cookie) | Same                                                    |
| `/api/v1/auth/refresh`     | POST   | —                                                                                                                       | rotate JWT                                  | Same                                                    |
| `/api/v1/auth/logout`      | POST   | —                                                                                                                       | clear JWT cookie                            | Same                                                    |
| `/api/v1/session`          | GET    | (BFF session decode)                                                                                                    | —                                           | Same                                                    |

**Notes:** `viem` server-side signature verify. Nonce TTL ≤ 5 min per Daniel's `SIWE.pdf:p4` spec. Q9 of the open-questions list confirms whether `auth-siwe` ships in P2.5R window.

### 4.2 KYC / CCID — 🟡 DANIEL-DOCUMENTED, service skeleton

| BFF route             | Method | Reads                                                     | Writes                            | Cutover                                     |
| --------------------- | ------ | --------------------------------------------------------- | --------------------------------- | ------------------------------------------- |
| `/api/v1/ccid/status` | GET    | (BFF stub returning fixture; later: `identity-ccid` REST) | —                                 | Stub today; swap when `identity-ccid` ships |
| `/api/v1/ccid/start`  | POST   | —                                                         | (BFF stub returning provider URL) | Same                                        |

**Notes:** KYC provider TBD (Q10) — likely ComplyCube, Persona, or Sumsub. Webhook-driven status updates from provider → `identity-ccid` → BFF cache invalidation.

### 4.3 Compliance / Risk verdict — 🟢 DANIEL-IMPLEMENTED (read-only from Spanner)

| BFF route                                   | Method | Reads                                                                                      | Writes | Cutover                                                                                                                                         |
| ------------------------------------------- | ------ | ------------------------------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| (no investor-facing preview endpoint)       | —      | —                                                                                          | —      | The pre-rescope `POST /orders/preview` is **removed** under the tier reframe (`09 §3`). Investors do not preview/approve per-rec under Managed. |
| `/api/v1/risk-snapshots/:account_intent_id` | GET    | `RiskSnapshots WHERE account_intent_id=...` (`docs/IOs/risk-engine_IO_details.md:174-193`) | —      | Read live from Spanner once BFF Spanner auth is live                                                                                            |

**Verdict envelope (Daniel canonical):**

```json
{
  "decision": "approved|rejected",
  "intent_id": "string",
  "account_id": "string",
  "correlation_id": "string",
  "ts": "datetime",
  "snapshot_hash": "string (cryptographic proof)",
  "constraints": [],
  "reasons": [],
  "metrics": {
    "equity": "string-decimal",
    "positions_age_ms": "int",
    "prices_age_ms_max": "int"
  },
  "retry_hint": {}
}
```

**Notes:**

- Daniel has **two** decisions only: `approved | rejected`. There is no `REVIEW` state at the service level. UI "review" maps to Exception Review for Managed users (intents flagged out-of-policy go there) or to `AccountIntent.status="blocked"` projection at the dashboard.
- `snapshot_hash` is the cryptographic-proof field we surface on the recommendation detail page audit row.
- `metrics.positions_age_ms` + `prices_age_ms_max` drive the freshness column on the BrokerStatusBanner and the dashboard's Broker card.
- **No `compliance-adapter` service exists** — this skeleton is decommissioned in favor of `risk-engine` as the canonical policy gate.

### 4.4 ACE / broker — 🟢 DANIEL-IMPLEMENTED (read via Spanner; writes via Pub/Sub `dev-orders.cmd`)

| BFF route                   | Method | Reads                                                                                                           | Writes                                                                   | Cutover                                                                             |
| --------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `/api/v1/broker/supported`  | GET    | `BrokerApiConfigs` (admin-managed registry)                                                                     | —                                                                        | Read live once Spanner auth                                                         |
| `/api/v1/broker/connection` | GET    | `AccountSettings.snaptrade_user_id/snaptrade_user_secret` per `docs/IOs/trade-manager_IO_details.md:37`         | —                                                                        | Read live                                                                           |
| `/api/v1/broker/connect`    | POST   | —                                                                                                               | SnapTrade `register_snap_trade_user` proxy → write `AccountSettings` row | BFF wraps SnapTrade API directly (Daniel uses the same approach in `trade-manager`) |
| `/api/v1/broker/account`    | GET    | `AccountSnapshots` (cached snapshot) + on-demand SnapTrade fetch if stale                                       | —                                                                        | Same                                                                                |
| `/api/v1/positions`         | GET    | `Positions` table + Redis `positions:{account_id}` TTL 180s cache per `docs/IOs/trade-manager_IO_details.md:79` | —                                                                        | Read live; honor cache key                                                          |

**Notes:**

- **Only SnapTrade is implemented as a broker integration.** Our UI's "supported brokers" list (Alpaca, IBKR, Tradier coming-soon) needs trimming to SnapTrade-only for v1.
- `Positions` uses string decimals — BFF must NOT cast to float at the API boundary.
- `asset_id` is the canonical key; the UI displays `symbol` (asset_id → symbol mapping via `AssetMetadata`).

### 4.5 Orders — 🟢 DANIEL-IMPLEMENTED (read-only investor view; cancel via Pub/Sub)

| BFF route                                 | Method | Reads                                                                                                          | Writes                                                                                                                 | Cutover                                                                                                   |
| ----------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `/api/v1/orders`                          | GET    | `Orders WHERE account_id=...`                                                                                  | —                                                                                                                      | Read live                                                                                                 |
| `/api/v1/orders/:client_order_id/lineage` | GET    | `Orders + OrderEvents + OrderIdMap + Fills + BrokerOrderAttempts + ExecutionSagas` joined on `client_order_id` | —                                                                                                                      | Read live — this is the 5-table lineage that makes "Watch every broker interaction" possible (`08 §12.4`) |
| `/api/v1/orders/:client_order_id/cancel`  | POST   | —                                                                                                              | publish `dev-orders.cmd action=cancel` (mirrors `admin-portal` at `docs/as-built/v2/admin-portal_AS_BUILT.md:325-327`) | Wire when Pub/Sub publisher SA provisioned                                                                |

**Notes:**

- **`POST /orders` (place raw order) is REMOVED.** Investors cannot place arbitrary orders. Orders originate from the AccountIntent pipeline; investor accept = activation (`09 §1 Q5`).
- **Status enum:** Daniel's canonical set per `apps/common/trade_lifecycle/states.py` is `planned, pending_submit, blocked_by_conflict, blocked_dependency, submit_started, submitted, acknowledged, working, partially_filled, filled, canceled, rejected, expired, replaced, failed_retry, unknown`. American `canceled`, not British `cancelled`. No `mined/reverted/acked` (those are L1-chain semantics; no on-chain today). Our pre-P2.5 fix used `submitted|mined|reverted|acked|partial|filled|cancelled|rejected` — **partially wrong; revert** in P2.5R-03 schema rewrite.
- **`client_order_id` is the idempotency key**; BFF must accept investor `Idempotency-Key` header and forward as `client_order_id` attribute when publishing.

### 4.6 Recommendations — 🔴 UI-INVENTED projection over Daniel's lineage

| BFF route                                                        | Method | Reads                                                                                                                                                     | Writes | Cutover                                                                                                                                                                                               |
| ---------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `/api/v1/recommendations`                                        | GET    | `AccountIntents JOIN portfolio_actions_history` keyed by `account_id` ORDER BY ts DESC                                                                    | —      | Read live                                                                                                                                                                                             |
| `/api/v1/recommendations/:intent_id`                             | GET    | `AccountIntents + RiskSnapshots + ExecutionPlans + portfolio_actions_history + TemplateTargets + Orders + Fills` joined by `correlation_id` / `intent_id` | —      | This is the full lineage page (P2.5R-05 / `08 §12.1`)                                                                                                                                                 |
| ~~`PATCH /v1/recommendations/:id` accept/reject/request_review~~ | —      | —                                                                                                                                                         | —      | **REMOVED under the tier reframe (`09 §2`).** Per-rec investor action surface is wrong. Investor actions are now `client.execution_policy.activate` (one-time per policy) + `client.exception.approve | reject` (per-exception). |

**Notes:**

- The MSW `PATCH /v1/recommendations/:id` handler stays for backward compat during transition but the UI stopped using it in P2.5R-19.
- "Recommendation" in our UI is a projection — the canonical Daniel concept is **AccountIntent** (per-account, multi-leg). See `09 §2` table for invalidated components.

### 4.7 Activity / Audit projection — 🟡 DANIEL-DOCUMENTED, projection-only

| BFF route          | Method | Reads                                                                                                                       | Writes | Cutover                                |
| ------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------- |
| `/api/v1/activity` | GET    | composite: `OrderEvents + dev-audit.evt`-sourced rows + `portfolio_actions_history + AccountIntentHistory + ExecutionSagas` | —      | Read live, project to typed event list |

**Notes:**

- `audit-writer` is a skeleton — `dev-audit.evt` has no durable consumer today. Until that ships, the BFF assembles "activity" from the Spanner tables above.
- Daniel's audit envelope per `API and Event Contracts.pdf:p9` is `{kind, ref_id, emitted_at, correlationId, redactions[], digest}`. Our flat `ActivityEvent` needs `digest`, `ref_id`, `correlationId`, `redactions[]` added in P2.5R-03 schema rewrite.

### 4.8 Profile / Strategy / Activation — 🟡 DANIEL-DOCUMENTED at table level, no service API

| BFF route                      | Method | Reads                                                                                                                                                                   | Writes                                                                                                 | Cutover                                                     |
| ------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `/api/v1/profile`              | GET    | `AccountPrefs + UserConsents + AccountConsents + AccountSettings` joined by `account_id`                                                                                | —                                                                                                      | Read live                                                   |
| `/api/v1/profile`              | PATCH  | —                                                                                                                                                                       | publish `dev-account.admin action=update_prefs` (mirrors admin-portal write pattern)                   | Confirm topic with Daniel                                   |
| `/api/v1/strategies/current`   | GET    | `templates + selected_strategies + available_strategies + TemplateTargets` (latest target for account)                                                                  | —                                                                                                      | Read live                                                   |
| `/api/v1/eligibility`          | GET    | gate union: `AccountConsents + UserConsents + AccountPrefs + AccountSettings.snaptrade_user_id != null + AccountTemplates.active + ActiveAssets + TradingControlStates` | —                                                                                                      | Read live; computed projection                              |
| `/api/v1/eligibility/activate` | POST   | —                                                                                                                                                                       | publish `client.execution_policy.activate` (new topic proposed; Q7) + write `TradingControlStates` row | This is the canonical investor accept moment per `09 §1 Q5` |

**Notes:**

- **`activation.disclosures` is no longer a single boolean from the server.** Activation gate is the union per row 4 above — disclosures count is one of the union members but the BFF computes the boolean from the document-ack store.
- `client.execution_policy.activate` payload spec in `09 §1 Q5` — required fields: `user_id, account_id, strategy_id, investor_profile_version, disclosure_version_set, advisory_agreement_version, execution_policy_id, execution_policy_version, broker_connection_id, automation_scope, risk_guardrails, restrictions, pause_rules, notification_preferences, signed_at, ip_address (HMAC-hashed), device_fingerprint (hashed)`.

### 4.9 Exceptions — 🔴 UI-INVENTED projection (no Daniel service)

| BFF route                        | Method | Reads                                                                                                                                              | Writes                                                                                                                                                                                    | Cutover                                                               |
| -------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `/api/v1/exceptions`             | GET    | `RiskSnapshots WHERE decision='rejected' JOIN AccountIntents` filtered by `account_id` and reasons indicating policy-exception (vs. terminal-deny) | —                                                                                                                                                                                         | Read live                                                             |
| `/api/v1/exceptions/:id`         | GET    | Same as above + full `AccountIntent.legs` + `RiskSnapshot.reasons[]`                                                                               | —                                                                                                                                                                                         | Read live                                                             |
| `/api/v1/exceptions/:id/approve` | POST   | —                                                                                                                                                  | publish `client.exception.approve` (new topic; Q7) — payload: `{exception_id, account_intent_id, execution_policy_id, user_id, approved_changes, signed_at, ip_hash, device_fingerprint}` | This is the ONLY per-decision investor approval surface under Managed |
| `/api/v1/exceptions/:id/reject`  | POST   | —                                                                                                                                                  | publish `client.exception.reject` (new topic; Q7)                                                                                                                                         | Default-reject if expires_at passes with no action                    |

**Notes:**

- Today the Exception object is BFF-projected from `RiskSnapshots.decision='rejected'` rows. Daniel may eventually formalize an `Exceptions` Spanner table.
- Exception expiry semantics TBD with Daniel (Q11) — propose 48h default-reject.

### 4.10 Documents — 🔴 UI-INVENTED (BFF owns until Daniel ships Document Registry)

| BFF route                         | Method | Reads                                                                                                              | Writes                                                                                                                | Cutover                                              |
| --------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `/api/v1/disclosures`             | GET    | BFF-owned Spanner table proposed: `DocumentVersions(doc_id, version, hash, effective_at, required_for_activation)` | —                                                                                                                     | BFF owns until Document Registry service ships (Q15) |
| `/api/v1/disclosures/:doc_id/ack` | POST   | —                                                                                                                  | BFF-owned Spanner: `DocumentAcks(account_id, doc_id, version, acked_at, signed_at_hash, ip_hash, device_fingerprint)` | Same                                                 |

**Notes:**

- Current MSW stores acks in client-side localStorage (`apps/web/app/us/_lib/document-acks.ts`). BFF cutover moves storage server-side.
- The 7-doc list at `apps/web/app/us/_content/disclosures.ts` is the canonical reference until counsel publishes real versions.

### 4.11 Support — 🔴 UI-INVENTED (BFF owns; classifier client-side; storage BFF-side)

| BFF route                | Method | Reads | Writes                                                                                                                                                                                                               | Cutover                                                      |
| ------------------------ | ------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `/api/v1/support/ticket` | POST   | —     | BFF-owned Spanner: `SupportEvents(ticket_id, account_id, category, blocked, boundary_rule_id, classification_confidence, matched_patterns, correlation_id, created_at)` — **never** stores message text in analytics | BFF owns indefinitely; Daniel has no support service planned |

**Notes:**

- Classifier (`apps/web/app/us/_lib/support-boundary/*`) is client-side per SEC Rule 203A-2(e)(3) requirements. Server-side re-validation in route handler is also implemented.
- This is the **most valuable frontend-owned compliance asset** — Daniel will not replace it.

### 4.12 Eligibility (US Internet Adviser overlay) — 🔴 UI-INVENTED (Next route handler)

| BFF route             | Method | Reads | Writes                                                                       | Cutover                                                 |
| --------------------- | ------ | ----- | ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| `/api/us/eligibility` | POST   | —     | Sets signed JWT cookie `us_eligibility_v1`; HMAC-hashes IP/UA before logging | Already production-grade; no Daniel coordination needed |

**Notes:**

- Lives at `apps/web/app/api/us/eligibility/route.ts` (not under `/api/v1/`). Kept at its current path because it's a Phase-0 gate, not part of the BFF read/write surface.
- 4 rules: US-person required, age ≥ 18, state-waitlist (`{AK, HI, NY}`), default-eligible.

### 4.13 Tier model — 🔴 UI-INVENTED (read from session + execution policy)

| BFF route                    | Method | Reads | Writes | Cutover                                                                                                                                                                                                                                                           |
| ---------------------------- | ------ | ----- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (no dedicated tier endpoint) | —      | —     | —      | `tier` is computed: if account has an active `ExecutionPolicy` row (BFF-owned table or `AccountSettings.execution_policy_id` Daniel-side) → `managed`; if role includes `admin` → `admin`; else → `signal`. Surfaced on `AuthSession.tier` from `/api/v1/session` |

**Notes:**

- See `09 §3` for the full tier model.
- The Q3 server-of-truth (BFF-table vs Daniel-`AccountSettings`) is a P2.5R-02 OpenAPI design call — defer until Daniel ratifies endpoint shapes.

### 4.14 Dashboard composite — 🟢 multiple-table projection

| BFF route           | Method | Reads                                                                                                                                                                                                   | Writes | Cutover                                                                                                                                |
| ------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/v1/dashboard` | GET    | composite of all dashboard card sources (activation, broker, policy, latest intent, latest risk decision, latest plan, broker freshness, open exceptions count, data freshness ts, control state, tier) | —      | Read live; Redis-cached 60s mirroring `admin-portal admin:kpis:latest` pattern per `docs/as-built/v2/admin-portal_AS_BUILT.md:141-145` |

**Notes:**

- Single round-trip for the 11-card home dashboard. Cache hit is the common path; full Spanner read happens at most once per minute per account.
- Per-card schema lives with each card source above; `/api/v1/dashboard` is the aggregation envelope.

### 4.15 Records Center — 🟡 multi-table projection

| BFF route                                        | Method | Reads                                                                                  | Writes | Cutover                                                                             |
| ------------------------------------------------ | ------ | -------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| `/api/v1/records/recommendation/:intent_id`      | GET    | same join as 4.6 detail                                                                | —      | Read live                                                                           |
| `/api/v1/records/execution/:plan_id`             | GET    | `ExecutionPlans + Orders + OrderEvents + Fills + BrokerOrderAttempts + ExecutionSagas` | —      | Read live                                                                           |
| `/api/v1/records/broker/:attempt_id`             | GET    | `BrokerInteractionsLog + BrokerOrderAttempts`                                          | —      | Read live; includes redacted request/response — never raw secrets                   |
| `/api/v1/records/disclosure/:account_id/:doc_id` | GET    | `DocumentAcks` (BFF-owned)                                                             | —      | BFF owns                                                                            |
| `/api/v1/records/support/:ticket_id`             | GET    | `SupportEvents` (BFF-owned)                                                            | —      | BFF owns                                                                            |
| `/api/v1/records/export`                         | POST   | composite of all of the above filtered by `account_id` + optional date range           | —      | Returns signed manifest; on-chain anchor field placeholder until `anchor-job` ships |

**Notes:**

- Records Center v2 (P2.5R-11) consumes these.
- `dev-audit.evt` topic is the aspirational source for an audit-writer service; until then, BFF reads from the per-table tables above.

---

## 5. Cutover plan per domain (per `10 §11`)

Per-domain feature flag: `BFF_LIVE_DOMAINS` env var; comma-separated list. Default empty = all MSW. As Daniel-side prerequisites land, flip flags one domain at a time.

**Suggested order (least dependency first):**

1. **`session`** — BFF-owned SIWE + JWT decode. Zero Daniel dependency. Cut over first to test Cloud Run deploy + Workload Identity.
2. **`profile`** — Spanner read-only on `AccountPrefs + UserConsents + AccountConsents + AccountSettings`. Tests Spanner auth.
3. **`positions`** — Spanner read on `Positions` + Redis `positions:{account_id}` cache. Tests Redis access (separate IAM if needed).
4. **`recommendations`** — composite Spanner read on `AccountIntents + portfolio_actions_history`. Tests JOIN + correlation_id propagation.
5. **`activity`** — composite Spanner read on `OrderEvents + portfolio_actions_history + AccountIntentHistory + ExecutionSagas`. Tests multi-table projection.
6. **`exceptions`** — Spanner read on `RiskSnapshots WHERE decision='rejected'` filtered for policy-exception reasons. Tests read filtering.
7. **`orders`** + **`orders/lineage`** — composite Spanner read across 5 tables. The lineage endpoint is the highest-value visible product surface.
8. **`broker`** — `AccountSettings + BrokerApiConfigs` Spanner read + SnapTrade API proxy for `connect`. First external-API integration.
9. **`disclosures`** — BFF-owned Spanner write + read. Tests BFF as a write surface.
10. **`support`** — BFF-owned Spanner write. Already prod-grade in route handler; swap localStorage classifier persistence to Spanner.
11. **`execution-policy/activate`** — Pub/Sub publish. Tests publisher SA + new topic. **High-risk because it's the canonical investor accept moment** — last to cut over, with extra observability.
12. **`exceptions/:id/approve`** + **`/reject`** — Pub/Sub publish. Tests new topic. Default-reject TTL handler needs scheduling (Cloud Scheduler → BFF /api/v1/exceptions/expire-pending?).
13. **`orders/:id/cancel`** — Pub/Sub publish on `dev-orders.cmd`. Mirrors admin-portal pattern.

**Per-domain cutover checklist (template):**

- [ ] Daniel publishes canonical shape OR ratifies ours.
- [ ] Spanner table(s) the BFF will read are populated with at least one fixture row.
- [ ] BFF route handler implementation replaces MSW stub.
- [ ] Feature flag enabled for staging.
- [ ] Smoke test: 1 read + 1 write per route.
- [ ] Compliance review: error envelope contains no PII, no Spanner internals.
- [ ] Observability: correlation_id propagation visible end-to-end (BFF → Spanner query tag / Pub/Sub attribute / structured log).
- [ ] E2E test extends to cover live path (Playwright spec).
- [ ] Rate-limit per IP + per account confirmed.
- [ ] Rollback plan: feature flag flip-back tested.

---

## 6. Annotations to maintain

Every BFF route handler MUST carry a `BACKEND_DEPENDENCY:` JSDoc block matching this template:

```ts
/**
 * BACKEND_DEPENDENCY:
 * Owner: Daniel <service-name> OR BFF-owned
 * Source: Spanner table `<TableName>` columns ... | Pub/Sub topic `<topic>` | External API <name>
 * Cutover gate: `BFF_LIVE_DOMAINS=<domain>`
 * Fail-closed rule: <or "N/A">
 * Daniel doc citation: `docs/IOs/<service>_IO_details.md:<line-range>` (where applicable)
 */
```

The same block stays on every MSW handler under `packages/api-clients/src/mocks/handlers.*.ts`, kept in sync.

---

## 7. Definitions

- **BFF (Backend-for-Frontend):** the Next.js Route Handlers at `apps/web/app/api/v1/*` that translate investor intent into Spanner reads, Pub/Sub publishes, or external API calls. See `10-bff-architecture-decision.md`.
- **Tier:** the investor's mode — Signal (advisory only), Managed (authorized auto-execution), Admin (operator). See `09 §3`.
- **Execution Policy:** the artifact a Managed investor signs to authorize auto-execution. The activation event IS the investor accept per SEC Rule 203A-2(e); per-recommendation accept does not exist. See `09 §1 Q5`.
- **Exception:** an AccountIntent that fell outside the approved Execution Policy and was routed to Exception Review — the ONLY per-decision investor approval surface under Managed.
- **`correlation_id`:** UUID v4 generated by BFF per investor action; propagated to every downstream Spanner query, Pub/Sub publish, external HTTP call, and structured log. Mirrors Daniel's spec at `trade_lifecycle_contract.md:43-61`.
- **Fail-closed:** any non-`approved` response from `risk-engine` blocks Managed auto-execution. Network errors and 5xx are treated as `rejected`, never as `approved` or `pending`.
- **String decimals:** monetary and quantity values (`cash`, `equity`, `qty`, `notional`) cross the BFF boundary as strings, never floats. Per Daniel convention.

---

## 8. Document history

- 2026-05-20 — Full rewrite for MIG-P2.5R-01. Reframed by BFF endpoint instead of UI-invented OpenAPI surface. Every section cites Daniel's actual code or marks UI-invented status. `07-daniel-blueprint-alignment.md` superseded for forward planning.
- 2026-05-19 — OpenAPI codification banner (now retired by the rescope).
- 2026-05-19 — Pre-rescope Daniel-spec coverage legend (kept; legend remains useful).
- (earlier) — Initial doc.
