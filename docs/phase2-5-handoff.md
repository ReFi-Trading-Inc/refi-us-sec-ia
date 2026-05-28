# Phase 2.5 Handoff

**Date:** 2026-05-28
**Branch:** `phase2-5-wip-rebase`
**Latest commit:** see `git log -1` (gate-cleanup pass adds `docs/phase2-5-gate-cleanup.md` and deletes the stale `apps/web/e2e/recommendations.spec.ts` superseded by §A + §B).
**Pushed to:** `origin/phase2-5-wip-rebase`
**Not merged:** Do not merge into `main` — see [Merge rule](#merge-rule) below.

---

## What is green

- `pnpm typecheck` — all 4 workspace packages.
- `pnpm test` — contract assertions + tripwire + vitest, **126 / 126** passing.
- `pnpm e2e compliance-fail-closed-structural.spec.ts` — §A, **6 / 6**.
- `pnpm e2e compliance-verdict-visibility.spec.ts` — §B, **6 / 6**.
- `pnpm e2e persona-switch-stable.spec.ts` — §C, **5 / 5**.
- `pnpm e2e support-boundary-preservation.spec.ts` — §D, **8 / 8**.

---

## What is not green

1. **`pnpm lint` is blocked by baseline tooling drift.** `eslint` is not installed in `@refi/api-clients` or `@refi/ui`, and Next 16 removed the `next lint` command that `@refi/web`'s lint script invokes. Pre-existing on `1d59f9a` — confirmed by `git stash` + re-run on the parent commit. Not introduced by `f9ae439`.
2. **Full E2E suite has pre-existing baseline failures.** `apps/web/e2e/recommendations.spec.ts` (4 cases that bind to the removed `CompliancePreview` component), `apps/web/e2e/onboarding.spec.ts` (validation-error case), and `apps/web/e2e/support.spec.ts` (success-banner-after-submission case) fail on `1d59f9a` without any §A–§D changes. All are orthogonal to §A–§D scope and were left in place per the "do not change product scope" directive.
3. **§D flaked once under full-suite parallel load.** The "Maya (Managed) — allowed technical prompt unblocks submission" case timed out on `toBeEnabled` once when the Next dev server was under heavy parallel-worker contention. The spec passes **8 / 8** reliably in isolation (verified multiple times) and is already configured `mode: "serial"` within itself with hydration probes + `expect.poll`-driven controlled-input fills.

---

## Merge rule

**Do not merge `phase2-5-wip-rebase` into `main`** until we either:

- **(a) fix the baseline lint and full-E2E failures**, or
- **(b) explicitly classify them into a separate tracked cleanup branch** with owner, scope, and acceptance criteria.

The Phase 2.5 replacement coverage (§A–§D) is complete and passes; the blockers above are independent of that coverage. They must be resolved or formally split off before a merge request is opened.

---

## Scope lock — carried forward from prior phases

The following invariants are not negotiable on this branch or any branch derived from it:

- **No new product surfaces.** Phase 2 Surfaces 1–7 are the current ceiling. No Surface 8+ work belongs here.
- **No Daniel backend changes.** Daniel's backend (canonical path `…/Daniels Back End/live-components-main`) is read-only reference truth. No reads, writes, or deletions under that directory.
- **No weakening of the SEC 203A-2(e) boundary assertions.** The tripwire `FORBIDDEN_ACTION_IDS` and `FORBIDDEN_LABELS` lists are floor; the §A–§D test assertions are floor; neither may be loosened.
- **No per-trade Accept, Approve, Submit, staff approval, or investor-accept affordances.** Specifically forbidden: `accept_trade`, `investor-accept`, `approve_exception`, `reject_exception`, `approve for execution`, `accept and execute`, `Approve Trade`, `Approve Recommendation`, `staff approval`, `staff-approve-button`, `execute-now-button`, `rebalance-approval-button`, `recommendation-override-button`. The investor UI must remain advisory in Signal mode and governed by activation + execution policy + pause/resume + Exception Review in Managed mode.

---

## Pointers

- **`docs/phase2-5-gate-cleanup.md` — gate-by-gate classification, separate-cleanup-branch scopes, and merge-readiness verdict. Read this first if you are about to open a PR or merge.**
- `docs/phase2-5-replacement-e2e-backlog.md` — §A–§D requirement specification + 2026-05-28 completion update.
- `docs/phase2-5-post-rebase-checkpoint.md` — rebase conflict resolution log + 2026-05-28 replacement-coverage update.
- `memory/scope_daniel_backend_path.md` — canonical Daniel backend folder (`live-components-main`, NOT `refinity-main-main`).
- `memory/rule_no_per_trade_accept.md` — investor action catalog (allowed + forbidden).
- `scripts/tripwire-investor-boundary.ts` — source-level boundary enforcement.
