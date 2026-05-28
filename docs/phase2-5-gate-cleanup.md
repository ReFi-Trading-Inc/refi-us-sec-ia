# Phase 2.5 Gate Cleanup Inventory

**Date:** 2026-05-28
**Branch:** `phase2-5-wip-rebase`
**Goal:** Move the branch from "Phase 2.5 replacement coverage shipped" (commit `f9ae439`) to **PR-review-ready** by classifying every remaining red gate as either in-branch fixable, separately tracked baseline cleanup, environmental tooling drift, or environmental Playwright flake.

This document is the load-bearing artifact for the [Phase 2.5 merge rule](./phase2-5-handoff.md#merge-rule). A red gate that is not classified here blocks merge.

---

## 1. Gate inventory

### 1.1 `pnpm typecheck`

- **Command:** `pnpm typecheck`
- **Result:** ✅ green (4 / 4 workspace packages).
- **Action:** none.

### 1.2 `pnpm test` (contract + tripwire + vitest)

- **Command:** `pnpm test`
- **Result:** ✅ green, **126 / 126** tests passing.
- **Action:** none.

### 1.3 Focused §A–§D specs

- **Commands:**
  ```
  pnpm e2e compliance-fail-closed-structural.spec.ts
  pnpm e2e compliance-verdict-visibility.spec.ts
  pnpm e2e persona-switch-stable.spec.ts
  pnpm e2e support-boundary-preservation.spec.ts
  ```
- **Result:** ✅ green, **25 / 25** when run as a single Playwright invocation against one dev server.
- **Action:** none. The Phase 2.5 replacement coverage holds.

### 1.4 `pnpm lint`

- **Command:** `pnpm lint`
- **Result:** ❌ red on `@refi/api-clients`, `@refi/ui`, `@refi/web`.
- **Failure cause:** multi-package tooling drift.
  - `@refi/config/eslint/index.js` imports `@eslint/js`, but `@eslint/js` is **not declared** as a dependency of `@refi/config`. ESM resolution fails with `ERR_MODULE_NOT_FOUND`.
  - `@refi/config/package.json` does not set `"type": "module"`, so Node emits `MODULE_TYPELESS_PACKAGE_JSON` reparsing-as-ESM warnings on every run.
  - `@refi/api-clients` and `@refi/ui` declare `"lint": "eslint src --max-warnings=0"` but do **not** have `eslint` listed as a devDependency, and `shamefully-hoist=false` in `.npmrc` means `@refi/config`'s `eslint` does not reach their `node_modules/.bin/`.
  - `@refi/web` declares `"lint": "next lint --max-warnings=0"`. **Next.js 16 removed the `next lint` subcommand** (it now interprets `lint` as a project directory path and fails).
- **Classification:** **tooling drift, baseline (pre-existing on parent commit `1d59f9a`)**. Confirmed by `git stash` + re-run on parent — lint failed identically before the §A–§D work.
- **In-branch fix?** No.
- **Rationale:** restoring lint requires:
  1. adding `@eslint/js` (or equivalent) to `@refi/config` deps,
  2. adding `"type": "module"` to `@refi/config/package.json`,
  3. adding `eslint` (and possibly TypeScript-eslint plugins) to `@refi/api-clients` and `@refi/ui` devDeps,
  4. authoring `eslint.config.js` flat configs for `@refi/api-clients` and `@refi/ui`,
  5. migrating `@refi/web`'s lint script from `next lint` to `eslint .`,
  6. then fixing whatever wave of lint errors surfaces once the binaries actually run.

  That is a focused multi-package tooling PR. Doing it inside this branch would mix tooling rewiring with Phase 2.5 compliance coverage and risk surfacing unbounded lint debt.

- **Tracked separately:** see [Section 3](#3-separate-tracked-cleanup-branch) below.

### 1.5 Full `pnpm --filter @refi/web exec playwright test`

- **Command:** `pnpm --filter @refi/web exec playwright test`
- **Result after this cleanup pass (with `recommendations.spec.ts` deleted):** to be measured (was 66 / 93 + 2 flaky + 9 did-not-run before).

Per-failure classification:

| Spec                                                            | Cases | Pass in isolation?                                       | Classification                                                                                                                                                                                      | In-branch fix                                                                                                                                                                          |
| --------------------------------------------------------------- | ----- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recommendations.spec.ts`                                       | 4     | ❌ all fail                                              | **Stale baseline** — binds to removed `CompliancePreview` Submit affordance; selector `article, [data-testid=recommendation], .card, a[href*='/recommendations/']` does not match Phase 2 list page | **Yes — DELETED in this branch.** Coverage subsumed by §A `compliance-fail-closed-structural.spec.ts` + §B `compliance-verdict-visibility.spec.ts` + Phase 2 `mode-branching.spec.ts`. |
| `onboarding.spec.ts`                                            | 4     | ❌ all fail                                              | **Stale baseline** — broker form / risk-assessment copy drifted from spec                                                                                                                           | No — orthogonal to Phase 2.5 boundary. Tracked in [Section 3](#3-separate-tracked-cleanup-branch).                                                                                     |
| `support.spec.ts:39`                                            | 1     | ❌ fails                                                 | **Stale baseline** — success-banner copy regex                                                                                                                                                      | No — tracked separately.                                                                                                                                                               |
| `eligibility.spec.ts`                                           | 3     | ❌ all fail                                              | **Stale baseline** — `/us/eligibility` no longer renders a "US person" checkbox the test calls `check()` on                                                                                         | No — tracked separately.                                                                                                                                                               |
| `auth.spec.ts:21`                                               | 1     | ❌ fails                                                 | **Stale baseline** — SIWE copy regex on `/us/auth/connect`                                                                                                                                          | No — tracked separately.                                                                                                                                                               |
| `exception-review.spec.ts:39`                                   | 1     | ✅ passes in isolation (17 / 17 with managed-activation) | **Flaky Playwright** — full-suite parallel-worker contention on Next dev server                                                                                                                     | No fix needed (environmental).                                                                                                                                                         |
| `managed-activation.spec.ts:255`                                | 1     | ✅ passes in isolation                                   | **Flaky Playwright** — same root cause                                                                                                                                                              | No fix needed (environmental).                                                                                                                                                         |
| `support-boundary-preservation.spec.ts` David allowed_technical | 1     | ✅ passes in isolation (8 / 8 §D, 25 / 25 focused)       | **Flaky Playwright** — same root cause; React hydration / dev-server contention under heavy parallel load                                                                                           | No fix needed. Spec already uses `mode: "serial"` within file, `expect.poll` controlled-input fills, network-idle hydration waits.                                                     |
| `support-boundary-preservation.spec.ts` SBR-001                 | 1     | ✅ passes in isolation                                   | **Flaky Playwright** — same root cause                                                                                                                                                              | No fix needed.                                                                                                                                                                         |

---

## 2. In-branch changes applied (this commit family)

- **Deleted** `apps/web/e2e/recommendations.spec.ts`. All 4 cases either bind to the removed `CompliancePreview` / per-trade Submit affordance (which Phase 2.5R-19 deliberately removed and Surface 1 + 7 reinforced) or use a CSS selector that no longer matches the Phase 2 mode-aware list page. Coverage is fully replaced by:
  - `apps/web/e2e/compliance-fail-closed-structural.spec.ts` (§A) for the detail-page boundary.
  - `apps/web/e2e/compliance-verdict-visibility.spec.ts` (§B) for verdict visibility.
  - `apps/web/e2e/mode-branching.spec.ts` (Phase 2 Surface 1) for the list page.

No product source changes were needed in this cleanup pass.

---

## 3. Separate tracked cleanup branch

The following gate failures are **explicitly classified as out-of-scope for `phase2-5-wip-rebase`** and must be resolved on a separate branch before any merge into `main`:

### 3.1 Lint tooling rewire — `phase2-5-lint-tooling` (proposed branch name)

**Owner:** TBD (front-end tooling).
**Scope:**

- Add `@eslint/js` to `@refi/config/package.json` deps and set `"type": "module"`.
- Add `eslint` (matching the version range used by `@refi/config`) to devDependencies of `@refi/api-clients` and `@refi/ui`.
- Create `eslint.config.js` flat configs in `@refi/api-clients` and `@refi/ui` that re-export `@refi/config/eslint/index.js`'s base config.
- Migrate `apps/web/package.json` lint script from `next lint --max-warnings=0` to `eslint . --max-warnings=0`.
- Fix any lint errors that surface once the binaries actually run.

**Acceptance criteria:**

- `pnpm lint` exits 0.
- No lint rules are weakened relative to `@refi/config/eslint/index.js` as it stands today.
- The tripwire rules (`scripts/tripwire-investor-boundary.ts`) remain the load-bearing boundary check; lint failures alone never substitute for tripwire failures.

### 3.2 Stale orthogonal-surface e2e specs — `phase2-5-stale-e2e-cleanup` (proposed branch name)

**Owner:** TBD (qa / front-end).
**Scope:**

- `apps/web/e2e/eligibility.spec.ts` — update to current eligibility form fields (no "US person" checkbox) OR delete if the flow is now covered by a sibling spec.
- `apps/web/e2e/auth.spec.ts:21` — replace SIWE copy regex with stable data-testid or delete if redundant.
- `apps/web/e2e/onboarding.spec.ts` (4 cases) — realign broker / risk-assessment cases to the current form layout.
- `apps/web/e2e/support.spec.ts:39` — replace `/submitted|received|support request/i` copy regex with a stable `data-testid="support-success-banner"` or similar.

**Acceptance criteria:**

- Each rewritten case uses stable data-testid / data-status / data-eligibility / data-tier / data-blocked / data-rule-id / data-category attributes rather than free-text copy regex (except where the explicit purpose of the test is to assert forbidden language).
- `pnpm --filter @refi/web exec playwright test` exits 0 across the full suite.
- No SEC 203A-2(e) boundary assertion is weakened. No per-trade Accept, Approve, Submit, investor-accept, staff-approval, founder-review, or support-led-advice affordance is reintroduced.

### 3.3 Full-suite parallel-load flakes — environmental, no separate branch needed

The flakes documented in 1.5 (exception-review, managed-activation:255, two §D cases) are environmental: they pass in isolation and in focused multi-spec runs. The root cause is Next.js dev-server contention under heavy parallel-worker load. Long-term remediation belongs in a Playwright config / CI tier rather than a code branch:

- Either reduce `workers` in `playwright.config.ts` (cost: longer wall-clock), or
- Run e2e against `next build && next start` instead of `next dev` (cost: longer setup), or
- Mark specifically the `support-boundary-preservation`, `exception-review`, and `managed-activation` suites with `test.describe.configure({ mode: "serial" })` at a global level and accept the wall-clock cost.

None of these belong in `phase2-5-wip-rebase` because none affect the boundary correctness of the §A–§D coverage and all three are also load-bearing dev-velocity decisions.

---

## 4. Final pass / fail state on this branch

| Gate                                           | State                 | Notes                                                                |
| ---------------------------------------------- | --------------------- | -------------------------------------------------------------------- |
| `pnpm typecheck`                               | ✅ green              | 4 / 4 packages                                                       |
| `pnpm test`                                    | ✅ green              | 126 / 126                                                            |
| §A `compliance-fail-closed-structural.spec.ts` | ✅ green              | 6 / 6                                                                |
| §B `compliance-verdict-visibility.spec.ts`     | ✅ green              | 6 / 6                                                                |
| §C `persona-switch-stable.spec.ts`             | ✅ green              | 5 / 5                                                                |
| §D `support-boundary-preservation.spec.ts`     | ✅ green in isolation | 8 / 8; flaky under full parallel load                                |
| Focused §A–§D in one run                       | ✅ green              | 25 / 25                                                              |
| `pnpm lint`                                    | ❌ red                | Tracked: §3.1 — tooling rewire                                       |
| Full E2E suite                                 | ⚠️ partial            | Tracked: §3.2 (stale orthogonal specs) + §3.3 (parallel-load flakes) |

---

## 5. Merge readiness

- **Ready for PR review?** **Yes.** The §A–§D Phase 2.5 replacement coverage is complete, green, and structurally stable. Every other red gate is explicitly classified above with owner / scope / acceptance criteria.
- **Ready to merge into `main`?** **No.** The merge rule from `docs/phase2-5-handoff.md` requires the §3.1 (lint tooling) and §3.2 (stale orthogonal specs) branches to land first.

---

## 6. Scope lock — carried forward

No new product surfaces. No Daniel backend changes (canonical: `…/Daniels Back End/live-components-main`). No weakening of SEC 203A-2(e) boundary assertions. No per-trade Accept, Approve, Submit, investor-accept, staff approval, founder review, or support-led advice affordances reintroduced.
