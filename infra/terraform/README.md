# Durable store infra (Cloud Firestore)

Provisions the Firestore database + app service account + least-privilege IAM
that back the BFF's durable store. Portable HCL — runs on GCP now (the eventual
home) and keeps the app host-agnostic (Vercel today via a key, Cloud Run later
via workload identity).

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

### Vercel (current host — no workload identity)

1. `terraform apply -var project_id=<p> -var create_sa_key=true`
2. `terraform output -raw gcp_service_account_key_json` → paste into the Vercel
   **Production** env var `GCP_SERVICE_ACCOUNT_KEY` (mark as sensitive).
3. Set `GCP_PROJECT_ID=<p>`.
4. Flip the entities to durable:
   `REFI_BACKING__ALPHA_APPLICATION=durable`,
   `REFI_BACKING__ALPHA_HANDOFF_JTI=durable`.
5. Redeploy. The BFF now persists alpha signups + the single-use jti guard in
   Firestore (durable across cold starts/instances; atomic replay protection).

### Cloud Run (eventual host — preferred, no key)

1. `terraform apply -var project_id=<p>` (leave `create_sa_key=false`).
2. Deploy Cloud Run with `--service-account=<service_account_email output>`.
3. Set `GCP_PROJECT_ID` + the `REFI_BACKING__*=durable` vars. Credentials come
   from the metadata server via ADC — no key handling.

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
