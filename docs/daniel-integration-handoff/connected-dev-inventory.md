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

## 3. Certification finding — infrastructure is not reproducible from this repo

**The Terraform source for the 27 applied resources is not in this
repository.** Verified:

- not in the working tree (`grep` for `runtime_probe` / `deploy_status` /
  `refinity-dev-frontend` across all `*.tf` → no hits);
- not on any remote branch (`git grep` across every `origin/*` ref → no hits);
- not in any sibling working copy under `.../ReFi/Website/`.

So live infrastructure — including the KMS keys that sign identity assertions —
is **applied but not source-controlled here**. The state is real Terraform
(serial 6), so this is not dashboard drift; the configuration simply lives
somewhere this repository cannot see.

**This is a platform-certification blocker.** Infrastructure that cannot be
reproduced from source control cannot be certified, reviewed for drift, or
safely changed.

**`BLOCKED — SOURCE LOCATION REQUIRED`.** Needed: the repository/path holding
the `connected-dev` Terraform configuration whose state is
`gs://refinity-dev-frontend-tfstate/connected-dev/default.tfstate`. Once
located, Lane D's task is to bring it under this repository's IaC (or
authoritatively reference it) — **not** to author a parallel configuration,
which would produce duplicate keys and conflicting state.

### What `infra/terraform/` is, in light of this

`infra/terraform/` (Firestore + optional SA key) and
`infra/terraform/environments/{dev,staging,prod}` are a **separate, never-applied**
configuration, with no backend and no state. `environments/dev` defaults to
`us-central1` with `REFI_DATA_ADAPTER = "mock"` and inline plaintext dev
secrets. It is **not** the connected Dev environment and must not be applied
against `refinity-dev` in its current form.

---

## 4. Next Lane D actions

1. **Locate the connected-dev Terraform source** (blocker above).
2. Verify Cloud Logging / Monitoring coverage, the one required item not
   evidenced by the state.
3. Then, as a Tier 2 PR: remove `create_sa_key`, its output, the
   `google_service_account_key.app` resource and the `GCP_SERVICE_ACCOUNT_KEY`
   branch in `store.ts` together.
4. Reconcile or retire `infra/terraform/environments/*` so there is one
   connected configuration rather than two competing ones.

No `terraform apply` has been run, and none will be without Tier 2 review.
