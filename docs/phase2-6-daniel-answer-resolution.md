# Phase 2.6 Daniel Answer Resolution

**Date:** 2026-05-30
**Source of truth:** [`phase2-6-authoritative-source-of-truth.md`](phase2-6-authoritative-source-of-truth.md) — anchored to `refinity-main main @ 9f9dfc9`.
**Status:** Closes the four Phase 2.5 blockers using Daniel's direct answers and the authoritative docs.

This doc records, for each of the four Phase 2.5 open questions, the prior question, Daniel's answer, the supporting evidence, the Phase 2.5 assumption that's now invalidated, the new Phase 2.6 interpretation, and the implementation impact.

Primary evidence file: `refinity-main/docs/scratch_pads/qa/email_qa_checklist.md`.
Secondary evidence: `refinity-main/docs/authoritative/frontend_integration_contract.md` (FIC).

---

## Q1 — Risk reason-code partition

### Prior question (Phase 2.5)

"How should `RiskDecision.decision = 'rejected'` be classified by `reasons[].code`? Which codes route to `REVIEW` vs `DENY` on the investor surface?"

### Daniel's answer

Every persisted `RiskDecision.decision = "rejected"` is a **backend hard stop** for that intent — no exceptions. Risk Engine publishes rejections to `dev-risk.rejected`; Exec Gateway only ingests from `dev-risk.approved` and **builds plans only from approved decisions**. The frontend may display "needs review" copy for operators, but the pipeline does not treat a rejected risk decision as clearable by any frontend.

Per-code verdict (all DENY):

- `LEVERAGE_LIMIT` — gross/net exposure breach (`RiskLimits.max_gross_exposure_pct` / `max_net_exposure_pct`)
- `VAR_LIMIT` — parametric VaR breach (`RiskLimits.var.max_var_pct`)
- `SINGLE_NAME_CONC_LIMIT` — single-name concentration breach (`RiskLimits.max_single_name_pct`)
- `SECTOR_CONC_LIMIT` — sector concentration breach (`RiskLimits.max_sector_pct`)

Operational non-rule outcomes (NOT risk denies):

- `STALE_PRICES`, `BROKER_UNAVAILABLE` — fast-rejects that are retryable downstream
- `RETRY_PRICES` — retryable, not a normal verdict
- `missing_risk_limits`, `simulation_failed` — procedure failures, recorded in procedure history

Control-state outcomes (separate surface, separate semantics) — sourced from `TradingControlStates`:

- `halt_all` — blocks submits, generally allows cancel
- `halt_new_orders`, `reconciliation_block` — block exposure-increasing orders
- `reduce_only` — blocks new exposure, allows reductions
- `degraded` — payload-flag-dependent; generally permits reductions more readily than new exposure

### Supporting evidence

- `email_qa_checklist.md` lines 1–27
- `FIC` lines 253–309 (Risk Approval And Denial)
- `apps/risk-engine/src/models.py:132-144` — `RiskDecision` schema (verified Phase 2.5; unchanged)
- `refinity-main/apps/admin-portal/backend/api/risk_engine.py` — operator-facing pipeline endpoints exist for rejection visibility but no clear/override route

### Phase 2.5 assumption invalidated

Contract V2 §3.6 partitioned the four reason codes between REVIEW (`LEVERAGE_LIMIT`, `VAR_LIMIT`) and DENY (`SINGLE_NAME_CONC_LIMIT`, `SECTOR_CONC_LIMIT`). **Wrong.** All four are DENY.

### Phase 2.6 interpretation

- `EligibilityCheck.status` is binary from risk: `ALLOW | DENY`.
- A `REVIEW` state may still exist on the BFF side, but only for BFF-owned operational/state blockers, not for clearing a rejected risk verdict.
- Exception Review (Surface 10) does **not** override risk rejects. It focuses on `TradingControlStates`, blocked orders (`GET /api/v1/orders/blocked`), `TradeReconciliationDiscrepancies`, broker connection / credential issues, and other items with a real resolution path.

### Surfaces unblocked

- Surface 9 (Eligibility presentation) — implementation can proceed once Contract V3 lands
- Surface 13 (Broker submission path) — implementation can proceed

### Surfaces still blocked

- Surface 10 (Exception Review) — blocked on Contract V3 because the entire model needs reframing (see [`phase2-6-surface-reframing-map.md`](phase2-6-surface-reframing-map.md))

### Contract impact

- Drop `reason_codes` REVIEW/DENY partition logic from `apps/web/src/lib/sec203a/*` and replace with: risk = binary; BFF REVIEW is a separate, non-risk-driven model.
- `RiskSnapshots` becomes the immutable evidence the frontend renders, not an object the frontend can mutate.

### Test impact

- E2E spec `recommendations.spec.ts` already asserts absence of per-trade Accept; no change there.
- New E2E: assert that `risk.rejected` projections render with no clear/override affordance.
- Contract assertions: add `EligibilityCheck.fromRiskOnly is binary` invariant.

---

## Q2 — Template registry

### Prior question

"Where is the canonical template registry? Spanner table? Admin Portal API? Pub/Sub topic? Other?"

### Daniel's answer

**Canonical registry is Spanner-backed.** Tables:

- `templates` — core template config
- `template_membership` — active stream membership
- `template_rules` — guard/rule settings
- `AccountTemplates` — account-template activation links
- `TemplateTargets` — runtime target snapshots
- `TemplateTargetAffectedStreams` — stream-level lineage for a target action
- `portfolio_registry` — portfolio-manager metadata

**Admin Portal exposes API projections** over those tables. Live router registers `portfolio.router` under `/api/v1/portfolio` and these template endpoints exist (verified at `apps/admin-portal/backend/api/portfolio.py` lines 425, 490, 569, 738, 828, 885, 945, 972):

- `GET /api/v1/portfolio/templates`
- `POST /api/v1/portfolio/templates`
- `GET /api/v1/portfolio/templates/{template_id}`
- `PUT /api/v1/portfolio/templates/{template_id}`
- `DELETE /api/v1/portfolio/templates/{template_id}`
- `GET /api/v1/portfolio/memberships`
- `GET /api/v1/portfolio/rules`
- `POST /api/v1/portfolio/templates/{template_id}/rules`

**Pub/Sub announces runtime actions, not registry truth.** Discovery is pull/read.

**No standalone `strategy_id`.** Strategy identity = `stream_id + strategy_source`. `portfolio_registry.recipe_id` is a construction artifact id, not a generic trading `strategy_id`.

**No template-level minimum account requirement.** Account participation is `AccountTemplates.active`; execution eligibility is composed from account state, consents, `AccountPrefs`, snapshots/positions, `RiskLimits`, controls.

### Supporting evidence

- `email_qa_checklist.md` lines 29–75
- `FIC` lines 130–174 (Template Registry And Activation Metadata)
- `apps/admin-portal/backend/api/portfolio.py` (router file)
- `apps/admin-portal/backend/api/router_registry.py` (registration of `portfolio.router` at `/api/v1/portfolio`)

### Phase 2.5 assumption invalidated

Contract V2 §3 carried a `strategy_id: string` field on `SignalCandidate` and `RecommendationProjection`. **Wrong.** No such field exists. Strategy identity is `stream_id + strategy_source`.

### Phase 2.6 interpretation

- Surface 5 (Managed activation) consumes `GET /api/v1/portfolio/templates` (with investor-scoped ACL) for the template picker.
- Investor-facing display: `templates.name` (or `portfolio_registry.display_name`), `templates.risk_class`, `template_membership` rows for asset/stream universe, `template_rules` for guardrail context.
- Activation calls `POST /api/v1/accounts/{account_id}/templates` (verified at `apps/admin-portal/backend/api/accounts.py:371`).
- Drop `strategy_id` from frontend types. Replace with `stream_id`/`strategy_source` where lineage is needed; for activation use `template_id`.

### Surfaces unblocked

- Surface 5 (Managed activation) — implementation can proceed once Contract V3 + Admin Portal proxy land

### Contract impact

- Remove `strategy_id` from `SignalCandidate`, `RecommendationProjection`, OpenAPI generated client
- Add template-display model anchored to actual `templates` / `portfolio_registry` columns

### Test impact

- `managed-activation.spec.ts` needs to consume a mocked `/api/v1/portfolio/templates` response
- Add boundary test: ensure raw `template.admin` / `target_account_id` never reaches an investor surface (existing tripwire holds)

---

## Q3 — `signal: 0` preservation

### Prior question

"Are `signal: 0` rows preserved by the inference worker? Suppressed? Strategy-source dependent? Does `0` close positions?"

### Daniel's answer

**Yes, `signal: 0` is preserved.** Both RF and RL streams can emit `0`. Source-independent: Component E starts at neutral `0` when no prior regime exists, then carries the prior label forward until a threshold crossing occurs. After warmup, `0` should be **uncommon** — `1` or `-1` are typical.

**`signal: 0` does NOT by itself close positions.** Treat as neutral / no new stance. Account-level action requires evidence from `TemplateTargets`, `AccountIntents` (zero-weight or closing legs), or downstream lifecycle objects.

The `signals` table has primary key `stream_id` and is a latest-state table per stream, not a history table. Portfolio Engine gates an initial/repeated `0` as `gate_signal_zero`. If a `0` passes ingress, actionability is determined by downstream evidence, not by the raw signal.

### Supporting evidence

- `email_qa_checklist.md` lines 77–107
- `FIC` lines 28–102 (Signal Identity And Signal Values; Portfolio Engine Zero-Signal Behavior)
- `FIC` line 98: "Do not display `0` as a third investment stance. Display it as neutral/flat/no new stance."

### Phase 2.5 assumption invalidated

Contract V2 §3.5 framed `signal: 0` as potentially producing a `hold` `RecommendationProjection` per adapter policy. **Wrong framing.** "Hold" implies active position management; `0` is neutral / no new stance.

`apps/web/src/lib/prototype-store/entities/recommendation-projection.ts:30` defines `action: "buy" | "sell" | "hold" | "rebalance"`. The `"hold"` value is misframed for `signal: 0`.

### Phase 2.6 interpretation

- Drop `"hold"` from `RecommendationProjection.action` when referring to `signal: 0`.
- Replace with **`"neutral"`** or simply **no projection** for `signal: 0` when no prior position exists.
- Account-level close evidence comes from `AccountIntents.legs` (zero-weight or closing deltas), NOT from raw signal.
- UI copy update: never show "Hold AAPL" for `signal: 0`. Show "Neutral / no new stance" or suppress.

### Surfaces unblocked

- Surface 2 (Recommendations list) — render rule clarified
- Surface 3 (Recommendation detail) — render rule clarified

### Contract impact

- `RecommendationProjection.action` enum changes: `"buy" | "sell" | "neutral" | "rebalance"` (no `"hold"`)
- Adapter rule: `signal: 0` with no prior account-level state → no projection. `signal: 0` with prior nonzero → optional neutral projection (informational only).

### Test impact

- `recommendations.spec.ts` — add explicit assertion: `signal: 0` projection never renders a "hold" affordance
- Boundary test addition: no projection generates a close trade from `signal: 0` alone

---

## Q4 — ExecutionPolicy ownership

### Prior question

"Who owns the per-account versioned `ExecutionPolicy` record? Frontend? Backend? Where stored? How versioned?"

### Daniel's answer

**No per-account versioned `ExecutionPolicy` record exists in the trusted backend contract.** The only `ExecutionPolicy` in code is `apps/common/snaptrade_driver.models.ExecutionPolicy` (line 108 of that file) — an internal broker-driver behavior object controlling fresh snapshot, preview, force-order allowance, wait-to-confirm, and refresh behavior. **It is not investor policy.**

Current backend-owned account-execution state:

- `AccountPrefs(account_id, drift_threshold, min_order, excluded_assets, fractional_enabled, updated_at)` — current state, no history
- `AccountConsents` / `UserConsents(consent_key, consent_version, accepted_at, acceptance_source, ip_hash, user_agent_hash, correlation_id)` — versioned consent acceptance evidence
- `RiskLimits` — backend-owned exposure/risk caps
- `TradingControlStates` / `TradingControlEvents` — execution controls
- `TradeInputSnapshots` — immutable trade-time inputs

**No `policy_id` / `policy_version` envelope field.** `RiskApprovedEvent` only requires `intent_id`, `account_id`, `correlation_id` with optional `decision`, `constraints`. Exec Gateway does **NOT** validate `policy_id` or `policy_version`.

**No historical ledger of `AccountPrefs` changes today.** This is a future product requirement that needs a new explicit contract and table (see [`phase2-6-account-prefs-history-options.md`](phase2-6-account-prefs-history-options.md)).

### Supporting evidence

- `email_qa_checklist.md` lines 109–139
- `FIC` lines 355–390 (Policy Id And Policy Version)
- `FIC` lines 176–229 (Account Preferences And Capital Usage)
- `apps/common/snaptrade_driver/models.py:108` — `class ExecutionPolicy(BaseModel):` confirmed at this exact line

### Phase 2.5 assumption invalidated

Contract V2 §3.7 carried `ExecutionPolicyDecision` with `policy_id`, `policy_version` fields. **Wrong** — these don't exist on the backend.

Frontend code currently affected:

- `apps/web/app/api/v1/investor/execution-policy/route.ts` (BFF route)
- `apps/web/app/api/v1/investor/execution-policy/draft/route.ts` (BFF route)
- `apps/web/app/api/v1/investor/execution-policy/activate/route.ts` (BFF route)
- `apps/web/app/us/app/settings/automation/page.tsx` — Surface 4 page using `useExecutionPolicy`, `useExecutionPolicyDraft`, `useSaveExecutionPolicyDraft`
- `apps/web/src/lib/prototype-store/entities/execution-policy.ts` (entity)
- `apps/web/src/lib/prototype-store/entities/execution-policy-draft.ts` (entity)
- `packages/api-clients/src/generated/api.ts` lines 42, 215, 225, 289, 340, 801 (`execution_policy_id` / `execution_policy_version`)
- `packages/api-clients/src/generated/api.gen.ts` lines 1119, 1120, 1156, 1157 (same)

### Phase 2.6 interpretation

- Drop frontend-facing `policy_id` / `policy_version` from contract, generated client, BFF routes, and prototype-store entities.
- **Surface 4 is reframed** as the "Account Controls Center" — an editor + history viewer over `AccountPrefs` (writeable subset) + `RiskLimits` (read-only display) + `UserConsents` (acceptance flow) + `TradingControlStates` (read-only execution-control state).
- The new `AccountPrefsHistory` (Daniel's ask) is the audit-evidence backbone for investor changes. Until that table exists, the BFF retains a prototype-store ledger; see [`phase2-6-account-prefs-history-options.md`](phase2-6-account-prefs-history-options.md).
- `apps/common/snaptrade_driver.models.ExecutionPolicy` stays in Daniel's repo, owned by trade-manager broker-driver code, and is never surfaced.

### Surfaces unblocked

- Surface 4 (reframed as Account Controls Center) — design can proceed; implementation blocked on Contract V3 + AccountPrefs History contract

### Surfaces still blocked

- Surface 4 (implementation) — blocked on AccountPrefs History contract being agreed with Daniel

### Contract impact

- Drop `ExecutionPolicy*` entities from frontend
- Replace with `AccountPrefs` write contract + `AccountPrefsHistory` write contract + `UserConsents` acceptance contract + read-only views of `RiskLimits` and `TradingControlStates`
- OpenAPI generated client regeneration with `execution_policy_id` / `execution_policy_version` removed

### Test impact

- `automation-center.spec.ts` needs full rewrite for the reframed surface
- `managed-activation.spec.ts` removes `executionPolicy` activation; replaces with `AccountTemplates` join via `POST /api/v1/accounts/{account_id}/templates`
- New: `account-prefs-history.spec.ts` (after PR-E lands)
- Tripwire: `policy_id` and `policy_version` become forbidden in frontend code (currently allowed because we were carrying them)

---

## Resolved summary

| Question                     | Status                                                               | Surfaces unblocked | New scope opened              |
| ---------------------------- | -------------------------------------------------------------------- | ------------------ | ----------------------------- |
| Q1 Risk reason partition     | **Resolved — binary ALLOW/DENY from risk**                           | 9, 13              | —                             |
| Q2 Template registry         | **Resolved — Admin Portal API over Spanner**                         | 5                  | —                             |
| Q3 Signal: 0 preservation    | **Resolved — preserved as neutral**                                  | 2, 3               | —                             |
| Q4 ExecutionPolicy ownership | **Resolved — does not exist; new AccountPrefs History scope opened** | 4 (design)         | AccountPrefs History contract |

---

## Open follow-up items for Daniel

Items that emerged from his answers and still need confirmation before adapter implementation:

1. **AccountPrefsHistory table location** — should the history table live in his Spanner instance or ours? (See `phase2-6-account-prefs-history-options.md`.)
2. **Admin Portal investor-facing ACL** — does he want the BFF to consume `/api/v1/*` endpoints directly with investor-scoped filtering, or does he prefer to ship a separate `/api/v1/investor/*` projection? (See `phase2-6-admin-portal-api-consumption-map.md`.)
3. **Trading-control investor-initiability** — which `TradingControlStates` modes (if any) are investor-initiable vs operator-only? (Surface 6 Pause/Resume needs this.)

These three follow-ups are tracked in `phase2-6-gap-register-v3-plan.md` as new gaps `GAP-PREFS-HISTORY-001`, `GAP-ACL-005`, and `GAP-CONTROL-INIT-011`.

---

## Scope lock

No backend changes. No frontend product behavior changes from this doc alone. No SEC 203A-2(e) boundary weakened. No new surface added. Phase 2.5 docs retained as historical evidence with supersession headers.
