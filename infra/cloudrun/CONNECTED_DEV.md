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
  per source commit plus build ID for CI retries; deployments pin the digest.
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

`REFI_ENV=staging` is the frontend's fail-closed security tier (no developer
login fallback), not a move to a staging GCP project. The Google environment
remains `refinity-dev`; the public data adapter is live, not MSW/demo.

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

## Automatic branch deployment

Cloud Build connection `refi-frontend-github` is authorized for
`ReFi-Trading-Inc/refi-us-sec-ia`; its OAuth secret stays in Secret Manager,
outside Terraform state. Temporary setup Secret Manager Admin was removed after
authorization completed. The GitHub App is not a personal SSH key and does not
change main protection or existing GitHub Actions.

Terraform defines trigger `refi-frontend-integration` in `us-west1`, matching
**only `^integration/refinity-dev$` pushes**, using
[`cloudbuild.connected-cicd.yaml`](cloudbuild.connected-cicd.yaml). Documentation
and Terraform-only changes do not trigger application builds. Terraform changes
still require an operator-reviewed plan/apply. There is no new main/PR trigger.

Each code push runs release-script unit tests, generated-client build, focused
durable-store checks, contract assertions, investor boundary checks, and the
Next.js production build/typecheck. It pushes an immutable SHA/build-ID image,
then [`connected-release.py`](connected-release.py):

1. Acquires a generation-guarded lock in `gs://refinity-dev-frontend-releases`.
   Newer deployment-attempt timestamps prevent an older build rolling back a
   newer one. Builds can run concurrently; only deployment is serialized.
2. Creates a digest-pinned `candidate` revision with **no serving traffic**.
   Verifies health, distinct public JWKS and anonymous session/dashboard refusal.
3. Updates only the isolated probe Job and verifies real native identity,
   KMS and named-Firestore write/atomicity plus separate-execution persistence.
4. Promotes the verified revision, checks the normal service URL and records
   source/build/digest/revision/previous traffic in `current.json` and a versioned
   per-build receipt. Failed promotion checks restore previous serving traffic.

The builder can update only the existing frontend service/probe Job, act as the
frontend runtime, and write its images/logs/release receipts. It has no Terraform
state/IAM administration, backend deployment, broker-secret or game/demo access.
Deploying code **does** confer the frontend runtime's capabilities: treat write
access to this integration branch as Dev deployment authority. These hosting
checks do not certify real user login, KYC, admission or trading acceptance.

Operational commands:

```bash
# Inspect runs (ordinary pushes start them automatically).
gcloud builds list --project refinity-dev --region us-west1 --limit=10
# Retry current integration HEAD after an infrastructure/transient failure.
gcloud builds triggers run refi-frontend-integration \
  --branch=integration/refinity-dev --project refinity-dev --region us-west1
# Actual verified release, not the historical bootstrap image:
gcloud storage cat gs://refinity-dev-frontend-releases/current.json
```

Rollback: pause the trigger, wait for/cancel active deployments, then use the
recorded `previous_traffic` revision(s) with `gcloud run services update-traffic
refi-frontend-integration --to-revisions=REVISION=100 --project refinity-dev
--region us-west1`. Verify health and both JWKS before resuming. Revert the bad
source on this branch before re-enabling automation. **Do not change
`release.tfvars` expecting a rollback**: it is now only a bootstrap reference;
Terraform ignores image/traffic fields owned by CI. Never delete databases,
secrets or keys to roll back.

Cancellation can leave `deployment-lock.json`. Inspect its owning build ID and
confirm that build has stopped before removing exactly that object using its
generation precondition. Never break a live lock or erase the watermark/release
history; retry a new build afterward. Candidate/probe failures leave normal
service traffic on the prior release; the probe Job may retain the candidate
image and is updated again by the next release.

## Infrastructure operations and historical bootstrap

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
6. First service bootstrap only: put the successful digest in `release.tfvars`
   as `image = "...@sha256:..."`, then repeat plan/review/apply. For this existing
   deployment, image/traffic updates are now CI-owned: use the branch pipeline
   above, not this historical bootstrap procedure.
7. Check `/api/health`, both public JWKS routes and refusal of unauthenticated
   account/demo/login routes. Run `bash infra/cloudrun/connected-dev.sh check`:
   separate Job executions prove persisted state, atomic create, denial against
   the default database, both actual KMS signers and separate Google audiences.
   Only isolated probe documents are written; no user or trading data is touched.

Public JWKS must remain compatible with active key bindings across any rollback.
Only infrastructure configuration is applied by Terraform after bootstrap.

## Explicitly pending before user-connected acceptance

The initial hosting configuration is **not an admitted Alpha release**:

- Stytch/Socure are `unconfigured`, not mock. Frontend-owned provider credentials
  and approved redirects are still required; no KYC/provider behavior changed.
  Register the isolated Stytch callback exactly as
  `https://refi-frontend-integration-182665799543.us-west1.run.app/us/auth/callback`.
  The owner subsequently authorized a narrowly scoped development KYC-pass source;
  [roadmap step 2](../../docs/integration-roadmap.md#2-fi-003d--implement-the-development-only-kyc-acceptance-source)
  specifies its boundaries. It is not implemented/enabled yet, does not simulate
  Stytch login, and does not certify real KYC or permit broad mock controls.
- `REFI_INVESTOR_API_ALLOW_REMOTE=0` remains until the actual runtime identity,
  bridge issuer/audience/JWKS, redirects and Investor assertion JWKS are explicitly
  bound through backend ATD-046. No broad IAM or frontend admission is granted.
- Security sessions, acknowledgment continuations and attestation retry state
  use the new durable database. This does not migrate or certify frontend-owned
  KYC/profile stores; their owner must complete those paths before acceptance.
- FI-002..007 contract/adapter and admission work is still open. Hosting does not
  claim login, profile, brokerage, subscription, or trade lifecycle acceptance.
- Automatic deployment is defined above; its live validation is recorded below.
  It is separate from the remaining application/backend integration work.

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
tokens. The final packaged checks below supersede the probe failures and close
this bounded hosting verification. Local typechecks, all contract
assertions, investor-boundary checks, focused settings tests and Terraform
validation pass. These are hosting proofs, not real login/KYC or broker evidence.

Final hosted image and verification (September 11, 2026, about 23:05 UTC):

- Source: `6e5f1be41e1c2445dfa87153c70c5bac7734452b`.
- Cloud Build: `28a8cfe8-857b-4e1d-87aa-a8ba627f5af6`, SUCCESS.
- Digest: `sha256:62359b2e009361ea1763da141fe7b2e3c1d61c15c307ea3d23a8f52c16e62500`.
- Ready revision: `refi-frontend-integration-00002-44h`, 100% traffic.
- Write/atomicity execution: `refi-frontend-runtime-check-vctzn`, PASS.
- Independent persisted-read execution: `refi-frontend-runtime-check-qkqsk`, PASS.
  Both use the packaged probe, actual runtime identity, real named database,
  actual KMS signatures and Google metadata tokens. The default-database denial
  uses its correct Datastore API, not a Firestore-mode mismatch as false proof.
- Final HTTP checks: root/health and both JWKS 200; session/dashboard 401 without
  authentication; demo 404. Initial same-config login POST was 404/unconfigured.
- Terraform refresh/plan: **no changes**, including explicit service-level
  scale-to-zero defaults. No broader IAM or trading-gate changes.
- GitHub reported no Vercel deployments for this integration commit. Both
  project-root variants carry the exact branch-only exclusion.

`release.tfvars` pins this historical bootstrap image. Later documentation/scaling-declaration
commits do not imply a different application image. FI-001's branch/base is
established and FI-008's isolated hosting portion is proved; FI-008's backend
binding and FI-009 user-connected acceptance remain open.

References: [named Firestore databases and scoped IAM](https://docs.cloud.google.com/firestore/native/docs/manage-databases),
[Cloud Run HTTPS addresses](https://docs.cloud.google.com/run/docs/triggering/https-request),
[dedicated Cloud Build identities](https://docs.cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts).

## CI/CD verification — September 11–12, 2026

- GitHub App installation `161007339`; connection `refi-frontend-github` COMPLETE.
  Its authorization secret grants accessor only to Google's Cloud Build service
  agent. The temporary project-level Secret Manager Admin binding was removed.
- Trigger `a5480318-871a-4cfd-b0ca-d49ccc64bad2` is enabled, exact integration
  branch only. Actual pushes create the GitHub check
  `refi-frontend-integration (refinity-dev)`, linked to the Google build result.
- First end-to-end success: source `e02f302b4e28938e8651862a1f0a6197c30292db`,
  build `c210472e-5382-4165-b8af-88bb484006dc`, GitHub check SUCCESS.
  Probe executions `refi-frontend-runtime-check-4hrg6` (write/atomicity) and
  `refi-frontend-runtime-check-f47nh` (independent read) both succeeded.
  Candidate HTTP checks passed at zero traffic, then promotion and normal-origin
  checks passed. Previous revision `refi-frontend-integration-00002-44h` remains
  available for rollback.
- Final source `639a9a2888f92f768beebb23980ba7d0a7cc9e3f`, automatic build
  `c236414c-00ad-44c9-926a-fbf667ed1a63`: SUCCESS. Verified serving revision
  `refi-frontend-integration-00005-lut`, digest
  `sha256:0b74a785854506fb89cb0ebadb48a779db787acc5cd045c184f2623ebf17d549`.
  Both packaged runtime executions (`refi-frontend-runtime-check-mmg8d` write,
  `refi-frontend-runtime-check-mfwpv` read) succeeded. Candidate and promoted
  origin checks passed, and the versioned current-release receipt was written.
- Seven release-control unit tests pass, including no promotion after candidate
  failure, rollback after failed public verification, stale-build refusal and
  owned-generation lock cleanup. They also pass inside the actual Google CLI
  image. Candidate failure/rollback scenarios are unit-level fault injection;
  successful deployment, native runtime checks and HTTP boundaries are real.
- Deployment-identity permission checks confirm frontend/probe update and job
  execution permissions, with **no `run.services.update` on `investor-api`**.
- Build-context correction: Git is installed only in the builder and a local
  source index supports existing contract checks. The Dockerfile-specific ignore
  excludes checkout metadata, local secrets/state and generated build caches.
- The deployment CLI image is digest-pinned. Its bundled Python uses Google's
  packaged CA bundle via `SSL_CERT_FILE`; real HTTPS was verified locally with
  certificate validation enabled. Initial build-environment failures stopped
  before any service change; the successful run above supersedes them.

CI owns only image/traffic releases and CLI client metadata. Cloud Run generates
revision names; Terraform retains runtime configuration ownership and does not
ignore environment, identity, secrets, scaling or networking changes. Actual
current source/image/revision is always the versioned `current.json` receipt,
cross-checked with the service's serving traffic, not the bootstrap tfvars.

Post-release Terraform review: **no image, traffic, IAM or runtime-configuration
drift**. Google CLI still records the generated `template.revision` name, so
Terraform proposes clearing that one field to its unset configuration. This is
not a rollback request; no apply was performed just to normalize that metadata.
Do not hide the entire template or ignore its revision field: doing so can pin an
immutable old revision when a real runtime setting changes. Review this known
one-field normalization alongside the next actual infrastructure change. Such a
change must be verified and promoted explicitly; image CI does not auto-apply
Terraform configuration.
