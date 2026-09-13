# alpha.4 and `integration/refinity-dev` — reconciliation assessment

**Date:** 2026-09-13 · **Lanes C, D** · Read-only analysis. Nothing merged,
imported or applied.

`integration/refinity-dev` is not merely Terraform history. It is a **parallel
connected-integration line maintained by Daniel**, carrying the live
connected-dev Terraform, Cloud Run deployment tooling, auth/BFF changes and a
complete `v1.1.0-alpha.4` contract package.

**It is unprotected.** Treat its contents as _evidence and source to
reconcile_, never as automatically trusted release authority.

---

## 0. Correction — alpha.4 does exist

Two earlier statements in this repository were wrong, and both came from the
**same root cause**: a truncated branch search (`git branch -r | head -40`)
that missed `integration/refinity-dev`.

| Claim                                                           | Reality                                                                                                  |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| "no alpha.4 artifact exists in any local repository" (#152)     | **False.** It is vendored on `integration/refinity-dev`.                                                 |
| README: "that was incorrect and no such artifact exists" (#152) | **False.** The README's _original_ text was right; the "correction" introduced the error. Reverted here. |

The original README was correct all along. One incomplete search produced two
wrong conclusions and nearly sent Daniel a question we already had the answer
to — the same gap that produced the withdrawn `SOURCE LOCATION REQUIRED`
blocker.

---

## 1. Package authenticated

|                                |                                                                    |
| ------------------------------ | ------------------------------------------------------------------ |
| Version                        | `v1.1.0-alpha.4`                                                   |
| Digest                         | `a6db935b6a398bff00a7ccee4cb268ee565249bbd75c23e36594c9f6b698e7c3` |
| `CURRENT.json` ↔ `bundle.json` | **agree**                                                          |
| Per-artifact verification      | **11 / 11 hash-match, 0 mismatches**                               |
| `connected_alpha_verified`     | `false`                                                            |

Each artifact's declared `sha256` in `bundle.json` was recomputed from branch
content and compared. The package is internally consistent and untampered.

This check matters: alpha.3 shipped a known defect where `INTEGRATION.md`
Appendix A paired the alpha.3 version with the **alpha.2** digest. Alpha.4 does
not repeat it at this level.

Generator: `scripts/contracts/build_investor_alpha4_handoff.py` v2, from source
`contracts/frontend/investor-api-v1.1.0-alpha.4.json`.

---

## 2. Membership and admission are STILL NOT exposed

The decisive question, and the answer is unchanged from alpha.3.

| Artifact            | `membership` / `admission` |
| ------------------- | -------------------------- |
| `schemas.json`      | **none**                   |
| `openapi.json`      | **none**                   |
| `capabilities.json` | **none**                   |
| `contract.json`     | **none**                   |
| `INTEGRATION.md`    | 10 mentions (**prose**)    |
| `MIGRATION.md`      | 0 mentions                 |

**Adopting alpha.4 does not unblock Lane C.** `D-A2` (ClosedAlphaMembership)
and `D-A3` (canonical admission) remain `BLOCKED — DANIEL CONTRACT DECISION
REQUIRED`, and #149's `OnboardingStatus === READY` proxy **cannot yet be
replaced**.

`D-A1` is corrected again: the ask is no longer "deliver alpha.4" (it exists)
but **"expose membership and admission in a machine-readable successor
package."** We will not transcribe them from `INTEGRATION.md` prose.

---

## 3. What alpha.4 actually changes

From its `MIGRATION.md`:

1. **`funding_assessment`** — new nullable field on allocation previews and
   recommendation list/detail. Implement per `FUNDING.md`.
2. **Recommendation schemas corrected to match real backend projections** —
   list items use `RecommendationSummary`; detail uses `Recommendation` with
   `lineage`, `summary`, `content_status`, `lifecycle_status` and separate
   timestamps. **Alpha.3 was wrong here**: it retained an older shared schema
   with `status`, `freshness` and `estimated_turnover_percent`. Turnover is now
   a **fraction, not percentage points**.
   `execution_eligible=false` describes the advisory recommendation, **not**
   disabled account automation.
3. **Historical funding assessments are null, never recomputed.** An unconsumed
   legacy preview must be refreshed; a preference change invalidates a new
   preview; completed action replay stays idempotent.
4. **Unchanged:** SSE event names/envelopes, consent naming, allocation
   fraction request, **broker environment selection**, identity/Google/JWKS
   ownership.

> "The package is a frontend-development contract, not a connected Alpha
> release. `connected_alpha_verified=false` remains explicit."

### Consequence for Lanes F and H

Item 4 confirms **broker environment selection and consent naming are unchanged
in alpha.4**, so Lane F's brokerage/AccountAuthorization audit and the consent
work are not invalidated by the version move.

Item 2 **does** invalidate any recommendation-shape assumption taken from
alpha.3 — alpha.3's schema was factually wrong. Lane H must audit against
alpha.4, not alpha.3. Turnover units (fraction vs percentage points) are a
silent-corruption risk worth an explicit test.

---

## 4. Commit triage

13 non-merge commits, in two clean groups.

### Group A — connected Dev infrastructure (8)

```text
dc688a5  feat(infra): isolate frontend integration hosting in refinity-dev
6e5f1be  fix(infra): verify native runtime without Next tracing assumptions
c86e100  docs(infra): record verified connected Dev hosting checkpoint
abe5a55  feat(infra): automate isolated frontend branch deployments
9b81d29  fix(infra): run contract checks against archived build sources
8a49632  fix(infra): use Cloud SDK bundled Python for deployment
e02f302  fix(infra): pin CLI image and configure verified TLS roots
639a9a2  fix(infra): preserve Terraform ownership of runtime configuration
f061a8e  docs(infra): record verified branch CI/CD and release ownership
```

**Assessment: authoritative.** This group produced the live, verified
infrastructure inspected in `connected-dev-inventory.md` (state serial 6). It
is the source of record for `infra/terraform/connected-dev/`. `e02f302` (pinned
CLI image, verified TLS roots) and `639a9a2` (Terraform ownership of runtime
config) are supply-chain and drift improvements worth keeping on their merits.

### Group B — alpha.4 adoption (5)

```text
af12aec  docs(integration): stage alpha.4 and order connected development
09842e4  feat(integration): adopt alpha4 contract and scoped development adapters
6aae367  docs(integration): record alpha4 rollout and remaining acceptance gates
93c40ee  docs(integration): record verified main synchronization rollout
```

**Assessment: requires audit before adoption.** The package itself is
authenticated (§1), but `09842e4` also carries "scoped development adapters"
touching `apps/web/src/lib/investor-api` (12 files) and
`packages/api-clients/src/investor-api` (4). Those are **runtime** changes that
must be audited against decisions made _after_ this branch diverged —
particularly the Lane E account-access/economic-authorization separation, the
#149 admission proxy, and the KYC-claim truthfulness fix.

### Not a merge candidate

The branch is **33 commits behind** our handoff line and carries older
assumptions beside valuable connected work. **Do not merge wholesale.**
Reconciliation is commit-by-commit or file-by-file, each classified under the
existing tier policy.

---

## 5. Recommended order

1. **Adopt the alpha.4 package** — vendored bytes + `CURRENT.json` pin, with
   the digest re-verified on landing. Mechanical; no runtime change. _(Tier 2:
   contract authority.)_
2. **Regenerate the client and rerun conformance** against alpha.4.
3. **Audit Group B's runtime adapters** against post-divergence decisions
   before taking any of them.
4. **Reconcile Group A** into the handoff line as the source of record for
   connected-dev infrastructure. _(Tier 2: infrastructure.)_
5. **Then** resume Lanes F and H against alpha.4 — never alpha.3.
6. Lane C stays blocked on D-A2/D-A3 regardless; alpha.4 does not supply them.

Nothing above is started. Steps 1 and 4 are Tier 2 and await founder review.
