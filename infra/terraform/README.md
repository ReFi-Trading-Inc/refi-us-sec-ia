# Durable store infra (Cloud Firestore)

Provisions the Firestore database + app service account + least-privilege IAM
that back the BFF's durable store.

> **Deployment authority.** The connected US product runs on **Google Cloud**,
> deployed by Terraform to the shared `refinity-dev` environment
> (`us-west1`), with `refinity-stg` / `refinity-prod` to follow. Vercel is
> **not** production infrastructure — at most an optional PR preview.
>
> Credentials come from **service identity**: Workload Identity for CI, and
> the attached service account via ADC on Cloud Run. **Never** a downloaded,
> long-lived service-account key. Earlier revisions of this file documented
> exporting a key JSON into Vercel; that guidance is withdrawn.

## What it creates

- `firestore.googleapis.com` enabled
- A Firestore Native database (US location `nam5` by default; delete-protection
  and point-in-time-recovery on for books-and-records retention)
- A service account with `roles/datastore.user` (read/write documents only)
- Optionally (`create_sa_key = true`) a service-account key for hosts without
  workload identity

## Usage

```bash
cd infra/terraform
terraform init
terraform plan  -var project_id=<your-gcp-project>
terraform apply -var project_id=<your-gcp-project>
```

> The tools aren't installed in the dev container used to author this; run
> `terraform fmt` and `terraform validate` in an environment that has Terraform
> before applying.

## Wiring the app to the durable store

### Cloud Run — the deployment path

1. `terraform apply -var project_id=<p>` (leave `create_sa_key = false`).
2. Deploy Cloud Run with `--service-account=<service_account_email output>`.
3. Set `GCP_PROJECT_ID` + the `REFI_BACKING__*=durable` vars. Credentials come
   from the metadata server via ADC — **no key handling**.

The BFF then persists alpha signups + the single-use jti guard in Firestore,
durable across cold starts and instances, with atomic replay protection.

### `create_sa_key` — deprecated

`create_sa_key` mints a long-lived key and writes the private key **into
Terraform state**. It is off by default and should stay off. It exists only for
a host with no workload identity; the connected environment has one, so there
is no supported reason to enable it. Do not use it to wire Vercel.

## Local / CI testing (Firestore emulator)

```bash
gcloud emulators firestore start --host-port=localhost:8080   # needs gcloud + Java
export FIRESTORE_EMULATOR_HOST=localhost:8080 GCP_PROJECT_ID=demo-refi
pnpm contract-test    # runs the emulator-gated durable driver assertions
```

Without `FIRESTORE_EMULATOR_HOST` the durable assertions self-skip; the rest of
the contract suite runs against the prototype store.

## Rollback

Set the `REFI_BACKING__*` vars back to `prototype` (or unset) and redeploy —
the app returns to the filesystem store with no infra change.
