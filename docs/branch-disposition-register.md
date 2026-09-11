# Branch Disposition Register

**Date:** 2026-08-22
**Author:** repo audit, pre-Daniel-handover
**Scope:** every remote branch on `github.com/ReFi-Trading-Inc/refi-us-sec-ia` as of `origin/main @ c6013df`.
**Purpose:** authorise branch pruning with evidence, not vibes. Nothing here is deleted until its content is proven present on `main` or explicitly salvaged.

---

## Method — how "safe to delete" was proven

`git branch --no-merged` **overstates** risk in this repo: squash-merge is the default (README §Branching), so a squash-merged branch's commits are never ancestors of `main` even when its content is fully landed. Topology alone would have flagged 32 branches as unmerged.

Four independent tests were used instead:

1. **PR state** (`gh pr list --state all`) — a `MERGED` PR is authoritative evidence the content landed, regardless of commit topology.
2. **Orphan-file test** — files present in the branch tree and absent from `origin/main`'s tree, restricted to files the branch itself introduced. This is the strongest signal of unlanded content.
3. **History test** — for each orphan, `git log origin/main --follow -- <path>`. A non-empty result means the file existed on `main` and was deliberately deleted; an empty result means it never reached `main`.
4. **Supersession test** — for files present on both sides but differing, compare content and size to confirm `main` holds the later, larger version rather than a truncation.

---

## Summary

| Disposition                                       | Count  |
| ------------------------------------------------- | ------ |
| Safe to delete — merged PR                        | 18     |
| Safe to delete — absorbed, no PR                  | 9      |
| Safe to delete — closed PR, content landed anyway | 1      |
| **Salvage required before deletion**              | **1**  |
| Keep — live work                                  | 3      |
| **Total**                                         | **32** |

Target end state: `main` + 2 live branches. Recommended insurance: archive tag every deleted branch (see §6).

---

## 1. KEEP — live work (3)

| Branch                                         | PR               | Evidence                                                                                                                                                                 | Action                                                                                                                                                               |
| ---------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `integrate/phase2-6-pr-d`                      | #43 OPEN (draft) | 49 unique commits, **85 orphan files** — the entire `apps/web/app/api/v1/investor/*` BFF route tree. Strictly supersedes #7 (0 commits exist in #7 that are not in #43). | **Keep.** This is the highest-value unlanded work in the repo.                                                                                                       |
| `phase2-6-orderidmap-domain`                   | #14 OPEN         | 1 commit, 2 orphan files: `prototype-store/entities/order-id-map.ts`, `sec203a/order-id-map.ts`. Genuine unlanded domain work, open since 2026-05-31.                    | **Keep, but decide.** Land it or close it — do not leave it open for Daniel to guess at.                                                                             |
| `phase2-6-pr-d-account-prefs-history-contract` | #7 OPEN          | **Fully contained in #43.** `git rev-list --count origin/integrate/phase2-6-pr-d..origin/phase2-6-pr-d-account-prefs-history-contract` = **0**.                          | **Close PR #7 as superseded by #43, then delete the branch.** Redundant, and two near-identical 85-file PRs is the single most confusing thing Daniel would inherit. |

---

## 2. SALVAGE REQUIRED — `phase2-5-wip-rebase`

**Do not delete this branch yet.** It carries 40 files that never reached `main` by any path, and three of them are still referenced as needed by the live gaps register.

Its own `docs/phase2-5-handoff.md` says _"Do not merge into `main`"_ — so it was intentionally parked, not abandoned. Main diverged from it at `5291dda` (2026-05-27) and evolved 35 commits along a **restructured** design (consolidated MSW `handlers.ts`, `_content/support-boundary.ts`, `src/lib/*`), which superseded most of this branch. Most, not all.

### 2a. Salvage — high value, still referenced by the gaps register

| File                                                             | Size      | Why it matters                                                                                           |
| ---------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------- |
| `scripts/check-openapi-drift.ts`                                 | 69 lines  | **Closes G-016.** `main` has only 3 scripts and no drift guard; the gaps register cites this exact path. |
| `scripts/scan-retired-routes.ts`                                 | 237 lines | **Closes G-012.** Gaps register cites it as "(untracked)" — it is not untracked, it is on this branch.   |
| `packages/api-clients/src/mocks/fixtures/compliance/verdicts.ts` | 292 lines | Cited by **G-011** as "the 10 verdict scenarios already defined". `main` has no compliance fixtures.     |

### 2b. Salvage — specification lineage (10 docs, none on `main`)

`refi-build-docs/spec-current/` on `main` stops at `03`. This branch holds `04`–`12` plus `MIG-P2.5-audit.md`, including:

- **`12-daniel-2026-05-20-guidance.md`** (272 lines) — self-described **"Authoritative … north star"** and the discipline charter. Both salvage scripts above cite it as their rule source.
- **`10-bff-architecture-decision.md`** (198 lines) — the BFF architecture ADR (Cloud Run host decision, partially superseded by `12`).
- `04-brand-voice`, `05-observability-verification`, `06-backend-contract-map`, `07-daniel-blueprint-alignment`, `08-daniel-rescope-plan`, `09-daniel-answers-and-product-reframe`, `11-integration-audit-post-p2.5r-04`.

### 2c. Salvage — phase records (6 docs, none on `main`)

`docs/phase2-5-{handoff,gate-cleanup,post-rebase-checkpoint,pr-description,replacement-e2e-backlog,daniel-backend-reconciliation}.md`.

### 2d. Evaluate — probably superseded, confirm before discarding

- **5 e2e specs**: `compliance-fail-closed-structural`, `compliance-verdict-visibility`, `support-boundary-preservation`, `persona-switch`, `persona-switch-stable`. The current suite is 68 tests and green; check whether these cover anything it does not, particularly the two compliance specs.
- **13 MSW `handlers.*.ts` + persona fixtures + `scenarios.ts`** — superseded by `main`'s consolidated `mocks/handlers.ts` + `fixtures/{david,maya}.ts`.
- **UI**: `PersonaSwitcher`, `ScenarioSwitcher`, `BrokerStatusBanner`, `home/_components/dashboard.tsx`, `packages/ui/src/components/Logo.tsx`, `public/logo.svg`, `app/icon.svg` — superseded by the Phase 2.6 redesign.
- `packages/api-clients/src/hooks/bff.ts`, `mocks/_shared.ts`, mock `__tests__/*`.

**Recommended sequence:** land 2a + 2b + 2c as a `docs/salvage-phase2-5` PR → then tag and delete the branch.

---

## 3. SAFE DELETE — merged PR (18)

Content landed via squash-merge. Orphan count 0 for all; residual differences are `main` evolving further.

`chore/dependabot-high-burn-down` (#44) · `chore/security-hardening` (#32) · `docs-add-readme` (#3) · `docs/alpha-go-live-checklist` (#37) · `docs/integration-roadmap` (#38) · `docs/system-integration-map` (#41) · `feat/alpha-claim-hardening` (#39) · `feat/alpha-claim-page` (#15) · `feat/alpha-claim-server-integration` (#16) · `feat/mock-boundary-annotations` (#42) · `fix/auth-fail-closed` (#31) · `fix/csp-static-hydration` (#40) · `phase2-5-stale-e2e-cleanup` (#1) · `phase2-6-contract-v3` (#5) · `phase2-6-fills-domain` (#13) · `phase2-6-pr-c-type-fixture-realignment` (#6) · `phase2-6-repo-observation-and-authoritative-plan` (#4) · `phase2-7-daniel-direction` (#45)

> `phase2-5-stale-e2e-cleanup` shows 1 orphan — `apps/web/eslint.config.js`, renamed to `eslint.config.mjs` on `main`. Benign.

---

## 4. SAFE DELETE — absorbed, never had a PR (9)

Eight `phase2-5-*` branches are independent lineages whose content nonetheless landed. Verified: **every file they added exists on `main`**, and for every file that differs, `main`'s version is larger (uniform +2 lines = Prettier reformatting; `phase2-5-lint-findings-inventory.md` 133 → 160). No truncation, no loss.

`phase2-5-contract-gap-v2-gitlab` · `phase2-5-daniel-live-backend-alignment` · `phase2-5-gitlab-backend-verification` · `phase2-5-gitlab-surface-alignment-audit` · `phase2-5-lint-findings-cleanup` · `phase2-5-lint-tooling` · `phase2-5-react-hooks-cleanup` · `phase2-5-signal-contract-corrections`

`phase2-ui-bff` — 0 unique commits, 0 unique files; a strict ancestor of `phase2-5-wip-rebase`.

> All 8 carry `apps/web/eslint.config.js` as their sole orphan — the pre-rename config. Benign.

---

## 5. SAFE DELETE — closed unmerged, but content landed anyway (1)

**`fix-counsel-copy-placeholders` (PR #2, CLOSED unmerged).** This one deserved the closest look: it carries counsel-confirmed legal copy dated 2026-05-29 — the legal entity name and the landing hero — replacing `[Bracketed]` placeholders.

Verified against `origin/main`: `apps/web/app/us/_content/brand.ts` already reads `"ReFi Trading LLC, a subsidiary of ReFi Trading Inc."` with the `// Counsel-confirmed entity (2026-05-29)` comment, and `landing.ts` carries the counsel-confirmed hero. **The copy reached `main` by another route.** Safe to delete.

---

## 6. Execution

Archive tags first — they preserve every commit permanently at negligible cost and make deletion fully reversible:

```bash
git fetch --prune origin

# 1. Archive tag every branch to be deleted (reversible insurance)
for b in <list from §3, §4, §5>; do
  git tag "archive/$b" "origin/$b"
done
git push origin --tags

# 2. Verify a tag resolves before deleting anything
git rev-parse archive/phase2-5-stale-e2e-cleanup

# 3. Delete remote branches
for b in <same list>; do git push origin --delete "$b"; done

# 4. Prune local tracking refs
git fetch --prune origin
```

**Order of operations:**

1. Salvage `phase2-5-wip-rebase` §2a–2c into a PR and merge it.
2. Close PR #7 as superseded by #43.
3. Decide PR #14 (land or close).
4. Archive-tag and delete the 28 branches in §3 + §4 + §5, plus `phase2-6-pr-d-account-prefs-history-contract` once #7 is closed.
5. Tag and delete `phase2-5-wip-rebase` last, after step 1 merges.

---

## 7. Corrections to the initial handover assessment

Two claims in the first-pass assessment were wrong and are corrected here:

- **`.env.example` exists and is good.** `apps/web/.env.example` is tracked on `main` (7,554 bytes) and documents every variable — `REFI_ENV` vs `NEXT_PUBLIC_REFI_ENV` strictness, all four 32-char secrets, the ES256 alpha-handoff and BFF-assertion key material, Firestore backing selection, and `REFI_RELEASE_STAGE`. The root `.gitignore` `.env*` rule (line 37) does not affect it, because the file is already tracked. The residual issue is narrow: that rule _would_ block a new **root-level** `.env.example`, and the README never points at the one that exists.
- **The branch count is 32, not 33.** `git fetch --prune` removed 4 stale local tracking refs whose remotes were already deleted.
