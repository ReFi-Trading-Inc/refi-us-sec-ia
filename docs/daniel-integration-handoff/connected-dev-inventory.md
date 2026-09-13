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
asked. Per the directive, work stops here: importing, moving, merging or
reconciling the branch is **Tier 2** and awaits founder review.

## 4. Next Lane D actions

1. ~~Locate the connected-dev Terraform source~~ — **done**, see §3. Next is a
   Tier 2 decision on how `integration/refinity-dev` relates to `main` and to
   `daniel-handoff/integration`: it is 15 commits ahead with no open PR, so the
   connected configuration currently lives only on an unmerged branch.
2. Verify Cloud Logging / Monitoring coverage, the one required item not
   evidenced by the state.
3. Then, as a Tier 2 PR: remove `create_sa_key`, its output, the
   `google_service_account_key.app` resource and the `GCP_SERVICE_ACCOUNT_KEY`
   branch in `store.ts` together.
4. Reconcile or retire `infra/terraform/environments/*` so there is one
   connected configuration rather than two competing ones.

No `terraform apply` has been run, and none will be without Tier 2 review.
