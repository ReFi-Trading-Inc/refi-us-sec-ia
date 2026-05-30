# Phase 2.6 Repo Observation Report

**Date:** 2026-05-30
**Branch:** `phase2-6-repo-observation-and-authoritative-plan`
**Source of truth:** [`phase2-6-authoritative-source-of-truth.md`](phase2-6-authoritative-source-of-truth.md)
**Status:** Evidence-anchored report from direct inspection of both repos. All findings cite file paths and line numbers.

---

## 1. Repo state

### Backend (`refinity-main`)

- Path: `/Users/za/Library/CloudStorage/Dropbox/Nature Of Commerce LLC/ReFi/Website/GitLab/refinity-main`
- Branch: `main`
- Head: `9f9dfc99b322042924439f8ae48d44659091a3b4` (`9f9dfc9`)
- Pulled cleanly with `git pull --ff-only origin main`.
- `docs/authoritative/` directory present.
- `docs/out_dated/` directory present (explicitly deprecated per Daniel).

### Frontend (`refi-us-sec-ia`)

- Path: `/Users/za/Library/CloudStorage/Dropbox/Nature Of Commerce LLC/ReFi/Website/refi-us-sec-ia`
- Branch: `phase2-6-repo-observation-and-authoritative-plan` (branched from `main`)
- Base `main` head: `555f7860fd27cfc87685df4e8ae52356b2328fee` (`555f786`)
- Recent history confirms Phase 2.5 squash-merged at `9407755` and README at `555f786`.

## 2. Authoritative docs read

All nine expected files present and read (in part or full).

| File                                                         | Lines | Read state                           |
| ------------------------------------------------------------ | ----- | ------------------------------------ |
| `docs/authoritative/executive_overview.md`                   | 274   | Full                                 |
| `docs/authoritative/frontend_integration_contract.md`        | 521   | Full                                 |
| `docs/authoritative/trade_lifecycle_contract.md`             | 629   | Key sections (via sub-agent)         |
| `docs/authoritative/trade_auditability_contract.md`          | 801   | Key sections (via sub-agent)         |
| `docs/authoritative/trade_lifecycle_retention_legal_hold.md` | 37    | Full (via sub-agent)                 |
| `docs/authoritative/spanner_ddl_all.txt`                     | n/a   | Table presence audit (via sub-agent) |
| `docs/authoritative/topics_subs_dlqs.txt`                    | n/a   | Topic/sub/DLQ audit (via sub-agent)  |
| `docs/authoritative/service_iam.txt`                         | n/a   | Identity audit (via sub-agent)       |
| `docs/scratch_pads/qa/email_qa_checklist.md`                 | 139   | Full                                 |

## 3. Backend files inspected (code-level)

The following backend code paths were directly inspected to verify doc claims:

| Path                                                                                                           | Purpose                                              | Finding                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `apps/admin-portal/backend/api/router_registry.py`                                                             | Confirms 35 routers mounted under `/api/v1/{prefix}` | Verified                                                                                                                                                                            |
| `apps/admin-portal/backend/api/portfolio.py`                                                                   | Template registry routes                             | Lines 425, 490, 569, 738, 828, 885, 945, 972 confirm `GET/POST/PUT/DELETE /templates` + memberships + rules                                                                         |
| `apps/admin-portal/backend/api/accounts.py`                                                                    | Account flow routes                                  | Lines 111, 153, 371, 458, 554, 709, 852, 917 confirm `GET /accounts/*`, `POST /accounts/{id}/templates`, `POST /accounts/{id}/admin-actions`, `GET/POST /accounts/{id}/risk-limits` |
| `apps/admin-portal/backend/api/orders.py`                                                                      | Order routes incl. blocked                           | Lines 13, 78 confirm `GET /orders/blocked`, `GET /orders`                                                                                                                           |
| `apps/admin-portal/backend/api/execution.py`                                                                   | Plan + order detail routes                           | Lines 1307, 1546, 1762, 1943 confirm `GET /execution/plans`, `/execution/orders`, `/{order_id}`                                                                                     |
| `apps/admin-portal/backend/api/broker_interactions.py`                                                         | Broker forensic log routes                           | Lines 43, 112 confirm `GET /broker-interactions`, `/{order_id}`                                                                                                                     |
| `apps/admin-portal/backend/api/ops.py`                                                                         | Reconciliation routes                                | Lines 553, 606, 697, 766, 785 confirm reconciliation discrepancy endpoints                                                                                                          |
| `apps/admin-portal/backend/api/stream.py`                                                                      | SSE live event feed                                  | Line 210 confirms `GET /api/v1/stream` returns `EventSourceResponse`                                                                                                                |
| `apps/admin-portal/backend/api/{trade_manager,risk_engine,exec_gateway,account_intent_builder,data_loader}.py` | Per-service pipeline observability routers           | Each has `GET /pipeline/overview`, `/pipeline/occurrences`, `/pipeline/occurrences/{procedure_id}`, `/pipeline/analytics`                                                           |
| `apps/common/stream_identity/__init__.py`                                                                      | Stream ID canonical builder                          | Module + tests present                                                                                                                                                              |
| `apps/common/trade_lifecycle/`                                                                                 | Lifecycle shared code                                | `models.py`, `states.py`, `transitions.py`, `payloads.py`, `writer.py`, `controls.py`, `constants.py`, `retention.py`, `timestamps.py` all present                                  |
| `apps/common/snaptrade_driver/models.py:108`                                                                   | Confirm `ExecutionPolicy` is broker-driver model     | Confirmed at line 108 as `class ExecutionPolicy(BaseModel):`                                                                                                                        |
| Grep `AccountPrefsHistory                                                                                      | account_prefs_history`across`apps/`                  | History table absence                                                                                                                                                               | **No results** — confirms history doesn't exist in backend code today |

## 4. Frontend files inspected

| Path                                                                        | Inspected for                 | Finding                                                                                                                                            |
| --------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | --------------------------- |
| `apps/web/app/api/`                                                         | BFF route inventory           | 35 routes; relevant stale: `/execution-policy/*` (3 routes)                                                                                        |
| `apps/web/src/lib/prototype-store/entities/`                                | Entity inventory              | 18 entities; stale: `execution-policy.ts`, `execution-policy-draft.ts`, `managed-execution-state.ts`                                               |
| `apps/web/e2e/*.spec.ts`                                                    | E2E inventory                 | 12 specs; needs realignment: `automation-center`, `managed-activation`, `recommendations`, `exception-review`                                      |
| `packages/api-clients/src/generated/api.ts` + `api.gen.ts`                  | Generated client stale fields | `execution_policy_id`, `execution_policy_version`, `strategy_id` present and stale                                                                 |
| `apps/web/app/us/app/settings/automation/page.tsx`                          | Surface 4 stale usage         | Imports `useExecutionPolicy`, `useExecutionPolicyDraft`, `useSaveExecutionPolicyDraft`, `ExecutionPolicyDraftDto`, `SaveExecutionPolicyDraftInput` |
| `apps/web/app/us/app/_components/CompliancePreview.tsx`                     | Stale REVIEW framing          | Lines 10, 33, 46, 64, 157, 165, 182, 183, 188 use `"ALLOW"                                                                                         | "REVIEW" | "DENY" | "UNAVAILABLE"` ternary-plus |
| `apps/web/app/us/app/recommendations/[id]/page.tsx:39`                      | Stale hold framing            | `const actionable = data.action !== "hold"`                                                                                                        |
| `apps/web/src/lib/prototype-store/entities/recommendation-projection.ts:30` | Stale hold action             | `action: "buy"                                                                                                                                     | "sell"   | "hold" | "rebalance"`                |

## 5. Stale Phase 2.5 assumptions confirmed by evidence

### Critical (must reverse for Contract V3)

| #   | Assumption                                                          | Reality                                                              | Evidence                                                                                     |
| --- | ------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | `RiskDecision` REVIEW/DENY partition by reason code                 | All `rejected` = DENY (hard stop)                                    | `email_qa_checklist.md:1-27`; `FIC:253-309`                                                  |
| 2   | Frontend-facing `policy_id` / `policy_version` is the right framing | No such field exists; broker-driver `ExecutionPolicy` only           | `email_qa_checklist.md:109-139`; `FIC:355-390`; `apps/common/snaptrade_driver/models.py:108` |
| 3   | `strategy_id` is on the wire                                        | Strategy identity = `stream_id + strategy_source`                    | `email_qa_checklist.md:53-55`; `FIC:158-163`                                                 |
| 4   | `signal: 0` may be a `hold` projection                              | `0` is neutral / no new stance; never auto-closes                    | `email_qa_checklist.md:77-107`; `FIC:55-103`                                                 |
| 5   | `aggregation_status` enum for multi-stream rows                     | Backend canonicalizes; frontend reads finished `AccountIntents.legs` | `FIC:104-119` (Stream Lineage Versus Tradable Asset)                                         |
| 6   | BFF needs heavy adapter chain                                       | Admin Portal API already exposes most needed projections             | `apps/admin-portal/backend/api/router_registry.py` — 35 routers                              |
| 7   | `audit-writer` + `compliance-adapter` are production blockers       | They're for on-chain audit summary; not basic auditability           | Daniel's response; `FIC:392-505`                                                             |

### Significant (reshape but not reverse)

- Exception Review (Surface 10) — surfaces `TradingControlStates` + blocked orders + reconciliation discrepancies, not risk-rejected verdicts
- Records Center (Surface 11) — built around correlation spine + Admin Portal projections, not invented records
- Recommendation projections — derived from `AccountIntents.legs` (account-level evidence) + `Orders` / `Fills` (executed evidence), not fabricated from raw signals

### Cosmetic (rename for clarity)

- "Automation Center" → "Account Controls Center"
- "ExecutionPolicy" → drop entirely; replace with `AccountPrefs` editor + `RiskLimits` viewer + `UserConsents` acceptance flow

## 6. Validated assumptions (Phase 2.5 was right)

- SEC 203A-2(e) tripwire enforcement model holds.
- Admin-investor boundary doc (`docs/admin-investor-boundary.md`) holds.
- Investor-action taxonomy (`docs/investor-action-taxonomy.md`) holds.
- BFF prototype-store three-bucket rule (`docs/bff-prototype-state-contract.md`) holds — the bucket Daniel introduced is "upstream-via-Admin-Portal-projection," which is a refinement, not a contradiction.
- Signal vs Managed mode framing (Surface 1) holds (mode is a frontend product framing, not a backend concept).
- Support boundary (Surface 12) holds.
- Eligibility eligibility check (`/us/eligibility`, US-states / DOB / US-person) is frontend-owned and correct.

## 7. Conflicts found

### High-severity conflicts

| Conflict                                                                         | Resolution                                                       |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Phase 2.5 Contract V2 §3.7 `policy_id`/`policy_version` vs backend absence       | Drop from V3                                                     |
| Phase 2.5 Contract V2 §3.6 risk REVIEW/DENY partition vs Daniel's binary verdict | Reframe risk as binary, REVIEW moves to BFF                      |
| Phase 2.5 §3 `strategy_id` vs `stream_id + strategy_source`                      | Replace `strategy_id` with `stream_id`/`strategy_source`         |
| Phase 2.5 §3.3 `aggregation_status` enum vs backend canonicalization             | Remove from V3; consume `AccountIntents.legs` directly           |
| Phase 2.5 §10 production blockers include `audit-writer`+`compliance-adapter`    | Move to "on-chain audit summary infra" — not basic-prod blockers |

### Medium-severity conflicts

| Conflict                                                                        | Resolution                                                                                |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `RecommendationProjection.action: "hold"` vs Daniel's neutral-not-hold rule     | Replace `"hold"` with `"neutral"`; refine adapter rule                                    |
| BFF computes verdict in `apps/web/app/us/app/_components/CompliancePreview.tsx` | Move verdict to consume `RiskSnapshots` projection from Admin Portal                      |
| Surface 4 framed as "Automation Center / Execution Policy"                      | Reframe to "Account Controls Center" with `AccountPrefs` + `RiskLimits` + `UserConsents`  |
| Surface 10 Exception Review expects to "clear" risk rejects                     | Reframe to surface `TradingControlStates` + blocked orders + reconciliation discrepancies |

### Low-severity / wording

| Conflict                                               | Resolution                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| Phase 2.5 docs reference "Daniel backend" generally    | Phase 2.6 docs use "`refinity-main` authoritative docs at `<commit>`" |
| Phase 2.5 docs reference `live-components-main` folder | Phase 2.6 docs drop the reference; folder is superseded               |

## 8. Unresolved uncertainties

Items I cannot resolve from doc reading alone — recorded as Phase 2.6 open follow-ups:

| #   | Uncertainty                                                                                                                                                                                                      | Owner                                            | Where tracked                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------- |
| 1   | DDL table presence beyond line 150 of `spanner_ddl_all.txt` — specifically `RiskLimits` table actual schema                                                                                                      | Read full file before PR-B                       | `gap-register-v3-plan`                      |
| 2   | Investor-scoped ACL approach — does Daniel prefer BFF proxy with filtering, or new `/api/v1/investor/*` Admin Portal projection?                                                                                 | Daniel                                           | `GAP-ACL-005`                               |
| 3   | Trading-control investor-initiability — which `TradingControlStates` modes are investor-safe?                                                                                                                    | Daniel                                           | `GAP-CONTROL-INIT-011`                      |
| 4   | AccountPrefsHistory table location — backend Spanner vs BFF prototype-store as the long-term home                                                                                                                | Daniel                                           | `GAP-PREFS-HISTORY-001`                     |
| 5   | AccountPrefsHistory write procedure architecture — `apps/common` shared code (Option 3) vs microservice (Option 1) vs documented procedure (Option 2)                                                            | Daniel                                           | `phase2-6-account-prefs-history-options.md` |
| 6   | Admin Portal endpoints `/api/v1/operations/cancel-order` and `/operations/trigger-rebalance` — are these admin-only or could subsets be investor-initiable (e.g. self-cancel of a still-`pending_submit` order)? | Daniel                                           | `gap-register-v3-plan`                      |
| 7   | Audit packet export (mentioned in trade_auditability_contract) — investor entitlement to download their own audit packet?                                                                                        | Daniel + legal                                   | `gap-register-v3-plan`                      |
| 8   | `dev-training.requested` topic mismatch (admin-portal publishes unprefixed; scheduler subscribes to prefixed)                                                                                                    | Daniel (this is his bug to fix; we just note it) | Doc only                                    |

## 9. Recommended next PRs (planning order)

Following the directive's Section 7 — see [`phase2-6-next-pr-sequence.md`](phase2-6-next-pr-sequence.md) for full PR specifications.

| PR   | Type                                         | Status                                                  |
| ---- | -------------------------------------------- | ------------------------------------------------------- |
| PR-A | docs: authoritative source update            | ready (this branch is a superset)                       |
| PR-B | docs: Contract V3 and Gap Register V3        | drafted in this branch                                  |
| PR-C | code: frontend type and fixture realignment  | blocked on PR-A/B review                                |
| PR-D | docs: AccountPrefs history contract          | drafted in this branch; sent to Daniel for confirmation |
| PR-E | code: Admin Portal API proxy / BFF ACL       | blocked on Daniel ACL decision                          |
| PR-F | code: Account Controls Center implementation | blocked on PR-B + PR-D + PR-E                           |
| PR-G | code: Records Center lifecycle spine         | blocked on PR-B + PR-E                                  |
| PR-H | code: Exception Review reframing             | blocked on PR-B + PR-E                                  |

## 10. Validation results

This branch is docs-only (plus Phase 2.5 supersession headers and a small README addendum).

| Gate                 | Result                            |
| -------------------- | --------------------------------- |
| `pnpm scan-copy`     | (pending; will run before commit) |
| `pnpm typecheck`     | (pending)                         |
| `pnpm lint`          | (pending)                         |
| `pnpm contract-test` | (pending)                         |
| `pnpm tripwire`      | (pending)                         |
| `pnpm test`          | (pending)                         |
| `pnpm e2e`           | not run; not needed for docs-only |

Results are recorded at the end of the branch commit message and in the PR description when the branch is opened.

## 11. Scope lock

No frontend product behavior changes. No backend changes. No SEC 203A-2(e) boundary weakened. No new product surface added. No Daniel backend file modified.
