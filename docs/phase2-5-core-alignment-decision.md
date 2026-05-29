# Phase 2.5 Core Alignment Decision Memo

**Date:** 2026-05-29
**Audit branch:** `phase2-5-gitlab-surface-alignment-audit`
**Companion docs:** `phase2-5-gitlab-branch-inventory.md`, `phase2-5-gitlab-backend-capability-map.md`, `phase2-5-frontend-surface-inventory.md`, `phase2-5-surface-to-gitlab-alignment-register.md`.

Direct answers to the 16 core questions from the audit directive, grounded in the four companion docs.

---

## Direct answers

### 1. Have we inspected the GitLab repo closely enough?

**Adequately for boundary correctness; not exhaustively for adapter implementation.** This audit read the GitLab tree at the service-folder level, inspected `inference-worker` signal publishing tests, `account-intent-builder` action vocabulary + tests, `risk-engine` decision model + reason codes, `exec-gateway` order schema + topic constants, `admin-portal` Pub/Sub publisher (both `template.admin` and `account.admin`), and the `trade_lifecycle_contract.md` architecture doc. What is **not** yet read at the line level: `portfolio-engine` and `portfolio-manager` event shapes, the full inference-worker orchestrator (whether `position: 0` is preserved or suppressed), the broker integration in `trade-manager`, the trainer/training-scheduler interaction with `available_strategies`. For Phase 2.5 merge decisions this depth is sufficient; for Phase 3 adapter implementation, deeper passes will be needed.

### 2. Have we inspected all relevant GitLab branches?

**Yes — there is only one branch.** `git ls-remote --heads origin` returns a single ref: `refs/heads/main` at `0a7d64d`. The five tags are CI backup snapshots (named `backup-ci-foundation-*` / `backup-phase1-devops-a-*`) from 2025-09-15, not feature/environment branches. The branch-aware framing in the audit directive is moot for this repo today: it's single-branch trunk-based development.

### 3. Which GitLab branch should be treated as canonical for Phase 2.5?

**`main` at commit `0a7d64d` ("portfolio-manager bug fixes").** No other candidates exist.

### 4. Are Surfaces 1 to 3 (Phase 2 Surfaces) aligned with Daniel's backend at the core?

**Mostly partially aligned; some misalignments at the wire level.**

- **Surface 1 (Signal vs Managed mode)** — partially aligned. Backend has no "mode" object; mode is emergent from `account.admin` actions. Mapping rule needed.
- **Surface 2 (Automation Center / Execution Policy)** — frontend-only shell at the policy-versioned-record level; partially aligned at the pause/resume edges via `account.admin pause_autopilot / resume_autopilot`.
- **Surface 3 (Managed Activation)** — backend exists but adapter missing. Activation maps to `account.admin action ∈ {join_template, resume_autopilot}` plus a downstream `account.intent.ready` materialization. `template_id` registry needs Daniel confirmation.

None of these blocks the §A / §B / §C / §D structural boundary coverage; they block production-ready wire-level binding only.

### 5. Are the planned Surfaces 4 to 8 aligned with Daniel's backend at the core?

(Mapping to the Phase 2 Surface numbering: Surface 4 = Pause/Resume Managed in Phase 2; in the user's directive "Surface 4" refers to the next surface beyond Phase 2.5. I answer both.)

**Phase 2 Surfaces 4–8** (= Pause/Resume, Disclosure Re-Ack, Profile Reactivation, Exception Review):

- **Surface 4 (Pause/Resume)** — **aligned** semantic 1:1 with `account.admin pause_autopilot / resume_autopilot`. The single cleanest alignment in the catalog.
- **Surface 5 (Disclosure Re-Ack)** — **frontend-only shell**. Daniel has no disclosure concept. Stays BFF-owned indefinitely.
- **Surface 6 (Profile Reactivation)** — **frontend-only shell**. Daniel has no advisory profile concept beyond per-account prefs via `update_prefs`. Stays BFF-owned.
- **Surface 7 (Exception Review)** — partially aligned. Backend has `risk.rejected` events + `TradingControlStates` + lifecycle blocked states; frontend assembles all into one queue. Mapping table needed.

**"Surface 4" as the user's next-in-line product surface** (unspecified, but per `phase2-5-pr-description.md` likely Records Center v2 or Evidence Console):

- **Records Center v2** — backend partially exists (execution-side records are real Spanner tables; `audit-writer` is a skeleton). Adapter work needed; investor-side `InvestorActionReceipt` / `RecordAccessLog` remain BFF-owned. Not safe to ship to production without `audit-writer`.
- **Evidence Console** — BFF/admin-side; out of scope for the public investor product per the rescope doc §6.

**Bottom line:** Surfaces 1–8 in Phase 2 are conceptually well-aligned with Daniel's chain; the work that remains is wire-level binding (adapter implementation), not architectural rework.

### 6. Which surfaces are only frontend shells?

| Surface                              | Reason                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| Surface 7 (Disclosure Re-Ack)        | Daniel has no disclosure concept                                                   |
| Surface 8 (Profile Reactivation)     | Daniel has no profile concept                                                      |
| Surface 9 (Eligibility presentation) | Pre-auth; BFF-owned by design                                                      |
| Surface 12 (Support boundary)        | 203A-2(e)-mandated BFF-owned                                                       |
| Surface 14 (Admin boundary)          | Lives in a separate app (admin-portal); intentionally absent from the investor app |
| Surface 15 (Tripwire enforcement)    | Build-time tool, not a product surface                                             |
| Surface 16 (Stale E2E coverage)      | Test infrastructure                                                                |

All seven are correctly classified. None is a misalignment; each is intentionally BFF-owned (or build-tool / test-infra).

### 7. Which surfaces map to real backend services?

| Surface                          | Backend service(s)                                                     |
| -------------------------------- | ---------------------------------------------------------------------- |
| Surface 1 Signal vs Managed mode | `account-intent-builder` + `admin-portal`                              |
| Surface 2 Recommendations list   | `inference-worker` + `account-intent-builder`                          |
| Surface 3 Recommendation detail  | `risk-engine` + `account-intent-builder`                               |
| Surface 4 Automation Center      | `account-intent-builder` (partial)                                     |
| Surface 5 Managed Activation     | `account-intent-builder` + `admin-portal`                              |
| Surface 6 Pause/Resume Managed   | `account-intent-builder` + `admin-portal`                              |
| Surface 10 Exception Review      | `risk-engine` + `exec-gateway` (`TradingControlStates`, `OrderEvents`) |
| Surface 11 Records Center        | lifecycle Spanner tables + future `audit-writer`                       |
| Surface 13 Broker submission     | `exec-gateway` + `trade-manager`                                       |

### 8. Which surfaces are misaligned?

**None has a hard semantic conflict** that requires either side to redesign. The deltas are all shape / mapping / direction-of-translation. The previously named "misalignments" in `phase2-5-daniel-to-refi-alignment-gap-register.md` were over-stated because the prior audit (`phase2-5-daniel-live-backend-field-map.md`) inspected only `live-components-main`. With the GitLab evidence, those gaps reduce to:

- Signal wire shape (`position` → `signal`, `date` → `ts_utc`, plus the multi-stream and `proba` fields) — documented in `phase2-5-gitlab-contract-delta.md`.
- Risk decision ternary-vs-binary mapping (frontend `ALLOW | REVIEW | DENY` vs backend `approved | rejected`) — Surface 3 row in the register.
- Strategy `template_id` registry binding — Surface 5 row.

These are mapping problems, not misalignments.

### 9. Which surfaces require a BFF adapter before production?

| Surface    | Adapter scope                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| Surface 1  | derive `SubscriptionMode` from `account.admin` decisions                                                   |
| Surface 2  | `signals` (Spanner) + `account.intent.ready` (Pub/Sub) → `RecommendationProjection`                        |
| Surface 3  | `risk.approved` / `risk.rejected` + reason codes → `automation_eligibility.status ∈ {ALLOW, REVIEW, DENY}` |
| Surface 4  | persistent ExecutionPolicy storage (BFF) + emission of `account.admin` on activation/pause/resume          |
| Surface 5  | activation flow emits `account.admin {join_template, resume_autopilot}`                                    |
| Surface 6  | pause/resume → `account.admin {pause_autopilot, resume_autopilot}`                                         |
| Surface 10 | join `risk.rejected` + `TradingControlEvents` + lifecycle-blocked states → Exception Review queue items    |
| Surface 11 | read execution records from Spanner; persist investor receipts via BFF + future `audit-writer`             |
| Surface 13 | read-only lineage rendering from `Orders`, `OrderEvents`, `BrokerOrderAttempts`, `Fills`                   |

### 10. Which surfaces should not continue until Daniel confirms semantics?

Three areas require Daniel confirmation before further BFF or product work:

1. **Risk reason-code partition.** Which `RiskReason.code` values are recoverable (→ REVIEW) and which are hard (→ DENY)? Without this, Surface 3 can't ship the verdict mapping. (Affects Surfaces 3 + 10.)
2. **`template_id` registry shape.** What is the canonical Daniel-side template identifier the investor's strategy selection should map to? (Affects Surfaces 1, 5.)
3. **`position: 0` preservation.** Does GitLab `inference-worker` preserve the flat / hold case from the legacy MongoDB pipeline? If yes, adapter must handle; if no, adapter never sees it. (Affects Surfaces 2, 3.)

None of these blocks the existing §A–§D boundary coverage.

### 11. Does the frontend currently invent product behavior that the backend does not support?

**One clear case:** the frontend's `ExecutionPolicy` versioned record with constraint fields (`maxSingleOrderUsd`, `maxPositionSizeBps`, `minimumCashReserveBps`, etc.) is a BFF construct that does not exist on Daniel's backend. Daniel's risk constraints live in `risk-engine` config, not per-account policy. The investor controls in Automation Center either need:

- to map into a new Daniel-side per-account-policy record (Daniel work), OR
- to remain BFF-owned with the BFF translating into per-execution gating (current posture).

**Otherwise, no.** Disclosures, profile, support, and tripwire are all intentionally BFF-owned. They are not "inventions" — they are the 203A-2(e) recordkeeping surface the regulation requires.

### 12. Does the backend expose admin or execution behavior that the frontend must hide, wrap, or reinterpret?

**Yes — six categories:**

| Backend behavior                                                     | Investor-product treatment                                                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `template.admin action=rebalance target_account_id=X` (admin-portal) | hide — wrapped server-side via BFF; no investor surface                                                                               |
| `account.admin action=liquidate_all` (admin-portal)                  | hide unless the investor explicitly opts in via a self-service "close all" surface (not in Phase 2)                                   |
| `account.admin action=force_rebuild` (admin)                         | hide — operations-only                                                                                                                |
| `account.admin action=update_prefs` (admin or BFF)                   | wrap — investor profile changes route through here, but the admin-vs-investor caller distinction must be enforced server-side         |
| Backend `RiskDecision.decision = "rejected"` (binary)                | reinterpret — translate to ternary (`REVIEW` or `DENY`) per the reason-code partition                                                 |
| Backend rich `OrderStatus` (15 states) + raw `OrderEvents`           | hide internal lifecycle states; surface only investor-visible summary states (e.g. submitted / partial / filled / blocked / rejected) |

### 13. Does any surface violate or risk violating the SEC 203A-2(e) product boundary?

**No surface violates today.** All §A–§D coverage holds. Tripwire scans 144 files with 0 violations. The boundary is intact at the structural level.

**Risks of violation that the audit surfaces but doesn't yet observe:**

- If a future BFF adapter wires investor UI to `template.admin` directly (instead of through the BFF wrap), the admin boundary leaks. Mitigation: tripwire continues to block the literal strings; adapter must be reviewed against that.
- If `risk.rejected` reasons surface to the investor with the raw `target_account_id` attribute or admin metadata, the admin boundary leaks. Mitigation: the BFF strips admin attributes before projecting to the investor.
- If support gains ability to mutate any of `EligibilityCheck`, `ExecutionPolicyDecision`, or `Exception` state, the support boundary breaks. §D enforces structural absence today; adapter wiring must preserve.

### 14. Is stale E2E still the next gate after this audit?

**Yes.** Stale E2E cleanup (`phase2-5-stale-e2e-cleanup`, WIP stashed) remains the next branch to land before Phase 2.5 main merge. This audit does not invalidate that sequencing; it adds work to the production pipeline but does not block any of the merge-ready branches.

### 15. Is Surface 4 safe to start after this audit?

**No.** The audit clarifies the gap but does not close it. Three pre-Surface-4 items:

1. **Reviewer accepts the surface-to-GitLab alignment register.** Adopt the new evidence; supersede the prior "missing services" framing.
2. **Decision on `phase2-5-signal-contract-v2-against-gitlab`.** Either apply the 12 contract corrections from `phase2-5-gitlab-contract-delta.md` to `phase2-5-signal-to-investor-product-contract.md`, or document deferral.
3. **Stale E2E cleanup lands.** Same as #14.

Surface 4's specific scope is also undefined (Records Center v2? Evidence Console? Something else?). That scope decision must come from product before any implementation start.

### 16. Is Phase 2.5 safe to merge after this audit?

**Not yet, but the bar is unchanged.** The merge-blocking items remain:

- `phase2-5-stale-e2e-cleanup` lands.
- The PR description requirements from `phase2-5-pr-description.md` §6 are met (Daniel = signal infrastructure only; current Phase 2.5 coverage is frontend/BFF boundary, not production wire-level).

This audit adds optional-before-merge work (`phase2-5-signal-contract-v2-against-gitlab`, `phase2-5-gap-register-v2-against-gitlab`) but those are docs-only follow-ups that can land before or after Phase 2.5 main merge at the user's discretion.

---

## Surface-by-surface verdict (directive §6)

### Surface 1: Signal vs Managed mode

- **Verdict:** partially aligned.
- **Backend anchor:** `account-intent-builder` consuming `account.admin {join_template, leave_template, pause_autopilot, resume_autopilot}`.
- **Frontend status:** BFF + persona-aware MSW + prototype-store; tested by §C `persona-switch-stable.spec.ts`.
- **Required correction:** BFF must derive `SubscriptionMode` from real `account.admin` decisions in production. Map "no template subscriptions + no active autopilot" → Signal; "≥1 template + active autopilot" → Managed.
- **Blocks next work:** no.
- **Blocks production:** yes.

### Surface 2: Recommendations list

- **Verdict:** backend exists but adapter missing.
- **Backend anchor:** Spanner `signals` (`stream_id`, `asset_id`, `ts_utc`, `model_version`, `strategy_source`, `signal`, `label`, `proba`) + Pub/Sub `account.intent.ready`.
- **Frontend status:** BFF + persona MSW + prototype-store.
- **Required correction:** apply `phase2-5-gitlab-contract-delta.md` corrections to the signal contract; implement adapter intake from Spanner OR Pub/Sub.
- **Blocks next work:** no.
- **Blocks production:** yes.

### Surface 3: Recommendation detail

- **Verdict:** partially aligned with critical ternary-vs-binary mismatch.
- **Backend anchor:** `risk-engine` emitting `dev-risk.approved` / `dev-risk.rejected` with `RiskReason.code` set (`LEVERAGE_LIMIT`, `SINGLE_NAME_CONC_LIMIT`, `SECTOR_CONC_LIMIT`, `VAR_LIMIT`).
- **Frontend status:** §A + §B both green; boundary structurally enforced.
- **Required correction:** reason-code → ternary verdict mapping table; Daniel must confirm the recoverable / hard partition.
- **Blocks next work:** no.
- **Blocks production:** yes.

### Surface 4: Automation Center

- **Verdict:** frontend-only shell at the versioned-policy level; partially aligned at the pause/resume action edges.
- **Backend anchor:** `account-intent-builder` `account.admin` actions (pause/resume); no per-account-policy record on backend.
- **Frontend status:** BFF + prototype-store.
- **Required correction:** decide BFF-owned vs Daniel-owned per-account policy; if Daniel-owned, define a new event/table.
- **Blocks next work:** no.
- **Blocks production:** yes.

### Surface 5: Managed activation

- **Verdict:** backend exists but adapter missing.
- **Backend anchor:** `account.admin {join_template, resume_autopilot}` + downstream `account.intent.ready`.
- **Frontend status:** BFF + prototype-store; covered by `e2e/managed-activation.spec.ts` (8 cases).
- **Required correction:** activation flow emits `account.admin`; `template_id` registry binding pending Daniel.
- **Blocks next work:** no.
- **Blocks production:** yes.

### Surface 6: Pause / Resume Managed

- **Verdict:** **aligned (semantic 1:1).**
- **Backend anchor:** `account.admin {pause_autopilot, resume_autopilot}`.
- **Frontend status:** BFF + prototype-store; covered by `e2e/managed-pause-resume.spec.ts`.
- **Required correction:** wire pause/resume buttons to BFF → admin-portal POST → `account.admin` event.
- **Blocks next work:** no.
- **Blocks production:** yes.

### Surface 7: Disclosure re-acknowledgement

- **Verdict:** frontend-only shell.
- **Backend anchor:** none.
- **Frontend status:** BFF + prototype-store; covered by `e2e/disclosure-reack.spec.ts`.
- **Required correction:** none for boundary; durable persistence + future `audit.evt` mirroring.
- **Blocks next work:** no.
- **Blocks production:** yes (durable storage gap).

### Surface 8: Profile staleness / reactivation

- **Verdict:** frontend-only shell.
- **Backend anchor:** none direct (optional `account.admin update_prefs`).
- **Frontend status:** BFF + prototype-store; covered by `e2e/profile-reactivation.spec.ts`.
- **Required correction:** none for boundary; durable persistence.
- **Blocks next work:** no.
- **Blocks production:** yes (durable storage gap).

### Surface 9: Eligibility presentation

- **Verdict:** frontend-only shell.
- **Backend anchor:** none.
- **Frontend status:** BFF route handler; covered by `e2e/eligibility.spec.ts` (WIP rewrite).
- **Required correction:** none for boundary.
- **Blocks next work:** no.
- **Blocks production:** no.

### Surface 10: Exception Review

- **Verdict:** partially aligned.
- **Backend anchor:** `dev-risk.rejected` + Spanner `TradingControlStates` + `OrderEvents` blocked states.
- **Frontend status:** BFF + prototype-store; covered by `e2e/exception-review.spec.ts` (10 cases).
- **Required correction:** assemble queue across three backend sources; resolution categories must map to either BFF mutations OR `account.admin` events.
- **Blocks next work:** no.
- **Blocks production:** yes.

### Surface 11: Records Center

- **Verdict:** backend partially exists.
- **Backend anchor:** Spanner `Orders`, `OrderEvents`, `Fills`, `BrokerOrderAttempts`, `BrokerInteractionsLog`, `TradeReconciliationRuns`; `audit-writer` skeleton.
- **Frontend status:** BFF + prototype-store.
- **Required correction:** read execution records from Spanner; investor-side receipts + access logs stay BFF-owned until `audit-writer` ships.
- **Blocks next work:** no.
- **Blocks production:** yes (until `audit-writer`).

### Surface 12: Support boundary

- **Verdict:** **aligned (BFF-owned by design).**
- **Backend anchor:** none.
- **Frontend status:** §D `support-boundary-preservation.spec.ts` green 8/8.
- **Required correction:** none.
- **Blocks next work:** no.
- **Blocks production:** no.

### Surface 13: Broker submission path

- **Verdict:** backend exists but adapter missing.
- **Backend anchor:** `exec-gateway` (`dev-orders.cmd`), `trade-manager` (`dev-orders.evt`), Spanner lifecycle tables.
- **Frontend status:** BFF + prototype-store; §A + §B enforce structural absence of per-trade Accept.
- **Required correction:** READ-ONLY order lineage in Records Center; never expose `Order` for investor input.
- **Blocks next work:** no.
- **Blocks production:** yes.

### Surface 14: Admin boundary

- **Verdict:** **aligned (vacuously — admin lives in a separate app).**
- **Backend anchor:** `admin-portal` (its own full-stack app inside Daniel's monorepo).
- **Frontend status:** intentionally no investor-facing admin surface; tripwire blocks admin tokens.
- **Required correction:** none.
- **Blocks next work:** no.
- **Blocks production:** no.

### Surface 15: Tripwire enforcement

- **Verdict:** **aligned.**
- **Backend anchor:** n/a (build-time).
- **Frontend status:** `pnpm tripwire` → 0 violations / 144 files.
- **Required correction:** none.
- **Blocks next work:** no.
- **Blocks production:** no (must remain load-bearing).

### Surface 16: Stale E2E coverage

- **Verdict:** test infrastructure; WIP rewrite on the stale-e2e-cleanup branch (stashed).
- **Backend anchor:** n/a.
- **Frontend status:** WIP.
- **Required correction:** finish the WIP rewrite per `phase2-5-stale-e2e-cleanup.md` (created in that branch but not on this audit branch).
- **Blocks next work:** yes (stale E2E is the next gate for Phase 2.5 merge).
- **Blocks production:** no.

---

## Scope lock — re-affirmed

No frontend product code changes. No backend touches. No SEC 203A-2(e) boundary weakened. Audit was strictly read-only.
