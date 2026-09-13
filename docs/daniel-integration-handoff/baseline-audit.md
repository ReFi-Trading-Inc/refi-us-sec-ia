# Certification baseline audit (§2)

**Status:** ACCEPTED by founder 2026-09-13 as the correct execution of §2 of the
Top 0.01% Full-Stack Handoff Certification directive.

**Audited at main SHA:** `9483c3448d63db0ae17aaf4c1d5ebc2a44e7dedb`
(the certification work below is unchanged by the subsequent merge of #145,
`ed353b1db2b8f43b7e61d39803a5e71651d97bc7`, which added no infrastructure).

**Handoff status:** `NOT READY FOR DANIEL` — see [Blockers](#blockers).

This file is the authoritative starting-facts record for the certification
program. It is deliberately an inventory, not a design. Its purpose is to stop
the program rebuilding things that already exist, and to stop it claiming
things that do not.

> **Evidence rule (§0.5).** Every row below was produced by inspecting the
> repository, not by recollection. Where a row says something does not exist,
> the search that established that is named.

---

## 1. Exists — extend, do not rebuild (§2)

### Infrastructure as Code — Terraform

`infra/terraform/` is substantial and is the IaC basis. Do **not** introduce a
second framework.

| Path                               | Covers                                         |
| ---------------------------------- | ---------------------------------------------- |
| `modules/cloud-run-service/`       | Cloud Run service + runner service account     |
| `modules/artifact-registry/`       | image repository                               |
| `modules/secret-manager/`          | secrets + accessor service accounts            |
| `modules/workload-identity/`       | GitHub OIDC federation (no downloaded SA keys) |
| `environments/{dev,staging,prod}/` | per-environment composition                    |
| `infra/terraform/` (root)          | Firestore durable store + least-privilege IAM  |

`environments/prod/main.tf` already declares Artifact Registry (`refi-us`),
Workload Identity, Secret Manager (session / ip-hash / eligibility-jwt secrets
bound to the web runner), and Cloud Run `refi-us-web` with `min_instances = 1`,
`max_instances = 20`, `deletion_protection = true`.

Separately, `infra/gcp/socure-sandbox/` and `infra/gcp/socure-prod/` hold the
Socure runtime service definitions, provisioning scripts and Cloud Build
configs; `infra/cloudrun/` holds the demo deploy path.

### Contract and conformance infrastructure

Versioned contract packages already exist, **including Daniel-side conformance
tooling**. Extend these; do not build a competing system.

- `packages/api-clients/contracts/investor-api/{v1.1.0-alpha.2,v1.1.0-alpha.3}/`
- `packages/api-clients/contracts/investor-api/CURRENT.json`
- `.../v1.1.0-alpha.3/tools/conformance.py` — the conformance validator
- `packages/api-clients/src/__tests__/investor-api-conformance.test.ts`
- `packages/api-clients/openapi/refi-api.yaml`

The conformance validator + simulator already run **blocking in CI**.

### Protected CI

`.github/workflows/ci.yml` (the only workflow) provides: typecheck, lint,
gitleaks secret scan, dependency audit (report-only), route-manifest gate,
contract assertions, investor-boundary tripwire, blocked-term copy scan, unit
tests, and E2E across three lanes (main production artifact, signal, demo).

### Observability

`apps/web/instrumentation.ts` (OpenTelemetry) and Sentry client/server/edge
configs. Socure operational alerting exists via
`docs/runbooks/socure-kyc-alerts.md`.

---

## 2. Confirmed gaps

| Area                                     | Status                                 | Evidence                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commercial entitlement / Stripe (§47–53) | `NOT IMPLEMENTED`                      | `grep -rli stripe` across all source returns exactly two files — `scripts/contract-assertions.ts` and `apps/web/e2e/kyc.spec.ts` — and in both it is a _blocked-term regex_ for "stripe identity" as a KYC provider. No products, prices, customer mapping, Checkout, webhook, portal, tax, invoices or reconciliation. |
| Canonical trading eligibility (§55)      | `NOT IMPLEMENTED / CONTRACT NOT FINAL` | No `MAY_AUTOMATE_PAPER_TRADING` or equivalent single policy anywhere in `apps/` or `packages/`.                                                                                                                                                                                                                         |
| `CommercialEntitlement` model (§49)      | `NOT IMPLEMENTED`                      | "entitlement" appears only in `docs/`, never in code.                                                                                                                                                                                                                                                                   |
| Release/promotion pipeline (§15)         | `PARTIAL`                              | `.github/workflows/` contains only `ci.yml`, and it deploys nothing (no `gcloud`, no image push, no Cloud Run step). Deployment today is hand-run shell scripts + Cloud Build YAML. The GitHub → Artifact Registry → staging → approval → production path is not codified.                                              |
| Monitoring as code (§6)                  | `PARTIAL`                              | No monitoring, uptime-check, alert-policy or dashboard module under `infra/terraform/modules/`. Socure alerting exists operationally but is not declared in Terraform.                                                                                                                                                  |
| Drift detection (§7)                     | `NOT STARTED`                          | No plan/diff step in CI and no documented operator command.                                                                                                                                                                                                                                                             |
| Handoff package (§99)                    | `NOT STARTED`                          | This file is the first artifact in `docs/daniel-integration-handoff/`.                                                                                                                                                                                                                                                  |
| Supply-chain attestation (§10)           | `PARTIAL`                              | gitleaks + dependency audit exist. No SBOM, no build provenance, no image signing.                                                                                                                                                                                                                                      |

### Firestore correction (§5 of the sequencing decision)

Durable ReFi state is **Firestore**, not a relational database — there is no
`migrations/` directory anywhere in the repository, and `infra/terraform/`
provisions a Firestore Native database. The certification directive's
relational-migration language (§27/§28) must therefore be read as: document
schemas, schema/version evolution, indexes, transaction boundaries,
uniqueness/idempotency strategy, compatibility, backfill, retention, and
backup/restore. The requirement is disciplined data evolution, not SQL.

---

## 3. Open PRs affecting admission / onboarding / backend boundaries

Certification of admission (§41/§42) is blocked until this is reconciled (§6 of
the sequencing decision). Classification is deferred to after 2026-09-16, with
the exception of #114/#115, whose status is settled below.

### #114 / #115 — `PRESUMPTIVELY SUPERSEDED — DO NOT RETARGET`

These are **not** merely stacked on a stale base. Their _authority model_ is
superseded.

PR F (#114) explicitly describes ReFi as owning the automatic closed-Alpha
admission policy, and PR G (#115) hardens that model. Daniel subsequently
confirmed the opposite split:

- **backend** owns canonical closed-Alpha admission;
- **frontend** owns the Socure integration, evaluates the
  questionnaire/compliance, and submits trusted normalized KYC/compliance
  evidence;
- **backend** combines identity, membership, required consents, trusted
  compliance evidence and independent holds;
- **backend** persists canonical admission state, reasons and provenance;
- **frontend** owns no parallel canonical admission state and has no
  `set admitted` authority.

So the defect is ownership, not targeting. Retargeting or rebasing these onto
`main` would reintroduce a frontend-owned canonical admission implementation
that the confirmed architecture forbids.

**Post-freeze action (after 2026-09-16):**

1. inspect for reusable tests and invariants only — deterministic prerequisite
   matrices, fail-closed state treatment, evidence provenance,
   concurrency/idempotency tests, re-evaluation tests, durability patterns;
2. classify each reusable piece independently;
3. close the obsolete frontend-owned admission implementation;
4. do **not** merge or transplant canonical frontend admission authority.

No frontend-owned canonical admission implementation may survive merely because
its tests are good. Reusable invariants must be re-homed against the
backend-owned model, not carried over with their authority attached.

**Do not alter either PR during the demo freeze.**

| PR   | Base ← Head                                                   | Boundary               | Note                                                                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #115 | `kyc/socure-f-admission` ← `kyc/socure-g-admission-hardening` | **admission**          | PR G: hardens the superseded frontend-owned admission model. `PRESUMPTIVELY SUPERSEDED — DO NOT RETARGET` (see above).                                                                                                                            |
| #114 | `kyc/socure-e-attestation-docs` ← `kyc/socure-f-admission`    | **admission**          | PR F: ReFi-owned automatic Alpha admission on final trusted KYC ACCEPT — conflicts with the confirmed backend-owned model. `PRESUMPTIVELY SUPERSEDED — DO NOT RETARGET` (see above). Also on a stale base: PR E (#113) is already merged to main. |
| #43  | `main` ← `integrate/phase2-6-pr-d`                            | backend contract       | DRAFT, Dan-gated, "do not merge yet". Last updated 2026-07-24.                                                                                                                                                                                    |
| #7   | `main` ← `phase2-6-pr-d-account-prefs-history-contract`       | backend contract       | AccountPrefs history contract.                                                                                                                                                                                                                    |
| #14  | `main` ← `phase2-6-orderidmap-domain`                         | backend/trading domain | OrderIdMap domain types + controlled-upsert entity.                                                                                                                                                                                               |
| #98  | `main` ← `connected-dev/gcp-boundary-and-status`              | platform/IAM           | GCP boundary provisioning, IAM, phase status (docs).                                                                                                                                                                                              |
| #93  | `main` ← `ci/deploy-script-dotenv-escapes`                    | deployment             | Cloud Run env conversion fix.                                                                                                                                                                                                                     |
| #84  | `main` ← `docs/mint-handoff-deployed`                         | demo/deployment        | Deployment proof record (docs).                                                                                                                                                                                                                   |
| #77  | `main` ← `design/alignment-scope`                             | **design system**      | "adopt design-system tokens with a WCAG AA gate (slice 1)". Potentially conflicts with the frozen design decisions in `docs/investor-product-design-decisions.md` — review before either lands.                                                   |

---

## 4. Blockers

`NOT READY FOR DANIEL` for these reasons:

1. Commercial entitlement / Stripe subsystem missing (`BLOCKED — FOUNDER DECISION REQUIRED` on billing policy before implementation).
2. Canonical trading-eligibility policy unresolved (`BLOCKED — DANIEL CONTRACT DECISION REQUIRED`, and dependent on 1).
3. `AccountAuthorization` backend shape and enforcement require Daniel (`BLOCKED — DANIEL CONTRACT DECISION REQUIRED`).
4. Admission repository state requires reconciliation: #114/#115 are
   `PRESUMPTIVELY SUPERSEDED — DO NOT RETARGET`, because they implement a
   frontend-owned canonical admission authority that Daniel's confirmed model
   places in the backend. They must be decomposed — reusable invariants
   recovered, obsolete authority closed — not retargeted (see §3 above).
5. Platform deployment + monitoring certification incomplete.
6. Formal handoff package not yet built.
7. Only portions of investor-product behaviour are certified, and all of it is
   `PASS — FIXTURE DRIVEN`. Under §103 that must never be promoted to
   `PASS — LIVE`.

---

## 5. What is certified today

The P1 investor-product track (#144, #145) is certified at this level and no
higher:

- `PASS — FIXTURE DRIVEN` — brokerage connection, PAPER/LIVE gating,
  subscription, allocation, consent, backend-unavailable UX, route auth gate,
  KYC-claim truthfulness.
- `PASS — STATIC / CONTRACT` — production fixture fail-closed, LIVE denial by
  capability authority, design-system conformance (computed-style assertions).
- `DARK — TRAFFIC NOT AUTHORIZED` — Production Socure, LIVE execution, real
  Alpaca credentials, real capital.

See `docs/investor-product-design-decisions.md` for the accepted design and
architecture decisions, including the `/us/product/*` temporary successor-path
boundary.
