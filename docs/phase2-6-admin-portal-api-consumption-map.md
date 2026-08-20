# Phase 2.6 Admin Portal API Consumption Map

**Date:** 2026-05-30
**Source of truth:** [`phase2-6-authoritative-source-of-truth.md`](phase2-6-authoritative-source-of-truth.md)
**Gap:** `GAP-ADMIN-API-004`, `GAP-ACL-005`
**Status:** ⛔ **SUPERSEDED (2026-07-28) — NOT THE INTEGRATION PATH.** See [`phase2-7-daniel-direction-resolution.md`](phase2-7-daniel-direction-resolution.md) §3.

> **Daniel, 2026-07-28 (written):** "I dont want the investor BFF to use the
> broad Admin Portal API as an interim investor boundary." The Admin Portal is a
> privileged operator surface. A dedicated **`investor-api`** service is being
> built instead, enforcing account ownership, field allowlists, redaction, rate
> limits, and investor action auditing **at the backend boundary**.
>
> This overturns the 2026-05-30 record below (Contract V3 §13.2), which had no
> linked source. **No BFF route may target an Admin Portal endpoint.** The
> endpoint inventory in this doc is retained only as a _projection-shape
> reference_ for what investor-api will expose; its ACL, caching, scoping, and
> BFF-route-candidate columns are obsolete. The `/api/v1/stream` SSE bridge is
> replaced by `GET /api/v1/investor/accounts/{account_id}/events`.

**Superseded ratification (2026-05-30, source unconfirmed):** Phase 2.6 ACL strategy ratified as **patterns 1 + 2** (route-scoped filtering + account-filtered list filtering). Phase 3 migrates to **pattern 3** — dedicated `/api/v1/investor/*` projections owned by Daniel. `GAP-ACL-005` remains open for implementation in PR-E. See Contract V3 §13.2.

This doc identifies, for every Admin Portal endpoint that's relevant to the investor product, the source table, investor-safe status, fields to redact, account-id scoping requirement, cacheability, BFF route candidate, surface served, production readiness, and security notes.

The Admin Portal mounts 35 routers under `/api/v1/{prefix}` (verified at `apps/admin-portal/backend/api/router_registry.py`). This doc covers the relevant subset.

---

## 1. ACL principle

Every Admin Portal route the BFF consumes must be filtered against the authenticated investor's `account_id`. Three patterns:

1. **Route-scoped**: the endpoint already takes `{account_id}` as a path parameter (e.g. `GET /api/v1/accounts/{account_id}`). BFF asserts the parameter matches the session's `account_id` before proxying.
2. **Account-filtered**: the endpoint returns a list filtered by a query parameter (e.g. `GET /api/v1/orders?account_id=…`). BFF injects the session's `account_id` and rejects any other.
3. **Tenant-scoped projection**: a new endpoint is added on Admin Portal side that emits only the requested investor's data (e.g. `GET /api/v1/investor/accounts/{account_id}/dashboard`). Cleanest for production; needs Daniel coordination.

**Ratified (Daniel, 2026-05-30):** ship with patterns 1 + 2 in Phase 2.6 (BFF-side filter); migrate to pattern 3 in Phase 3 once Daniel scopes investor-facing projections explicitly. Tracked as `GAP-ACL-005`.

### 1.1 BFF ACL invariants (Phase 2.6)

- BFF authenticates the investor session (SIWE) before every Admin Portal call.
- BFF derives `account_id` from the session — never from caller input.
- BFF rejects (403) any caller-supplied `account_id` that does not match the session.
- BFF injects `account_id=session.account_id` into pattern-2 list routes.
- BFF redacts admin-only fields per the per-route redaction table in §4.
- BFF rate-limits sensitive routes (audit packet, trace, record download).
- BFF emits `RecordAccessLog` for every view/download of record/audit-packet routes (separate from `InvestorActionReceipt`).
- BFF never exposes raw Admin Portal route vocabulary to the investor UI; all routes are product-mediated under `/api/v1/investor/*` BFF paths.

## 2. Field redaction principle

Many Admin Portal responses carry operator-only fields (e.g. internal `notes`, `intervention_id` cross-references, `snapshot_hash` internal pointers). BFF strips these before returning to the investor. Each row below lists redacted fields.

## 3. Cache TTL principle

- **Registry-shaped, slow-changing**: TTL 300s (templates, memberships, rules, asset metadata)
- **Live state**: TTL 5–15s (account flow, intent state, control state)
- **Lifecycle evidence**: no cache; pass-through (orders, fills, events)
- **Real-time feed**: SSE pass-through with investor-scoped filtering (`/api/v1/stream`)

## 4. Endpoint inventory

### Template / portfolio registry (Surface 5, Surface 11 lineage)

| Admin Portal endpoint                                  | Source                                        | Investor-safe?         | Redact                              | Scoping                                       | TTL  | BFF route candidate                             | Surface |
| ------------------------------------------------------ | --------------------------------------------- | ---------------------- | ----------------------------------- | --------------------------------------------- | ---- | ----------------------------------------------- | ------- |
| `GET /api/v1/portfolio/templates`                      | `templates` table + `portfolio_registry` join | Yes (catalog)          | `weighting_policy` internals if any | None (catalog)                                | 300s | `/api/v1/investor/templates`                    | 5       |
| `GET /api/v1/portfolio/templates/{template_id}`        | same                                          | Yes                    | same                                | None                                          | 300s | `/api/v1/investor/templates/{id}`               | 5       |
| `POST /api/v1/portfolio/templates`                     | mutation                                      | **No** (admin-only)    | —                                   | —                                             | —    | —                                               | —       |
| `PUT /api/v1/portfolio/templates/{template_id}`        | mutation                                      | **No**                 | —                                   | —                                             | —    | —                                               | —       |
| `DELETE /api/v1/portfolio/templates/{template_id}`     | mutation                                      | **No**                 | —                                   | —                                             | —    | —                                               | —       |
| `GET /api/v1/portfolio/memberships`                    | `template_membership`                         | Yes (catalog)          | none                                | None                                          | 300s | `/api/v1/investor/templates/memberships`        | 5, 11   |
| `GET /api/v1/portfolio/rules`                          | `template_rules`                              | Yes (catalog)          | none                                | None                                          | 300s | `/api/v1/investor/templates/rules`              | 5       |
| `POST /api/v1/portfolio/templates/{template_id}/rules` | mutation                                      | **No**                 | —                                   | —                                             | —    | —                                               | —       |
| `GET /api/v1/portfolio/actions`                        | `portfolio_actions_history`                   | Limited (lineage only) | `triggered_by_intervention_id`      | Filter by `account_id` participation via join | 60s  | `/api/v1/investor/lineage/actions`              | 11      |
| `GET /api/v1/portfolio/actions/{action_id}`            | same                                          | Limited                | same                                | Verify investor's accounts touched            | 60s  | `/api/v1/investor/lineage/actions/{id}`         | 11      |
| `GET /api/v1/portfolio/streams/available`              | catalog                                       | Yes                    | none                                | None                                          | 300s | `/api/v1/investor/streams/available` (advanced) | 11      |

**Tripwire note**: `POST /api/v1/operations/trigger-rebalance` exists at admin-portal and remains forbidden in frontend code (already tripwire-listed).

### Accounts, risk limits, account flow (Surface 4, Surface 9, Surface 11)

| Admin Portal endpoint                                          | Source                                               | Investor-safe?                                                                                                                                                                                                          | Redact                                                          | Scoping                           | TTL          | BFF route candidate                                        | Surface  |
| -------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------- | ------------ | ---------------------------------------------------------- | -------- |
| `GET /api/v1/accounts`                                         | `Accounts` (list)                                    | **No** (returns all)                                                                                                                                                                                                    | —                                                               | —                                 | —            | —                                                          | —        |
| `GET /api/v1/accounts/{account_id}`                            | `Accounts` + joins                                   | Yes                                                                                                                                                                                                                     | `notes`, operator-set flags                                     | Path scoped; assert match         | 60s          | `/api/v1/investor/account`                                 | 4, 9     |
| `GET /api/v1/accounts/{account_id}/flow`                       | `AccountIntents` + `RiskSnapshots` + `Orders` joined | Yes (this is the investor's primary lifecycle view)                                                                                                                                                                     | `evidence_gaps` internal codes                                  | Path scoped                       | 15s          | `/api/v1/investor/account/flow`                            | 2, 3, 11 |
| `POST /api/v1/accounts/{account_id}/templates`                 | mutation: AccountTemplates write                     | Yes (investor activation)                                                                                                                                                                                               | —                                                               | Path scoped                       | — (mutation) | `/api/v1/investor/managed/activate`                        | 5        |
| `DELETE /api/v1/accounts/{account_id}/templates/{template_id}` | mutation                                             | Yes (investor deactivation)                                                                                                                                                                                             | —                                                               | Path scoped                       | —            | `/api/v1/investor/managed/deactivate`                      | 6        |
| `POST /api/v1/accounts/{account_id}/admin-actions`             | mutation: `account.admin` publish                    | **No** (admin-only verbs include `force_rebuild`, `rebalance`); but `pause_autopilot`, `resume_autopilot`, `liquidate_all`, `update_prefs`, `join_template`, `leave_template` are investor-safe per Phase 2.5 partition | redact `force_rebuild`, `rebalance` if ever present in response | Path scoped + verb allowlist      | —            | `/api/v1/investor/account/actions` (with allowlist)        | 4, 5, 6  |
| `GET /api/v1/accounts/{account_id}/risk-limits`                | `RiskLimits`                                         | Yes (read-only display)                                                                                                                                                                                                 | none                                                            | Path scoped                       | 60s          | `/api/v1/investor/risk-limits`                             | 4        |
| `POST /api/v1/accounts/{account_id}/risk-limits`               | mutation                                             | **No** (operator-only — investors can't change their own risk caps; only operators can per `RiskLimits` ownership model)                                                                                                | —                                                               | —                                 | —            | —                                                          | —        |
| `GET /api/v1/risk/intents`                                     | `AccountIntents` filtered by query                   | Yes (filter to investor's accounts)                                                                                                                                                                                     | none                                                            | Inject `account_id=session`       | 15s          | `/api/v1/investor/intents`                                 | 2, 11    |
| `GET /api/v1/risk/intents/{intent_id}`                         | `AccountIntents` + `RiskSnapshots`                   | Yes                                                                                                                                                                                                                     | `snapshot_hash` internal pointer (display as opaque ref)        | Verify intent belongs to investor | 15s          | `/api/v1/investor/intents/{id}`                            | 3, 11    |
| `POST /api/v1/risk/simulate`                                   | `risk-engine` simulate                               | Yes (investor what-if)                                                                                                                                                                                                  | none                                                            | Constrain to investor's account   | —            | `/api/v1/investor/risk/simulate` (Phase 3 — UX disruption) | (new)    |

### Execution / orders / broker (Surface 11, Surface 13)

| Admin Portal endpoint                        | Source                                                                 | Investor-safe?                                                                                                                    | Redact                               | Scoping                                   | TTL | BFF route candidate                         | Surface |
| -------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------- | --- | ------------------------------------------- | ------- |
| `GET /api/v1/execution/plans`                | `ExecutionPlans` list                                                  | Limited                                                                                                                           | `evidence_gaps` internals            | Filter to investor's accounts             | 30s | `/api/v1/investor/execution/plans`          | 11      |
| `GET /api/v1/execution/plans/{plan_id}`      | `ExecutionPlans` + `Orders` join                                       | Yes                                                                                                                               | same                                 | Verify plan belongs to investor's account | 30s | `/api/v1/investor/execution/plans/{id}`     | 11      |
| `GET /api/v1/execution/orders`               | `Orders` list                                                          | Limited                                                                                                                           | none                                 | Inject `account_id=session`               | 15s | `/api/v1/investor/orders`                   | 11, 13  |
| `GET /api/v1/execution/orders/{order_id}`    | `Orders` + `OrderEvents` + `Fills` + `BrokerOrderAttempts` joined      | Yes (the full lineage view)                                                                                                       | `notes`, `intervention_id`           | Verify order belongs to investor          | 15s | `/api/v1/investor/orders/{id}`              | 11, 13  |
| `GET /api/v1/orders`                         | same as above (alternate router)                                       | Limited                                                                                                                           | same                                 | Filter                                    | 15s | (same as `/execution/orders`)               | 11      |
| `GET /api/v1/orders/blocked`                 | `Orders` where status in {`blocked_by_conflict`, `blocked_dependency`} | Yes (feeds Exception Review)                                                                                                      | none                                 | Filter to investor's accounts             | 15s | `/api/v1/investor/orders/blocked`           | 10      |
| `POST /api/v1/operations/cancel-order`       | mutation                                                               | **Conditional** — investor self-cancel of `pending_submit` only is candidate UX; Daniel ratification needed (GAP-CANCEL-INIT-012) | —                                    | Path scoped + status allowlist            | —   | (Phase 3)                                   | 13      |
| `GET /api/v1/broker-interactions`            | `BrokerInteractionsLog`                                                | Limited                                                                                                                           | full payloads with redaction applied | Filter to investor's accounts             | 30s | `/api/v1/investor/broker-interactions`      | 13, 11  |
| `GET /api/v1/broker-interactions/{order_id}` | same                                                                   | Limited                                                                                                                           | redact secrets                       | Verify order belongs to investor          | 30s | `/api/v1/investor/broker-interactions/{id}` | 13, 11  |

### Reconciliation / controls / interventions (Surface 10, Surface 11)

| Admin Portal endpoint                                                | Source                             | Investor-safe?                                                                                                             | Redact                                                   | Scoping                                | TTL | BFF route candidate                                                          | Surface |
| -------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------- | --- | ---------------------------------------------------------------------------- | ------- |
| `GET /api/v1/ops/reconciliation/discrepancies`                       | `TradeReconciliationDiscrepancies` | Yes (feeds Exception Review)                                                                                               | `assigned_to_operator`                                   | Filter to investor's accounts          | 30s | `/api/v1/investor/reconciliation/discrepancies`                              | 10      |
| `GET /api/v1/ops/reconciliation/discrepancies/{id}`                  | same                               | Yes                                                                                                                        | same                                                     | Verify discrepancy belongs to investor | 30s | `/api/v1/investor/reconciliation/discrepancies/{id}`                         | 10      |
| `POST /api/v1/ops/reconciliation/discrepancies/{id}/resolve`         | mutation                           | **No** (operator-only) — investor can't resolve a discrepancy; the underlying issue resolves it                            | —                                                        | —                                      | —   | —                                                                            | —       |
| `GET /api/v1/settings/trading-controls`                              | `TradingControlStates`             | Yes (read-only)                                                                                                            | none                                                     | Filter to investor's accounts          | 15s | `/api/v1/investor/controls/state`                                            | 6, 10   |
| `PUT /api/v1/settings/trading-controls/{control_scope}/{control_id}` | mutation                           | **Conditional** — investor-safe modes (TBD per GAP-CONTROL-INIT-011) might be flippable; admin-only modes remain forbidden | —                                                        | Path scoped + mode allowlist           | —   | (Phase 2.6 partial)                                                          | 6       |
| `GET /api/v1/locks`                                                  | locks list                         | **No** (operator-only)                                                                                                     | —                                                        | —                                      | —   | —                                                                            | —       |
| `DELETE /api/v1/locks/{lock_type}/{key}`                             | mutation                           | **No**                                                                                                                     | —                                                        | —                                      | —   | —                                                                            | —       |
| `GET /api/v1/interventions`                                          | `AdminInterventions`               | Limited (only those affecting investor's account, redacted heavily)                                                        | operator-internal `notes`, intervention reason internals | Filter to investor's accounts          | 60s | `/api/v1/investor/interventions/affecting-me` (Phase 3 transparency feature) | 11      |
| `GET /api/v1/trace?q={id}`                                           | trace search                       | Limited                                                                                                                    | filter to investor's correlation IDs                     | Verify trace ID belongs to investor    | 30s | `/api/v1/investor/trace` (Phase 3 — decision lineage)                        | 11      |
| `GET /api/v1/sagas/trace/{search_id}`                                | sagas trace                        | Limited                                                                                                                    | same                                                     | Verify                                 | 30s | (Phase 3)                                                                    | 11      |

### Pipeline observability (admin-only, NOT investor-facing)

All `GET /api/v1/{service}/pipeline/*` endpoints (`account-intent-builder`, `risk-engine`, `exec-gateway`, `trade-manager`, `data-loader`, `portfolio-engine`, `portfolio-manager`) are operator pipeline visibility. **Not investor-safe.** BFF does NOT proxy.

### Live event stream (Surface 11, real-time UX)

| Admin Portal endpoint      | Source          | Investor-safe?                        | Redact                                     | Scoping            | TTL        | BFF route candidate                    | Surface |
| -------------------------- | --------------- | ------------------------------------- | ------------------------------------------ | ------------------ | ---------- | -------------------------------------- | ------- |
| `GET /api/v1/stream` (SSE) | live event feed | Yes (with strict per-event filtering) | every event filtered by `account_id` match | Filter every event | n/a (live) | `/api/v1/investor/stream` (SSE bridge) | 11, 13  |

### Operator / internal (forbidden — tripwire-listed)

All of these are admin-only operator commands and remain forbidden in frontend code (tripwire-blocked):

- `POST /api/v1/operations/force-inference`
- `POST /api/v1/operations/force-training`
- `POST /api/v1/operations/force-data-load`
- `POST /api/v1/operations/cancel-order` (operator path; investor variant TBD per GAP-CANCEL-INIT-012)
- `POST /api/v1/operations/rollback`
- `POST /api/v1/operations/trigger-rebalance`
- `POST /api/v1/operations/populate-returns`
- `POST /api/v1/internal/*` (all of `launch-init`, `launch-ss`, `publish-inference-catchup`, `rollback/run`, `populate-returns`)
- `POST /api/v1/pricing-rules/relax-all`
- `POST /api/v1/asset-initializer/*`
- `POST /api/v1/strategies/promote`
- `PUT /api/v1/assets/{asset}/version`
- `POST /api/v1/assets/activate`
- `PATCH /api/v1/assets/status`
- `POST /api/v1/assets/inference-catchup`
- `POST /api/v1/assets/initialize`
- `POST /api/v1/assets/strategy-selector`

These are the admin-portal-side enforcement of the tripwire boundary.

## 5. BFF investor route summary

After PR-E (Admin Portal proxy + ACL), the BFF surface is:

```
/api/v1/investor/account                                  → /api/v1/accounts/{me}
/api/v1/investor/account/flow                             → /api/v1/accounts/{me}/flow
/api/v1/investor/account/actions                          → /api/v1/accounts/{me}/admin-actions (verb-allowlisted)
/api/v1/investor/account-prefs                            → AccountPrefs read + history-write
/api/v1/investor/account-prefs/history                    → AccountPrefsHistory list
/api/v1/investor/risk-limits                              → /api/v1/accounts/{me}/risk-limits
/api/v1/investor/templates                                → /api/v1/portfolio/templates (catalog)
/api/v1/investor/templates/{id}                           → /api/v1/portfolio/templates/{id}
/api/v1/investor/templates/memberships                    → /api/v1/portfolio/memberships
/api/v1/investor/templates/rules                          → /api/v1/portfolio/rules
/api/v1/investor/managed/activate                         → POST /api/v1/accounts/{me}/templates
/api/v1/investor/managed/deactivate                       → DELETE /api/v1/accounts/{me}/templates/{tid}
/api/v1/investor/managed/pause                            → /api/v1/accounts/{me}/admin-actions (pause_autopilot)
/api/v1/investor/managed/resume                           → /api/v1/accounts/{me}/admin-actions (resume_autopilot)
/api/v1/investor/managed/state                            → /api/v1/settings/trading-controls (filtered)
/api/v1/investor/intents                                  → /api/v1/risk/intents?account_id={me}
/api/v1/investor/intents/{id}                             → /api/v1/risk/intents/{id} (verified)
/api/v1/investor/execution/plans                          → /api/v1/execution/plans (filtered)
/api/v1/investor/execution/plans/{id}                     → /api/v1/execution/plans/{id} (verified)
/api/v1/investor/orders                                   → /api/v1/orders?account_id={me}
/api/v1/investor/orders/{id}                              → /api/v1/orders/{id} (verified)
/api/v1/investor/orders/blocked                           → /api/v1/orders/blocked (filtered)
/api/v1/investor/orders/{cid}/lineage                     → join of execution/orders/{id} + broker-interactions/{id}
/api/v1/investor/broker-interactions                      → /api/v1/broker-interactions (filtered, redacted)
/api/v1/investor/broker-interactions/{id}                 → /api/v1/broker-interactions/{id} (verified, redacted)
/api/v1/investor/reconciliation/discrepancies             → /api/v1/ops/reconciliation/discrepancies (filtered)
/api/v1/investor/reconciliation/discrepancies/{id}        → /api/v1/ops/reconciliation/discrepancies/{id} (verified)
/api/v1/investor/controls/state                           → /api/v1/settings/trading-controls (filtered)
/api/v1/investor/stream                                   → SSE bridge from /api/v1/stream (filtered every event)
/api/v1/investor/consents                                 → UserConsents read + acceptance write (Surface 7)
/api/v1/investor/exceptions                               → composed: blocked-orders + reconciliation + control-states + BFF gates (Surface 10)
/api/v1/investor/records                                  → composed: correlation-spine search (Surface 11)
```

Existing BFF routes that stay BFF-owned (no Admin Portal backing):

- `/api/v1/investor/session` (SIWE projection)
- `/api/v1/investor/profile/*` (advisory profile — until backend adds)
- `/api/v1/investor/dashboard` (compose investor home)
- `/api/v1/investor/status` (compose eligibility)
- `/api/v1/investor/subscription-mode` (Signal vs Managed)
- `/api/us/eligibility` (state-of-residence check)
- `/api/us/support` (support ticket sink)
- `/api/v1/investor/profile/reactivation` (Surface 8)
- `/api/v1/investor/disclosures/*` (Surface 7 — until consent flow fully migrates to `UserConsents`)
- `/api/v1/investor/evidence/*` (SEC 203A-2(e) record-only fixture endpoints)

Existing BFF routes to **delete** (replaced by reframed Surface 4):

- `/api/v1/investor/execution-policy`
- `/api/v1/investor/execution-policy/draft`
- `/api/v1/investor/execution-policy/activate`

## 6. Security notes

- Every BFF investor route MUST verify `session.account_id` matches request path / query.
- Every proxied response MUST be parsed and filtered through a per-endpoint redaction schema (Zod schema enforcement at the BFF layer).
- The SSE bridge MUST drop any event whose payload `account_id` does not match the session.
- Any 401/403 from Admin Portal must NOT leak admin-realm details to the investor; surface as a generic "operation not available" error.
- Rate limiting at the BFF level mirrors backend rate limits for fairness.
- Audit log: every Admin Portal proxy call carries `correlation_id` + `x-investor-account-id` header so backend audit ties to investor session.

## 7. Production readiness per row

| Tier                                              | Endpoints                                                                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Ready to consume after PR-E** (BFF proxy + ACL) | All `GET` rows marked "Yes" or "Limited" with scoping defined                                                        |
| **Needs Daniel ratification**                     | `POST /accounts/{id}/admin-actions` (verb allowlist), `PUT /settings/trading-controls/{scope}/{id}` (mode allowlist) |
| **Phase 3**                                       | `POST /risk/simulate`, `/trace`, `/sagas/trace/{id}`, investor self-cancel                                           |
| **Never investor-facing**                         | All admin/operator endpoints listed in §4 "Operator / internal"                                                      |

## 8. Open questions for Daniel

| #   | Question                                                                                                                                                                            | Where this is tracked |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 1   | Does Daniel prefer BFF-side ACL filtering, or would he ship `/api/v1/investor/*` projections on Admin Portal?                                                                       | GAP-ACL-005           |
| 2   | Confirm the verb allowlist for investor-side `/admin-actions` (proposed: `pause_autopilot`, `resume_autopilot`, `liquidate_all`, `update_prefs`, `join_template`, `leave_template`) | gap-register-v3-plan  |
| 3   | Confirm which `TradingControlStates` modes are investor-initiable                                                                                                                   | GAP-CONTROL-INIT-011  |
| 4   | Investor self-cancel of `pending_submit` orders                                                                                                                                     | GAP-CANCEL-INIT-012   |
| 5   | Investor entitlement to download own `audit_packet` from `/api/v1/trace`?                                                                                                           | GAP-AUDIT-PACKET-013  |

## 9. Scope lock

No frontend product code changes from this doc alone. No backend changes. No SEC 203A-2(e) boundary weakened. No new product surface introduced — the BFF routes named above are the proxy layer for existing surfaces.
