# Phase 2.5 Lint Findings Inventory

**Branch:** `phase2-5-lint-findings-cleanup` (stacked on `phase2-5-lint-tooling`)
**Date:** 2026-05-28
**Purpose:** track the mechanical product-code cleanup needed to close the lint merge gate after `phase2-5-lint-tooling` restored lint infrastructure.

---

## Baseline (this branch's starting state)

Initial finding count on `phase2-5-lint-tooling` (commit `730d507`): **949 errors.**

After fixing one piece of remaining infrastructure (excluding generated artifacts from web lint — `playwright-report/`, `test-results/`, `public/mockServiceWorker.js`, `.next/`, `next-env.d.ts`), the real product-code finding count is:

| Package             | Errors  |
| ------------------- | ------- |
| `@refi/ui`          | 4       |
| `@refi/api-clients` | 28      |
| `@refi/web`         | 185     |
| **Total**           | **217** |

The 732-error delta (949 → 217) was entirely from linting auto-generated artifacts (Playwright HTML report bundles, the MSW service worker file). Adding `ignores` for those is infrastructure correctness, not a rule weakening.

---

## `@refi/ui` (4 errors)

| Rule                                               | Count | File                    | Fix pattern                  |
| -------------------------------------------------- | ----- | ----------------------- | ---------------------------- |
| `@typescript-eslint/restrict-template-expressions` | 1     | `Gauge.tsx:36`          | wrap `number` in `String(n)` |
| `@typescript-eslint/no-unused-vars`                | 1     | `Toast.tsx:7` (`useId`) | remove unused import         |
| `@typescript-eslint/no-confusing-void-expression`  | 2     | `Toast.tsx:156, 178`    | add braces around arrow body |

All four are mechanical. No product behavior change.

---

## `@refi/api-clients` (28 errors)

| Rule                                                | Count | Typical site                                       | Fix pattern                                       |
| --------------------------------------------------- | ----- | -------------------------------------------------- | ------------------------------------------------- |
| `@typescript-eslint/no-floating-promises`           | 14    | MSW handlers awaiting `request.json()` and similar | add `await` or `void` prefix on returned promises |
| `@typescript-eslint/restrict-template-expressions`  | 5     | numeric IDs/qtys in template literals              | wrap with `String()`                              |
| `@typescript-eslint/no-unnecessary-condition`       | 3     | optional-chain on values known non-null            | drop optional chain / null check                  |
| `@typescript-eslint/no-unnecessary-type-parameters` | 2     | generated client wrappers                          | unparameterize or constrain                       |
| `@typescript-eslint/no-unsafe-assignment`           | 1     | parsing untyped `JsonBodyType`                     | add a local type guard                            |
| `@typescript-eslint/no-unnecessary-type-assertion`  | 1     | redundant `as`                                     | drop the cast                                     |
| `@typescript-eslint/no-invalid-void-type`           | 1     | `void` in generic position                         | replace with `undefined`                          |

Most-likely files: `src/mocks/handlers.ts`, `src/mocks/handlers.*.ts`. No product behavior change.

---

## `@refi/web` (185 errors)

| Rule                                               | Count | Fix pattern                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@typescript-eslint/no-confusing-void-expression`  | 45    | add braces around arrow shorthand bodies that return `void`                                                                                                                                                                                                                                               |
| `@typescript-eslint/no-unsafe-member-access`       | 33    | parse JSON via local type guard; replace `body.field` with a narrowed accessor                                                                                                                                                                                                                            |
| `@typescript-eslint/no-unsafe-assignment`          | 26    | same — narrow `unknown` before assignment                                                                                                                                                                                                                                                                 |
| `@typescript-eslint/restrict-template-expressions` | 25    | `String(n)` wrap on numeric values                                                                                                                                                                                                                                                                        |
| `@typescript-eslint/no-non-null-assertion`         | 14    | replace `x!` with guard or default                                                                                                                                                                                                                                                                        |
| `@typescript-eslint/no-misused-promises`           | 9     | event handlers passing async fn — wrap with `() => { void asyncFn(); }`                                                                                                                                                                                                                                   |
| `@typescript-eslint/require-await`                 | 6     | remove unneeded `async` or add real awaits                                                                                                                                                                                                                                                                |
| `@typescript-eslint/no-unnecessary-type-assertion` | 5     | drop redundant casts                                                                                                                                                                                                                                                                                      |
| `@typescript-eslint/no-unnecessary-condition`      | 5     | drop redundant checks                                                                                                                                                                                                                                                                                     |
| `@typescript-eslint/no-unused-vars`                | 4     | remove unused symbols (incl. `_Check`)                                                                                                                                                                                                                                                                    |
| `@typescript-eslint/no-deprecated`                 | 4     | swap deprecated APIs for current equivalents (if drop-in) — else mark "Potential product defect"                                                                                                                                                                                                          |
| Misc (≤2 each)                                     | ~15   | `consistent-type-imports`, `import/no-anonymous-default-export`, `react-hooks/set-state-in-effect`, `react-hooks/incompatible-library`, `react-hooks/refs`, `react/no-unescaped-entities`, `no-dynamic-delete`, `no-unnecessary-type-parameters`, `no-unnecessary-boolean-literal-compare` — case-by-case |

Files span SEC 203A flows (`src/lib/sec203a/*`), BFF route handlers (`app/api/v1/investor/*`), app pages, and the prototype store. All forbidden-affordance copy + testid invariants must be preserved.

---

## Potential product defect, requires review

These six findings (3 errors, 3 warnings) are NOT mechanical. They flag genuine React anti-patterns that the strict `react-hooks` plugin catches in React 19+. A safe fix requires understanding the surrounding render lifecycle and the implicit invariant the original author relied on. They are explicitly left for a human reviewer rather than patched blindly.

| File:line                                              | Rule                                         | Symptom                                                                                                                                                                                                                        |
| ------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/app/_hooks/useSimulation.ts:174`             | `react-hooks/refs` (error)                   | "Cannot access refs during render" — a `.current` access happens inside the render path rather than in a callback/effect. May indicate a stale read; behavior depends on the caller.                                           |
| `apps/web/app/us/app/settings/automation/page.tsx:291` | `react-hooks/set-state-in-effect` (error)    | Sync `setForm(toForm(draftQ.data))` inside `useEffect` to mirror server data into local form state. Common pattern but the strict rule recommends derived state via `useMemo` or unconditional state.                          |
| `apps/web/app/us/onboarding/profile/page.tsx:57`       | `react-hooks/set-state-in-effect` (error)    | Sync `setFields({ ... })` inside `useEffect` from `existing` data. Same family as above.                                                                                                                                       |
| `apps/web/app/us/app/exceptions/page.tsx:238`          | `react-hooks/exhaustive-deps` (warning)      | `allItems` derivation could shift `useMemo` deps every render. Suggests wrapping `allItems` in its own `useMemo` or hoisting.                                                                                                  |
| `apps/web/app/us/eligibility/page.tsx:78`              | `react-hooks/incompatible-library` (warning) | `react-hook-form`'s `handleSubmit` returns a Promise; the new React Compiler check flags it as incompatible with the surrounding library boundary. Behavior preserved; future React Compiler integration may require refactor. |
| `apps/web/app/us/onboarding/broker/page.tsx:106`       | `react-hooks/incompatible-library` (warning) | Same root cause as above.                                                                                                                                                                                                      |

For all six, the safe path is a reviewer-driven structural change (likely converting `useEffect`→`useMemo` for derived state, hoisting refs into stable callbacks, or wiring the `react-hook-form` submit through a real `() => void` wrapper). None of these has shipped as a behavior change on this branch.

---

## Cleanup work order

1. **`@refi/ui` (4)** — fastest; one commit `chore: clean ui lint findings`.
2. **`@refi/api-clients` (28)** — handler typing; one commit `chore: clean api client lint findings`.
3. **`@refi/web` (185)** — multiple commits batched by directory: `sec203a/`, `app/api/v1/investor/`, `app/us/app/*`, hooks/lib.

Each step ends with the package-level lint passing before moving on.

---

## Final lint cleanup result

| Stage                                                                                                                             | `@refi/ui` | `@refi/api-clients` | `@refi/web`                                          | Total   |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------- | ---------------------------------------------------- | ------- |
| Initial finding count (this branch's baseline)                                                                                    | 4          | 68                  | 877                                                  | **949** |
| After ignoring generated artifacts in web (playwright-report/, test-results/, public/mockServiceWorker.js, .next/, next-env.d.ts) | 4          | 28                  | 185                                                  | **217** |
| After mechanical cleanup (this branch)                                                                                            | 0          | 0                   | 6 (all flagged in §"Potential product defect" above) | **6**   |

**Final state:**

- 3 / 4 packages exit `eslint` cleanly: `@refi/ui`, `@refi/api-clients`, `@refi/config`.
- `@refi/web` has 6 remaining findings (3 errors + 3 warnings), all in the `react-hooks/*` family, all flagged as **potential product defect, requires review** per the directive's "do not patch blindly" rule.
- Repo-wide `pnpm lint` exits non-zero on those 6 web findings until a reviewer-driven structural change lands.

### Validation results

| Gate                                     | Result                                                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                         | ✅ 4 / 4 packages green                                                                                                     |
| `pnpm contract-test`                     | ✅ all assertions pass                                                                                                      |
| `pnpm tripwire`                          | ✅ 0 violations across 144 scanned files                                                                                    |
| `pnpm test` (`@refi/api-clients` vitest) | ✅ 9 / 9 pass                                                                                                               |
| `pnpm lint`                              | ⚠️ 6 findings remain in `@refi/web`, all in the `react-hooks/*` family, all explicitly flagged as potential product defects |

Full E2E was not run on this branch — this is an infrastructure cleanup branch derived from `origin/main` (pre-Phase-2.5). Full E2E status is governed by the Phase 2.5 branch and tracked in `phase2-5-gate-cleanup.md` §3.2 (`phase2-5-stale-e2e-cleanup`). Full E2E remains deferred to that branch.

### Statements

- **No lint rules were weakened.** The `no-undef`/`no-redeclare` disables for `.ts`/`.tsx` files (from `phase2-5-lint-tooling`) follow official typescript-eslint guidance because TypeScript catches the same violations with full type awareness; the base ESLint variants misreport on TS namespace types and declaration merging. The `varsIgnorePattern: '^_'` addition aligns the rule with the underscore-prefix-means-intentionally-unused convention used by Phase 2 SEC 203A-2(e) compile-time type assertions (`_Check`, `_Assert`). No rule was relaxed in scope or severity. The six remaining findings are not silenced — they are surfaced as red on every CI run and tracked in §"Potential product defect" above.
- **No SEC 203A-2(e) product behavior changed.** Every fix is mechanical (rename, type tightening, void-prefix, String() wrap, sync arrow body wrap, type-predicate revert). No investor-facing affordance was added, removed, or repositioned. No persona / eligibility / execution-policy / exception / disclosure / record path semantic was changed. The tripwire (`scripts/tripwire-investor-boundary.ts`) still scans clean.
- **Daniel backend was untouched.** No file under `…/Daniels Back End/live-components-main` was opened with write or delete intent. Verified by `git diff --stat origin/main..HEAD` showing zero files outside `refi-us-sec-ia`.

---

## React hooks closure result

Landed on `phase2-5-react-hooks-cleanup` (stacked on `phase2-5-lint-findings-cleanup`). The six findings flagged above as "potential product defect, requires review" were all resolved structurally — no `eslint-disable` comments, no rule weakening, no override widening.

### Fix per finding

| File:line                                              | Rule                                         | Structural fix                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/_hooks/useSimulation.ts:174`             | `react-hooks/refs` (error)                   | Removed the gratuitous `dispatchRef.current = dispatch` write during render. `useReducer`'s `dispatch` is stable across renders, so the interval can capture it directly. Effect deps now include `dispatch`. Behaviorally identical.                                                                                                  |
| `apps/web/app/us/app/settings/automation/page.tsx:291` | `react-hooks/set-state-in-effect` (error)    | Replaced the `setForm(toForm(draftQ.data))` effect with a `useMemo` derivation. New `edits` state holds only user changes; `form = useMemo(() => { ...toForm(draftQ.data), ...edits })`. Background refetches no longer risk clobbering edits. Save / discard / pause / resume payloads unchanged.                                     |
| `apps/web/app/us/onboarding/profile/page.tsx:57`       | `react-hooks/set-state-in-effect` (error)    | Same shape: `setFields({ ...existing })` effect replaced by `edits` state + `useMemo` derivation. Field set, labels, submit payload, and navigation unchanged.                                                                                                                                                                         |
| `apps/web/app/us/app/exceptions/page.tsx:238`          | `react-hooks/exhaustive-deps` (warning)      | Wrapped `allItems = listQ.data?.items ?? []` in `useMemo(... [listQ.data?.items])` so the empty-array fallback has stable identity. The downstream `useMemo(filtered, [allItems, filter])` no longer recomputes on every render. Exception filtering/sorting/labels/resolution logic unchanged.                                        |
| `apps/web/app/us/eligibility/page.tsx:78`              | `react-hooks/incompatible-library` (warning) | Replaced `watch("state")` / `watch("isUsPerson")` with `useWatch({ control, name: ... })` — the memo-safe variant. Form's `register` / `handleSubmit` / `setValue` / `formState` / validation behavior preserved. Submit wired through a named `onSubmitForm(event: React.SyntheticEvent<HTMLFormElement>)` handler per the directive. |
| `apps/web/app/us/onboarding/broker/page.tsx:106`       | `react-hooks/incompatible-library` (warning) | Same `watch → useWatch({ control, name: "environment" })` swap. Submit wired through a named `onSubmitForm`. Reset-on-unmount effect preserved.                                                                                                                                                                                        |

### Statements

- The six findings were fixed structurally.
- No eslint-disable comments were added.
- No lint rules were weakened.
- No SEC 203A-2(e) product behavior changed.
- Daniel backend was untouched.
- `pnpm lint` now exits 0.
- Full E2E remains deferred to `phase2-5-stale-e2e-cleanup`.
