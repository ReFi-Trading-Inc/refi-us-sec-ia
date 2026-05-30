# Phase 2.6 Authoritative Source of Truth

**Date:** 2026-05-30
**Branch:** `phase2-6-repo-observation-and-authoritative-plan`
**Status:** Source-of-truth declaration for Phase 2.6. Supersedes the Phase 2.5 anchor.

This document is the canonical declaration of what backs Phase 2.6 of the frontend/BFF. Every Phase 2.6 doc, contract, and decision derives from the sources listed here, in this order of authority.

---

## 1. Authority hierarchy

| Rank | Source                                           | Where                                                                               |
| ---- | ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| 1    | **Daniel's backend at current `main`**           | `https://gitlab.com/refinity_dev/refinity-main`                                     |
| 2    | **`docs/authoritative/*` in that repo**          | the only doc folder that is current source of truth                                 |
| 3    | **`docs/scratch_pads/qa/email_qa_checklist.md`** | Daniel's direct answers to our four open questions                                  |
| 4    | **Live-state docs**                              | `docs/authoritative/spanner_ddl_all.txt`, `service_iam.txt`, `topics_subs_dlqs.txt` |
| 5    | **Backend code**                                 | `apps/*`, `apps/common/*`                                                           |
| 6    | **Frontend repo at current `main`**              | `https://github.com/ReFi-Trading-Inc/refi-us-sec-ia`                                |
| 7    | **Phase 2.5 docs**                               | historical audit evidence only                                                      |

## 2. Pinned commits

| Repo                                         | Branch | Commit    | Verified at |
| -------------------------------------------- | ------ | --------- | ----------- |
| `gitlab.com/refinity_dev/refinity-main`      | `main` | `9f9dfc9` | 2026-05-30  |
| `github.com/ReFi-Trading-Inc/refi-us-sec-ia` | `main` | `555f786` | 2026-05-30  |

The frontend `main` includes the squash-merge of Phase 2.5 PR #1 (`9407755 Phase 2.5: GitLab backend alignment, Contract V2, and E2E stabilization`) and the README PR #3 (`555f786 docs: add repository README`).

## 3. Not source of truth

The following are explicitly **not** controlling for Phase 2.6:

- `refinity-main/docs/out_dated/*` — Daniel has explicitly marked this folder as deprecated.
- The prior local `…/Daniels Back End/live-components-main` subset folder — superseded since Phase 2.5; kept as a read-only secondary reference at best.
- Phase 2.5 docs (`docs/phase2-5-*.md`) — useful as a historical record of how we read `refinity-main main @ 0a7d64d`, but not authoritative for current decisions.
- Any summary or assumption from an earlier session that conflicts with the authoritative docs above.

If a conflict arises between an earlier note and any item in the authority hierarchy, **the authority hierarchy wins**. The earlier note is updated or marked superseded.

## 4. Reading order for Phase 2.6 work

### Must-read by humans

- `refinity-main/docs/authoritative/executive_overview.md` (274 lines) — system summary with mermaid pipeline diagram

### Must-read by agents before adapter implementation

1. `refinity-main/docs/authoritative/frontend_integration_contract.md` (521 lines)
2. `refinity-main/docs/authoritative/trade_lifecycle_contract.md` (629 lines)
3. `refinity-main/docs/authoritative/trade_auditability_contract.md` (801 lines)
4. `refinity-main/docs/authoritative/trade_lifecycle_retention_legal_hold.md` (37 lines)

### Live-state references

- `refinity-main/docs/authoritative/spanner_ddl_all.txt` — Spanner DDL snapshot
- `refinity-main/docs/authoritative/topics_subs_dlqs.txt` — Pub/Sub topology
- `refinity-main/docs/authoritative/service_iam.txt` — service accounts and runtime identities

### Authoritative Q&A

- `refinity-main/docs/scratch_pads/qa/email_qa_checklist.md` — Daniel's resolution of our four blockers

### Optional / nerdy

- `refinity-main/docs/authoritative/trading_execution_playbook.md` (638 lines) — high-level procedure the lifecycle was built around

## 5. How this doc is used

- Every Phase 2.6 doc cites this file in its header.
- Every Contract V3 / Gap Register V3 claim must trace to a source listed above by file path and (where relevant) line range.
- Phase 2.5 docs receive a "superseded by Phase 2.6" header and remain in the tree for audit.

## 6. Update policy

When Daniel ships a new authoritative-doc revision or moves the backend `main` forward, this file is updated by:

1. Recording the new commit hash in §2
2. Re-reading any authoritative doc whose content changed
3. Triggering a Contract V3 + Gap Register V3 refresh if the new content invalidates current claims
4. Producing a "what changed" delta doc under `docs/phase2-6-deltas/`

No frontend product code is updated until the delta is reviewed.

## 7. Scope lock

No frontend product behavior changes follow from this declaration alone. No Daniel backend changes. No SEC 203A-2(e) boundary weakened. No new product surface added.
