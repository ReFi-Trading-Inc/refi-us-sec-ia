# Phase 2.6 Next PR Sequence

**Date:** 2026-05-30
**Source of truth:** [`phase2-6-authoritative-source-of-truth.md`](phase2-6-authoritative-source-of-truth.md)
**Status:** Ordered PR plan for Phase 2.6 work after this observation branch lands.

This doc defines the next 8 PRs in order, with objective, files touched, tests required, blockers, acceptance criteria, rollback risk, and Daniel-input requirement.

---

## PR-A — Authoritative source update

**Branch**: `phase2-6-doc-source-anchor`

### Objective

Anchor the Phase 2.6 source-of-truth declaration on `main`. Mark Phase 2.5 docs as superseded.

### Files touched

- `docs/phase2-6-authoritative-source-of-truth.md` (already in this observation branch)
- `docs/phase2-5-*.md` supersession headers (already in this observation branch)
- `README.md` — small "Backend source of truth for Phase 2.6" section (already in this observation branch)

### Tests required

- `pnpm scan-copy` green
- `pnpm typecheck` green
- `pnpm lint` green
- `pnpm contract-test` green
- `pnpm tripwire` green
- `pnpm test` green
- No E2E required

### Blockers

None.

### Acceptance criteria

- All Phase 2.5 docs listed in directive §8 carry the supersession header.
- README links to the new authoritative-source-of-truth doc and the three must-read backend authoritative docs in Daniel's repo.
- CI green.

### Rollback risk

Zero. Docs-only.

### Daniel input needed

No. Daniel already published `docs/authoritative/*`.

### Note

This observation branch (`phase2-6-repo-observation-and-authoritative-plan`) is a superset of PR-A scope plus the rest of the planning docs. PR-A may be merged as a single PR including all of Phase 2.6 planning, OR split into multiple PRs as listed below — at the user's discretion.

---

## PR-B — Contract V3 and Gap Register V3

**Branch**: `phase2-6-contract-v3`

### Objective

Author the full Contract V3 and Gap Register V3 docs (the V3 supersession of `phase2-5-signal-to-investor-product-contract.md` and `phase2-5-gap-register-v2-against-gitlab.md`).

### Files touched

- `docs/phase2-6-signal-to-investor-product-contract-v3.md` (new — supersedes V2)
- `docs/phase2-6-gap-register-v3-against-authoritative.md` (new — supersedes V2)
- `docs/phase2-6-contract-v3-plan.md` updated to mark complete (already in this branch as plan)
- `docs/phase2-6-gap-register-v3-plan.md` updated to mark complete (already in this branch as plan)

### Tests required

Same docs-only gate suite as PR-A.

### Blockers

PR-A merged.

### Acceptance criteria

- Contract V3 doc covers every object listed in `phase2-6-contract-v3-plan.md` §4 with full TS-style interface definitions, mapping tables, and rendering rules.
- Gap Register V3 doc covers every gap listed in `phase2-6-gap-register-v3-plan.md` with explicit owner, severity, surface impact, next action.
- README "Backend source of truth for Phase 2.6" section updated to link both new docs.
- CI green.

### Rollback risk

Zero. Docs-only.

### Daniel input needed

Recommended — Daniel review of the V3 contract before downstream code PRs land. Not strictly blocking, but lowers PR-C rework risk.

---

## PR-C — Frontend type and fixture realignment

**Branch**: `phase2-6-types-realignment`

### Objective

Replace stale Phase 2.5 types in code with Contract V3 types. Remove invented backend fields. Update generated OpenAPI client. Update fixtures. Update CompliancePreview to use new `BffEligibilityState`. Update RecommendationProjection to drop `"hold"`. Update tripwire forbidden-term list.

### Files touched (code)

- `packages/api-clients/openapi/refi-api.yaml` — remove `execution_policy_id`, `execution_policy_version`, `strategy_id`, regenerate
- `packages/api-clients/src/generated/api.ts`, `api.gen.ts` — regenerated
- `packages/api-clients/src/hooks/execution-policy.ts` — delete (and remove from index exports)
- `apps/web/src/lib/prototype-store/entities/execution-policy.ts` — delete
- `apps/web/src/lib/prototype-store/entities/execution-policy-draft.ts` — delete
- `apps/web/src/lib/prototype-store/entities/recommendation-projection.ts` — `action` enum updated (`"hold"` → `"neutral"`)
- `apps/web/src/lib/prototype-store/entities/exception-review.ts` — `ExceptionKind` union updated per Contract V3 plan §9
- `apps/web/app/api/v1/investor/execution-policy/route.ts` — delete (will return 410 Gone or remove handler entirely)
- `apps/web/app/api/v1/investor/execution-policy/draft/route.ts` — delete
- `apps/web/app/api/v1/investor/execution-policy/activate/route.ts` — delete
- `apps/web/app/us/app/_components/CompliancePreview.tsx` — replace `EligibilityCheck` ternary with `BffEligibilityState` model (REVIEW non-risk only)
- `apps/web/app/us/app/recommendations/[id]/page.tsx` — replace `action !== "hold"` actionability with neutral check
- `apps/web/app/us/app/recommendations/page.tsx` — update `RecommendationStatus` import path
- `apps/web/app/us/app/settings/automation/page.tsx` — hold off; full Surface 4 rewrite happens in PR-F. In PR-C, simply gate this page with a "Surface 4 reframing in progress" placeholder if needed
- `scripts/tripwire-investor-boundary.ts` — add `policy_id`, `policy_version` to forbidden term list (now that they don't exist anywhere in our code or Daniel's)
- `packages/config/blocked-terms.ts` — update if applicable

### Files touched (test)

- `apps/web/e2e/recommendations.spec.ts` — assert no "hold" affordance
- `apps/web/e2e/automation-center.spec.ts` — temporary skip pending Surface 4 rewrite (will be deleted in PR-F)
- `scripts/contract-assertions.ts` — add invariants: `risk verdict is binary`; `RecommendationProjection.action excludes 'hold'`

### Tests required

- `pnpm scan-copy`, `typecheck`, `lint`, `contract-test`, `tripwire`, `test` — all green
- `pnpm e2e` — green (Surface 4 spec may be skipped per above)

### Blockers

PR-B merged.

### Acceptance criteria

- Generated OpenAPI client has zero references to `execution_policy_id`, `execution_policy_version`, `strategy_id`.
- Tripwire forbids `policy_id`, `policy_version` in `apps/web/`.
- All E2E specs except automation-center continue to pass.
- The frontend builds (`next build`) successfully.

### Rollback risk

Medium. Deletes BFF routes and types. If any unforeseen consumer remains, rollback to revert deletes is straightforward (git revert).

### Daniel input needed

No.

---

## PR-D — AccountPrefs history contract

**Branch**: `phase2-6-account-prefs-history`

### Objective

Finalize the AccountPrefs History contract doc. Send to Daniel for ratification. Define the BFF prototype-store interim entity shape. Define the TS port + Python sidecar conformance test plan.

### Files touched

- `docs/phase2-6-account-prefs-history-options.md` updated to final spec (currently a plan with options)
- `docs/phase2-6-account-prefs-history-contract.md` (new — the final ratified contract; written after Daniel ratifies)
- `apps/web/src/lib/prototype-store/entities/account-prefs-history.ts` — entity shape stub (matches DDL §4)
- `docs/phase2-6-account-prefs-history-procedure-spec.md` (new — write procedure + parity test definitions)

### Tests required

Same docs-only gate suite as PR-A.

### Blockers

PR-B merged. **Daniel ratification of architecture choice (Option 3c hybrid recommended)**.

### Acceptance criteria

- The contract doc is signed off by Daniel.
- DDL shape ratified.
- Write procedure spec ratified.
- BFF prototype-store entity stub ready to be wired in PR-F.

### Rollback risk

Zero. Docs + one stub entity.

### Daniel input needed

**Yes — critical**. PR-D cannot be merged without Daniel ratification.

---

## PR-E — Admin Portal API proxy / BFF ACL design

> ⛔ **CANCELLED (2026-07-28).** Daniel rejected the Admin Portal as the investor
> boundary; the ACL moves into a dedicated backend `investor-api` service. This
> PR is replaced by **PR-E′** (typed investor-api client) and **PR-E″**
> (identity-ccid session exchange + multi-account) in
> [`phase2-7-daniel-direction-resolution.md`](phase2-7-daniel-direction-resolution.md) §7.
> Nothing below was implemented — `apps/web/src/lib/admin-portal-proxy/` does not
> exist — so the cancellation costs no code. Retained as historical record.

**Branch**: `phase2-6-admin-portal-proxy`

### Objective

Implement the BFF admin-portal-proxy module. Per-endpoint ACL rules. TTL cache. SSE bridge. Per-route Zod-schema redaction. Investor-account scoping throughout.

### Files touched (code)

- `apps/web/src/lib/admin-portal-proxy/` (new module):
  - `client.ts` — base proxy fetch with `correlation_id`, `x-investor-account-id`, retry/timeout
  - `acl.ts` — investor-account scoping helpers
  - `cache.ts` — LRU TTL cache
  - `sse.ts` — SSE bridge from Admin Portal `/api/v1/stream` with per-event filtering
  - `endpoints/` — one file per Admin Portal endpoint:
    - `templates.ts`, `memberships.ts`, `rules.ts`
    - `accounts.ts`, `accountFlow.ts`, `accountActions.ts`, `riskLimits.ts`
    - `intents.ts`, `riskDecisions.ts`
    - `executionPlans.ts`, `orders.ts`, `ordersBlocked.ts`, `brokerInteractions.ts`
    - `reconciliation.ts`, `tradingControls.ts`
  - `redaction/` — per-endpoint Zod schemas with `.transform()` redaction
- `apps/web/app/api/v1/investor/` — new investor-scoped routes (per `phase2-6-admin-portal-api-consumption-map.md` §5):
  - `templates/`, `templates/[id]/`, `templates/memberships/`, `templates/rules/`
  - `account/flow/`, `account/actions/`
  - `risk-limits/`
  - `managed/activate/`, `managed/deactivate/`
  - `intents/`, `intents/[id]/`
  - `execution/plans/`, `execution/plans/[id]/`
  - `orders/`, `orders/[id]/`, `orders/blocked/`
  - `broker-interactions/`, `broker-interactions/[id]/`
  - `reconciliation/discrepancies/`, `reconciliation/discrepancies/[id]/`
  - `controls/state/`
  - `stream/` (SSE bridge)

### Files touched (test)

- New E2E spec: `admin-portal-proxy.spec.ts` — every proxy endpoint returns only data scoped to investor's account; admin-only fields are absent
- Boundary spec: `admin-portal-proxy-acl.spec.ts` — attempting to access another investor's data returns 403/404 (depending on policy)
- New contract assertion: `admin-portal-proxy redaction schemas reject admin-only fields`
- New unit tests for cache TTL, SSE filtering, scoping helpers

### Tests required

- All gates green
- Full E2E green
- **Security spec**: dedicated test that proves admin-only fields are not present in any investor response

### Blockers

PR-C merged. **GAP-ACL-005 Daniel ratification** (BFF-side filter vs Admin Portal investor-projection).

### Acceptance criteria

- Every endpoint from `phase2-6-admin-portal-api-consumption-map.md` §4 has a corresponding BFF proxy route or is explicitly NOT proxied.
- Every response is parsed through its redaction schema.
- SSE bridge is investor-account-filtered.
- Security spec passes.

### Rollback risk

Medium-high. Large new module. Mitigated by feature-flagging the new routes until verified.

### Daniel input needed

**Yes** — ACL strategy ratification before significant implementation.

---

## PR-F — Account Controls Center (Surface 4)

**Branch**: `phase2-6-account-controls-center`

### Objective

Replace Surface 4 (Automation Center / Execution Policy) with the new Account Controls Center: AccountPrefs editor + RiskLimits viewer + UserConsents acceptance + AccountPrefsHistory viewer.

### Files touched (code)

- `apps/web/app/us/app/settings/automation/page.tsx` — full rewrite to "Account Controls Center"
- `apps/web/app/api/v1/investor/account-prefs/route.ts` (new) — GET (read current), PATCH (write + history)
- `apps/web/app/api/v1/investor/account-prefs/history/route.ts` (new) — GET history list
- `apps/web/app/api/v1/investor/consents/route.ts` (new) — Consent acceptance write
- `apps/web/src/lib/prototype-store/entities/account-prefs-history.ts` (from PR-D) — wired in
- `apps/web/src/lib/prototype-store/entities/execution-policy.ts` — already deleted in PR-C
- New hooks in `packages/api-clients/src/hooks/account-prefs.ts`

### Files touched (test)

- `apps/web/e2e/automation-center.spec.ts` — full rewrite OR delete
- `apps/web/e2e/account-controls-center.spec.ts` (new) — edit-and-confirm-history happy path; fail-closed on invalid drift; fail-closed on excluded_assets conflict; consent re-ack required for material change
- Contract assertions: AccountPrefs write produces exactly one history entry; atomic write invariant

### Tests required

- All gates green
- E2E green

### Blockers

PR-D ratified. PR-E merged. **GAP-PREFS-HISTORY-001 + GAP-PREFS-WRITE-002 + GAP-PREFS-AUDIT-003 ratified**.

### Acceptance criteria

- Surface 4 renders AccountPrefs editor + RiskLimits viewer + UserConsents flow + History viewer.
- Edits create AccountPrefsHistory entries with full audit metadata.
- Material changes require fresh consent acceptance.
- E2E green.

### Rollback risk

High — replaces a live surface. Mitigated by feature flag and side-by-side render during transition.

### Daniel input needed

**Yes** — already gathered in PR-D ratification.

---

## PR-G — Records Center (Surface 11) — correlation-spine implementation

**Branch**: `phase2-6-records-center-spine`

### Objective

Replace fabricated Records Center model with correlation-spine projections sourced from Admin Portal lifecycle endpoints.

### Files touched (code)

- `apps/web/app/us/app/documents/page.tsx` — extensive rewrite to render spine
- `apps/web/app/api/v1/investor/records/route.ts` — replace with proxy composing the spine
- `apps/web/app/api/v1/investor/records/[id]/route.ts` — same
- `apps/web/app/api/v1/investor/orders/[client_order_id]/lineage/route.ts` — reshape to use `OrderLifecycleProjection`
- `apps/web/src/lib/prototype-store/entities/decision-record.ts` — reshape to point at `RiskSnapshots.snapshot_hash`
- `apps/web/src/lib/prototype-store/entities/lifecycle.ts` — reshape against canonical 15-state vocabulary

### Files touched (test)

- New E2E: `records-center.spec.ts` — search by correlation_id; deep-link to a trade lineage; verify investor's account scope
- Contract assertions: spine traversal correctness; canonical order status set

### Tests required

- All gates green
- E2E green

### Blockers

PR-B merged. PR-E merged.

### Acceptance criteria

- Records Center renders the full spine for an executed intent.
- Deep-linking by any correlation ID works.
- Investor cannot see another investor's records.

### Rollback risk

Medium. Mitigated by feature flag.

### Daniel input needed

Optional — GAP-AUDIT-PACKET-013 if Phase 3 features land here.

---

## PR-H — Exception Review (Surface 10) — reframing

**Branch**: `phase2-6-exception-review-reframe`

### Objective

Rebuild Exception Review around `TradingControlStates` + blocked orders + reconciliation discrepancies + BFF-owned gates. Risk-rejected intents are NOT Exception Review items.

### Files touched (code)

- `apps/web/app/us/app/exceptions/page.tsx` — extensive rewrite
- `apps/web/app/api/v1/investor/exceptions/route.ts` — replace with composition of multiple source projections (control states, blocked orders, reconciliation, BFF gates)
- `apps/web/app/api/v1/investor/exceptions/[id]/resolve/route.ts` — resolution paths per source kind
- `apps/web/src/lib/prototype-store/entities/exception-review.ts` — reshape per new `ExceptionKind` union (already updated in PR-C)

### Files touched (test)

- `apps/web/e2e/exception-review.spec.ts` — rewrite per source kind
- Boundary spec: risk-rejected intents don't appear; resolution paths per kind enforced

### Tests required

- All gates green
- E2E green

### Blockers

PR-B merged. PR-E merged.

### Acceptance criteria

- Exception Review shows only resolvable items (control states, blocked orders, reconciliation, BFF gates).
- Risk-rejected intents redirect to Records Center as terminal evidence.
- Resolution paths per source kind are correct.

### Rollback risk

Medium. Mitigated by feature flag.

### Daniel input needed

Optional — GAP-CONTROL-INIT-011 (investor-initiable control modes) for full resolution paths.

---

## PR sequence summary

```
PR-A (docs anchor)
  → PR-B (Contract V3 + Gap Register V3 docs)
    → PR-C (types realignment, code) ─┐
    → PR-D (AccountPrefs history contract, docs + stub) ─┤
                                                          │
                                                          ├→ PR-E (Admin Portal proxy + ACL)
                                                          │     │
                                                          │     ├→ PR-F (Account Controls Center — Surface 4)
                                                          │     │
                                                          │     ├→ PR-G (Records Center — Surface 11)
                                                          │     │
                                                          │     └→ PR-H (Exception Review — Surface 10)
                                                          │
                                            Daniel ratification gates apply at PR-D, PR-E, PR-F
```

## Stop-and-ratify points

- After PR-A: source anchor confirmed
- After PR-B: contract direction confirmed by you + Daniel (recommended)
- After PR-D: AccountPrefs history contract confirmed by Daniel (**required**)
- Before merging PR-E: security review of ACL / redaction (**required**)
- After PR-F: investor regression sweep before promoting to staging

## Scope lock

No code changes from this doc alone. No backend changes. PR-by-PR scope as defined above; deviations require updating this doc first.
