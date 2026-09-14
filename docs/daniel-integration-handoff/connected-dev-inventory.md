# Connected Dev — platform inventory and state-access result

**Date:** 2026-09-13 · **Lane D** · **Method:** read-only inspection with
`gcloud` as `zeshan@refi.trading`. No `terraform apply`. No secret payload was
read. No key material was printed.

**Resolved project facts** (do not re-ask):

| Fact                 | Value          |
| -------------------- | -------------- |
| Project ID           | `refinity-dev` |
| Project number       | `182665799543` |
| Connected Dev region | `us-west1`     |

---

## 1. Terraform remote-state read — RESULT

### The backend in `backend.tf.example` does not exist

`gs://refi-us-tfstate` returns **404**. There is also **no `backend.tf`** in
`infra/terraform/` — only `backend.tf.example` — and no local `.tfstate`
anywhere in the tree. So `infra/terraform/` has never been initialized against
a remote backend and has no state.

### The real state is elsewhere

```text
gs://refinity-dev-frontend-tfstate/connected-dev/default.tfstate
  terraform_version 1.15.9 · serial 6 · 27 managed resources
```

### `google_service_account_key` entries: **0**

The state tracks **no** user-managed service-account key.

**Interpretation (per the directive's "No output" branch):** the
state-destruction concern for removing `create_sa_key` is **removed**. Nothing
in state would be destroyed.

The remaining check before deletion is runtime configuration, not state:
`apps/web/src/lib/durable-store/store.ts:44` still reads
`GCP_SERVICE_ACCOUNT_KEY` and uses a key when present, falling back to ADC. The
live service (§2) runs with a runtime service account, and
`docs/releases/2026-09-signal/gcp-bff-migration-plan.md` already records that
this variable "ceases to exist". Removal is therefore a **Tier 2** change
covering the Terraform resource/output _and_ the `store.ts` branch together.

---

## 2. The connected Dev environment already exists — inventory before extending

This is the central finding. The architecture listed as "required" is **already
built and applied**, and must not be rebuilt.

### Live, verified

| Resource                | Value                                                        |
| ----------------------- | ------------------------------------------------------------ |
| Cloud Run service       | `refi-frontend-integration` (us-west1)                       |
| Latest ready revision   | `refi-frontend-integration-00013-del`                        |
| URL                     | `https://refi-frontend-integration-74kl57biwa-uw.a.run.app`  |
| Runtime service account | `refi-frontend-runtime@refinity-dev.iam.gserviceaccount.com` |

### The two separate P-256 signing keys exist

Both required keys are present and correctly separated — this is the item most
at risk of being duplicated by a fresh Terraform build:

```text
projects/refinity-dev/locations/us-west1/keyRings/refi-frontend/cryptoKeys/
    identity-bridge       ASYMMETRIC_SIGN  EC_SIGN_P256_SHA256
    investor-assertion    ASYMMETRIC_SIGN  EC_SIGN_P256_SHA256
```

Key rings in `us-west1`: `refi-frontend`, `refinity-identity`.

### Declared in the connected-dev state (27 managed resources)

```text
google_artifact_registry_repository.images          x1
google_artifact_registry_repository_iam_member      x1
google_cloud_run_v2_service.frontend                x1
google_cloud_run_v2_service_iam_member              x2  (deploy, public)
google_cloud_run_v2_job.runtime_probe               x1
google_cloud_run_v2_job_iam_member.deploy_probe     x1
google_cloudbuild_trigger.frontend                  x1
google_cloudbuildv2_repository.frontend             x1
google_firestore_database.frontend                  x1
google_kms_key_ring.frontend                        x1
google_kms_crypto_key.signing                       x2   ← the two P-256 keys
google_kms_crypto_key_iam_member.signing            x2
google_kms_crypto_key_iam_member.public_keys        x2
google_secret_manager_secret.session                x4
google_secret_manager_secret_iam_member.runtime     x4
google_service_account.build                        x1
google_service_account.runtime                      x1
google_service_account_iam_member.deploy_runtime    x1
google_project_iam_custom_role.deploy_status        x1
google_project_iam_member                           x3  (build_logs, database, deploy_status)
google_storage_bucket                               x2  (build_source, releases)
google_storage_bucket_iam_member                    x2
```

Mapped against the directive's required list:

| Required                           | Status                                            |
| ---------------------------------- | ------------------------------------------------- |
| Artifact Registry                  | **exists**                                        |
| Cloud Run Next.js/BFF              | **exists**                                        |
| Dedicated runtime service account  | **exists**                                        |
| GitHub deployment identity         | **exists** (Cloud Build trigger + v2 repository)  |
| Firestore connected durable state  | **exists**                                        |
| Secret Manager                     | **exists** (4 secrets, runtime-scoped IAM)        |
| KMS P-256 — Investor API assertion | **exists** (`investor-assertion`)                 |
| KMS P-256 — identity bridge        | **exists** (`identity-bridge`)                    |
| Least-privilege IAM                | **exists** (per-resource members + a custom role) |
| Cloud Logging / Monitoring         | not visible in this state — **verify separately** |

### Daniel's services are live in the same project

`identity-ccid` and `investor-api` are deployed in `refinity-dev`, alongside
~20 other backend services (exec-gateway, risk-engine, trade-manager,
portfolio-engine, admin-portal and others).

---

## 3. Provenance — SOURCE RECOVERED (corrected 2026-09-13)

> **This section supersedes an incorrect finding.** The first revision of this
> document reported the Terraform source as "not in this repository, not on any
> remote branch" and raised `BLOCKED — SOURCE LOCATION REQUIRED`. **That was
> wrong.** The branch search behind it was truncated by `head -40`, and
> `integration/refinity-dev` sorts past that cut. The source was in our own
> repository the whole time. Had it not been caught, it would have sent Daniel
> a question we already had the answer to.

### The source

|              |                                                         |
| ------------ | ------------------------------------------------------- |
| Branch       | `origin/integration/refinity-dev`                       |
| Tip commit   | `d592c1047e5f82a71ae20612676a3d3f16321c24` (2026-09-12) |
| Author       | Daniel Oosthuyzen                                       |
| Path         | `infra/terraform/connected-dev/` — `main.tf`, `cicd.tf` |
| Build config | `infra/cloudrun/cloudbuild.connected-cicd.yaml`         |
| Open PR      | none                                                    |
| Divergence   | 15 commits not on `main`; `main` has 22 not on it       |

### Verified to correspond to the state we read

The backend block matches the inspected state object exactly:

```hcl
backend "gcs" {
  bucket = "refinity-dev-frontend-tfstate"
  prefix = "connected-dev"
}
provider "google" {
  project = "refinity-dev"
  region  = "us-west1"
}
```

Declared resource addresses line up with the 27 in state, including
`google_kms_crypto_key.signing` (the two P-256 keys),
`google_secret_manager_secret.session`, `google_service_account.runtime` /
`.build`, `google_artifact_registry_repository.images` and
`google_firestore_database.frontend`. `cicd.tf` carries the Cloud Run and
Cloud Build resources.

### Who applied it

Cloud Audit Logs (admin activity) name a single principal:

```text
2026-09-11T22:45:42Z  daniel@refi.trading  storage.buckets.create
2026-09-11T22:45:43Z  daniel@refi.trading  CreateCryptoKey        (x2)
2026-09-11T22:45:43Z  daniel@refi.trading  CreateServiceAccount   (x2)
2026-09-11T22:52:54Z  daniel@refi.trading  Services.CreateService (refi-frontend-integration)
2026-09-11T23:39:22Z  daniel@refi.trading  storage.buckets.create
```

State-object generations (bucket versioning is on) show six writes in one
session: `22:44:23` → `22:46:06` → `22:46:18` → `22:53:19` → `23:03:30` →
`23:39:36` UTC, ending at serial 6 / 69,140 bytes.

So this was applied by **Daniel, from a human identity, on 2026-09-11** — not
by CI and not by a service account.

### The Cloud Build trigger closes the loop

```text
trigger    refi-frontend-integration     created 2026-09-11T23:39:35Z
repository refi-us-sec-ia                (GitHub, via connection refi-frontend-github)
branch     ^integration/refinity-dev$
filename   infra/cloudrun/cloudbuild.connected-cicd.yaml
build SA   refi-frontend-build@refinity-dev.iam.gserviceaccount.com
```

The trigger points at **this repository**, at exactly the branch holding the
source. Nothing is missing.

### Classification

**A — SOURCE RECOVERED.** No question to Daniel is required, and none should be
asked. Importing, moving, merging or reconciling the branch is **Tier 2**; the
founder approved reconciliation on 2026-09-13.

### Reconciled onto the handoff line (2026-09-13, Tier 2 approved)

Taken **by path** from `origin/integration/refinity-dev` (tip `6cd903e`,
2026-09-13), never by merge — a merge would revert #148 because Daniel's branch
predates it:

| Taken                                                                                                                                   | Why                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `infra/terraform/connected-dev/{main.tf,cicd.tf,release.tfvars,.terraform.lock.hcl}`                                                    | Source of record for the live state (27 addresses ↔ 27 in §2; names, regions, SAs, KMS keys, trigger agree)                                                                                                       |
| `infra/cloudrun/**` (9 files: runbook, Dockerfile, two Cloud Build configs, operator script, release controller + tests, runtime probe) | Deployment tooling for that state; no SA key, no WIF — Cloud Build runs as `refi-frontend-build@…`                                                                                                                |
| `.gitignore`, `.gcloudignore`                                                                                                           | Terraform/Python working files; nothing tracked matches                                                                                                                                                           |
| root and `apps/web/` `vercel.json`                                                                                                      | Only disable Vercel auto-deploys of `integration/refinity-dev`; `main` and the demo fallback are unaffected                                                                                                       |
| `apps/web/src/lib/durable-store/store.ts` `firestoreSettings()`                                                                         | Under `native-cloud-run`, a SA key, `GOOGLE_APPLICATION_CREDENTIALS` or an emulator is a boot failure; validated `FIRESTORE_DATABASE_ID` (the named native database — `refinity-dev`'s default is Datastore mode) |
| `apps/web/src/lib/investor-product/resolve-adapter.ts`, `apps/web/app/us/product/layout.tsx`, its test                                  | `REFI_DATA_ADAPTER=live` forces the transport adapter on every tier; fixture is a configuration error there. Strictly more fail-closed than `main`                                                                |
| `scripts/connected-deployment-test.ts`                                                                                                  | Asserts the two rows above; the connected Dockerfile runs it before `contract-test`, `tripwire` and the web build                                                                                                 |

**Rejected:** `infra/gcp/socure-*/service*.yaml` (the prod manifests flip
`SOCURE_WEBHOOK_ENFORCE_SENDER_IP` `'0' → "1"` in a merge resolution under a
comment claiming the opposite; `main` deliberately holds `0`),
`infra/terraform/README.md` and `variables.tf` (would revert #148), `README.md`
and Daniel's `docs/**` (assert unaudited Group B claims). Everything under
`apps/web/src/lib/integration-dev/`, the paper|live broker widening, the
client-header idempotency model and Daniel's `contract-assertions.ts` changes
stay out — see `alpha4-reconciliation.md` §6.2.

**Edited on take:** one bullet of `infra/cloudrun/CONNECTED_DEV.md` that pointed
at the development KYC-pass roadmap now states that source is not adopted here.

### Deployment source amendment (founder review of PR #156, 2026-09-13)

Daniel's Terraform attached the Cloud Build push trigger to
`^integration/refinity-dev$` — his unprotected parallel branch, which we
deliberately refused to merge and which carries runtime changes we rejected.
That made the deployment source differ from the certification authority
(`daniel-handoff/integration`). **Amended on this PR:** the declared trigger,
the release controller (`DEPLOY_BRANCH`), the operator script and the Cloud
Build header all name `daniel-handoff/integration`, and
`scripts/connected-deployment-test.ts` pins the invariant in CI:

> connected Dev automated deployment may originate only from the reviewed
> Daniel-handoff integration branch — never `main`, a PR head,
> `integration/refinity-dev` or an arbitrary branch.

No new branch was created for this. No `terraform apply` was run: the **live**
trigger still names Daniel's branch until a credentialed operator applies the
amended configuration through a reviewed plan, which will show exactly that one
change. Daniel's builds recorded in `CONNECTED_DEV.md` came from the old source.

**GATE — `BLOCKED — DEPLOYMENT BRANCH PROTECTION REQUIRED BEFORE CONNECTED-DEV
TRIGGER APPLY` (founder, 2026-09-13).** `protected: false` is acceptable for an
engineering integration branch; it is not acceptable once pushes to that branch
automatically deploy Connected Dev. Before the Terraform change that moves the
live Cloud Build trigger is applied, GitHub must enforce the merge discipline
mechanically on `daniel-handoff/integration`, at minimum: direct pushes blocked
for normal contributors; changes enter only through pull requests; required
GitHub Actions checks must pass before merge; stale approvals/checks do not
survive a changed head where GitHub supports it; force pushes disabled; branch
deletion disabled. This blocker does **not** prevent merging #156's source into
the handoff branch; it prevents `terraform apply` of the trigger-source change.
Exact enforcement options are recorded here only after they are configured and
independently verified (founder-side GitHub setting).

**Branch protection — verified fact, not a claim:** the GitHub API reports
`daniel-handoff/integration` as **not protected** (`protected: false`,
2026-09-13). Protected CI on every lane PR is enforced by the workflow's
`pull_request` filter and by our PR/CI merge policy, not by GitHub branch
protection. Enabling protection is a founder-side GitHub setting and a separate
follow-up.

**`allUsers` invoker on `refi-frontend-integration`:**
`FOUNDER ACCEPTED 2026-09-13 — PUBLIC FRONTEND NETWORK ENTRY, APPLICATION AUTH
REQUIRED`. Acceptable only because application authentication remains
authoritative and no backend service is made public by this rule; it authorizes
neither backend invocation nor trading.

**Follow-ups recorded, not done:** digest-pin `python:3.12-slim`,
`gcr.io/cloud-builders/docker` and `node:22-alpine` (only the gcloud CLI image
is digest-pinned); apply the amended trigger through a reviewed plan; a credentialed `connected-dev.sh plan` is the only way
to confirm attribute-level agreement with state serial 6 (no state or plan
artifact exists in the repo, and `ignore_changes` covers the container image).

## 4. Next Lane D actions

1. ~~Locate the connected-dev Terraform source~~ — **done**, see §3.
   ~~Tier 2 decision on how `integration/refinity-dev` relates to the handoff
   line~~ — **decided and executed 2026-09-13**: reconciled by path (§3,
   "Reconciled onto the handoff line"); the branch itself stays unmerged and
   unprotected, Daniel's build trigger still deploys from it.
2. Verify Cloud Logging / Monitoring coverage, the one required item not
   evidenced by the state (equally absent from the config — only
   `roles/logging.logWriter` for the build SA).
3. Then, as a Tier 2 PR: remove `create_sa_key`, its output, the
   `google_service_account_key.app` resource and the `GCP_SERVICE_ACCOUNT_KEY`
   branch in `store.ts` together. `firestoreSettings()` now refuses that branch
   under `native-cloud-run`; the removal is still pending.
4. Reconcile or retire `infra/terraform/environments/*` so there is one
   connected configuration rather than two competing ones —
   `infra/terraform/connected-dev/` is now the one that matches live state.
5. Founder/Daniel: run `bash infra/cloudrun/connected-dev.sh plan` from the
   reconciled tree and confirm an empty plan (modulo the documented
   `template.revision` churn).

No `terraform apply` has been run, and none will be without Tier 2 review.
