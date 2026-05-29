# Phase 2.5 GitLab Branch Inventory

**Date:** 2026-05-29
**Audit branch:** `phase2-5-gitlab-surface-alignment-audit`
**Audit mode:** read-only.
**Companion docs:** `phase2-5-gitlab-backend-capability-map.md`, `phase2-5-frontend-surface-inventory.md`, `phase2-5-surface-to-gitlab-alignment-register.md`, `phase2-5-core-alignment-decision.md`.

---

## 1. Remote inventory

| Item                   | Value                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| Repo                   | `https://gitlab.com/refinity_dev/refinity-main.git`                                               |
| Local clone            | `/Users/za/Library/CloudStorage/Dropbox/Nature Of Commerce LLC/ReFi/Website/GitLab/refinity-main` |
| `git status` (clone)   | clean; on `main`, up to date with `origin/main`                                                   |
| `git remote -v`        | `origin` (fetch + push)                                                                           |
| Total branches (local) | 1 (`main`)                                                                                        |
| Total remote heads     | **1** (`refs/heads/main` → `0a7d64d`)                                                             |
| Tags                   | 5 (all `backup-*` CI snapshots)                                                                   |

### `git ls-remote --heads origin` output

```
0a7d64d7d4e77ce409a0c330da029fae85f6188a    refs/heads/main
```

### `git ls-remote --tags origin` output

```
0b5f41a16c402f890cb11e03d0e71b13a066ab16    refs/tags/backup-ci-foundation-$TS
0b5f41a16c402f890cb11e03d0e71b13a066ab16    refs/tags/backup-ci-foundation-20250915220111
48214763697eb3f83a727a43d1969fb00056842a    refs/tags/backup-phase1-devops-a-$TS
71066e1229b487b5cefac027828b89049eadaff0    refs/tags/backup-phase1-devops-a-20250915220111
cdbb86e65ea539739e3d74770d8043c2b85a6dab    refs/tags/backup-phase1-devops-a-20250915220316
```

The five tags are CI backup snapshots dated 2025-09-15 (with one literal `$TS` shell-template that wasn't expanded). None represents a feature branch or environment branch.

---

## 2. Branch-by-branch table

| Branch             | Latest commit                         | Files changed vs `main` | Backend services unique to this branch | Changes signal / intent / risk / execution / broker / audit / admin behavior vs `main`? | Notes                                  |
| ------------------ | ------------------------------------- | ----------------------- | -------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------- |
| `main` (canonical) | `0a7d64d portfolio-manager bug fixes` | n/a                     | n/a                                    | n/a                                                                                     | The only branch. Sole source of truth. |

There are **no other branches** to inspect. The audit's branch-aware framing is moot for this repo today: the GitLab backend is single-branch-trunk-based development. Every service that exists lives on `main`.

### Recent commits on `main` (read-only `git log --oneline`)

```
0a7d64d portfolio-manager bug fixes
f4d0158 added portfolio-manager service app and run jobs, admin-portal wiring
2948efe git ignore
d47385c untrack tmp
9ed291f admin-portal, trade lifecycle managment hardening and auto pm documented
d891499 update to multi-stream convention
555c268 trade-manager, exec-gateway and admin-portal hardening
46f6bb3 phase 11 - 15 of trade lifecycle punchlist implemented.
5d3a852 trade lifecycle phase 10 implemented for execution control and kill switches
e5fa8ef trade lifecycle punchlist phase 9
c018e8d trade lifecycle punchlist implemented phase 0 - 8
75ff5a0 audits and punchlist for trade lifecycle and ia alignment
```

The commit messages name every service the prior audit (`phase2-5-daniel-live-backend-reconciliation.md`) listed as "missing": `portfolio-manager`, `admin-portal`, `trade-manager`, `exec-gateway`, the `trade lifecycle punchlist`, and `ia alignment` (Internet Adviser = the SEC Rule 203A-2(e) frame). The work is current and ongoing.

---

## 3. Canonical-branch recommendation

**`main`** is the canonical branch. Treat `0a7d64d` as the audit anchor. There is no staging / develop / phase-N branch to disambiguate against.

If Daniel later introduces feature branches or environment branches, this inventory must be re-run before any contract correction is applied against them.

---

## 4. Scope lock — re-affirmed

No GitLab file was modified, deleted, or read with intent to modify. No frontend code changes in this branch. No SEC 203A-2(e) boundary weakened. The audit was strictly read-only.
