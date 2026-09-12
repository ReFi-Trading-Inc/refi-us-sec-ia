# Socure PRODUCTION environment — provisioned DARK

Mirror of `infra/gcp/socure-sandbox/` (same least-privilege layout, same two-phase model) for the Socure **Production** RiskOS environment. Differences: project `refi-socure-prod`, service `refi-socure-prod`, `SOCURE_ENV=production`, `SOCURE_API_BASE_URL=https://riskos.socure.com`, secrets `socure-api-key-prod` / `socure-webhook-bearer-prod` (containers only, **0 versions**), ReFi secrets `prod-*` generated at apply. Provider stays `unconfigured`: no Production credentials, no webhook, no traffic. The app tier remains `staging` until the `prod` tier inputs exist (see `service.yaml` header). Production traffic requires a separate founder directive after Sandbox certification (B/C).

---

# Socure Sandbox acceptance environment — design (PREPARATION ONLY, nothing provisioned)

Founder decision 2026-09-11: Sandbox acceptance runs on a dedicated Cloud Run staging service with durable Firestore backing — never the per-instance prototype store, never a local machine, never the full connected investor environment (#98). Everything in this directory is a proposal for founder approval; the script is dry-run by default.

## Boundary

| Item             | Proposal                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GCP project      | **`refi-socure-prod`** — new, dedicated, billing-attached, no other workload. Isolated from `refi-game-prod` (demo + mint-handoff), from the Vercel production shell, and from `refi-us-connected-investor` (#98, unprovisioned). Alternative if the founder prefers fewer projects: the existing `refi-trading-staging` project from `infra/terraform`, **only** if it holds no customer state (not verified). |
| Region           | `us-central1` (matches the demo pattern)                                                                                                                                                                                                                                                                                                                                                                        |
| Service          | Cloud Run **`refi-socure-prod`**, the standard web image (same Dockerfile; `NEXT_PUBLIC_REFI_ENV=staging` at build), HTTPS-only managed URL `https://refi-socure-prod-<hash>-uc.a.run.app` (optional custom domain `socure-prod.refi.trading` later)                                                                                                                                                            |
| Runtime identity | dedicated SA **`socure-prod-runtime@refi-socure-prod.iam.gserviceaccount.com`**; workload identity via the metadata server (Application Default Credentials); no downloaded keys; `GCP_SERVICE_ACCOUNT_KEY` unset                                                                                                                                                                                               |
| Scale            | `min-instances=0`, `max-instances=2`, concurrency 80, 1 vCPU / 1 GiB, timeout 60 s. Two instances on purpose: correctness must come from Firestore, not from single-instance semantics                                                                                                                                                                                                                          |
| Ingress          | all (the webhook must be reachable by Socure); every route other than the webhook is session-authenticated or dark by tier — nothing else becomes public because of it                                                                                                                                                                                                                                          |
| Data             | Firestore native mode, database `(default)`, location `nam5`; collections used by the existing durable driver: `kyc-evaluations`, `kyc-evaluation-index`, `kyc-webhook-events` (+ any other entity later switched to `durable`)                                                                                                                                                                                 |

## Two phases

**Phase 1 — infrastructure (APPLY=1 authorized 2026-09-11):** project, APIs, Artifact Registry, Firestore, runtime SA, IAM, Socure secret containers with NO versions, ReFi-owned secrets with generated versions, image build, service deployed **dark** (`REFI_KYC_PROVIDER=unconfigured`, no Socure secret references) — the KYC page reports "not available" and the webhook route answers 404. No placeholder value can satisfy the Socure configuration validation because none exists.

**Phase 2 — credentials (separate founder step, outside chat):** real Secret Manager versions for `socure-api-key-prod` and `socure-webhook-bearer-prod` (a UUIDv4 per RiskOS webhook configuration), then redeploy with `REFI_KYC_PROVIDER=socure`, the two secret references, `SOCURE_WORKFLOW_NAME` and `NEXT_PUBLIC_SOCURE_SDK_KEY`; register the webhook; run acceptance.

## Environment (values in `env.prod.example`; secrets only in Secret Manager)

Tier: `REFI_ENV=staging`, `NEXT_PUBLIC_REFI_ENV=staging`, `REFI_DATA_ADAPTER=live`, `REFI_TRUST_PROXY_HOST=1`, `REFI_AUTH_PROVIDER=unconfigured` (no Stytch), `REFI_INVESTOR_API_MODE=client` with **no** Investor API base URLs (routes that need the backend answer "upstream not configured"; the KYC evaluation, step-up and webhook routes do not need it), `REFI_INVESTOR_API_ALLOW_REMOTE=0`, `FLAG_ALPHA_CLAIM_ROUTE=off`.
KYC (dark until activation): `REFI_KYC_PROVIDER=unconfigured`, `REFI_KYC_MOCK_CONTROLS=0`, `SOCURE_ENV=production`, `SOCURE_API_BASE_URL=https://riskos.socure.com`, `SOCURE_WORKFLOW_NAME=<from dashboard>`, `SOCURE_WEBHOOK_ENFORCE_SENDER_IP=1` (enabled 2026-09-12 after #139: behind Cloud Run the sender is the edge-appended last `X-Forwarded-For` entry; forged headers verified refused), `NEXT_PUBLIC_SOCURE_SDK_KEY=<public>`.
Durability: `REFI_BACKING__KYC_EVALUATION=durable`, `REFI_BACKING__KYC_WEBHOOK_EVENT=durable`, `GCP_PROJECT_ID=refi-socure-prod`. Optional for cleaner audit: `REFI_BACKING__ATTESTATION_SUBMISSION=durable`.
Secrets (Secret Manager → env at deploy): `SOCURE_API_KEY`, `SOCURE_WEBHOOK_BEARER_TOKEN`, `SESSION_SECRET`, `IP_HASH_SECRET`, `ELIGIBILITY_JWT_SECRET`, `SESSION_JWT_SECRET` (all generated fresh for this environment; never copied from production). Non-secret but required by the schema: `ALPHA_HANDOFF_PUBLIC_KEY_JWK` (a throwaway public key; the claim route stays flag-dark), `ALPHA_HANDOFF_ISSUER`, `ALPHA_HANDOFF_AUDIENCE`.

## IAM (least privilege; no owner/editor; no broker or economic scope)

| Principal                | Role                                                                                     | Scope                                                                                        | Why                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `socure-prod-build` SA   | `roles/logging.logWriter`                                                                | project                                                                                      | build logs (CLOUD_LOGGING_ONLY)                                                                 |
| `socure-prod-build` SA   | `roles/artifactregistry.writer`                                                          | repository `us-central1/refi` only                                                           | push the image                                                                                  |
| `socure-prod-build` SA   | `roles/storage.objectViewer`                                                             | bucket `refi-socure-prod_cloudbuild` only                                                    | read the staged source tarball                                                                  |
| human operator (founder) | `roles/owner`                                                                            | project                                                                                      | explicit deploy step (`gcloud run services replace`); no service account holds deploy authority |
| `socure-prod-runtime` SA | `roles/datastore.user`                                                                   | project (Firestore has no per-collection IAM; the project contains only this service's data) | read/write the KYC collections incl. transactions                                               |
| `socure-prod-runtime` SA | `roles/secretmanager.secretAccessor`                                                     | **per secret** (resource-level binding on each of the six secrets)                           | read secrets at deploy/runtime                                                                  |
| `socure-prod-runtime` SA | `roles/logging.logWriter`                                                                | project                                                                                      | Cloud Logging                                                                                   |
| Cloud Run service        | `roles/run.invoker` → `allUsers`                                                         | service                                                                                      | public HTTPS ingress for the webhook and the UI; application auth is session/Bearer             |
| Founder (human)          | `roles/run.admin`, `roles/iam.serviceAccountUser` on the SA, `roles/secretmanager.admin` | project                                                                                      | deploy and rotate; MFA on the account                                                           |

No Alpaca, no Investor API, no KMS, no Pub/Sub, no storage buckets.

## Logging

Cloud Run request logs record method, path, status, latency and client IP — never headers or bodies, so the Bearer credential and payloads are not logged by the platform. The application emits no console logging on the KYC/webhook paths (asserted in CI). Retained by the app in Firestore only: ReFi request id, `eval_id`, `event_id`, coarse states, timestamps, provider error kinds. Log-based redaction search terms for the acceptance packet are in `docs/security/socure-review/socure-acceptance-matrix.md`.

## Footprint (estimate)

Persistent: 1 project, 1 Firestore database (tens of documents during acceptance; well inside the free tier), 6 secrets (≈ $0.06/version/month each), 1 Artifact Registry repo (one image ≈ 0.5 GB), 1 Cloud Run service scaling to zero (compute cost only during acceptance runs; pennies), 1 service account. No load balancer, no custom domain required.
Removable after acceptance: the Cloud Run service, the image, the Firestore documents (delete the three collections), the Socure secrets. Reusable for the Connected Identity Alpha: the deployment pattern (`service.yaml`, provisioning script, secret naming), the runtime-SA IAM shape, the Firestore-backed KYC collections design; the project itself stays a Socure-only boundary (the connected environment remains `refi-us-connected-investor` via #98).

## What this does NOT change

No product code. The store abstraction already supports these entities durably (`REFI_BACKING__<ENTITY>=durable` → Firestore driver with transactional `putIfAbsent` and the same collection names). Not yet durable-capable (prototype-only, per-instance on Cloud Run): `action-receipts` (audit receipts) and `auth-session-links` (account link). The KYC evaluation, step-up and webhook routes need neither for correctness; receipts would be per-instance during acceptance. If the founder wants receipts durable for the packet, registering `action-receipts` in the backing matrix is a one-line product change to request separately — not done here.

## Phase 1 applied — 2026-09-11

Evidence: `docs/security/socure-review/sandbox-phase1-evidence-2026-09-11.md`. Service URL
`https://refi-socure-prod-692706086295.us-central1.run.app`, image tag `5e945e2`, provider dark. Socure secret
containers exist with **0 versions**. Phase 2 has NOT been started.
