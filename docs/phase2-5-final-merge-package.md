# Phase 2.5 Final Merge Package

**Date:** 2026-05-29
**Final branch:** `phase2-5-stale-e2e-cleanup` @ `4db457b`
**Parent branch:** `phase2-5-contract-gap-v2-gitlab` @ `539e5b0`
**Canonical backend:** `gitlab.com/refinity_dev/refinity-main` branch `main` @ `0a7d64d`
**Status:** PR-review ready. Main-merge gated only on reviewer acceptance.

---

## 1. Executive summary

- Phase 2.5 aligns the ReFi investor-product shell with Daniel's canonical GitLab backend.
- GitLab `refinity-main main @ 0a7d64d` is the backend source of truth.
- The frontend and BFF remain the SEC 203A-2(e) investor-product shell.
- The missing production layer is adapter mapping between GitLab backend events and investor-facing product objects.
- No Daniel backend files were changed.
- No new product surfaces were added.
- No per-trade Accept path exists.
- No investor-accept command exists.
- No staff approval path exists.
- No founder review path exists.

---

## 2. Branch stack

Two branches comprise the merge package:

| Branch                            | Head      | Purpose                                                                                |
| --------------------------------- | --------- | -------------------------------------------------------------------------------------- |
| `phase2-5-contract-gap-v2-gitlab` | `539e5b0` | Contract V2 + Gap Register V2 (GitLab-aligned).                                        |
| `phase2-5-stale-e2e-cleanup`      | `4db457b` | Stale E2E realignment + final-merge package. **Includes the contract-gap-v2 history.** |

### Preferred PR strategy

**One combined PR from `phase2-5-stale-e2e-cleanup` → `main`.**

The stale E2E branch already includes Contract V2, Gap Register V2, and the
final test cleanup stack. Reviewers see the full Phase 2.5 story in one
place.

### Alternative strategy (stacked review)

- PR 1: `phase2-5-contract-gap-v2-gitlab` → `main`
- PR 2: `phase2-5-stale-e2e-cleanup` → `phase2-5-contract-gap-v2-gitlab`

### Recommendation

Use the one combined PR unless the reviewer asks for stacked review.

---

## 3. What changed

### A. GitLab backend alignment

| File                                                        | Purpose                                                                                               |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `docs/phase2-5-gitlab-refinity-main-source-verification.md` | Confirms GitLab `refinity-main main @ 0a7d64d` is canonical; supersedes the local-subset framing.     |
| `docs/phase2-5-gitlab-contract-delta.md`                    | Enumerates the 12 contract deltas between prior local-backend assumptions and GitLab reality.         |
| `docs/phase2-5-gitlab-branch-inventory.md`                  | Records single-branch trunk-based GitLab repo; 5 CI-backup tags, no feature/staging/develop branches. |
| `docs/phase2-5-gitlab-backend-capability-map.md`            | Verified file paths, line numbers, topic names, table column names for every GitLab capability area.  |
| `docs/phase2-5-frontend-surface-inventory.md`               | 16 frontend surfaces × route × BFF backing × prototype-store entity × hook × test × tripwire.         |
| `docs/phase2-5-surface-to-gitlab-alignment-register.md`     | 16-row register; aligned / partially aligned / adapter-pending verdicts per surface.                  |
| `docs/phase2-5-core-alignment-decision.md`                  | Direct answers to the 16 directive alignment questions.                                               |

**What these docs prove:** GitLab `refinity-main main @ 0a7d64d` is the canonical backend source. The local `…/Daniels Back End/live-components-main` folder was a subset (inference-worker + portfolio-analyzer-web only).

### B. Contract V2 and Gap Register V2

| File                                                   | Purpose                                                                                                                                                                                                                                      |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/phase2-5-signal-to-investor-product-contract.md` | Contract V2. Replaces MongoDB `live_signals` / `position` / UNIX `date` with GitLab wire fields. Adds multi-stream semantics, freshness-from-`ts_utc`, end-to-end backend workflow chain, admin-command partition, and SEC §A boundary lock. |
| `docs/phase2-5-gap-register-v2-against-gitlab.md`      | Gap Register V2. Reclassifies every prior misaligned/missing row as aligned, adapter-pending, BFF-owned, partially aligned, Daniel-confirm, or skeletal. No architectural misalignments remain.                                              |

**What these docs prove:** old local-backend assumptions are replaced with GitLab-backed fields, events, services, and adapter requirements.

### C. E2E realignment

| File                                   | Change                                                                                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/e2e/eligibility.spec.ts`     | RadioGroup (Yes / No) instead of checkbox; correct submit label; in-page result CTA before navigation.                                                                |
| `apps/web/e2e/auth.spec.ts`            | Strict-mode scoped to unique SIWE body sentence; seeded eligibility cookie.                                                                                           |
| `apps/web/e2e/onboarding.spec.ts`      | `page.route()` mocks for `/v1/brokers/*`; success banner anchored on exact title; "Risk assessment" describe replaced with "Advisory profile" against the real route. |
| `apps/web/e2e/support.spec.ts`         | Seeded cookie; stable `data-testid`; blocked-prompt assertion now uses a real classifier-matching prompt (`"Should I buy AAPL right now?"`).                          |
| `apps/web/e2e/recommendations.spec.ts` | Seeded cookies at `path: "/"`; stable testids; per-trade ALLOW/DENY tests replaced with **absence** assertions across the family of forbidden labels.                 |

**What these specs prove:** the realigned suite asserts the current product shell, BFF seed state, Contract V2 semantics, and the SEC 203A-2(e) boundary at render level.

### D. Product testability and accessibility

| File                                   | Change                                                                                                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/app/us/app/support/page.tsx` | Textarea now associated with its `<label>` via `htmlFor="support-message"` + `id="support-message"`, plus `data-testid="support-message"`. Accessibility fix + stable E2E selection. **No behavior change.** |

---

## 4. Backend source of truth

**Canonical:** `gitlab.com/refinity_dev/refinity-main` branch `main` @ `0a7d64d`.

**Superseded:** local `…/Daniels Back End/live-components-main` (subset only — inference-worker + portfolio-analyzer-web).

**Old assumptions, all superseded:**

- MongoDB `live_signals`
- `position`
- UNIX `date`
- `source_collection`
- `asset_status.last_prediction_ts`
- derived `model_version`
- derived `strategy_id`
- derived `confidence_score`

**Canonical GitLab signal fields (wire):**

- `stream_id`
- `asset_id`
- `ts_utc`
- `strategy_source`
- `strategy`
- `label`
- `proba`
- `model_version`
- `signal`

---

## 5. Backend workflow chain

```
signals
  → template.rebalance.intent
    → account.intent.ready
      → risk.approved | risk.rejected
        → orders.cmd
          → orders.evt
            → audit.evt
```

| Service                  | Status                            |
| ------------------------ | --------------------------------- |
| `account-intent-builder` | exists                            |
| `risk-engine`            | exists                            |
| `exec-gateway`           | exists                            |
| `trade-manager`          | exists                            |
| `portfolio-engine`       | exists                            |
| `portfolio-manager`      | exists                            |
| `admin-portal`           | exists                            |
| `audit-writer`           | **skeletal** — production blocker |
| `compliance-adapter`     | **skeletal** — production blocker |

---

## 6. SEC 203A-2(e) boundary

The following remain **forbidden in the investor UI** by both the source-level tripwire and the render-level E2E assertions:

- No per-trade Accept.
- No investor-accept.
- No approve for execution.
- No accept and execute.
- No submit trade.
- No staff approval.
- No founder review.
- No support-led individualized advice.
- `template.admin` remains backend / admin only.
- `target_account_id` remains backend / admin only.

The product modes:

- **Signal tier** is record-only. No `orders.cmd` is ever emitted on the investor's behalf.
- **Managed tier** uses a standing execution policy plus the backend intent / risk / execution / records chain. No per-trade investor approval is required or possible.

**New as of this branch:** `recommendations.spec.ts` asserts the **absence** of all forbidden investor-action affordances at render level on both Signal and Managed detail pages. The tripwire continues to enforce the same boundary at source level (`pnpm tripwire` → `0 violations across 144 files`).

---

## 7. Surface alignment summary

- No architectural misalignment was found.
- The frontend/BFF shell remains acceptable.
- The missing layer is adapter mapping from GitLab events and tables into ReFi investor product objects.

### Aligned boundary surfaces

- Pause / Resume Managed
- Support boundary
- Admin boundary
- Tripwire enforcement

### Adapter-pending surfaces

- Signal vs Managed mode
- Recommendations list
- Recommendation detail
- Automation Center / Execution Policy
- Managed activation
- Exception Review
- Records Center
- Broker submission path

### Frontend / BFF-owned surfaces

- Investor session
- Profile UX
- Disclosures UX
- Execution-policy UX
- Support UX
- Eligibility presentation

---

## 8. Validation

Latest known on this branch (`4db457b`):

| Gate                                  | Command                    | Result                                             |
| ------------------------------------- | -------------------------- | -------------------------------------------------- |
| typecheck                             | `pnpm typecheck`           | **green** (4/4 packages)                           |
| lint                                  | `pnpm lint`                | **green** (3/3 packages)                           |
| contract-assertions                   | `pnpm contract-test`       | **green** (all assertions pass)                    |
| tripwire                              | `pnpm tripwire`            | **green** — `0 / 144` violations                   |
| unit tests + contract-test + tripwire | `pnpm test`                | **green** (9/9 unit tests + assertions + tripwire) |
| full E2E                              | `pnpm e2e --reporter=line` | **67 / 67 passed**, `0 flaky`, `0 skipped`         |

A re-run of these gates immediately before commit is included in §13.

---

## 9. Production blockers

These **do not block the Phase 2.5 merge**, but they **do block production**:

1. Adapter implementation from GitLab events to ReFi investor product objects (13 adapter-pending rows in Gap Register V2).
2. Durable BFF storage (profile, disclosure ack, execution policy, eligibility cache).
3. `audit-writer` completion (currently skeletal in GitLab).
4. `compliance-adapter` completion (currently skeletal in GitLab).
5. Production record-retention integration.
6. Broker credential handling (key rotation, vault, scope-limited credentials).
7. Production broker integration (live Alpaca / second broker as needed).
8. Daniel confirmation items (see §10).
9. Legal and compliance review of the SEC 203A-2(e) end-to-end flow.
10. Final SEC 203A-2(e) review (post-adapter implementation).

---

## 10. Daniel confirmation items

1. **Risk reason-code partition** — which `risk-engine` `reasons[].code` values map to `EligibilityCheck.status = "REVIEW"` vs `"DENY"`?
2. **`template_id` registry / discovery shape** — how does the BFF enumerate the platform-supported templates for the investor to choose from at Surface 5 activation? Spanner registry / admin-portal RPC / Pub/Sub topic?
3. **`signal: 0` preservation** — does GitLab's `signals` table preserve flat / hold rows or suppress them?
4. **ExecutionPolicy ownership** — does per-account versioned ExecutionPolicy remain BFF-owned (current), or does it require Daniel-side per-account policy storage consumed by `exec-gateway`?

---

## 11. PR description draft

Ready to copy into the GitHub PR body.

**Title:** `Phase 2.5: GitLab backend alignment, Contract V2, and E2E stabilization`

---

### Summary

Phase 2.5 aligns the ReFi investor-product shell with Daniel's canonical GitLab backend source, updates the signal-to-investor product contract, updates the gap register, and stabilizes E2E coverage against the current product surface.

### Backend source of truth

GitLab `refinity-main main @ 0a7d64d` is canonical.

Local `live-components-main` is superseded.

### What changed

- Added GitLab backend verification and surface alignment docs.
- Updated Contract V2 against GitLab signal and backend workflow semantics.
- Updated Gap Register V2 against GitLab services.
- Realigned stale E2E specs.
- Added one support textarea accessibility / test selector improvement.

### SEC 203A-2(e) boundary

- No per-trade Accept.
- No investor-accept.
- No approve for execution.
- No accept and execute.
- No submit trade.
- No staff approval.
- No founder review.
- No support-led individualized advice.
- Admin commands remain hidden from investor UI.
- Managed mode remains standing-policy based, not per-trade investor approval based.

### Validation

- Typecheck: green.
- Lint: green.
- Contract-test: green.
- Tripwire: green, `0 / 144`.
- Unit tests: green.
- E2E: `67 / 67 passed`, `0 flaky`, `0 skipped`.

### Production blockers

- Adapter implementation.
- Durable BFF storage.
- Audit-writer completion.
- Compliance-adapter completion.
- Production record retention.
- Broker integration.
- Daniel confirmation items.
- Legal / compliance review.

### Daniel confirmation items

1. Risk reason-code partition into REVIEW vs DENY.
2. `template_id` registry and discovery shape.
3. `signal: 0` preservation or suppression.
4. ExecutionPolicy ownership.

---

## 12. Reviewer checklist

- [ ] Confirm GitLab `refinity-main main @ 0a7d64d` is treated as canonical backend.
- [ ] Confirm local `live-components-main` assumptions are no longer controlling.
- [ ] Confirm no investor Accept path exists.
- [ ] Confirm no investor-accept command exists.
- [ ] Confirm admin commands remain hidden from investor UI.
- [ ] Confirm support cannot provide individualized investment advice.
- [ ] Confirm stale E2E cleanup did not weaken SEC boundary assertions.
- [ ] Confirm production blockers are clearly stated.
- [ ] Confirm Surface 4 remains blocked until adapter and Daniel confirmation work proceeds.

---

## 13. Final recommendation

Open **one combined PR** from `phase2-5-stale-e2e-cleanup` → `main`.

**Do not start Surface 4** until this PR is reviewed and merged.

### Validation rerun before commit

The following commands were run on this branch immediately before adding this doc:

```
git status
git branch --show-current
git log --oneline -12
pnpm typecheck
pnpm lint
pnpm contract-test
pnpm tripwire
pnpm test
pnpm e2e --reporter=line
```

All gates remain green. E2E remains `67 / 67 passed`, `0 flaky`, `0 skipped`.

### Commit + push

- Commit: `docs: add final phase 2.5 merge package`
- Push: `origin/phase2-5-stale-e2e-cleanup`

### Do not

- Do not open the PR until explicitly instructed.
- Do not merge into main.
- Do not start Surface 4.
- Do not modify Daniel backend.
- Do not change product behavior.
- Do not weaken SEC 203A-2(e) boundaries.

---

## 14. Scope lock — re-affirmed

No new product surfaces. No GitLab / Daniel backend changes. No
weakening of tripwire / lint / typecheck / contract-test gates. No
SEC 203A-2(e) boundary weakened. No PR opened. No merge into main.
Surface 4 remains blocked.
