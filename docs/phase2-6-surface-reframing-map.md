# Phase 2.6 Surface Reframing Map

**Date:** 2026-05-30
**Source of truth:** [`phase2-6-authoritative-source-of-truth.md`](phase2-6-authoritative-source-of-truth.md)
**Status:** Per-surface map of how Phase 2.6 reshapes each of the 16 product surfaces against the authoritative backend.

Each surface row records: current name, new name (if changed), status, backend anchor, frontend anchor, BFF route impact, prototype-store impact, stale assumptions, required docs/types/tests updates, whether implementation is blocked, and the blocker reason.

---

## Surface 1 — Signal vs Managed mode

| Field                   | Value                                                         |
| ----------------------- | ------------------------------------------------------------- |
| Phase 2.5 name          | Signal vs Managed mode                                        |
| Phase 2.6 name          | Signal vs Managed mode                                        |
| Status                  | **aligned — no change**                                       |
| Backend anchor          | None — frontend product framing (backend is mode-agnostic)    |
| Frontend anchor         | `apps/web/app/us/app/home/page.tsx`, `mode-branching.spec.ts` |
| BFF route impact        | `/api/v1/investor/subscription-mode` retained                 |
| Prototype-store impact  | `subscription-mode.ts` retained (KEEP)                        |
| Stale assumptions       | None                                                          |
| Required docs update    | None                                                          |
| Required type update    | None                                                          |
| Required test update    | None                                                          |
| Implementation blocked? | No                                                            |
| Blocker reason          | —                                                             |

---

## Surface 2 — Recommendations list

| Field                   | Value                                                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Phase 2.5 name          | Recommendations list                                                                                                              |
| Phase 2.6 name          | Recommendations list                                                                                                              |
| Status                  | **reshape — consume Admin Portal projections**                                                                                    |
| Backend anchor          | `AccountIntents` via `/api/v1/risk/intents` and `/api/v1/accounts/{id}/flow`; live tail via `/api/v1/stream`                      |
| Frontend anchor         | `apps/web/app/us/app/recommendations/page.tsx`                                                                                    |
| BFF route impact        | `/api/v1/investor/recommendations` becomes a thin proxy + investor-scope ACL over `/api/v1/risk/intents` filtered by `account_id` |
| Prototype-store impact  | `recommendation-projection.ts` reshapes to `AccountIntentLegProjection`; entity reclassified MIGRATE (backend-owned via proxy)    |
| Stale assumptions       | `RecommendationProjection.action: "hold"` (GAP-SIGNAL-ZERO-007); `strategy_id` references                                         |
| Required docs update    | Update Contract V3 examples in PR-B                                                                                               |
| Required type update    | Replace `RecommendationProjection` with `AccountIntentLegProjection` (PR-C)                                                       |
| Required test update    | `recommendations.spec.ts` — assert no "hold" affordance for `signal: 0`; assert per-trade Accept absence remains                  |
| Implementation blocked? | Yes (until PR-B + PR-C + PR-E land)                                                                                               |
| Blocker reason          | Contract V3 + frontend type realignment + Admin Portal proxy                                                                      |

---

## Surface 3 — Recommendation detail

| Field                   | Value                                                                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 2.5 name          | Recommendation detail                                                                                                                                                         |
| Phase 2.6 name          | Recommendation detail                                                                                                                                                         |
| Status                  | **reshape — consume Admin Portal projections + correlation spine**                                                                                                            |
| Backend anchor          | `AccountIntents` (intent shape), `RiskSnapshots` (verdict), `ExecutionPlans` (if Managed + approved), `Orders` + `Fills` (if executed)                                        |
| Frontend anchor         | `apps/web/app/us/app/recommendations/[id]/page.tsx`                                                                                                                           |
| BFF route impact        | `/api/v1/investor/recommendations/[id]` proxies `/api/v1/risk/intents/{intent_id}` + joins lifecycle endpoints                                                                |
| Prototype-store impact  | Replace `recommendation-projection.ts` with `AccountIntentLegProjection`; `decision-record.ts` migrates to point at `RiskSnapshots.snapshot_hash`                             |
| Stale assumptions       | `action !== "hold"` actionability check (line 39); `EligibilityCheck.status: REVIEW` framing in compliance preview component                                                  |
| Required docs update    | Contract V3; correlation spine rendering rules                                                                                                                                |
| Required type update    | `RecommendationDetailProjection` introducing the joined view                                                                                                                  |
| Required test update    | E2E `recommendations.spec.ts` — assert correlation IDs render; assert no per-trade Accept; assert risk-rejected projections show terminal status (no clear-review affordance) |
| Implementation blocked? | Yes                                                                                                                                                                           |
| Blocker reason          | Contract V3 + Admin Portal proxy + correlation-spine renderer                                                                                                                 |

---

## Surface 4 — Automation Center → **Account Controls Center**

| Field                   | Value                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Phase 2.5 name          | Automation Center / Execution Policy                                                                                                                                                                                                                                                                              |
| Phase 2.6 name          | **Account Controls Center**                                                                                                                                                                                                                                                                                       |
| Status                  | **major reframing — `ExecutionPolicy` does not exist**                                                                                                                                                                                                                                                            |
| Backend anchor          | `AccountPrefs` (write), `RiskLimits` (read-only display), `UserConsents` (acceptance flow), `TradingControlStates` (read-only); new `AccountPrefsHistory` (Phase 2.6 scope)                                                                                                                                       |
| Frontend anchor         | `apps/web/app/us/app/settings/automation/page.tsx` — to be rewritten                                                                                                                                                                                                                                              |
| BFF route impact        | **Drop** `/api/v1/investor/execution-policy`, `/execution-policy/draft`, `/execution-policy/activate`. **Add** `/api/v1/investor/account-prefs` (GET, PATCH), `/api/v1/investor/account-prefs/history` (GET), `/api/v1/investor/consents` (GET, POST acceptance), `/api/v1/investor/risk-limits` (GET, read-only) |
| Prototype-store impact  | **Delete** `execution-policy.ts`, `execution-policy-draft.ts`. **Add** `account-prefs-history.ts` ledger entity. `managed-execution-state.ts` reshapes against `TradingControlStates`                                                                                                                             |
| Stale assumptions       | Entire surface                                                                                                                                                                                                                                                                                                    | (GAP-SURFACE4-009) |
| Required docs update    | `phase2-6-account-prefs-history-options.md` + Contract V3 §4 (AccountPrefs / Consent / History objects)                                                                                                                                                                                                           |
| Required type update    | Drop `ExecutionPolicy*` types from `packages/api-clients/src/generated/api*`; drop `useExecutionPolicy*` hooks; add `AccountPrefs*` hooks                                                                                                                                                                         |
| Required test update    | `automation-center.spec.ts` — full rewrite for the reframed surface; new `account-prefs-history.spec.ts`                                                                                                                                                                                                          |
| Implementation blocked? | **Yes — design-track blocked on Daniel ACL + AccountPrefs History agreement; implementation blocked on PR-B + PR-D + PR-E**                                                                                                                                                                                       |
| Blocker reason          | New scope `GAP-PREFS-HISTORY-001` + `GAP-ACL-005`                                                                                                                                                                                                                                                                 |

---

## Surface 5 — Managed activation

| Field                   | Value                                                                                                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 2.5 name          | Managed activation                                                                                                                                                                                 |
| Phase 2.6 name          | Managed activation                                                                                                                                                                                 |
| Status                  | **reshape — consume template registry + AccountTemplates join**                                                                                                                                    |
| Backend anchor          | `GET /api/v1/portfolio/templates` + `/memberships` + `/rules` (template picker); `POST /api/v1/accounts/{account_id}/templates` (activation); `UserConsents` (acceptance of activation disclosure) |
| Frontend anchor         | `apps/web/app/us/onboarding/activation/page.tsx`, `apps/web/app/us/app/settings/automation/activate/page.tsx`                                                                                      |
| BFF route impact        | `/api/v1/investor/managed/activate` proxies `POST /api/v1/accounts/{id}/templates`; add `/api/v1/investor/templates` for the picker                                                                |
| Prototype-store impact  | `activation-idempotency.ts` migrates to the new flow; `disclosure-document.ts` reshapes against `UserConsents`                                                                                     |
| Stale assumptions       | `executionPolicy` activation flow; `strategy_id` selection                                                                                                                                         |
| Required docs update    | Contract V3 `TemplateDescriptor` + `ConsentAcceptance`                                                                                                                                             |
| Required type update    | `TemplateDescriptor`; drop `strategy_id`                                                                                                                                                           |
| Required test update    | `managed-activation.spec.ts` — consume mocked `/api/v1/portfolio/templates` response; assert template_id-based activation                                                                          |
| Implementation blocked? | Yes                                                                                                                                                                                                |
| Blocker reason          | Contract V3 + Admin Portal proxy + ACL design                                                                                                                                                      |

---

## Surface 6 — Pause / Resume Managed

| Field                   | Value                                                                                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 2.5 name          | Pause / Resume Managed                                                                                                                                                                                         |
| Phase 2.6 name          | Pause / Resume Managed                                                                                                                                                                                         |
| Status                  | **aligned with refinement**                                                                                                                                                                                    |
| Backend anchor          | `TradingControlStates` + `TradingControlEvents` (the actual state); `account.admin pause_autopilot / resume_autopilot` (Phase 2.5 finding — verify investor-initiability with Daniel via GAP-CONTROL-INIT-011) |
| Frontend anchor         | `apps/web/app/us/app/settings/automation/page.tsx` Pause/Resume section, `apps/web/e2e/managed-pause-resume.spec.ts`                                                                                           |
| BFF route impact        | `/api/v1/investor/managed/pause`, `/managed/resume` retained but reshape to call backend's `account.admin` (per GAP-CONTROL-INIT-011 ratification)                                                             |
| Prototype-store impact  | `managed-execution-state.ts` reshapes to read from `TradingControlStates`                                                                                                                                      |
| Stale assumptions       | Local-only state representation; needs to mirror backend control state                                                                                                                                         |
| Required docs update    | Contract V3 `ControlStateProjection` + Daniel ratification of investor-safe modes                                                                                                                              |
| Required type update    | `ControlStateProjection` + reshape `managed-execution-state.ts`                                                                                                                                                |
| Required test update    | `managed-pause-resume.spec.ts` — assert state matches backend `TradingControlStates` projection                                                                                                                |
| Implementation blocked? | Soft block — needs Daniel ratification of which control modes are investor-initiable                                                                                                                           |
| Blocker reason          | GAP-CONTROL-INIT-011                                                                                                                                                                                           |

---

## Surface 7 — Disclosure re-acknowledgement

| Field                   | Value                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Phase 2.5 name          | Disclosure re-acknowledgement                                                                                              |
| Phase 2.6 name          | Consent re-acknowledgement                                                                                                 |
| Status                  | **reshape — Consent over `UserConsents`**                                                                                  |
| Backend anchor          | `UserConsents` (versioned acceptance evidence), `AccountConsents`                                                          |
| Frontend anchor         | `apps/web/app/us/app/settings/automation/disclosures/page.tsx`, `disclosure-reack.spec.ts`                                 |
| BFF route impact        | `/api/v1/investor/disclosures/reacknowledge` retained; reshape to write `UserConsents` rows                                |
| Prototype-store impact  | `disclosure-acknowledgement.ts` reshapes to `ConsentAcceptance`; `disclosure-document.ts` reshapes to `ConsentRequirement` |
| Stale assumptions       | `policy_version` references                                                                                                |
| Required docs update    | Contract V3 `ConsentAcceptance` + `ConsentRequirement`                                                                     |
| Required type update    | `ConsentAcceptance`, `ConsentRequirement`                                                                                  |
| Required test update    | `disclosure-reack.spec.ts` — assert IP/UA-hash captured per `UserConsents` schema                                          |
| Implementation blocked? | Yes (Contract V3)                                                                                                          |
| Blocker reason          | Contract V3                                                                                                                |

---

## Surface 8 — Profile staleness / reactivation

| Field                   | Value                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Phase 2.5 name          | Profile staleness / reactivation                                                                                   |
| Phase 2.6 name          | Profile staleness / reactivation                                                                                   |
| Status                  | **reshape — gated on backend account.intent.ready signal**                                                         |
| Backend anchor          | None directly; BFF-owned. May surface from `AccountIntents.blocked_reason = "stale_profile"` if backend ever emits |
| Frontend anchor         | `apps/web/app/us/app/settings/automation/profile/page.tsx`, `profile-reactivation.spec.ts`                         |
| BFF route impact        | Retained; reshape blocker triggers per backend signals once available                                              |
| Prototype-store impact  | `advisory-profile.ts`, `profile-confirmation.ts` retained (KEEP)                                                   |
| Stale assumptions       | None major                                                                                                         |
| Required docs update    | Contract V3 references                                                                                             |
| Required type update    | Minor                                                                                                              |
| Required test update    | `profile-reactivation.spec.ts` — current already correct; add note about backend gate                              |
| Implementation blocked? | No (surface is stable)                                                                                             |
| Blocker reason          | —                                                                                                                  |

---

## Surface 9 — Eligibility presentation

| Field                   | Value                                                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 2.5 name          | Eligibility presentation                                                                                                                        |
| Phase 2.6 name          | Eligibility presentation                                                                                                                        |
| Status                  | **reshape — `BffEligibilityState` model**                                                                                                       |
| Backend anchor          | `RiskSnapshots` (binary verdict), `UserConsents` (consent gates), `TradingControlStates` (control gates), `AccountSettings` (broker connection) |
| Frontend anchor         | `apps/web/app/us/app/_components/CompliancePreview.tsx`                                                                                         |
| BFF route impact        | `/api/v1/investor/dashboard`, `/status` evolve to compose `BffEligibilityState`                                                                 |
| Prototype-store impact  | None directly; eligibility is composed at request time                                                                                          |
| Stale assumptions       | `EligibilityCheck.status: REVIEW` framing being clearable; `policy_version` reference in shape                                                  |
| Required docs update    | Contract V3 `BffEligibilityState`                                                                                                               |
| Required type update    | Drop `EligibilityCheck` ternary on risk path; add `BffEligibilityState`                                                                         |
| Required test update    | New E2E: assert risk-rejected never renders clear-review; assert BFF REVIEW renders for non-risk gates                                          |
| Implementation blocked? | Yes (Contract V3)                                                                                                                               |
| Blocker reason          | Contract V3 + Admin Portal proxy                                                                                                                |

---

## Surface 10 — Exception Review

| Field                   | Value                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 2.5 name          | Exception Review                                                                                                                                                          |
| Phase 2.6 name          | Exception Review                                                                                                                                                          |
| Status                  | **major reframing — focus on controls + blocked orders + reconciliation, not risk-clear**                                                                                 |
| Backend anchor          | `TradingControlStates`, `GET /api/v1/orders/blocked`, `TradeReconciliationDiscrepancies`, `AccountSettings` (broker connection state), `AccountIntents.blocked_reason`    |
| Frontend anchor         | `apps/web/app/us/app/exceptions/page.tsx`                                                                                                                                 |
| BFF route impact        | `/api/v1/investor/exceptions` reshaped; resolution route per source kind                                                                                                  |
| Prototype-store impact  | `exception-review.ts` reshapes: drop `out_of_policy_intent` (was risk-clear); add `control_state_blocking`, `reconciliation_discrepancy`, `blocked_order` exception kinds |
| Stale assumptions       | Risk-reject clearable framing; existing `out_of_policy_intent` kind reframed to record-only                                                                               |
| Required docs update    | Contract V3 `ExceptionSource` union                                                                                                                                       |
| Required type update    | Reshape `ExceptionReview` entity to new `ExceptionSource` union                                                                                                           |
| Required test update    | `exception-review.spec.ts` — rewrite resolution paths per source kind; assert risk-rejects don't appear                                                                   |
| Implementation blocked? | Yes                                                                                                                                                                       |
| Blocker reason          | GAP-EXCEPTION-010 + Contract V3 + Admin Portal proxy                                                                                                                      |

---

## Surface 11 — Records Center

| Field                   | Value                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 2.5 name          | Records Center                                                                                                                                                                                                                                                                                                                  |
| Phase 2.6 name          | Records Center                                                                                                                                                                                                                                                                                                                  |
| Status                  | **major reshape — correlation-spine-based**                                                                                                                                                                                                                                                                                     |
| Backend anchor          | The full correlation spine over `AccountIntents`, `RiskSnapshots`, `ExecutionPlans`, `Orders`, `OrderEvents`, `BrokerOrderAttempts`, `BrokerInteractionsLog`, `Fills`, `Positions`, `PositionSnapshots`, `TradeInputSnapshots`, `TradeReconciliationRuns`, `TradeReconciliationDiscrepancies`, `UiEventTimeline`, `AuditEvents` |
| Frontend anchor         | `apps/web/app/us/app/documents/page.tsx`, `apps/web/app/api/v1/investor/records/*`                                                                                                                                                                                                                                              |
| BFF route impact        | `/api/v1/investor/records` evolves to expose correlation-spine search by `correlation_id` / `intent_id` / `action_id` / `order_id` / `fill_id`                                                                                                                                                                                  |
| Prototype-store impact  | `decision-record.ts` reshapes to point at backend `RiskSnapshots.snapshot_hash`; `lifecycle.ts` reshapes against canonical lifecycle objects                                                                                                                                                                                    |
| Stale assumptions       | Invented record model — replaced by spine projections                                                                                                                                                                                                                                                                           |
| Required docs update    | Contract V3 §10 correlation spine; Records Center rendering rules                                                                                                                                                                                                                                                               |
| Required type update    | `OrderLifecycleProjection` + spine-aware record render types                                                                                                                                                                                                                                                                    |
| Required test update    | New E2E for spine search; assert `correlation_id` deep-link                                                                                                                                                                                                                                                                     |
| Implementation blocked? | Yes                                                                                                                                                                                                                                                                                                                             |
| Blocker reason          | GAP-LIFECYCLE-RECORDS-008 + Contract V3 + Admin Portal proxy                                                                                                                                                                                                                                                                    |

---

## Surface 12 — Support boundary

| Field                   | Value                                                     |
| ----------------------- | --------------------------------------------------------- |
| Phase 2.5 name          | Support boundary                                          |
| Phase 2.6 name          | Support boundary                                          |
| Status                  | **aligned — no change**                                   |
| Backend anchor          | None — investor-side support boundary, ticket sink TBD    |
| Frontend anchor         | `apps/web/app/us/app/support/page.tsx`, `support.spec.ts` |
| BFF route impact        | `/api/us/support` retained                                |
| Prototype-store impact  | None                                                      |
| Stale assumptions       | None                                                      |
| Required docs update    | None                                                      |
| Required type update    | None                                                      |
| Required test update    | None                                                      |
| Implementation blocked? | No                                                        |
| Blocker reason          | —                                                         |

---

## Surface 13 — Broker submission path

| Field                   | Value                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 2.5 name          | Broker submission path                                                                                                                                                                |
| Phase 2.6 name          | Broker submission path                                                                                                                                                                |
| Status                  | **reshape — consume `Orders` lifecycle projection**                                                                                                                                   |
| Backend anchor          | `Orders`, `OrderEvents`, `BrokerOrderAttempts`, `BrokerInteractionsLog`, `Fills` via `/api/v1/execution/orders/{id}`, `/api/v1/orders/{id}`, `/api/v1/broker-interactions/{order_id}` |
| Frontend anchor         | `apps/web/app/api/v1/investor/orders/[client_order_id]/lineage/route.ts`, future broker-submission UI                                                                                 |
| BFF route impact        | `/api/v1/investor/orders/[client_order_id]/lineage` proxies the Admin Portal lifecycle endpoints with account-scoping                                                                 |
| Prototype-store impact  | `brokerage-connection.ts` retained (broker credentials still BFF-owned for UI flow); `lifecycle.ts` reshapes                                                                          |
| Stale assumptions       | Invented `BrokerSubmission` model — replaced by `OrderLifecycleProjection`                                                                                                            |
| Required docs update    | Contract V3 `OrderLifecycleProjection` + 15-state OrderStatus                                                                                                                         |
| Required type update    | `OrderLifecycleProjection` + `OrderStatus` enum (canonical from `apps/common/trade_lifecycle/states.py`)                                                                              |
| Required test update    | E2E coverage for lineage view; assert SSE stream from `/api/v1/stream` is filtered to investor's account                                                                              |
| Implementation blocked? | Yes (Contract V3)                                                                                                                                                                     |
| Blocker reason          | Contract V3 + Admin Portal proxy                                                                                                                                                      |

---

## Surface 14 — Admin boundary

| Field                   | Value                                                                            |
| ----------------------- | -------------------------------------------------------------------------------- |
| Phase 2.5 name          | Admin boundary                                                                   |
| Phase 2.6 name          | Admin boundary                                                                   |
| Status                  | **aligned — no change**                                                          |
| Backend anchor          | None — boundary is the absence of admin                                          |
| Frontend anchor         | `scripts/tripwire-investor-boundary.ts`, `apps/web/proxy.ts` (404 on `/admin/*`) |
| BFF route impact        | None                                                                             |
| Prototype-store impact  | None                                                                             |
| Stale assumptions       | None                                                                             |
| Required docs update    | None                                                                             |
| Required type update    | None                                                                             |
| Required test update    | None                                                                             |
| Implementation blocked? | No                                                                               |
| Blocker reason          | —                                                                                |

---

## Surface 15 — Tripwire enforcement

| Field                   | Value                                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 2.5 name          | Tripwire enforcement                                                                                                                                           |
| Phase 2.6 name          | Tripwire enforcement                                                                                                                                           |
| Status                  | **aligned with cleanup**                                                                                                                                       |
| Backend anchor          | None — source-level scan                                                                                                                                       |
| Frontend anchor         | `scripts/tripwire-investor-boundary.ts`, `packages/config/blocked-terms.ts`                                                                                    |
| BFF route impact        | None                                                                                                                                                           |
| Prototype-store impact  | None                                                                                                                                                           |
| Stale assumptions       | Tripwire allows `policy_id` / `policy_version` because they were in our V2 contract; in V3 they don't exist anywhere, so they could be added to forbidden list |
| Required docs update    | None                                                                                                                                                           |
| Required type update    | None                                                                                                                                                           |
| Required test update    | Tripwire run continues to assert 0 violations                                                                                                                  |
| Implementation blocked? | No                                                                                                                                                             |
| Blocker reason          | — (cleanup via GAP-TRIPWIRE-016 in PR-C)                                                                                                                       |

---

## Surface 16 — E2E coverage

| Field                   | Value                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phase 2.5 name          | E2E coverage                                                                                                                                                 |
| Phase 2.6 name          | E2E coverage                                                                                                                                                 |
| Status                  | **aligned with additions per Contract V3 plan §12**                                                                                                          |
| Backend anchor          | None                                                                                                                                                         |
| Frontend anchor         | `apps/web/e2e/*.spec.ts` (12 specs current)                                                                                                                  |
| BFF route impact        | None                                                                                                                                                         |
| Prototype-store impact  | None                                                                                                                                                         |
| Stale assumptions       | A handful of specs assert stale concepts (recommendations, automation-center, managed-activation, exception-review) — see Contract V3 plan §12 for additions |
| Required docs update    | None                                                                                                                                                         |
| Required type update    | None                                                                                                                                                         |
| Required test update    | Per per-surface entries above; plus new `account-prefs-history.spec.ts` and `account-controls.spec.ts`                                                       |
| Implementation blocked? | Soft — new specs land alongside their target PR                                                                                                              |
| Blocker reason          | —                                                                                                                                                            |

---

## Implementation blocking summary

| Surface               | Blocked?           | Primary blocker                                              |
| --------------------- | ------------------ | ------------------------------------------------------------ |
| 1, 12, 14             | No                 | —                                                            |
| 8, 15, 16             | Soft / cleanup     | —                                                            |
| 6                     | Soft               | GAP-CONTROL-INIT-011 (Daniel ratification)                   |
| 2, 3, 5, 7, 9, 11, 13 | Yes                | Contract V3 + Admin Portal proxy (PR-B + PR-C + PR-E)        |
| 10                    | Yes                | GAP-EXCEPTION-010 reframe + PR-B + PR-E                      |
| **4**                 | **Yes — critical** | **GAP-PREFS-HISTORY-001 + GAP-ACL-005 + PR-B + PR-D + PR-E** |

## Scope lock

No frontend product code changes from this doc alone. No backend changes. No SEC 203A-2(e) boundary weakened. No new product surface (Surface 4's rename is a reframing of the same surface, not a new one).
