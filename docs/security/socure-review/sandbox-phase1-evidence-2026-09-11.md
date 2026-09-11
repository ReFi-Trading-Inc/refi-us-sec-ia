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
| Build SA             | `socure-sandbox-build@…` — `roles/cloudbuild.builds.builder` (added during apply; see deviations)                                                                         |
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

## Deviations from the dry-run plan

1. Artifact Registry create failed once with `IAM_PERMISSION_DENIED` immediately after API enablement; retried
   after ~60 s and succeeded (propagation).
2. `roles/logging.logWriter` binding hit a concurrent-policy conflict; retried and verified.
3. Cloud Build could not read its own source bucket with the default compute identity (new-project default).
   Added dedicated `socure-sandbox-build` SA with `roles/cloudbuild.builds.builder` and passed
   `--service-account`. Script and README updated to match (this PR).

## Not done (per directive)

No Socure API key, SDK key, workflow name or webhook Bearer token installed; no webhook registered; no Socure
API request made; no real PII; no Stytch, Daniel remote, Alpaca or LIVE trading configuration.
Next step is founder-only Phase 2: RiskOS API key + `uuidgen` Bearer as Secret Manager versions, then a
`REFI_KYC_PROVIDER=socure` redeploy and webhook registration.
