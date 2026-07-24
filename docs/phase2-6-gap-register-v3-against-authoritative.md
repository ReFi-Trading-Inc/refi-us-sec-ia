# Phase 2.6 Gap Register V3 (authoritative-aligned)

**Date:** 2026-05-30
**Branch:** `phase2-6-contract-v3`
**Status:** **Phase 2.6 merge-gate gap register.** Final V3. Folds in Daniel's 2026-05-30 ratified decisions.
**Supersedes:** [`docs/phase2-5-gap-register-v2-against-gitlab.md`](phase2-5-gap-register-v2-against-gitlab.md) (V2).
**Source of truth:** [`docs/phase2-6-authoritative-source-of-truth.md`](phase2-6-authoritative-source-of-truth.md).
**Companion:** [`docs/phase2-6-signal-to-investor-product-contract-v3.md`](phase2-6-signal-to-investor-product-contract-v3.md) (Contract V3).

## Anchors

| Repo                                                    | Branch | Commit        |
| ------------------------------------------------------- | ------ | ------------- |
| Backend (`gitlab.com/refinity_dev/refinity-main`)       | `main` | **`9f9dfc9`** |
| Frontend (`github.com/ReFi-Trading-Inc/refi-us-sec-ia`) | `main` | **`590ab02`** |

## Daniel ratifications folded into this register (2026-05-30)

> **Provenance caveat (2026-07-24):** these ratifications carry no linked
> email/message source, and Daniel's verifiable 2026-05-29 message stated only
> a _preference_ for Option 3 ("likely best"), not a ratification of the 3c
> hybrid. Treat items below as **recorded, pending Daniel's written
> confirmation**; PR-D's ratification gate is the enforcement point. Note
> also: "on-chain audit infra" below is this register's term for Daniel's
> merkle-builder summary-audit pipeline (his 2026-05-29 wording).

1. **AccountPrefs History architecture — Option 3c ratified** (Contract V3 §13.1). `apps/common` canonical writer (Python). TS port for reads + validation. Parity fixtures. BFF must not invent a separate write procedure. → moves `GAP-PREFS-HISTORY-001`, `GAP-PREFS-WRITE-002`, `GAP-PREFS-AUDIT-003` from "needs Daniel ratification" to **"architecture ratified, implementation still blocked pending final Contract V3 + AccountPrefs History Contract."** Surface 4 remains blocked.
2. **Admin Portal API ACL strategy — patterns 1 + 2 ratified for Phase 2.6** (Contract V3 §13.2). BFF asserts authenticated `account_id`, injects it into list routes, rejects mismatched values, redacts admin-only fields. Phase 3 migrates to `/api/v1/investor/*` projections owned by Daniel. → `GAP-ACL-005` moves to **"decision recorded, implementation required in PR-E."**
3. **Investor-side `/admin-actions` verb allowlist confirmed** (Contract V3 §13.3): `pause_autopilot`, `resume_autopilot`, `join_template`, `leave_template`, `update_prefs`, `liquidate_all` (gated). All other verbs forbidden; tripwire enforced. → tracked in `GAP-EXCEPTION-010` / `GAP-SURFACE4-009` scope.
4. **Investor-initiable `TradingControlStates` modes — account-scoped self-service subset only** (Contract V3 §13.4). No `halt_all`, no `halt_new_orders`, no `reconciliation_block`. → `GAP-CONTROL-INIT-011` moves to **"decision recorded, backend-state mapping required in PR-E + PR-H."**
5. **Investor self-cancel of `pending_submit` — conditional** (Contract V3 §13.5). Permitted only after counsel review under SEC 203A-2(e). → `GAP-CANCEL-INIT-012` moves to **"conditional; Phase 3 unless counsel approves earlier."**
6. **Investor audit-packet download — conditional** (Contract V3 §13.6). Authenticated, account-scoped, redacted, logged via `RecordAccessLog`. → `GAP-AUDIT-PACKET-013` moves to **"decision recorded; needs endpoint contract, redaction schema, retention alignment, and tests."**

---

## 1. Gaps closed (V2 → V3)

| Gap ID (V2)         | V2 description                                | V3 resolution                                                                                                                                                                                                                               |
| ------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GAP-REC-003         | REVIEW verdict had no Daniel equivalent       | Closed — risk is binary; REVIEW is BFF-owned non-risk gates only                                                                                                                                                                            |
| GAP-REC-004         | DENY verdict had no Daniel equivalent         | Closed — `risk.rejected` is DENY                                                                                                                                                                                                            |
| GAP-REC-005         | ALLOW verdict had no Daniel equivalent        | Closed — `risk.approved` is ALLOW                                                                                                                                                                                                           |
| GAP-TEMPLATE-001    | `template_id` registry shape unknown          | Closed — Spanner tables + `/api/v1/portfolio/*` Admin Portal projections                                                                                                                                                                    |
| GAP-SIGNAL0-001     | `signal: 0` preservation unconfirmed          | Closed — preserved; neutral; never auto-closes                                                                                                                                                                                              |
| GAP-MODE-004        | ExecutionPolicy ownership unresolved          | Closed — Daniel backend has no ExecutionPolicy; AccountPrefs History gap opens instead. The BFF-owned signed-artifact `ExecutionPolicy` (`apps/web/src/lib/prototype-store/entities/execution-policy.ts`) is preserved per Contract V3 §4b. |
| GAP-EX-002          | ExecutionPolicy is frontend-side only         | Closed — confirmed no backend equivalent. The BFF retains the signed-artifact entity (Contract V3 §4b); Surface 4 reframed to compose `AccountPrefs` + `RiskLimits` + `UserConsents` + history.                                             |
| GAP-EX-003          | Broker submission missing on Daniel           | Closed — `trade-manager` + `Orders` + `OrderEvents` + `Fills` + `/api/v1/execution/orders/*`                                                                                                                                                |
| GAP-EX-005          | Record artifacts mismatched                   | Closed — Spanner lifecycle tables + spine documented in `trade_auditability_contract.md`                                                                                                                                                    |
| GAP-MULTISTREAM-001 | Multi-stream aggregation policy undefined     | Closed — `AccountIntents.legs.stream_contributions` canonical; frontend reads only                                                                                                                                                          |
| GAP-CORRELATION-001 | Correlation spine to preserve                 | Closed — spine canonical in `trade_auditability_contract.md:71-89`                                                                                                                                                                          |
| GAP-RECON-001       | `TradeReconciliationRuns/Discrepancies` exist | Closed — `/api/v1/ops/reconciliation/discrepancies` confirmed                                                                                                                                                                               |

## 2. Gaps reclassified (V2 → V3)

| Gap ID (V2)     | V2 classification                                 | V3 classification                                                                | Reason                                           |
| --------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------ |
| GAP-AUDIT-001   | `audit-writer` skeletal, production blocker       | **Not a production blocker for frontend shell** — on-chain audit infra; deferred | Basic auditability already in lifecycle services |
| GAP-COMPLY-001  | `compliance-adapter` skeletal, production blocker | **Not a production blocker for frontend shell** — on-chain audit infra; deferred | Same                                             |
| GAP-EX-004      | Exception Review missing on Daniel                | Reclassified → `GAP-EXCEPTION-010` (Exception Review reframe)                    | Source data exists; frontend reframes            |
| GAP-CONTROL-001 | `TradingControlStates` produce blocked states     | Reclassified → `GAP-EXCEPTION-010` + `GAP-CONTROL-INIT-011`                      | Two distinct frontend concerns                   |

## 3. New gaps opened in V3

### Critical / High (block Phase 2.6 adapter implementation)

| Gap ID                        | Description                                                                                                                                                                                                                                                                                                | Severity | Owner                                  | Surface impact                  | Production blocker? | Daniel input needed?                                              | Target PR                         | Next action                                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------- | ------------------------------- | ------------------- | ----------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **GAP-PREFS-HISTORY-001**     | `AccountPrefs` history table / append ledger does not exist; frontend ask to build it. **Architecture ratified by Daniel 2026-05-30: Option 3c hybrid (`apps/common` Python writer + TS port for reads/validation + parity fixtures).** Implementation still gated on final AccountPrefs History Contract. | Critical | Joint (Daniel writer + frontend BFF)   | Surface 4                       | Yes                 | No (architecture ratified); yes for final DDL + retention add     | PR-D                              | Author AccountPrefs History Contract (DDL, write procedure, retention scope, "material change" list); land in PR-D |
| **GAP-PREFS-WRITE-002**       | `AccountPrefs` write procedure not yet defined (investor-editable knobs, guards, idempotency). **Routes through Option 3c canonical writer.**                                                                                                                                                              | High     | Joint                                  | Surface 4                       | Yes                 | No (architecture ratified)                                        | PR-D                              | Spec in PR-D AccountPrefs History Contract                                                                         |
| **GAP-PREFS-AUDIT-003**       | Preference-change proof (investor-signed) and history view (investor-readable) missing. **Ratified to emit via canonical writer; retention managed in `apps/common/trade_lifecycle/retention.py`.**                                                                                                        | High     | Joint                                  | Surface 4 (history view)        | Yes                 | No (architecture ratified)                                        | PR-D                              | Spec in PR-D AccountPrefs History Contract                                                                         |
| **GAP-ADMIN-API-004**         | BFF Admin Portal API consumption map — endpoint-by-endpoint ACL + cache + scoping rules. Map authored in [`phase2-6-admin-portal-api-consumption-map.md`](phase2-6-admin-portal-api-consumption-map.md).                                                                                                   | High     | Frontend, ratified by Daniel           | Surfaces 2, 3, 5, 9, 10, 11, 13 | Yes                 | Yes (Daniel ratifies route-by-route scope)                        | PR-E                              | Daniel ratification of consumption map; then implement BFF proxy in PR-E                                           |
| **GAP-ACL-005**               | Investor-scoped ACL over Admin Portal projections + admin-only field filtering. **Phase 2.6 strategy ratified 2026-05-30: BFF-side ACL via patterns 1 + 2** (route-scoped filtering + account-filtered list filtering). Phase 3 migrates to dedicated `/api/v1/investor/*` projections.                    | Critical | Frontend (Phase 2.6), Daniel (Phase 3) | All adapter-pending surfaces    | Yes                 | No for Phase 2.6 (decision recorded); yes for Phase 3 projections | PR-E (Phase 2.6); Phase 3 backlog | Implement BFF ACL middleware + Zod redaction schemas per route in PR-E                                             |
| **GAP-RISK-BINARY-006**       | Remove REVIEW risk framing in `apps/web/app/us/app/_components/CompliancePreview.tsx` and related types.                                                                                                                                                                                                   | High     | Frontend                               | Surface 9                       | No (cleanup)        | No                                                                | PR-C                              | PR-C realignment                                                                                                   |
| **GAP-SIGNAL-ZERO-007**       | Replace `RecommendationProjection.action: "hold"` and `apps/web/app/us/app/recommendations/[id]/page.tsx:39` with neutral semantics.                                                                                                                                                                       | Medium   | Frontend                               | Surfaces 2, 3                   | No (cleanup)        | No                                                                | PR-C                              | PR-C realignment                                                                                                   |
| **GAP-LIFECYCLE-RECORDS-008** | Records Center must render via correlation spine: `correlation_id`, `action_id`, `intent_id`, `plan_id`, `order_id`, `client_order_id`, `broker_order_id`, `attempt_id`, `fill_id`, `reconciliation_run_id`.                                                                                               | High     | Frontend                               | Surface 11                      | Yes                 | No                                                                | PR-G                              | Implement spine-based Records Center in PR-G                                                                       |
| **GAP-SURFACE4-009**          | Surface 4 reframed as Account Controls Center (AccountPrefs editor + RiskLimits viewer + Consents acceptor + History viewer).                                                                                                                                                                              | High     | Frontend                               | Surface 4                       | Yes                 | No (Surface 4 scope ratified); gated on PR-D                      | PR-F                              | Implement Account Controls Center after PR-D ships AccountPrefs History Contract                                   |
| **GAP-EXCEPTION-010**         | Exception Review (Surface 10) focuses on `TradingControlStates`, blocked orders, reconciliation, broker/consent/profile gates — never risk-reject override. Investor-side `/admin-actions` verbs limited to the §13.3 allowlist.                                                                           | High     | Frontend                               | Surface 10                      | Yes                 | No (allowlist + boundary ratified)                                | PR-H                              | Implement Exception Review reframe in PR-H                                                                         |

### Conditional / Phase 3 (Daniel-ratified, not Phase 2.6 blockers)

| Gap ID                   | Description                                                                                                                                                                                                                                           | Severity   | Owner                                    | Surface impact | Production blocker?             | Daniel input needed?                                       | Target PR                                 | Next action                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------- | -------------- | ------------------------------- | ---------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| **GAP-CONTROL-INIT-011** | Investor-initiable `TradingControlStates` subset. **Ratified 2026-05-30: account-scoped self-service only** (investor pause/resume Managed, leave template, reduce-only conditional). No `halt_all`, no `halt_new_orders`, no `reconciliation_block`. | Medium     | Daniel (backend mapping) + Frontend (UI) | Surface 6      | Soft (Surface 6 exists as stub) | Yes for `reduce_only` backend-state mapping; rest ratified | PR-E + PR-H                               | Daniel maps `reduce_only`; frontend implements safe-subset toggles  |
| **GAP-CANCEL-INIT-012**  | Investor self-cancel of `pending_submit` orders. **Ratified 2026-05-30: conditional** on SEC 203A-2(e), counsel review, broker rules, lifecycle state.                                                                                                | Low–Medium | Daniel + counsel                         | Surface 13     | No                              | Yes (counsel review)                                       | Phase 3 (unless counsel approves earlier) | Do not implement yet; keep as conditional capability in Contract V3 |
| **GAP-AUDIT-PACKET-013** | Investor download of own `audit_packet`. **Ratified 2026-05-30: conditional** on authenticated session, account-scoped authorization, redaction, `RecordAccessLog` logging, retention alignment, rate limiting.                                       | Medium     | Daniel + Frontend + legal                | Surface 11     | No                              | Yes (endpoint contract, redaction schema)                  | Phase 3 (or PR-G if scoped this phase)    | Author endpoint contract + redaction schema; tests                  |

### Cleanup / cosmetic (Phase 2.6)

| Gap ID               | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Severity | Owner    | Production blocker? | Daniel input needed? | Target PR          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- | ------------------- | -------------------- | ------------------ |
| **GAP-DOCS-015**     | Phase 2.5 docs need "Superseded by Phase 2.6" headers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Low      | Frontend | No                  | No                   | This branch / PR-B |
| **GAP-TRIPWIRE-016** | Tripwire forbidden-term list update: per Contract V3 §4a/§4b scoping correction, `policy_id` / `policy_version` are **not** added to forbidden-terms (they remain legitimate BFF-owned identifiers on the BFF-signed artifact). Tripwire continues to block admin-shape items (`template.admin`, `target_account_id`, `force_rebuild`, `rebalance`, `manual_rebalance`, staff/founder review).                                                                                                                                          | Low      | Frontend | No                  | No                   | PR-C               |
| **GAP-OPENAPI-017**  | Generated OpenAPI client artifacts (`packages/api-clients/src/generated/api.ts`, `api.gen.ts`) carry V2 schemas (`RecommendationItem.action: "hold"`, `RecommendationType` with extra variants) that have **no live consumers** in `apps/web` (verified by grep). YAML spec at `packages/api-clients/openapi/refi-api.yaml:442` has `action: enum [buy, sell, hold]` — drop `hold`, add `neutral` and `rebalance`; regenerate `_openapi.gen.ts`. Hand-written `api.ts` and `api.gen.ts` left as legacy V2 vestiges; no consumer impact. | Low      | Frontend | No                  | No                   | PR-C               |

## 4. Gaps still open (no change from V2, still applicable)

| Gap ID (V2)      | Description                                       | Why still open                                                        |
| ---------------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| GAP-002          | Auth / session — BFF owns SIWE                    | Confirmed BFF-owned (`refinity-main` skeletal `auth-siwe` not active) |
| GAP-MODE-001     | Signal vs Managed tier — frontend product framing | Confirmed BFF-owned                                                   |
| GAP-MODE-003     | No investor-Accept — vacuous boundary             | Boundary holds                                                        |
| GAP-PF-002       | Investor objective profile — frontend-owned       | Confirmed BFF-owned                                                   |
| GAP-PF-005       | Eligibility composition — frontend-owned          | Confirmed BFF-owned via `BffEligibilityState`                         |
| GAP-CMP-001..006 | Compliance boundary rows                          | All vacuously aligned; tripwire holds                                 |

## 5. Severity table

| Severity | Definition                                                  | Count in V3                                                                                                                                                        |
| -------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Critical | Adapter implementation cannot proceed; SEC boundary at risk | 2 (`GAP-PREFS-HISTORY-001`, `GAP-ACL-005`)                                                                                                                         |
| High     | Blocks a named surface implementation                       | 6 (`GAP-PREFS-WRITE-002`, `GAP-PREFS-AUDIT-003`, `GAP-ADMIN-API-004`, `GAP-RISK-BINARY-006`, `GAP-LIFECYCLE-RECORDS-008`, `GAP-SURFACE4-009`, `GAP-EXCEPTION-010`) |
| Medium   | Reframing required; product can ship but degraded           | 4 (`GAP-SIGNAL-ZERO-007`, `GAP-CONTROL-INIT-011`, `GAP-AUDIT-PACKET-013`, plus minor)                                                                              |
| Low      | Cleanup / cosmetic / Daniel-side note                       | 4 (`GAP-CANCEL-INIT-012`, `GAP-DOCS-015`, `GAP-TRIPWIRE-016`, `GAP-OPENAPI-017`)                                                                                   |

## 6. Owner summary

| Owner                                            | Items                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Daniel (final ratifications already given for 6) | `GAP-PREFS-HISTORY-001` (architecture ratified; DDL pending), `GAP-ACL-005` (Phase 2.6 strategy ratified; Phase 3 projections deferred), `GAP-CONTROL-INIT-011` (subset ratified; `reduce_only` mapping pending), `GAP-CANCEL-INIT-012` (conditional), `GAP-AUDIT-PACKET-013` (conditional) |
| Frontend                                         | `GAP-RISK-BINARY-006`, `GAP-SIGNAL-ZERO-007`, `GAP-LIFECYCLE-RECORDS-008`, `GAP-SURFACE4-009`, `GAP-EXCEPTION-010`, `GAP-DOCS-015`, `GAP-TRIPWIRE-016`, `GAP-OPENAPI-017`                                                                                                                   |
| Joint                                            | `GAP-PREFS-WRITE-002`, `GAP-PREFS-AUDIT-003`, `GAP-ADMIN-API-004`                                                                                                                                                                                                                           |

## 7. Production blockers — V3 list

Removed from V2 list:

- `audit-writer` skeletal (on-chain audit; deferred)
- `compliance-adapter` skeletal (on-chain audit; deferred)

Still blockers:

- `GAP-ADMIN-API-004` — Admin Portal API consumption map ratified by Daniel
- `GAP-ACL-005` — investor-scoped BFF ACL implemented (PR-E)
- `GAP-SURFACE4-009` — Account Controls Center implementation (PR-F)
- `GAP-PREFS-HISTORY-001` / `GAP-PREFS-WRITE-002` / `GAP-PREFS-AUDIT-003` — AccountPrefs History Contract + writer (PR-D)
- `GAP-LIFECYCLE-RECORDS-008` — Records Center correlation-spine implementation (PR-G)
- `GAP-EXCEPTION-010` — Exception Review reframe (PR-H)
- Durable BFF storage (replace prototype-store for entities that remain BFF-owned)
- Production broker integration (broker connection / credential handling)
- Legal / compliance review

Soft blockers (can ship without):

- `GAP-CONTROL-INIT-011` (investor-safe controls; pending `reduce_only` mapping)
- `GAP-CANCEL-INIT-012` (investor self-cancel; counsel-gated)
- `GAP-AUDIT-PACKET-013` (investor audit-packet download; conditional)

## 8. Surface impact summary

See [`phase2-6-surface-reframing-map.md`](phase2-6-surface-reframing-map.md) for per-surface detail.

| Surface | V2 verdict      | V3 verdict                                                                         | Net change      |
| ------- | --------------- | ---------------------------------------------------------------------------------- | --------------- |
| 1       | aligned         | aligned                                                                            | unchanged       |
| 2       | adapter-pending | adapter-pending (over Admin Portal API)                                            | reshaped        |
| 3       | adapter-pending | adapter-pending (over Admin Portal API)                                            | reshaped        |
| 4       | misaligned      | **reframed as Account Controls Center** (blocked on PR-D)                          | major reshape   |
| 5       | adapter-pending | adapter-pending (`/api/v1/portfolio/*` + `POST /accounts/{id}/templates`)          | clear path      |
| 6       | aligned 1:1     | aligned (investor-initiable subset ratified; `reduce_only` mapping pending)        | refine          |
| 7       | frontend-only   | reshaped: Consent acceptance over `UserConsents`                                   | reshaped        |
| 8       | frontend-only   | reshaped: Profile reactivation gated on `account.intent.ready`                     | reshaped        |
| 9       | adapter-pending | new `BffEligibilityState` model (REVIEW is BFF-owned)                              | reshaped        |
| 10      | adapter-pending | **reframed**: control state + blocked orders + reconciliation, never risk-clearing | major reshape   |
| 11      | adapter-pending | correlation-spine-based, sourced from Admin Portal lifecycle endpoints             | clear path      |
| 12      | aligned         | aligned                                                                            | unchanged       |
| 13      | adapter-pending | adapter-pending; investor-scoped `Orders` / `OrderEvents` / `Fills` projection     | clear path      |
| 14      | aligned         | aligned                                                                            | unchanged       |
| 15      | aligned         | aligned (tripwire term updates per `GAP-TRIPWIRE-016`)                             | minor cleanup   |
| 16      | aligned         | aligned (test additions per Contract V3 §12)                                       | minor additions |

## 9. Scope lock

No backend changes. No frontend product code changes from this doc alone. No SEC 203A-2(e) boundary weakened. No new product surface added beyond Surface 4 reframing. Surface 4 implementation remains blocked pending PR-D.
