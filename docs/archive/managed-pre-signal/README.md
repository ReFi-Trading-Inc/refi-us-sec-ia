# Managed pre-Signal product — archive

**Canonical immutable reference:** signed annotated tag
`archive/managed-pre-signal-2026-08-22` → `42e9603de0a2b132c1e7239e8d0049040f33a194`
(GPG key `80CF…99FF`; verify with `git tag -v archive/managed-pre-signal-2026-08-22`).
The convenience branch `archive/managed-pre-signal-2026-08-22-browse` points
at the same SHA — the tag is the immutable canonical reference; the `-browse`
branch is browseable convenience only. The names are deliberately distinct so
no ambiguous-ref workaround is ever necessary.

**What this freezes:** the last hardened merged `main` before PR #49 began
Signal-specific destructive surface removal — the complete dual-mode product:
Automation Center and activation flow, ExecutionPolicy authoring, Managed
pause/resume/state, profile reactivation, disclosure re-acknowledgement, the
six-category Exception Review, order read surfaces, subscription-mode UX/API,
and the raw-API-key broker connection flow.

**Status: deferred, not abandoned — and NOT production-ready.** This archive
exists so future Managed work starts from a preserved, inspectable product
rather than from git archaeology. It must not be merged back wholesale; see
[reintroduction-guide.md](reintroduction-guide.md).

| Document                                                 | Contents                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [built-surface-inventory.md](built-surface-inventory.md) | Measured capability inventory at the archived SHA, with per-capability classification and known defects |
| [reintroduction-guide.md](reintroduction-guide.md)       | What reconciliation with Daniel's target architecture requires before any of this returns               |
