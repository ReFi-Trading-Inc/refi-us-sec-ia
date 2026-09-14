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

| Artifact            | cohort `membership` / `admission`                                                 |
| ------------------- | --------------------------------------------------------------------------------- |
| `schemas.json`      | **none** (only `AccountMembership` = allocation membership, identical to alpha.3) |
| `openapi.json`      | **none** (only `listAccountMemberships`, identical to alpha.3)                    |
| `capabilities.json` | **none** (same operation)                                                         |
| `contract.json`     | **none** (same operation)                                                         |
| `INTEGRATION.md`    | 10 mentions (**prose**)                                                           |
| `MIGRATION.md`      | 0 mentions                                                                        |

Precision added 2026-09-13: the string "membership" _does_ occur in the machine
artifacts — as `listAccountMemberships` / `AccountMembership`
(`ACTIVE | ENDED | PENDING`, `allocation_percent`, `template_id`, …) and as
`lineage.membership_fingerprint` / `membership_version` on a recommendation.
That is the **portfolio allocation** membership produced by `join_template`,
byte-identical to alpha.3. It is not the closed-Alpha **cohort** membership of
D-A2. The table is about the latter.

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

At the first assessment the branch was 33 commits behind our handoff line.
Daniel has since merged `main` into it three times (`da938ae`, `d592c10`,
`6cd903e`, 2026-09-11/12/13), so as of 2026-09-13 it is **16 commits ahead of
and 11 behind** `daniel-handoff/integration` (merge base = `main` at
`509b1f7`). The 11 it lacks are exactly our handoff lanes #148–#154, including
#148's withdrawal of the service-account-key deployment path. The three merge
commits are **not pure merges**: each carried conflict-resolution edits outside
`main`'s own changes (§6.2, §6.3). **Do not merge wholesale.** Reconciliation
is commit-by-commit or file-by-file, each classified under the existing tier
policy.

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

Status 2026-09-13 (founder approved steps 1 and 4 on 2026-09-13):

| Step | Status                                                                                                                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **MERGED** — PR #155, head `3611307`, CI run 34800004663, merge `019a6bf` = `daniel-handoff/integration` (§6.1)                                                                                                                             |
| 2    | **DONE** — client regenerated; conformance validate + self-test; 402 client tests; all contract assertions                                                                                                                                  |
| 3    | **DONE (audit)** — §6.2; the mechanical take-list landed in the same branch, the conflicts did not                                                                                                                                          |
| 4    | **MERGED** — PR #156, reviewed head `915e77d`, CI run 34803445524, merge `ac11593` = `daniel-handoff/integration`; deployment source corrected to `daniel-handoff/integration` (§6.3). Trigger apply still gated on a founder-reviewed plan |
| 5    | Next: Lanes F and H against alpha.4 (the turnover-units guard already landed as a test)                                                                                                                                                     |
| 6    | Still blocked. Daniel's status record claims a backend **alpha.5** with membership/admission reads → D-A1                                                                                                                                   |

---

## 6. Reconciliation results (2026-09-13)

Read-only audits of every Daniel-side change, then a by-path take. Nothing was
merged; nothing from `integration/refinity-dev` was taken without a
classification below.

### 6.1 Adopted: the alpha.4 package and its mechanical adapters

Landed on `daniel-handoff/lane-c-alpha4-adoption` (from
`daniel-handoff/integration`):

- `packages/api-clients/contracts/investor-api/v1.1.0-alpha.4/**` — 12 files,
  byte-for-byte from `09842e4`. Re-verified on landing: 11/11 artifact hashes;
  the package content digest recomputed with Daniel's own algorithm in
  `alpha4-adoption.test.ts` (not trusted from `bundle.json`);
  `conformance.py validate` and `self-test` on python3.11. `CURRENT.json`
  pinned to alpha.4. alpha.3 and alpha.2 stay at their original paths as
  history — Daniel's `archive/` move was **not** taken (it would churn
  hash-asserted paths for no gain).
- Client pins (`package.json` generate target, `package.ts`, `validation.ts`,
  `client.ts`, `index.ts`, `upstream-state.ts`) and the regenerated
  `investor-api.gen.ts`.
- The recommendation projection (`recommendations.ts`), `funding-notices.ts`
  (new), the demo world's alpha.4 shapes (`demo-client.ts`), the presentation
  helpers (`_view.tsx`), the hook/route pass-through of `nextCursor` /
  `fundingNotices` / `fundingComplete`, and the mechanical test and e2e
  updates. These were **forced** by the pin: alpha.4 removed `status`,
  `freshness.*` and `estimated_turnover_percent` from recommendations, so
  typecheck failed on the pin alone.
- Four alpha.3→alpha.4 fixture-path bumps in `scripts/contract-assertions.ts`
  — and nothing else from Daniel's 82-line change to that file (§6.2 C).
- New `alpha4-adoption.test.ts`: integrity recompute; **turnover is a
  fraction** (no alpha.4 schema names `estimated_turnover_percent`; the
  examples carry `0.999`; the projection renders `99.9` by exact base-10
  conversion; malformed decimals throw rather than guess units); summary and
  detail project to one view with `execution_eligible` `const false` and no
  fabricated `last_evaluated_at` / policy version; `funding_assessment: null`
  is never "sufficient"; stale / superseded / null / incomplete evidence cannot
  clear an INSUFFICIENT funding notice.

Lane H follow-up fixes (status casing, fan-out resilience, exact percent display) merged as #158: head `c4cdea6`, CI run 34802196817, merge `57680cf`.

Gates on the branch: typecheck, lint, 402 client tests, contract assertions,
tripwire (0 violations / 349 files), route manifest (51 routes), Playwright
main 91 / signal 10 / demo 42, CI-equivalent staging build.

Compatibility debt carried by the projection (Lane H, not adoption): the
detail page still renders alpha.3-era fields alpha.4 does not supply
(`lastEvaluatedAt` and `policyVersion` are empty strings; `formatDateTime`
prints "—"). The list view resolves a summary's missing `template_id` from
`funding_assessment.input_versions` or, failing that, from a bounded detail
fetch (groups of 4). A `template_id` on `RecommendationSummary` would remove
that fan-out — a D-A ask, not a frontend invention.

### 6.2 Group B runtime changes — classification

`09842e4` changed 37 runtime/test files besides the package, and the three
merge commits carried further edits. Audited against the post-divergence
decisions: Lane E (#149, `d86a774`: general account access ≠ economic
authorization), `3a16050` (product routes gated on session; the KYC claim
sourced from authority), `5f5bd95`, and the Socure hardening set.

| Classification                       | Files                                                                                                                                                                                                                                                                                                                                                                                                                                     | Outcome                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| MECHANICAL (alpha.4 shape)           | package, pins, `recommendations.ts`, `funding-notices.ts`, `demo-client.ts`, `_view.tsx`, `useInvestorRecommendations.ts`, `recommendations/route.ts`, `upstream-state.ts`, version tests, e2e version strings                                                                                                                                                                                                                            | **taken** (§6.1)               |
| SAFE-INDEPENDENT (worth taking)      | `pagination.ts` `collectComplete`; `account-scope.ts`; `portfolio.ts` (5→20 pages, memberships paginated); the `listOwnedBrokerageConnections` hunk of `brokerage-connection.ts` only; `events.ts`; `events/route.ts` (50 s renewal, cursor reset); `useAccountEvents.ts`; `AuthProvider.tsx` cache scoping; `durable-store/store.ts`; `connected-deployment-test.ts`; the `resolveAccountScope` hardening in `attestation/route.ts` only | separate PR; not adoption      |
| CONFLICTS — D-LAUNCH-07 (paper only) | `broker/connection/route.ts` (`z.enum(["paper","live"])`, `(PK\|AK)` key regex), `[id]/rotate/route.ts`, `brokerage-connection.ts` `account_environment: input.environment`, `useBrokerConnection.ts` — a live-trading grant at the BFF boundary while founder decision F2 is open                                                                                                                                                        | **not taken**                  |
| CONFLICTS — idempotency model        | `operation-identity.ts` (new), `account-actions.ts`, `brokerage-maintenance.ts` key derivation, four allocation routes + sync hard-refusing without a browser `Idempotency-Key` — the key is no longer derived from the economic parameters; safety rests on an unverified backend changed-body rejection                                                                                                                                 | **not taken**; design decision |
| DEV-ONLY fixture                     | `integration-dev/kyc-pass.ts` (see finding 1), `attestation-mapping.ts` (finding 2), `attestation-submission.ts` fixture branch, `decision-sequence.ts` fixture early-return, `attestation/route.ts` fixture wiring, `development-kyc.test.ts`                                                                                                                                                                                            | **must not land** on this line |

**Findings that block the rest of Group B** (file:line as of `09842e4`):

1. `kyc-pass.ts:149` mints `kyc.status = "passed"` with no provider decision.
   Its gate is server env plus project/service/SA identity
   (`GCP_PROJECT_ID === "refinity-dev"`, `K_SERVICE`, runtime SA via the
   metadata server, subject/account allowlists). No browser input reaches it,
   but it is reachable on a connected deployment because
   `REFI_KYC_PROVIDER=unconfigured` is the permitted F-1 value; it is not
   release-stage gated and no Socure invariant excludes it.
2. `attestation-mapping.ts:82,248` makes `trading_eligibility: "eligible"`
   emittable under `REFI_RELEASE_STAGE=automated_alpha` — inverting Lane E and
   removing the D-LAUNCH-06 "unrepresentable" boundary the prior code typed
   out of existence.
3. `broker/connection/route.ts:37,42` accepts live Alpaca key ids and
   `account_environment: "live"` while its own header still says live keys are
   refused and D-LAUNCH-07 is open.
4. `contract-assertions.ts` widens the sole-submitter allowlist to
   `kyc-pass.ts`; `withdrawDevelopmentKyc` calls
   `createComplianceProfileAttestation` directly, bypassing the consent chain.
5. Idempotency identity moves from the economic parameters to a client header.

**C. Assertions weakened or removed by Daniel's `contract-assertions.ts`
change** (none taken): "trading_eligibility `eligible` must be unrepresentable"
removed and replaced by a pin _requiring_ the eligible branch; "expiry is
undecided — the builder must send null" loosened to a fixture override; the
sole-submitter pin widened; "environment must be the literal paper" and "only
PK key ids parse" loosened to paper|live and `(PK|AK)`; rotation/sync key
assertions rewritten for the client operation id. Daniel's hunks do not
textually overlap #149's additions, so the file reconciles hunk-wise.

**Merge-commit extras** (edits beyond `main`'s own changes): `da938ae`,
`d592c10`, `6cd903e` touched `development-kyc.test.ts`,
`attestation-mapping.test.ts`, `connected-deployment-test.ts`, the three
`infra/gcp/socure-*` manifests (§6.3) and Daniel's docs as conflict
resolutions.

### 6.3 Group A infrastructure — audit and reconciliation plan

Daniel-side-only files outside `apps/`, `packages/`, `docs/`: `.gitignore`,
`.gcloudignore`, `.prettierignore`, `README.md`, root and `apps/web/`
`vercel.json`, `infra/cloudrun/**` (9 files), `infra/terraform/connected-dev/**`
(4 files), `infra/gcp/socure-{prod,sandbox}/service*.yaml`,
`scripts/connected-deployment-test.ts`. `.github/workflows/ci.yml`,
`infra/terraform/README.md` and `infra/terraform/variables.tf` are **not**
Daniel-side: their diff against our line is the inverse of #148, i.e. his
branch simply predates it. A wholesale merge would revert #148.

**Terraform vs live inventory (state serial 6):** `main.tf` (18 addresses) +
`cicd.tf` (9) = **27 resource addresses, matching the inventory 27/27** — none
declared but not inventoried, none inventoried but not declared. Names,
regions, SA emails (`refi-frontend-runtime@…`, `refi-frontend-build@…`), the
two KMS keys (`investor-assertion`, `identity-bridge`, `EC_SIGN_P256_SHA256`),
the trigger (name, SA, filename, `^integration/refinity-dev$`) and the
Firestore database id agree with the inventory. Attribute-level state
(ingress, min/max instances, secret ids, bucket names, env vars) is **not
comparable from repo evidence**; no state or plan artifact exists in the repo.
Confirmation needs a credentialed `connected-dev.sh plan` against
`gs://refinity-dev-frontend-tfstate` — founder/Daniel, not us. `ignore_changes`
covers the container image, so a clean plan does not prove the served digest.

**Compatibility with #148:** no `google_service_account_key`, no key file, no
WIF pool; Cloud Build runs as the dedicated build SA. Consistent.

**Security review:** clean on credentials (in-memory tokens only; secrets
generated into Secret Manager via stdin; no literals), the promotion controller
is bounded and rollback-safe, the runtime probe asserts default-database denial
and distinct KMS signers. Open items: `python:3.12-slim`,
`gcr.io/cloud-builders/docker` and `node:22-alpine` are tag-pinned, not
digest-pinned (only the gcloud CLI image is); the `allUsers` invoker on the
integration service is intended and must be an explicit acceptance.

**HIGH — reject `infra/gcp/**` outright.** The only semantic change across the
three Socure manifests is in the two **prod** files:
`SOCURE_WEBHOOK_ENFORCE_SENDER_IP: '0' → "1"`, introduced by merge-conflict
resolution (`d592c10`, `6cd903e`), not by any Group A commit, under a header
comment rewritten to say the merge "preserves the existing enabled sender-IP
enforcement". `main` deliberately holds `0` for prod ("stays 0 until the
genuine Sandbox delivery proof passes"; last set by `0733e80`, after
`e53466b`). The sandbox manifest differs only by prettier reflow.

**Plan (Tier 2, approved 2026-09-13; separate PR):** take by path
`infra/terraform/connected-dev/**`, `infra/cloudrun/**`, `.gitignore`,
`.gcloudignore`, both `vercel.json` (they only disable Vercel auto-deploys of
`integration/refinity-dev`; `main` and the demo fallback are unaffected), and
`apps/web/src/lib/durable-store/store.ts` together with
`scripts/connected-deployment-test.ts`. Reject `infra/gcp/**`,
`infra/terraform/README.md`, `infra/terraform/variables.tf`, `README.md`.
Record base-image digest pinning as a follow-up. `allUsers` invoker: `FOUNDER
ACCEPTED 2026-09-13 — PUBLIC FRONTEND NETWORK ENTRY, APPLICATION AUTH REQUIRED`.

**Founder review finding on #156 (2026-09-13):** Daniel's trigger deployed from
`^integration/refinity-dev$`, so the deployment source differed from the
certification authority. Amended on the PR: trigger, release controller,
operator script and Cloud Build header all name `daniel-handoff/integration`,
pinned by `scripts/connected-deployment-test.ts`. The live trigger keeps the old
branch until a reviewed plan/apply. `daniel-handoff/integration` is verified
**not** GitHub-branch-protected; PR/CI policy is the enforcement.

### 6.4 Claims in Daniel's status record that need verification

`docs/alpha4-integration-status.md` on `integration/refinity-dev` states, among
deployment facts we cannot check from here: "Backend alpha.5 is now
issued/deployed in the separate GitLab repository, but is not adopted by this
merge … current backend membership/admission reads and normal disconnect
recovery are implemented" (→ D-A1, sharpened to "issue the alpha.5 frontend
package"); "changed bodies under the same ID must be rejected by the backend"
(the whole safety case for the operation-id idempotency model; unverified);
the development-KYC fixture's backend guard is on a GitLab branch and "not
deployed"; and "no new live-trading grant" for paper/live selection, which the
schema change in finding 3 contradicts at the frontend boundary.
