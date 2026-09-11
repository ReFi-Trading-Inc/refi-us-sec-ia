# Socure Sandbox — Phase 1 infrastructure evidence (2026-09-11)

Authorization: founder decision 2026-09-11 (`APPLY=1` for Sandbox infrastructure only, after #118 merged).
Executed from `main` at `5e945e2` (#118 merge `31c0b9b`, #122 merge `5e945e2`). Operator account: founder's
`@refi.trading` identity via `gcloud auth login` in-session.

## What exists

| Resource             | Value                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project              | `refi-socure-sandbox` (number `692706086295`), billing `01CE03-B43A3D-C1942A` (ReFi-Trading Primary)                                                                      |
| APIs                 | run, artifactregistry, firestore, secretmanager, iam, logging, cloudbuild                                                                                                 |
| Artifact Registry    | `us-central1/refi` (docker)                                                                                                                                               |
| Firestore            | `(default)`, FIRESTORE_NATIVE, `nam5`                                                                                                                                     |
| Runtime SA           | `socure-sandbox-runtime@…` — `roles/datastore.user`, `roles/logging.logWriter`                                                                                            |
| Build SA             | `socure-sandbox-build@…` — see identity table below (narrowed 2026-09-11)                                                                                                 |
| Secrets (Socure)     | `socure-api-key-sandbox` **0 versions**, `socure-webhook-bearer-sandbox` **0 versions**                                                                                   |
| Secrets (ReFi-owned) | `sandbox-session-secret`, `sandbox-ip-hash-secret`, `sandbox-eligibility-jwt-secret`, `sandbox-session-jwt-secret` — 1 generated version each, accessor = runtime SA only |
| Cloud Build          | build `7244734e-e63d-4618-bfd7-351454d8730d`, SUCCESS, 3m18s                                                                                                              |
| Image                | `us-central1-docker.pkg.dev/refi-socure-sandbox/refi/refi-socure-sandbox:5e945e2`                                                                                         |
| Cloud Run            | `refi-socure-sandbox`, us-central1, minScale 0 / maxScale 2, runtime SA, Ready=True                                                                                       |
| URL                  | `https://refi-socure-sandbox-692706086295.us-central1.run.app`                                                                                                            |
| Invoker              | `allUsers` (webhook must be publicly reachable; every route still authenticates)                                                                                          |
| Project IAM (humans) | `roles/owner` = founder only                                                                                                                                              |

## Live revision configuration (provider dark)

`REFI_ENV=staging`, `NEXT_PUBLIC_REFI_ENV=staging`, `REFI_KYC_PROVIDER=unconfigured`, `REFI_KYC_MOCK_CONTROLS=0`,
`SOCURE_ENV=sandbox`, `SOCURE_API_BASE_URL=https://riskos.sandbox.socure.com`,
`SOCURE_WEBHOOK_ENFORCE_SENDER_IP=0`, `REFI_BACKING__KYC_EVALUATION=durable`,
`REFI_BACKING__KYC_WEBHOOK_EVENT=durable`. **No** `SOCURE_API_KEY`, `SOCURE_WEBHOOK_BEARER_TOKEN`,
`SOCURE_WORKFLOW_NAME` or `NEXT_PUBLIC_SOCURE_SDK_KEY` on the revision.

## Probes (Cloud Logging confirms each request)

| Request                                      | Status | Meaning                            |
| -------------------------------------------- | ------ | ---------------------------------- |
| `GET /`                                      | 200    | service serves                     |
| `POST /api/webhooks/kyc/provider` (Bearer x) | 404    | provider unconfigured → route dark |
| `GET /api/webhooks/kyc/provider`             | 405    | method gate                        |
| `GET /api/v1/investor/kyc/step-up`           | 401    | session auth first                 |
| `GET /investor/kyc`                          | 404    | no KYC page without a provider     |

## Identities and exact IAM scope

| Identity                                | Role                                 | Scope                                   | Purpose                                                                                                   |
| --------------------------------------- | ------------------------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `socure-sandbox-runtime@…` (runtime SA) | `roles/datastore.user`               | project                                 | KYC persistence incl. Firestore transactions                                                              |
| `socure-sandbox-runtime@…`              | `roles/logging.logWriter`            | project                                 | application logs                                                                                          |
| `socure-sandbox-runtime@…`              | `roles/secretmanager.secretAccessor` | per secret, all six sandbox secrets     | read secrets at deploy/runtime                                                                            |
| `socure-sandbox-build@…` (build SA)     | `roles/logging.logWriter`            | project                                 | build logs                                                                                                |
| `socure-sandbox-build@…`                | `roles/artifactregistry.writer`      | repository `us-central1/refi`           | push image                                                                                                |
| `socure-sandbox-build@…`                | `roles/storage.objectViewer`         | bucket `refi-socure-sandbox_cloudbuild` | read staged source                                                                                        |
| founder (`@refi.trading`)               | `roles/owner`                        | project                                 | human deployment identity; runs `gcloud builds submit` (actAs build SA) and `gcloud run services replace` |

Original build-SA role at first apply: `roles/cloudbuild.builds.builder` (project). Removed 2026-09-11 and
replaced with the three rows above; build `8095016e-8a80-4298-8467-fdf7ab4b668c` (image tag `b9cb8bd`) succeeded
under the narrowed roles at first attempt, so no further permission was required. The build SA holds no Cloud
Run, Secret Manager, Firestore, IAM or project-wide editor authority. Build and runtime identities are separate.

## Deviations from the dry-run plan

1. Artifact Registry create failed once with `IAM_PERMISSION_DENIED` immediately after API enablement; retried
   after ~60 s and succeeded (propagation).
2. `roles/logging.logWriter` binding hit a concurrent-policy conflict; retried and verified.
3. Cloud Build could not read its own source bucket with the default compute identity (new-project default).
   Added dedicated `socure-sandbox-build` SA, initially with `roles/cloudbuild.builds.builder`, then narrowed per founder review (identity table above). Script and README reproduce the narrowed identity (this PR).

## Not done (per directive)

No Socure API key, SDK key, workflow name or webhook Bearer token installed; no webhook registered; no Socure
API request made; no real PII; no Stytch, Daniel remote, Alpaca or LIVE trading configuration.
Next step is founder-only Phase 2: RiskOS API key + `uuidgen` Bearer as Secret Manager versions, then a
`REFI_KYC_PROVIDER=socure` redeploy and webhook registration.
