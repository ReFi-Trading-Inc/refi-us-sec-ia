# Phase 2.5: Daniel backend reconciliation and signal-to-investor product boundary

**Branch:** `phase2-5-wip-rebase`
**Target:** **do not merge to `main`** — see [§6. Merge blockers for main](#6-merge-blockers-for-main).

---

## 1. PR title

**Phase 2.5: Daniel backend reconciliation and signal-to-investor product boundary**

---

## 2. Summary

- **Daniel's backend is the signal infrastructure.** `…/Daniels Back End/live-components-main` implements the ML inference pipeline, the strategy/pre-pipeline, and the Portfolio Analyzer FastAPI service. Its HTTP surface is five routes (`/get-upload-url`, `/process-upload`, `/get-upload-result/{blob_name}`, `/assets`, `/analyze`) plus MongoDB collections (`live_signals`, `asset_status`, `rl_predictions`, `sharpe_series`, `selected_features`, `available_strategies`, `requested_symbols`). It owns signal generation; it does not implement the investor-product API contract.
- **The ReFi frontend / BFF is the investor-product shell.** This repo (`refi-us-sec-ia`) carries the OpenAPI for 40+ `/api/v1/*` routes (auth, broker, recommendations, orders, exceptions, execution-policy, disclosures, support, records), the BFF route handlers under `apps/web/app/api/v1/investor/**`, the MSW mock layer, the persona fixtures, and the SEC 203A-2(e) boundary tests (§A–§D).
- **The missing production layer is the adapter contract** between Daniel's signal output and the SEC 203A-2(e) investor product. That layer — the `SignalToInvestorProductAdapter` — does not exist as code today. Phase 2.5 specifies it as a contract.
- **Phase 2.5 documents this boundary and keeps execution paths fail-closed.** The §A–§D replacement coverage proves the frontend boundary at the test-handle / data-attribute level. No path on the frontend leads to a per-trade Accept / Approve / Submit / investor-accept / staff approval / founder review affordance.
- **No production backend integration is claimed.** The investor-product server side is still a BFF + prototype JSON store + MSW. Wire-level backend assertions are out of scope for this branch.

---

## 3. What changed

Four documentation artifacts on this branch (in landing order):

| Doc                                                    | Commit                             | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/phase2-5-handoff.md`                             | `c51c0d7` (then `7de53df` refresh) | Initial handoff after §A–§D coverage shipped. Records branch state, green gates, known not-green gates, and the explicit merge rule.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `docs/phase2-5-gate-cleanup.md`                        | `5bc3d2e`                          | Gate-by-gate classification of every red gate. Each red gate is either fixed in branch, classified into a separately tracked cleanup branch (`phase2-5-lint-tooling`, `phase2-5-stale-e2e-cleanup`), or marked as environmental Playwright flake. Confirms branch is PR-review-ready but not merge-ready.                                                                                                                                                                                                                                                                                                       |
| `docs/phase2-5-daniel-backend-reconciliation.md`       | `1ffbd56`                          | Read-only audit of `…/Daniels Back End/live-components-main`. Inventories routes, schemas, account identifiers, lifecycle states, admin/investor commands, recommendation/rebalance/execution/compliance/exception/auth/persistence/OpenAPI surfaces. Classifies each row as exact-match / partial-match / frontend-only / backend-only / missing / conflict, with risk level, required action, owner, and merge-block status.                                                                                                                                                                                  |
| `docs/phase2-5-signal-to-investor-product-contract.md` | `70b39d1`                          | Phase 2.5 **merge gate contract** (not a Phase 3 implementation design). Defines `SignalToInvestorProductAdapter` and the chain `DanielSignalRaw → SignalCandidate → RecommendationProjection → EligibilityCheck → ExecutionPolicyDecision → {BrokerSubmission \| ExceptionReview \| RecordArtifact}`. Includes TypeScript-style interfaces for every contract object, a full mapping table for every Daniel field surfaced by the audit, SEC 203A-2(e) boundary statement, explicit non-goals, provisional decisions on five open product questions, production blockers list, and a contract-level test plan. |

The non-doc change on this branch (already shipped in earlier commits):

- §A `apps/web/e2e/compliance-fail-closed-structural.spec.ts` (6 tests)
- §B `apps/web/e2e/compliance-verdict-visibility.spec.ts` (6 tests)
- §C `apps/web/e2e/persona-switch-stable.spec.ts` (5 tests)
- §D `apps/web/e2e/support-boundary-preservation.spec.ts` (8 tests)
- Stable `data-testid` / `data-status` / `data-freshness` / `data-eligibility` / `data-tier` / `data-blocked` / `data-rule-id` / `data-category` / `data-ack-count` / `data-total-count` / `data-action` attributes on the BrokerStatusBanner, dashboard disclosure card, recommendation detail page, and support page.
- Test/mock-only `x-refi-persona` header path in `getActivePersona` (MSW-only; production code path unchanged).
- Deletion of `apps/web/e2e/compliance-fail-closed.spec.ts`, `apps/web/e2e/support-boundary.spec.ts`, and `apps/web/e2e/recommendations.spec.ts` (superseded by §A + §B + §D and Phase 2 `mode-branching.spec.ts`).
- Trim of `apps/web/e2e/persona-switch.spec.ts` to the one non-skipped David case.
- Fix of pre-existing `@refi/api-clients` typecheck failure in `compat.test.ts` (`OrderPreviewResult` was missing `expiry_at` + `policy_version`).

---

## 4. SEC 203A-2(e) boundary statement

The following invariants hold across every code path landed on this branch and are enforced by `scripts/tripwire-investor-boundary.ts` + the §A–§D test suite:

- **No per-trade Accept.** The investor recommendation detail page exposes no per-trade Accept affordance in any tier (Signal or Managed) under any eligibility verdict (ALLOW, REVIEW, DENY, UNAVAILABLE).
- **No investor-accept command.** No `investor-accept`, `accept_trade`, `acceptRecommendation`, or `accept-trade-button` testid or label appears anywhere in the investor UI.
- **No staff approval.** No staff / operator / admin approval affordance exists. The tripwire blocks the `staff approval`, `staff-approve-button`, `approve-recommendation-button`, `approve-for-execution-button` identifiers at source level.
- **No founder review.** No `founderApproveRecommendation`, `founder review`, or analogous label appears anywhere.
- **No support-led individualized advice.** §D `support-boundary-preservation.spec.ts` enforces, for both Managed (Maya) and Signal (David) personas, that the support surface refuses every SBR-\* classifier rule (buy/sell advice, recommendation approval, portfolio change, custom strategy, model override) and never exposes any of the nine forbidden labels (`accept_trade`, `investor-accept`, `approve for execution`, `accept and execute`, `edit recommendation`, `staff approval`, `execute now`, `rebalance approval`, `recommendation override`).
- **No direct execution from Daniel raw signal output.** The `phase2-5-signal-to-investor-product-contract.md` contract specifies that no path may take a `DanielSignalRaw` straight to a `BrokerSubmission`. Every `BrokerSubmission` MUST have a `decision_id` whose chain resolves back through `ExecutionPolicyDecision → EligibilityCheck → RecommendationProjection → SignalCandidate`.
- **Daniel signal output must pass through the future BFF adapter, eligibility engine, execution policy, broker submission path, exception flow, and records layer.** This is the load-bearing architectural rule the contract codifies. Any future implementation that bypasses any of these stages is a SEC 203A-2(e) boundary violation by construction.

---

## 5. Production blockers

These are **acknowledged blockers**, not Phase 2.5 implementation tasks. Phase 2.5 does not deliver them, and is not asking to:

- investor-product backend routes (40+ `/api/v1/*` per `phase2-5-daniel-backend-reconciliation.md` §2.1)
- durable investor profile storage
- durable disclosure storage
- durable execution policy storage
- eligibility engine (per-account ALLOW / REVIEW / DENY decision service)
- execution records
- broker submission records
- support boundary records
- adapter contract tests (per `phase2-5-signal-to-investor-product-contract.md` §9)
- Daniel signal fixture tests (per `phase2-5-signal-to-investor-product-contract.md` §9.1)
- end-to-end fail-closed tests (frontend coverage already shipped via §A; production wire-level equivalents pending the investor-product backend)

---

## 6. Merge blockers for main

Phase 2.5 is PR-review-ready, but **merge into `main` is blocked** until **all** of the following:

1. **`phase2-5-lint-tooling` must land first.** Multi-package ESLint rewire per `phase2-5-gate-cleanup.md` §3.1: add `@eslint/js` to `@refi/config` deps, set `"type": "module"` in `@refi/config/package.json`, add `eslint` to `@refi/api-clients` and `@refi/ui` devDeps, author flat configs for the latter two, migrate `apps/web` lint script from `next lint` (removed in Next 16) to `eslint .`, then fix any resulting lint errors. Acceptance: `pnpm lint` exits 0; no rules weakened.
2. **`phase2-5-stale-e2e-cleanup` must land first.** Per `phase2-5-gate-cleanup.md` §3.2: realign `eligibility.spec.ts` (3 cases), `auth.spec.ts:21`, `onboarding.spec.ts` (4 cases), and `support.spec.ts:39` to stable `data-testid` / `data-*` attributes instead of copy regex. Acceptance: full E2E exits 0; no copy-regex assertions remain except where the explicit purpose is to assert forbidden language.
3. **PR description must state Daniel backend is signal infrastructure only, not the investor-product backend.** This document satisfies that requirement. Any merge PR opened against this branch must carry forward this statement explicitly.

---

## 7. Validation

Latest known validation on this branch (`70b39d1`):

| Gate                                                  | Result                              |
| ----------------------------------------------------- | ----------------------------------- |
| `pnpm typecheck`                                      | ✅ green — 4 / 4 workspace packages |
| `pnpm test` (contract assertions + tripwire + vitest) | ✅ green — **126 / 126**            |
| §A `compliance-fail-closed-structural.spec.ts`        | ✅ green — 6 / 6                    |
| §B `compliance-verdict-visibility.spec.ts`            | ✅ green — 6 / 6                    |
| §C `persona-switch-stable.spec.ts`                    | ✅ green — 5 / 5                    |
| §D `support-boundary-preservation.spec.ts`            | ✅ green — 8 / 8 in isolation       |
| Focused §A–§D in one Playwright invocation            | ✅ green — 25 / 25                  |

**Not claimed green:**

- `pnpm lint` — red on baseline tooling drift; classified to `phase2-5-lint-tooling`.
- Full `pnpm --filter @refi/web exec playwright test` — partial; stale orthogonal-surface specs failing on baseline; classified to `phase2-5-stale-e2e-cleanup`. **Do not claim full E2E green until that branch lands.**

---

## 8. Reviewer guidance

This PR is a Phase 2.5 **boundary** PR. The reviewer's job is to confirm the architecture stays compliant, not to verify production backend integration. Specifically:

- **Review for boundary correctness.** The chain `DanielSignalRaw → SignalCandidate → RecommendationProjection → EligibilityCheck → ExecutionPolicyDecision → {BrokerSubmission | ExceptionReview | RecordArtifact}` in `phase2-5-signal-to-investor-product-contract.md` §2 is the load-bearing architecture rule. Confirm no shortcut exists.
- **Review for SEC 203A-2(e) product discipline.** Confirm the tripwire `FORBIDDEN_ACTION_IDS` / `FORBIDDEN_LABELS` are not weakened, the §A–§D specs are not weakened, and no new product surface bypasses them.
- **Review for no accidental investor-accept path.** Search the diff for `accept`, `approve`, `submit`, `investor-accept`, `staff`, `founder` in any UI / handler / route / fixture context. The intent is zero non-test occurrences in investor-facing code paths.
- **Review for no hidden Daniel backend mutation.** Confirm `git diff main...HEAD --stat` shows zero files under `…/Daniels Back End/live-components-main`. The audit was strictly read-only and must remain so.
- **Review for adapter contract completeness.** `phase2-5-signal-to-investor-product-contract.md` §3 (contract objects) and §4 (mapping table) must cover every Daniel field surfaced by the reconciliation audit. Unconfirmed fields are explicitly tagged `TODO(confirm-daniel-field)` — that is acceptable for a contract document; the downstream requirement is still pinned.
- **Do not review this PR as a production backend integration.** The investor-product backend is not implemented. The MSW + BFF + prototype JSON store remain the simulation layer. Production wire-level claims belong to a future PR, not this one.
