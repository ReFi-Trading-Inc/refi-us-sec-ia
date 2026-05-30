# Phase 2.6 Gap Register V3 Plan

**Date:** 2026-05-30
**Source of truth:** [`phase2-6-authoritative-source-of-truth.md`](phase2-6-authoritative-source-of-truth.md)
**Supersedes:** [`phase2-5-gap-register-v2-against-gitlab.md`](phase2-5-gap-register-v2-against-gitlab.md) (V2).
**Status:** **Plan** for Gap Register V3. Detailed authoring happens in PR-B.

> **Status update (2026-05-30):** Final Gap Register V3 has been authored in [`docs/phase2-6-gap-register-v3-against-authoritative.md`](phase2-6-gap-register-v3-against-authoritative.md). This plan is retained as planning evidence.

This doc enumerates the gap-classification changes from V2 → V3 driven by Daniel's authoritative docs. New gaps, closed gaps, reclassified gaps, owners, severity, surface impact, next action.

---

## 1. Gaps closed by Daniel's answers

| Gap ID (V2)      | Gap (V2 description)                    | Resolution                                                               |
| ---------------- | --------------------------------------- | ------------------------------------------------------------------------ |
| GAP-REC-003      | REVIEW verdict had no Daniel equivalent | Closed — risk is binary; REVIEW is BFF-owned non-risk gates              |
| GAP-REC-004      | DENY verdict had no Daniel equivalent   | Closed — risk is binary; `risk.rejected` is DENY                         |
| GAP-REC-005      | ALLOW verdict had no Daniel equivalent  | Closed — `risk.approved` is ALLOW                                        |
| GAP-TEMPLATE-001 | `template_id` registry shape unknown    | Closed — Spanner tables + `/api/v1/portfolio/*` Admin Portal projections |
| GAP-SIGNAL0-001  | `signal: 0` preservation unconfirmed    | Closed — preserved; neutral, never auto-closes                           |
| GAP-MODE-004     | ExecutionPolicy ownership unresolved    | Closed — does not exist; new AccountPrefs History gap opens              |
| GAP-EX-002       | ExecutionPolicy is frontend-side only   | Closed — confirmed no backend equivalent; reframe Surface 4              |

## 2. Gaps reclassified

| Gap ID (V2)         | V2 classification                                    | V3 classification                                                                                                                          | Reason                                                                                                  |
| ------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| GAP-AUDIT-001       | `audit-writer` is skeletal, production blocker       | **Not a production blocker for frontend shell** — on-chain audit summary infra; deferred                                                   | Daniel clarified; basic auditability already in lifecycle services                                      |
| GAP-COMPLY-001      | `compliance-adapter` is skeletal, production blocker | **Not a production blocker for frontend shell** — on-chain audit summary infra; deferred                                                   | Same                                                                                                    |
| GAP-EX-003          | Broker submission missing on Daniel                  | Closed — `trade-manager` + `Orders` + `OrderEvents` + `Fills` Spanner tables + `/api/v1/execution/orders/*` Admin Portal routes            | Verified at `apps/admin-portal/backend/api/execution.py:1307,1546,1762,1943`                            |
| GAP-EX-004          | Exception Review missing on Daniel                   | Reclassified to GAP-EXCEPTION-010 — Exception Review reframing                                                                             | Backend has the source data (control states, blocked orders, reconciliation); frontend needs to reframe |
| GAP-EX-005          | Record artifacts mismatched                          | Closed — Spanner trade-lifecycle tables are real; correlation spine documented in `trade_auditability_contract.md`                         | Frontend Records Center moves to spine-based; tracked as GAP-LIFECYCLE-RECORDS-008                      |
| GAP-MULTISTREAM-001 | Multi-stream aggregation policy undefined            | Closed — backend canonicalizes via `AccountIntents.legs.stream_contributions` and `legs.source_streams`; frontend reads, doesn't aggregate | Frontend `aggregation_status` enum drops in V3                                                          |
| GAP-CORRELATION-001 | Correlation spine to preserve                        | Closed — spine canonical in `trade_auditability_contract.md:71-89`                                                                         | Frontend Records Center implementation uses it                                                          |
| GAP-CONTROL-001     | `TradingControlStates` produce blocked states        | Reclassified into Exception Review reframing (GAP-EXCEPTION-010) and Pause/Resume control toggles (GAP-CONTROL-INIT-011)                   | Two distinct frontend concerns                                                                          |
| GAP-RECON-001       | `TradeReconciliationRuns/Discrepancies` exist        | Closed — `/api/v1/ops/reconciliation/discrepancies` routes exist; surface 10 + 11 consume                                                  | Verified at `apps/admin-portal/backend/api/ops.py:697,766,785`                                          |

## 3. New gaps opened by V3

### Critical (Phase 2.6 must address before adapter implementation)

| Gap ID                        | Description                                                                                                                                                        | Severity     | Owner                                                                                                          | Surface impact                      | Next action                                                                                                         | Production blocker? |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | -------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------- |
| **GAP-PREFS-HISTORY-001**     | `AccountPrefs` history table or append ledger does not exist anywhere; frontend ask to build it (Daniel's request)                                                 | **Critical** | Daniel + frontend (joint design)                                                                               | Surface 4 (Account Controls Center) | Draft [`phase2-6-account-prefs-history-options.md`](phase2-6-account-prefs-history-options.md), confirm with Daniel | Yes                 |
| **GAP-PREFS-WRITE-002**       | `AccountPrefs` write procedure not yet defined (which knobs are investor-editable; what guards; idempotency)                                                       | **High**     | Daniel + frontend (joint design)                                                                               | Surface 4                           | Same as GAP-PREFS-HISTORY-001                                                                                       | Yes                 |
| **GAP-PREFS-AUDIT-003**       | Preference-change proof (signed by investor) and history view (investor-readable) missing                                                                          | **High**     | Frontend, with backend for proof anchor                                                                        | Surface 4 (history view)            | Spec in `phase2-6-account-prefs-history-options.md` §SEC-impl                                                       | Yes                 |
| **GAP-ADMIN-API-004**         | BFF Admin Portal API consumption map needed; endpoint-by-endpoint ACL + cache + scoping rules                                                                      | **High**     | Frontend, ratified by Daniel                                                                                   | Surfaces 2, 3, 5, 9, 10, 11, 13     | [`phase2-6-admin-portal-api-consumption-map.md`](phase2-6-admin-portal-api-consumption-map.md) draft, Daniel review | Yes                 |
| **GAP-ACL-005**               | Investor-scoped ACL over Admin Portal projections; admin-only field filtering                                                                                      | **Critical** | Frontend + backend coordination (does Daniel ship `/api/v1/investor/*` projections or do we add a BFF filter?) | All adapter-pending surfaces        | Daniel choice between proxy-with-filter and dedicated investor projection                                           | Yes                 |
| **GAP-RISK-BINARY-006**       | Old REVIEW risk framing in `apps/web/app/us/app/_components/CompliancePreview.tsx` and related types must be removed                                               | **High**     | Frontend                                                                                                       | Surface 9                           | PR-C realignment                                                                                                    | No (cleanup)        |
| **GAP-SIGNAL-ZERO-007**       | Old "hold" framing in `RecommendationProjection.action: "hold"` and `apps/web/app/us/app/recommendations/[id]/page.tsx:39` must be replaced with neutral semantics | **Medium**   | Frontend                                                                                                       | Surfaces 2, 3                       | PR-C realignment                                                                                                    | No (cleanup)        |
| **GAP-LIFECYCLE-RECORDS-008** | Records Center must move to correlation-spine-based rendering                                                                                                      | **High**     | Frontend                                                                                                       | Surface 11                          | PR-G implementation                                                                                                 | Yes                 |
| **GAP-SURFACE4-009**          | Surface 4 must be reframed as Account Controls Center (AccountPrefs editor + RiskLimits viewer + Consents acceptor + History viewer)                               | **High**     | Frontend                                                                                                       | Surface 4                           | PR-F implementation, gated on GAP-PREFS-\* resolution                                                               | Yes                 |
| **GAP-EXCEPTION-010**         | Exception Review (Surface 10) must focus on `TradingControlStates`, blocked orders, reconciliation, broker/consent/profile gates — not risk-reject override        | **High**     | Frontend                                                                                                       | Surface 10                          | PR-H implementation                                                                                                 | Yes                 |

### Important (Phase 2.6 ratify, Phase 3 may resolve)

| Gap ID                     | Description                                                                                                                               | Severity   | Owner                              | Surface impact           | Next action                                                      | Production blocker?                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------- | ------------------------ | ---------------------------------------------------------------- | --------------------------------------- |
| **GAP-CONTROL-INIT-011**   | Which `TradingControlStates` modes are investor-initiable (e.g. self-pause via `reduce_only`) vs operator-only?                           | Medium     | Daniel                             | Surface 6 (Pause/Resume) | Daniel ratifies; frontend implements toggles for the safe subset | Soft — Surface 6 exists as a stub today |
| **GAP-CANCEL-INIT-012**    | Can an investor self-cancel a still-`pending_submit` order? (Backend exposes `POST /api/v1/operations/cancel-order` — operator-flavoured) | Low–medium | Daniel                             | Surface 13               | Daniel ratifies; if yes, design investor-scoped variant          | No                                      |
| **GAP-AUDIT-PACKET-013**   | Audit packet export (`audit_packet` model in `trade_auditability_contract.md`) — investor entitlement to download their own packet?       | Medium     | Daniel + legal                     | Surface 11 (Records)     | Specs deferred to Phase 3                                        | No                                      |
| **GAP-TRAINING-TOPIC-014** | `admin-portal` publishes `training.requested` (unprefixed); scheduler subscribes to `dev-training.requested` (prefixed)                   | Low        | Daniel's backend (not our concern) | None                     | Note only; Daniel cleanup item                                   | No                                      |

### Cosmetic / cleanup (Phase 2.6)

| Gap ID               | Description                                                                                                                                                                                   | Severity | Owner    | Next action |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- | ----------- |
| **GAP-DOCS-015**     | Phase 2.5 docs need "Superseded by Phase 2.6" headers                                                                                                                                         | Low      | Frontend | This branch |
| **GAP-TRIPWIRE-016** | Tripwire forbidden-term list update: `policy_id` / `policy_version` no longer forbidden in BFF code (they don't exist anywhere); admin-shape items remain forbidden                           | Low      | Frontend | PR-C        |
| **GAP-OPENAPI-017**  | Generated OpenAPI client (`packages/api-clients/src/generated/api.ts` + `api.gen.ts`) carries `execution_policy_id`, `execution_policy_version`, `strategy_id` — regenerate from updated yaml | Low      | Frontend | PR-C        |

## 4. Gaps still open (no change from V2, still applicable)

| Gap ID (V2)      | Description                                                  | Why still open                                                                                                    |
| ---------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| GAP-002          | Auth / session — BFF owns SIWE; backend doesn't              | Confirmed correct; remains BFF-owned (`refinity-main` has skeletal `auth-siwe` but it's not the active auth path) |
| GAP-MODE-001     | Signal vs Managed tier — frontend product framing            | Confirmed correct; remains BFF-owned                                                                              |
| GAP-MODE-003     | No investor-Accept — vacuous boundary                        | Boundary still holds                                                                                              |
| GAP-PF-002       | Investor objective profile — frontend-owned                  | Confirmed; remains BFF-owned                                                                                      |
| GAP-PF-005       | Eligibility composition — frontend-owned regulatory boundary | Confirmed; remains BFF-owned via `BffEligibilityState`                                                            |
| GAP-CMP-001..006 | Compliance boundary rows                                     | All vacuously aligned; tripwire holds                                                                             |

## 5. Severity table

| Severity     | Definition                                                                                 | Count in V3                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| **Critical** | Adapter implementation cannot proceed; SEC boundary at risk; new product behavior blocking | 3 (GAP-PREFS-HISTORY-001, GAP-ACL-005, plus the joint product-design urgency on GAP-ADMIN-API-004) |
| **High**     | Blocks a named surface implementation                                                      | 6                                                                                                  |
| **Medium**   | Reframing required; product can ship but UX degraded                                       | 4                                                                                                  |
| **Low**      | Cleanup / cosmetic / Daniel's-side note                                                    | 4                                                                                                  |

## 6. Owner summary

| Owner    | New / open items                                   | Items                                                                                                                                                     |
| -------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Daniel   | 5 (decisions needed before adapter implementation) | GAP-PREFS-HISTORY-001, GAP-ACL-005, GAP-CONTROL-INIT-011, GAP-CANCEL-INIT-012, GAP-AUDIT-PACKET-013                                                       |
| Frontend | 8 (PR work)                                        | GAP-RISK-BINARY-006, GAP-SIGNAL-ZERO-007, GAP-LIFECYCLE-RECORDS-008, GAP-SURFACE4-009, GAP-EXCEPTION-010, GAP-DOCS-015, GAP-TRIPWIRE-016, GAP-OPENAPI-017 |
| Joint    | 4                                                  | GAP-PREFS-WRITE-002, GAP-PREFS-AUDIT-003, GAP-ADMIN-API-004, GAP-PREFS-HISTORY-001                                                                        |

## 7. Production blockers — V3 list

**Removed from V2 list** (per Daniel's clarification):

- `audit-writer` skeletal
- `compliance-adapter` skeletal

**Confirmed still blockers**:

- Adapter implementation against Admin Portal API (GAP-ADMIN-API-004)
- Investor-scoped ACL (GAP-ACL-005)
- Account Controls Center implementation (GAP-SURFACE4-009)
- AccountPrefs history (GAP-PREFS-HISTORY-001, GAP-PREFS-WRITE-002, GAP-PREFS-AUDIT-003)
- Records Center lifecycle-spine implementation (GAP-LIFECYCLE-RECORDS-008)
- Exception Review reframing (GAP-EXCEPTION-010)
- Durable BFF storage (replace prototype-store for entities that remain BFF-owned)
- Production broker integration (broker connection / credential handling)
- Legal / compliance review

**Soft blockers** (can ship without; Surface 6 / 13 currently exist as stubs):

- GAP-CONTROL-INIT-011 (investor-safe trading controls)
- GAP-CANCEL-INIT-012 (investor self-cancel)
- GAP-AUDIT-PACKET-013 (investor audit packet download)

## 8. Surface impact summary

See [`phase2-6-surface-reframing-map.md`](phase2-6-surface-reframing-map.md) for per-surface detail. Quick view:

| Surface | V2 verdict      | V3 verdict                                                                             | Net change      |
| ------- | --------------- | -------------------------------------------------------------------------------------- | --------------- |
| 1       | aligned         | aligned                                                                                | unchanged       |
| 2       | adapter-pending | adapter-pending (over Admin Portal API)                                                | reshaped        |
| 3       | adapter-pending | adapter-pending (over Admin Portal API)                                                | reshaped        |
| 4       | misaligned      | **reframed as Account Controls Center**                                                | major reshape   |
| 5       | adapter-pending | adapter-pending (over `/api/v1/portfolio/templates` + `POST /accounts/{id}/templates`) | clear path      |
| 6       | aligned 1:1     | aligned (pending investor-initiability subset; GAP-CONTROL-INIT-011)                   | refine          |
| 7       | frontend-only   | reshaped: Consent acceptance over `UserConsents`                                       | reshaped        |
| 8       | frontend-only   | reshaped: Profile reactivation gated on `account.intent.ready` consumer signal         | reshaped        |
| 9       | adapter-pending | new `BffEligibilityState` model (REVIEW is BFF-owned)                                  | reshaped        |
| 10      | adapter-pending | **reframed**: control state + blocked orders + reconciliation, not risk-clearing       | major reshape   |
| 11      | adapter-pending | correlation-spine-based, sourced from Admin Portal lifecycle endpoints                 | clear path      |
| 12      | aligned         | aligned                                                                                | unchanged       |
| 13      | adapter-pending | adapter-pending; investor-scoped `Orders` / `OrderEvents` / `Fills` projection         | clear path      |
| 14      | aligned         | aligned                                                                                | unchanged       |
| 15      | aligned         | aligned (with tripwire term updates per GAP-TRIPWIRE-016)                              | minor cleanup   |
| 16      | aligned         | aligned (test additions per Contract V3 plan §12)                                      | minor additions |

## 9. Scope lock

No backend changes. No frontend product code changes from this doc alone. No SEC 203A-2(e) boundary weakened. No new product surface added beyond the Surface 4 reframing (which is a rename + scope change, not a new surface).
