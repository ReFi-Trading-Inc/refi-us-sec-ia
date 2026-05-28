# Phase 2.5 Post-Rebase Checkpoint

**Date:** 2026-05-27
**Branch:** `phase2-5-wip-rebase`
**Final HEAD:** `ba33a6e chore: preserve phase 2.5 wip before rebase`
**Rebased onto:** `5291dda feat: add exception review surface` (`origin/main` at checkpoint time)
**Origin/main base before rebase:** `e2930b9 feat: investor bff, prototype state store, and boundary enforcement`

This document records the state of the Phase 2.5 work after it was rebased onto post-Surface-7 `origin/main`. The branch is pushed to `origin/phase2-5-wip-rebase` but **not merged**. Replacement coverage backlog is tracked separately in `docs/phase2-5-replacement-e2e-backlog.md`.

---

## Status statement

- **Core gates green.** typecheck, tripwire, contract-test, vitest (`pnpm test`), `next build` all pass on a clean shell.
- **Phase 2 Surface 1–7 E2E green.** All 48 Surface 1–7 tests pass on a clean store.
- **Phase 2.5 skipped legacy-affordance tests require replacement coverage before merge.** Sixteen Phase 2.5 e2e tests are intentionally `test.skip(...)` with inline TODO markers pointing to the replacement backlog. Without those replacements, the branch is **not yet ready to merge**.

---

## Conflict resolution summary

**18 conflicts** were surfaced by the rebase:

- 14 content (`UU`)
- 2 add/add (`AA`): `packages/api-clients/src/hooks/exceptions.ts`, `packages/api-clients/vitest.config.ts`
- 2 modify/delete (`UD`): `packages/api-clients/src/mocks/fixtures/{david,maya}.ts`

### Resolved files (all 18)

#### Phase 2 wins (Surfaces 1–7 version kept verbatim)

| File                                           | Why Phase 2 won                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/api-clients/src/hooks/exceptions.ts` | Phase 2 Surface 7 is the full implementation (`useInvestorExceptions`, `useResolveException`, the UI/backend resolution alias, etc.). Phase 2.5's 17-line stub explicitly anticipated "full Exception Review queue + page lands in a follow-up" — Phase 2 was that follow-up. The stub function `useExceptions` is preserved alongside as a `/v1/exceptions` direct-read entry for Phase 2.5 consumers. |
| `apps/web/app/us/app/recommendations/page.tsx` | Phase 2's 244-line mode-aware list page carries every `data-testid` the `mode-branching.spec` depends on (`signal-upgrade-cta`, `managed-banner`, `signal-review-action`, `signal-act-manually-action`, `recommendations-mode-badge`, etc.). Phase 2.5's 83-line generic list lacked them.                                                                                                              |

#### Phase 2.5 wins (richer UX, boundary verified clean)

| File                                                          | Why Phase 2.5 won                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/app/us/app/recommendations/[id]/page.tsx`           | Phase 2.5's 615-line richer detail page (`advisory_context`, `explanation`, `model_factors`, `decision_record`, `guardrails`). Boundary scan: zero occurrences of `useSubmitOrder`, `signal-place-order-button`, `AcceptButton`, `accept_trade`, `investor-accept`, `approve_exception`, `reject_exception`. |
| `packages/api-clients/src/mocks/handlers.ts`                  | Phase 2.5's composing-index over per-domain handler files (`handlers.account.ts`, `handlers.bff.ts`, `handlers.exceptions.ts`, etc.). URL coverage verified: every Phase 2 mocked endpoint is reachable in a per-domain handler.                                                                             |
| `packages/api-clients/src/mocks/fixtures/david.ts`, `maya.ts` | Deletion accepted. The replacement `fixtures/personas/{david-kim,maya-thompson,sarah-patel,index,types}.ts` (1797 lines total) supersedes the 184-line legacy fixtures.                                                                                                                                      |
| `apps/web/app/us/app/home/page.tsx`                           | Phase 2.5's status-oriented MIG-P2.5-09 home (`BrokerStatusBanner` + `Dashboard` + `RecentActivity`). I prepended `<ModeStatusStrip />` so the Surface 1 `mode-status-strip` testid stays available to `mode-branching.spec`.                                                                                |
| `apps/web/app/us/app/account/page.tsx`                        | Phase 2.5's `account.walletStatusConnected` / `B.connectedLabel` copy bindings.                                                                                                                                                                                                                              |
| `apps/web/app/us/app/documents/page.tsx`                      | Phase 2.5's interactive disclosure-ack flow (replaces Phase 2's static read-only list).                                                                                                                                                                                                                      |
| `packages/api-clients/src/hooks/recommendations.ts`           | Phase 2.5's `./generated/api` import path + `useRecommendationDetail` + `usePatchRecommendation` hooks. Note: `usePatchRecommendation` is Reject + Request-manual-review only; per Phase 2.5R-19, **no per-trade Accept path is reintroduced**.                                                              |
| `packages/api-clients/src/hooks/session.ts`                   | Phase 2.5's `./generated/api` import path + `useTier` hook.                                                                                                                                                                                                                                                  |

#### Manual union files

| File                                    | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/app/us/_content/app-copy.ts`  | Union: kept Phase 2's `manualAction` + sibling `signalManual`/`signal`/`managed` blocks (Surface 1 list page consumes these) AND added Phase 2.5's deep-detail labels (`summary`, `whyNow`, `modelFactors`, `tier.signal`/`managed`/`managedException`) inside `detail`. **Phase 2.5's `managedException.title` reworded** from "Exception — your approval required" to "Resolve exception" and `body` reworded to "until you resolve the exception" — keeps the Surface-7 eligibility-not-approval framing. |
| `packages/api-clients/src/index.ts`     | Manual union: `export * from "./generated/api"` (Phase 2.5 canonical surface) + explicit re-exports of Phase 2 Surface-1 projection types (`SubscriptionMode`, `SubscriptionModeState`, `RecommendationProjection`, `RecommendationProjectionStatus`, `InvestorRecommendationsResponse`) from `./compat`. Both Phase 2 Surfaces 2–7 hooks and Phase 2.5 BFF / persona / scenario hooks exported. Phase 2.5 stub `useExceptions` preserved alongside Surface 7's canonical `useInvestorExceptions`.           |
| `packages/api-clients/package.json`     | Union of scripts: Phase 2.5's `validate:openapi`, `check:openapi-drift`, `test:watch` + Phase 2's `build: pnpm generate`. Vitest pinned to Phase 2.5's `^2.1.0` to match the new contract tests.                                                                                                                                                                                                                                                                                                             |
| `packages/api-clients/vitest.config.ts` | Phase 2.5's variant (adds `coverage: { enabled: false }`).                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `pnpm-workspace.yaml`                   | Kept Phase 2's `allowBuilds` additions (`bufferutil`, `keccak`, `msw`, `sharp`, `unrs-resolver`, `utf-8-validate`).                                                                                                                                                                                                                                                                                                                                                                                          |
| `pnpm-lock.yaml`                        | Deleted and regenerated via `pnpm install` (15,330 lines).                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `.github/workflows/ci.yml`              | Both `pnpm test` (Phase 2.5 vitest contract + discipline) AND `pnpm --filter @refi/api-clients test` (Phase 2 api-clients vitest) preserved.                                                                                                                                                                                                                                                                                                                                                                 |

### Additional post-rebase fixes (Phase 2.5 WIP issues surfaced during typecheck)

- `packages/api-clients/src/compat.ts` — `_openapi.gen` → `api.gen` import path (Phase 2.5 changed the generate target).
- `packages/api-clients/src/compat.ts` — `OrderRequest` and `OrderPreviewResult` repointed from `Schemas[...]` (no longer in the OpenAPI YAML) to the hand-typed `./generated/api`.
- `apps/web/app/us/app/account/page.tsx` — `formatCurrency(...)` wrapped in `Number(...)` for `brokerAccount.equity` / `buying_power` (backend changed to decimal-string).
- `apps/web/app/us/app/activity/page.tsx` and `home/_components/dashboard.tsx` — `event.type` → `event.kind`, `event.created_at` → `event.ts` (canonical Daniel envelope shape).
- `packages/api-clients/src/__tests__/compat.test.ts` — `isKycTerminal("under_review")` expectation flipped from `true` to `false` to match the new product-intent comment on `kyc.ts`.

---

## Gates run

```
git diff --check                   ✓ no whitespace/conflict markers
pnpm tripwire                      ✓ 0 violations across 156 files
pnpm --filter @refi/web typecheck  ✓
pnpm contract-test                 ✓ 10/10 assertions
pnpm test                          ✓ 126/126 vitest + contract + tripwire
pnpm --filter @refi/web build      ✓ clean shell
```

---

## E2E results

### Phase 2 Surface 1–7 (all green on a clean store)

| Spec                           | Pass / Total | Notes                                                                   |
| ------------------------------ | ------------ | ----------------------------------------------------------------------- |
| `mode-branching.spec.ts`       | 2 / 2        | Updated stale `exceptions-placeholder-page` testid → `exceptions-page`. |
| `automation-center.spec.ts`    | 5 / 5        |                                                                         |
| `managed-activation.spec.ts`   | 7 / 7        |                                                                         |
| `managed-pause-resume.spec.ts` | 5 / 5        |                                                                         |
| `disclosure-reack.spec.ts`     | 8 / 8        |                                                                         |
| `profile-reactivation.spec.ts` | 11 / 11      |                                                                         |
| `exception-review.spec.ts`     | 10 / 10      |                                                                         |

**Subtotal: 48 / 48.**

### Phase 2.5 (partial)

| Spec                             | Pass | Skip | Total | Notes                                                                   |
| -------------------------------- | ---- | ---- | ----- | ----------------------------------------------------------------------- |
| `support-boundary.spec.ts`       | 3    | 0    | 3     | Fully green.                                                            |
| `persona-switch.spec.ts`         | 1    | 5    | 6     | One David case passes. Five cases skipped — see "Skipped suites" below. |
| `compliance-fail-closed.spec.ts` | 0    | 11   | 11    | Entire suite skipped — see "Skipped suites" below.                      |

**Subtotal: 4 / 4 passing; 16 skipped.**

---

## Skipped suites

Each skipped test carries an inline `// TODO(replacement-e2e-backlog):` marker that names the replacement category in `docs/phase2-5-replacement-e2e-backlog.md`. The skips are deliberate — none represent broken Phase-2 Surface 1–7 behavior. They test affordances that Phase 2.5 itself removed in P2.5R-19 (per the WIP's own comment trail) or that bind to brittle copy strings that need stable test-id replacements.

### `compliance-fail-closed.spec.ts` — 11 tests skipped

**Reason:** The suite binds to the disabled-Submit state of an "Approve for execution" Button rendered by `apps/web/app/us/app/_components/CompliancePreview.tsx`. That component and its button were removed in Phase 2.5R-19 (the WIP's own decision: "Managed mode has no per-rec Approve button; investor accept = ExecutionPolicy activation + per-exception approval in Exception Review only", per `apps/web/app/us/_content/app-copy.ts` doc-comment). Phase 2 Surface 1 + Surface 7 took the same boundary further: the tripwire now blocks the "approve for execution" label entirely. The button no longer exists in any code path — there is nothing for these tests to bind to.

**Replacement coverage required:** §A (structural fail-closed compliance test) and §B (compliance verdict visibility replacement) in `docs/phase2-5-replacement-e2e-backlog.md`. Once those land, this suite can either be deleted or rewritten to assert button-absence.

### `persona-switch.spec.ts` — 5 of 6 tests skipped

**Skipped cases:**

1. "Maya (default) — dashboard shows broker connected fresh" — binds to literal copy "connected — fresh" on the dashboard.
2. "Sarah — broker stale banner visible on home" — binds to literal copy "data is stale".
3. "Sarah — recommendation rec_s_001 sits in compliance REVIEW" — binds to the removed CompliancePreview's `REVIEW_TAX_IMPACT` badge.
4. "Maya — disclosure card shows 0 of 5 (default ack state)" — binds to literal copy "0 of 5 acknowledged".
5. "Maya — Next action surfaces disclosure acknowledgment" — binds to literal copy "acknowledge regulatory disclosures".

**Reason:** The Phase 2.5 `BrokerStatusBanner` / `Dashboard` components do not currently surface those exact strings against the seeded persona MSW responses. The bindings are brittle copy assertions that broke when the components were refactored in the same WIP series. **Pre-existing Phase 2.5 polish gap — not introduced by Surfaces 1–7.**

**Passing case:** "David — onboarding incomplete blocks managed execution" — exercises the `data-testid` / state-based assertion that is structurally stable.

**Replacement coverage required:** §C (persona-switch replacement tests) in `docs/phase2-5-replacement-e2e-backlog.md`. Replacements should use stable `data-testid` attributes on `BrokerStatusBanner` and the disclosure card rather than copy regexes.

---

## Replacement-test backlog

See `docs/phase2-5-replacement-e2e-backlog.md` for the four categories of required replacement coverage:

- **§A** Structural fail-closed compliance test — proves no per-trade submit/approve/accept path exists on investor recommendation detail.
- **§B** Compliance verdict visibility replacement — eligibility posture / review reason / exception reason rendering without a per-trade Approve button.
- **§C** Persona-switch replacement tests — stable `data-testid` assertions on `BrokerStatusBanner` and disclosure card; tolerant of copy changes.
- **§D** Support-boundary preservation — confirms support remains non-advisory and cannot mutate policy / exception / recommendation / execution state.

Each skipped test has an inline `// TODO(replacement-e2e-backlog): ...` marker referencing its replacement category.

---

## Daniel backend repo

**Not touched.** Daniel's backend lives at `/Users/za/Library/CloudStorage/Dropbox/Nature Of Commerce LLC/ReFi/Website/Daniels Back End/live-components-main` — a separate repo. (Earlier drafts of this doc referenced `refinity-main-main`; that sibling folder is an older snapshot and is _not_ canonical. The canonical folder is `live-components-main`. See `memory/scope_daniel_backend_path.md`.) No file under that path was read, written, deleted, or otherwise modified by this rebase or by any commit on `phase2-5-wip-rebase`. The Phase 2.5 alignment documents at `refi-build-docs/spec-current/07-daniel-blueprint-alignment.md`, `09-daniel-answers-and-product-reframe.md`, and `12-daniel-2026-05-20-guidance.md` are documentation about Daniel's contract; they arrived through the rebase with zero conflict and zero modification.

---

## SEC 203A-2(e) investor boundary

**Not weakened.** Verified by:

- **Tripwire** at 0 violations across 156 scanned files (3 more than before the rebase because Phase 2.5 added e2e + handler files to the scan set). Tripwire continues to block: `approve_exception`, `reject_exception`, `approve exception`, `execute exception`, `override guardrail`, `override risk`, `investor accept`, `approve for execution`, `accept and execute`, `AcceptButton`, `accept_trade`, `investor-accept`, the `acceptRecommendation`/`approveTrade`/`approveRebalance`/`adminRebalance` family, and the `founderApproveRecommendation`/`staffReviewAdvice` family.
- **Contract-test** still passes 10/10 including `Forbidden investor actions are not in InvestorActions`, `ExceptionResolutions includes all 6 required categories`, and `InvestorActionReceipt and RecordAccessLog are independent streams`.
- **Direct grep**: `useSubmitOrder` is not imported in any investor recommendations UI (`recommendations/[id]/page.tsx`, `recommendations/page.tsx`).
- **Copy normalization**: Phase 2.5's `managedException` block — which had used "your approval required" — was reworded during the union merge to "Resolve exception" to align with Surface 7's eligibility-not-approval framing.
- **Skipped tests are not regressions**: every skip points at an affordance that Phase 2.5R-19 itself removed (CompliancePreview + the per-rec Approve button) or at brittle copy that needs stable-testid replacements. Re-enabling these tests in their current form would require reintroducing the very affordances the boundary now blocks.

---

## Not ready to merge

The branch is **not yet ready for merge into `main`**. Required follow-up before a merge request:

1. Land the four replacement-coverage categories in `docs/phase2-5-replacement-e2e-backlog.md` as real, passing e2e specs.
2. Delete or rewrite the suspended suites once their replacements ship.
3. Re-run the full gate set including the four new spec areas.

Until those land, the branch represents a clean rebase floor: Phase 2.5 work preserved, Phase 2 Surface 1–7 behavior intact, no boundary weakened, no Daniel-backend touched.

---

## 2026-05-28 replacement-coverage update

All four replacement sections (§A–§D) shipped as passing specs:

| Section                          | Spec file                                                | Tests |
| -------------------------------- | -------------------------------------------------------- | ----- |
| §A Structural fail-closed        | `apps/web/e2e/compliance-fail-closed-structural.spec.ts` | 6     |
| §B Verdict visibility            | `apps/web/e2e/compliance-verdict-visibility.spec.ts`     | 6     |
| §C Persona-switch stable         | `apps/web/e2e/persona-switch-stable.spec.ts`             | 5     |
| §D Support-boundary preservation | `apps/web/e2e/support-boundary-preservation.spec.ts`     | 8     |

Files changed (no product-behavior change — additive test handles only):

- `apps/web/app/us/app/_components/BrokerStatusBanner.tsx` — `data-testid="broker-status-banner"`, `data-status`, `data-freshness`.
- `apps/web/app/us/app/home/_components/dashboard.tsx` — `data-testid="disclosure-ack-card"`, `data-ack-count`, `data-total-count`, `data-action`.
- `apps/web/app/us/app/recommendations/[id]/page.tsx` — `data-testid="recommendation-detail-page"`, `data-tier`, `data-eligibility`, `data-pending-exception`; eligibility card + exception card + signal-advisory testids.
- `apps/web/app/us/app/support/page.tsx` — `data-testid="support-page"` with `data-blocked`, `data-rule-id`, `data-category`; `data-testid="support-submit-button"`.
- `apps/web/playwright.config.ts` — `NEXT_PUBLIC_REFI_DATA_ADAPTER: "mock"` so the persona-aware MSW handlers run in e2e.
- `packages/api-clients/src/mocks/fixtures/personas/index.ts` — test/mock-only `x-refi-persona` header path consulted before the cookie in `getActivePersona`. Only reachable through MSW handlers; production code path is unchanged.

Legacy specs removed:

- `apps/web/e2e/compliance-fail-closed.spec.ts` — entire suite was `test.skip(true, …)`; all 11 cases replaced by §A + §B.
- `apps/web/e2e/support-boundary.spec.ts` — 3 copy-regex cases replaced by §D.
- `apps/web/e2e/persona-switch.spec.ts` — trimmed to the David onboarding-incomplete case (orthogonal to §C, not duplicated).

Production behavior: unchanged. Daniel backend (`live-components-main`): untouched.

Known limitation: §A–§D are frontend / MSW / BFF boundary tests. They prove the investor UI and the support classifier refuse forbidden actions and surface the correct compliance posture. They do not assert that Daniel's backend itself refuses these actions on the wire — that contract layer lives in `live-components-main` and is the responsibility of that repo's integration tests.
