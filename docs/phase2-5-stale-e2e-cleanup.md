# Phase 2.5 Stale E2E Cleanup

**Date:** 2026-05-29
**Branch:** `phase2-5-stale-e2e-cleanup`
**Parent:** `phase2-5-contract-gap-v2-gitlab` @ `539e5b0`
**Audit mode:** test-only realignment + minimal product `data-testid` additions.

This document records the realignment of the Phase 2.5 stale E2E specs against
the actual current product surface (frontend + BFF + prototype-store seed). No
product behavior was changed. No SEC 203A-2(e) boundary was weakened. No
Daniel / GitLab backend file was touched.

---

## 1. Baseline failures (run on parent branch)

`pnpm e2e` against the four directive-named specs surfaced **12 failures** and
**1 flaky**. A subsequent full suite run surfaced an additional **4 failures**
in `recommendations.spec.ts` for a total of **16** stale-test failures across
**5 specs**.

| Spec                      | Test                                                      | Failure reason                                                                                    | Stale assumption                                                                                                              |
| ------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `eligibility.spec.ts`     | `eligible CA resident proceeds to auth`                   | `getByRole("checkbox", { name: /us person/i })` timed out                                         | US-person field is a **RadioGroup** ("Yes" / "No"), not a checkbox                                                            |
| `eligibility.spec.ts`     | `NY resident sees waitlist message`                       | Same                                                                                              | Same; also expected fuzzy copy "waitlist / not yet available"                                                                 |
| `eligibility.spec.ts`     | `under-18 applicant sees age error`                       | Same                                                                                              | Same; also expected fuzzy copy "/18\|age\|minor/"                                                                             |
| `auth.spec.ts`            | `shows SIWE copy on the connect page`                     | `getByText(/ethereum wallet\|sign in\|wallet/i)` strict-mode violation — regex matched 2 elements | Regex too broad — matched both the heading and body paragraph                                                                 |
| `onboarding.spec.ts`      | `renders Alpaca broker card`                              | "Alpaca" text never appeared                                                                      | Page hits `/v1/brokers/supported` which has no BFF route → list stays empty                                                   |
| `onboarding.spec.ts`      | `connect button reveals API key form`                     | Same root cause — no broker rendered                                                              | Same                                                                                                                          |
| `onboarding.spec.ts`      | `invalid key format shows validation error`               | Same                                                                                              | Same                                                                                                                          |
| `onboarding.spec.ts`      | `valid paper key submits successfully`                    | Same                                                                                              | Same; also asserted success via `getByRole("heading", /alpaca connected/)` but `StatusBanner.title` is a `<p>`, not a heading |
| `onboarding.spec.ts`      | `renders risk questions`                                  | 404 — route does not exist                                                                        | Route `/us/onboarding/risk` was never built; risk tolerance lives inside `/us/onboarding/profile`                             |
| `support.spec.ts`         | `form renders correctly`                                  | `getByLabel(/message/i)` timed out                                                                | Textarea had no `htmlFor`/`id` association with its `<label>`                                                                 |
| `support.spec.ts`         | `shows success banner after submission`                   | Same; submit also stuck disabled                                                                  | Same; also relied on category-select via fragile index + fuzzy banner regex                                                   |
| `support.spec.ts`         | `blocked message disables submit`                         | Same label issue; also asserted on a prompt that the classifier does NOT block                    | "Ignore all previous instructions…" does not match any `blockedPromptPatterns` regex                                          |
| `recommendations.spec.ts` | `list renders recommendations`                            | `<article>` / `a[href*='/recommendations/']` never visible                                        | Cookie `path: "/us"` is NOT sent on `/api/*` fetches → BFF auth fails → list empty                                            |
| `recommendations.spec.ts` | `navigating to detail shows compliance preview`           | Same cookie issue + fuzzy copy regex                                                              | Same                                                                                                                          |
| `recommendations.spec.ts` | `ALLOW verdict enables submit button (fail-closed check)` | Button `/approve for execution/i` never appears                                                   | **Forbidden affordance** — tripwire forbids "approve for execution"; test was asserting a SEC-violation                       |
| `recommendations.spec.ts` | `DENY verdict disables submit button (fail-closed)`       | Same                                                                                              | Same                                                                                                                          |

---

## 2. Fix register

For each failure, the realigned selector / assertion and whether product
code or only spec code changed.

| Spec                      | Test                                                     | Corrected selector / assertion                                                                                                                                                                                                                                                                                                                                                        | Product code changed?                                                                                                            | SEC boundary touched?                                                                                         | Final status |
| ------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------ |
| `eligibility.spec.ts`     | `eligible CA resident proceeds to auth`                  | `getByRole("radio", { name: "Yes" })` + click "Continue to wallet connect" link to trigger navigation                                                                                                                                                                                                                                                                                 | No                                                                                                                               | No                                                                                                            | passing      |
| `eligibility.spec.ts`     | `NY resident sees waitlist message`                      | `getByLabel(/eligibility result: waitlist/i)` — anchored to the stable `aria-label` on the Badge component                                                                                                                                                                                                                                                                            | No                                                                                                                               | No                                                                                                            | passing      |
| `eligibility.spec.ts`     | `under-18 applicant sees age error`                      | `getByText(/at least 18 years old/i)` — anchored to the schema's exact error message                                                                                                                                                                                                                                                                                                  | No                                                                                                                               | No                                                                                                            | passing      |
| `auth.spec.ts`            | `shows SIWE copy on the connect page`                    | `getByText(/uses your Ethereum wallet as your login/i)` — unique substring                                                                                                                                                                                                                                                                                                            | No                                                                                                                               | No                                                                                                            | passing      |
| `onboarding.spec.ts`      | broker-card + connect-button + invalid-key + valid-key   | `page.route()` mocks for `/v1/brokers/supported`, `/v1/brokers/connection`, `/v1/brokers/connect/keys`. Success banner anchored on exact "Alpaca connected" text.                                                                                                                                                                                                                     | No                                                                                                                               | No                                                                                                            | passing      |
| `onboarding.spec.ts`      | `renders risk questions` (→ "Advisory profile" describe) | Replaced with `renders advisory profile with risk tolerance field` against `/us/onboarding/profile` — the surface that actually owns risk tolerance                                                                                                                                                                                                                                   | No                                                                                                                               | No                                                                                                            | passing      |
| `support.spec.ts`         | `form renders correctly`                                 | `getByTestId("support-message")` — added stable testid + proper `<label htmlFor>` association on the textarea                                                                                                                                                                                                                                                                         | **Yes — `apps/web/app/us/app/support/page.tsx`**: added `id` + `data-testid` + `htmlFor` (accessibility fix; no behavior change) | No                                                                                                            | passing      |
| `support.spec.ts`         | `shows success banner after submission`                  | `selectOption("App issue")` by value (deterministic); fill via testid; assert `getByText("Request submitted", { exact: true })`; sanity-check the select + textarea values before clicking submit                                                                                                                                                                                     | Same testid addition                                                                                                             | No                                                                                                            | passing      |
| `support.spec.ts`         | `blocked message disables submit`                        | Replaced prompt-injection string (which the classifier does NOT block) with `"Should I buy AAPL right now?"` (matches `/should i (buy\|sell\|hold\|invest)/i`); also asserts the inline blocked-prompt warning copy is visible                                                                                                                                                        | No                                                                                                                               | **Strengthened** — boundary assertion now uses a real classifier-matching prompt                              | passing      |
| `recommendations.spec.ts` | list + detail (Signal + Managed users)                   | Switched to seeded cookies (`e2e-signal-user`, `e2e-managed-user`) with `path: "/"` so `/api/*` fetches carry them. Anchored on stable testids (`recommendations-list`, `recommendation-card`, `managed-banner`, `managed-exception-cta`, `managed-review-action`, `signal-review-action`, `recommendation-detail-mode`). Mocked `/v1/recommendations/:id` for detail-page hydration. | No                                                                                                                               | No                                                                                                            | passing      |
| `recommendations.spec.ts` | per-trade ALLOW/DENY assertions (replaced)               | **Inverted** to absence assertions: `getByRole("button", { name: /accept (recommendation\|trade)/i })` etc. must have `toHaveCount(0)` on both Signal and Managed detail pages                                                                                                                                                                                                        | No                                                                                                                               | **Strengthened** — replaces a test that asserted a SEC-violating affordance with one that asserts its absence | passing      |

### Product-code changes (full list)

| File                                   | Change                                                                                                                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/us/app/support/page.tsx` | Added `htmlFor="support-message"` to the message `<label>`, plus `id="support-message"` + `data-testid="support-message"` on the textarea. Accessibility fix (the label was previously unassociated). No behavior change. |

No other product file was modified. No Daniel / GitLab backend file was modified.

### Test-code structural changes

- All four directive-named specs adopted seeded E2E cookies (`E2E_USERS.signal.eligibilityCookie` etc.) at cookie path `"/"` (rather than the stale `"mock-eligibility-token"` / `"mock-session-token"` at `"/us"`). This matches the convention used by the existing passing surface specs (`mode-branching.spec.ts` and siblings).
- A small "wait for H1 visible" gate was added to each spec's `beforeEach` to handle Next.js dev-server on-demand route compilation under parallel-worker load (first navigation can hit a transient 404 before the route is compiled). This is a single deterministic wait per navigation, **not** a broad retry loop or arbitrary `sleep`.

---

## 3. Files changed

### Test files

- `apps/web/e2e/eligibility.spec.ts` — rewritten
- `apps/web/e2e/auth.spec.ts` — rewritten
- `apps/web/e2e/onboarding.spec.ts` — rewritten
- `apps/web/e2e/support.spec.ts` — rewritten
- `apps/web/e2e/recommendations.spec.ts` — rewritten

### Product files

- `apps/web/app/us/app/support/page.tsx` — accessibility-only edit (textarea label association + `data-testid`)

### Docs

- `docs/phase2-5-stale-e2e-cleanup.md` — this file (new)

---

## 4. Validation results

Run on `phase2-5-stale-e2e-cleanup` (this branch), commit pending:

| Gate                     | Command          | Result                                                                 |
| ------------------------ | ---------------- | ---------------------------------------------------------------------- |
| typecheck                | `pnpm typecheck` | **4/4 packages green**                                                 |
| lint                     | `pnpm lint`      | **3/3 packages green**                                                 |
| contract-test + tripwire | `pnpm test`      | **9/9 unit tests pass**, contract-assertions all green, tripwire 0/144 |
| Full E2E                 | `pnpm e2e`       | **67/67 passed**, 0 flaky, 0 skipped                                   |

Command executed:

```
pnpm e2e --reporter=line
# → 67 passed (1.7m)
```

---

## 5. Compliance statements

- **No SEC 203A-2(e) boundary was changed.** Two boundary assertions were
  **strengthened**: (a) support `blocked message disables submit` now uses
  a prompt that actually matches the `blockedPromptPatterns` classifier
  (per-stock investment-advice prompt), so the assertion is load-bearing
  rather than vacuous; (b) `recommendations.spec.ts` now asserts the
  **absence** of per-trade Accept / Approve affordances rather than
  asserting their presence (which would have been a SEC-boundary
  violation). The tripwire (`pnpm tripwire`) remains at 0 violations.
- **No Daniel / GitLab backend file was changed.** The audit was strictly
  read-only against `gitlab.com/refinity_dev/refinity-main main @ 0a7d64d`
  and the local `…/Daniels Back End/live-components-main` subset.
- **No tests were skipped.** No `.skip()`, `.only()`, or `.todo()` was
  added. The "Risk assessment" describe (which targeted a non-existent
  route) was replaced with an "Advisory profile" describe that exercises
  the surface that actually owns risk tolerance.
- **No broad retries were added.** Each new `expect(...).toBeVisible()` /
  `toBeEnabled()` / `toHaveValue()` is a single deterministic wait on a
  specific element / state. No `for`-loop retries, no `setTimeout` waits,
  no `waitForTimeout` calls.
- **No fragile copy regex remained on normal UI text.** Where the prior
  specs used fuzzy regex like `/connected|success/i`, the corrected specs
  use exact text (`getByText("Alpaca connected", { exact: true })`) or
  stable testids (`getByTestId("recommendations-list")`). The
  forbidden-affordance assertions deliberately retain regex because they
  must catch any drift across the family of forbidden labels (Accept
  Recommendation, Approve for Execution, Approve Trade, etc.) — that is
  the strict mode the SEC boundary requires.
- **Contract V2 was not changed.** No E2E failure surfaced an error in
  `docs/phase2-5-signal-to-investor-product-contract.md` or
  `docs/phase2-5-gap-register-v2-against-gitlab.md`.

---

## 6. Remaining blockers

None for the E2E gate itself. Remaining Phase 2.5 production blockers
(unchanged from the gap register):

1. Adapter implementation against GitLab events / tables (13
   adapter-pending rows in `phase2-5-gap-register-v2-against-gitlab.md`).
2. Durable BFF storage for profile, disclosure ack, execution policy,
   eligibility cache.
3. `audit-writer` reaching production state (currently skeletal in
   GitLab).
4. `compliance-adapter` reaching production state (currently skeletal in
   GitLab).
5. Four Daniel-confirmation items: risk reason-code partition into
   REVIEW vs DENY; `template_id` registry / discovery shape;
   `signal: 0` preservation policy; ExecutionPolicy ownership.

---

## 7. Scope lock — re-affirmed

No new product surfaces. No GitLab / Daniel backend changes. No
weakening of tripwire / lint / typecheck / contract-test gates. No
SEC 203A-2(e) boundary weakened. No tests skipped, no broad retries
added. Surface 4 remains blocked.
