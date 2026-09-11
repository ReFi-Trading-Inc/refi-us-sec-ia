# Connected Dev hosting — integration branch

This is the deployment path for `integration/refinity-dev`, created from frontend
`main` at `b3e7a1abd412fa4712ad68d7b76782241b1d6955`. Only this GitHub frontend
repository belongs in the build context. Backend source/state remains in GitLab.
See [the shared working agreement](../../docs/integration-collaboration.md).

## Targets and boundaries

- Google project/region: `refinity-dev/us-west1` only.
- App + BFF: `refi-frontend-integration`, one unchanged Next.js application.
- Isolated origin: `https://refi-frontend-integration-182665799543.us-west1.run.app`.
- Runtime: `refi-frontend-runtime@refinity-dev.iam.gserviceaccount.com`.
- Cloud Build builder: `refi-frontend-build@refinity-dev.iam.gserviceaccount.com`.
- Images: `us-west1-docker.pkg.dev/refinity-dev/refi-frontend/web`, immutable tags
  per full source commit; deployments pin the resulting digest.
- Firestore: named **native** database `refi-frontend-integration`; never convert
  or use the project's existing Datastore-mode `(default)` database. An IAM
  condition limits runtime access to the new database.
- Independent KMS ring `refi-frontend`, distinct P-256 `investor-assertion` and
  `identity-bridge` keys. No exported signing or service-account private keys.
- Four fresh session/HMAC secrets, with exact Secret Manager version references.
- Terraform: only `infra/terraform/connected-dev`, independent remote state in
  `gs://refinity-dev-frontend-tfstate/connected-dev`. Never apply the older root
  `infra/terraform` configuration or backend Terraform for this deployment.
- Cloud Run scales to zero, at most three instances. One unscheduled runtime
  probe Job verifies the same image/identity without any broker calls.

Application hosting, builds, images, durable state, secrets, signing and logs are
Google-hosted. GitHub remains source control. Stytch and Socure remain the selected
external providers; moving hosting does not replace their integrations.
Root and `apps/web/vercel.json` disable automatic Vercel deployment **only** for
`integration/refinity-dev` (covering either configured project root). Unspecified
branches retain Vercel's default enabled behavior; no wildcard disable is used.
No existing Vercel project targets, game/demo service, domains, backend services, trading
gates or production/staging environments are modified. The selected final JWKS
URL `https://bff-dev.refi.trading/.well-known/jwks.json` is unchanged; this run.app
address is isolated preparation, not a DNS cutover or silently substituted trust.

## Reproducible deployment

Use an authenticated operator (`gcloud auth login`), Terraform and the current
frontend branch. No downloaded service-account key or persistent access token.

1. Initial bootstrap only: the private versioned state bucket must already exist.
   `bash infra/cloudrun/connected-dev.sh init`
2. `bash infra/cloudrun/connected-dev.sh plan`. Inspect `deployment.tfplan` with
   `terraform -chdir=infra/terraform/connected-dev show deployment.tfplan`.
   First bootstrap has no image/service. Later plans consume `release.tfvars`;
   do not remove that file or apply a null-image plan to an existing service.
3. `bash infra/cloudrun/connected-dev.sh apply` applies only the inspected plan.
4. First bootstrap only: `bash infra/cloudrun/connected-dev.sh initialize-secrets`.
   Generates directly into the four newly created secrets; never prints values
   or rotates existing versions. Values do not enter Terraform state/source.
5. Commit reviewed source, then `bash infra/cloudrun/connected-dev.sh build`.
   The script submits Cloud Build asynchronously. Inspect the returned build ID
   with `gcloud builds describe ID --project refinity-dev --region us-west1`.
   Do not deploy a failed build. The image includes the public origin at build
   time; no server secrets are provided to the build.
6. Record the successful build's full image digest in
   `infra/terraform/connected-dev/release.tfvars` as `image = "...@sha256:..."`.
   Record source/build/revision evidence here, then repeat plan/review/apply.
7. Check `/api/health`, both public JWKS routes and refusal of unauthenticated
   account/demo/login routes. Run `bash infra/cloudrun/connected-dev.sh check`:
   separate Job executions prove persisted state, atomic create, denial against
   the default database, both actual KMS signers and separate Google audiences.
   Only isolated probe documents are written; no user or trading data is touched.

Rollback: put the previously verified digest in `release.tfvars`, inspect the
plan and apply. Do not delete Firestore/secrets/keys. Public JWKS must remain
compatible with the active key bindings across any rollback.

## Explicitly pending before user-connected acceptance

The initial hosting configuration is **not an admitted Alpha release**:

- Stytch/Socure are `unconfigured`, not mock. Frontend-owned provider credentials
  and approved redirects are still required; no KYC/provider behavior changed.
  Register the isolated Stytch callback exactly as
  `https://refi-frontend-integration-182665799543.us-west1.run.app/us/auth/callback`.
- `REFI_INVESTOR_API_ALLOW_REMOTE=0` remains until the actual runtime identity,
  bridge issuer/audience/JWKS, redirects and Investor assertion JWKS are explicitly
  bound through backend ATD-046. No broad IAM or frontend admission is granted.
- Security sessions, acknowledgment continuations and attestation retry state
  use the new durable database. This does not migrate or certify frontend-owned
  KYC/profile stores; their owner must complete those paths before acceptance.
- FI-002..007 contract/adapter and admission work is still open. Hosting does not
  claim login, profile, brokerage, subscription, or trade lifecycle acceptance.
- Builds/deployments are operator-invoked from the integration branch for now.
  No push trigger has been attached to main or Zeshan's branches. A Google-hosted
  GitHub build trigger needs the approved Cloud Build GitHub App connection;
  keep GitHub credentials out of Terraform and build substitutions.
  The September 11 connection attempt could not start OAuth: Cloud Build's
  service agent lacks `secretmanager.secrets.create`/`setIamPolicy` for storing
  its GitHub authorization. No connection or trigger was created and no
  project-wide secret administration was granted. Configure scoped authorization
  storage/app installation before adding a trigger for exactly
  `^integration/refinity-dev$`; manual Cloud Build already works.

## Verification record

September 11, 2026: 27 isolated Terraform resources plus the private state bucket
created; zero existing backend resources changed/destroyed. The default database
is unchanged. Runtime Google subject is `104683840377279941448`.

Initial build `2597b0ef-6475-41c7-8804-950e574c1bc6` from `dc688a5` succeeded.
Initial web revision `refi-frontend-integration-00001-9pk` serves the root/health
and both JWKS with HTTP 200; Investor session/dashboard refuse anonymous callers
with 401; demo and unconfigured login POST return 404. Separate public `kid`s:
`refi-dev-investor-20260911-1` and `refi-dev-bridge-20260911-1`.

The initial standalone probe import failed because Next.js bundles dependencies.
The corrected built-in-Node/Google-REST probe passed as an execution override in
`refi-frontend-runtime-check-mhkkj`: atomic named-database create, default
Datastore API denial, actual KMS signatures and both audience-bound Google
tokens. Packaging/re-execution of that correction is in progress; only the final
image checks below close hosting verification. Local typechecks, all contract
assertions, investor-boundary checks, focused settings tests and Terraform
validation pass. These are hosting proofs, not real login/KYC or broker evidence.

References: [named Firestore databases and scoped IAM](https://docs.cloud.google.com/firestore/native/docs/manage-databases),
[Cloud Run HTTPS addresses](https://docs.cloud.google.com/run/docs/triggering/https-request),
[dedicated Cloud Build identities](https://docs.cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts).
