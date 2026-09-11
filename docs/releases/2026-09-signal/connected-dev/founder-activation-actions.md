# Founder external-activation actions (not started; separate approval required)

Code merge and external activation are separate decisions. Nothing below has
been executed. Phase remains **US Investor Integration Foundation**.

## GCP — project `refi-us-connected-investor`

1. Create the project and attach billing.
2. Enable APIs: Cloud Run, Artifact Registry, Firestore, Secret Manager, Cloud KMS, IAM, Cloud Build (if used), Cloud Logging.
3. Artifact Registry repository for the BFF image.
4. Cloud Run service (stateless, multi-instance) for the connected BFF; note the service name and region for Appendix A.
5. Runtime service account for the BFF; record its email and numeric uniqueId (string) for Appendix A / Daniel's admission.
6. Least-privilege IAM: Firestore user, Secret Manager accessor, KMS signer/verifier on the two keys only; no key files.
7. Firestore database (native mode) for the connected store (`REFI_CONNECTED_STORE_BACKING=durable`, namespace per env).
8. Secret Manager secrets: `SESSION_JWT_SECRET`, `IP_HASH_SECRET`, Stytch project id/secret, `BRIDGE_ASSERTION_*` and `BFF_ASSERTION_*` values (or KMS references).
9. KMS key ring; key `assertion` (Investor API user assertion, EC P-256 sign) — `BFF_ASSERTION_SIGNER=kms`.
10. KMS key `identity-bridge` (separate key, EC P-256 sign) — `BRIDGE_ASSERTION_SIGNER=kms`; record both `kid`s for the JWKS routes.
    (`infra/gcp/connected/provision-us-connected-investor.sh` on #98 documents these steps; it is not executed by any merge.)

## Stytch (Consumer Authentication, headless)

1. Create the project (test environment first).
2. Register the exact HTTPS redirect URI: `https://<bff host>/us/auth/callback` (must equal `REFI_AUTH_CALLBACK_URL`).
3. Enable email magic links and email OTP; sender/branding configuration.
4. Place project id and secret in Secret Manager; set `REFI_AUTH_PROVIDER=stytch`, `STYTCH_ENV`.
5. Provide `upstream_identity_provider_id`, issuer (`BRIDGE_ASSERTION_ISSUER`), audience (`IDENTITY_CCID_UPSTREAM_AUDIENCE`), bridge JWKS URL (`/.well-known/identity-bridge-jwks.json`) for Appendix A.

## KYC — decided 2026-09-10: ReFi-owned KYC via Socure (supersedes the Alpaca-owned note)

**KYC provider: Socure · Integration: Build Your Own UI · Workflow: KYC + Fraud + Watchlist > DocV Step Up · Scope: US Alpha.**
Implementation is complete against fixtures (PRs B–E); live acceptance is
blocked on the Socure account. Founder actions (in order):

1. Socure Launch sandbox account (support@socure.com); select the Direct API + SDK path for the KYC + Fraud + Watchlist > DocV Step-Up solution (the path is locked per solution).
2. Record the **sandbox API key** in Secret Manager → `SOCURE_API_KEY`; `SOCURE_API_BASE_URL=https://riskos.sandbox.socure.com`; `SOCURE_ENV=sandbox`; `SOCURE_WORKFLOW_NAME=<workflow>`; `REFI_KYC_PROVIDER=socure` (all-or-nothing; boot fails otherwise).
3. **SDK key** → `NEXT_PUBLIC_SOCURE_SDK_KEY` (public by design; enables the CSP allowance for `websdk.socure.com`); install `@socure-inc/device-risk-sdk` and initialise it (activation code slice).
4. Register the webhook `https://<bff host>/api/webhooks/kyc/provider` in Developer Workbench > Webhooks with a Bearer credential (founder decision: Bearer only); mirror it into `SOCURE_WEBHOOK_BEARER_TOKEN`; subscribe to `evaluation_completed` (and `evaluation_paused`, `workflow_execution_failed` for audit); decide whether to enforce the documented sender-IP allowlist (`SOCURE_WEBHOOK_ENFORCE_SENDER_IP=1`).
5. Sandbox acceptance runs (synthetic test data only): ACCEPT, REJECT, REVIEW → DocV → webhook ACCEPT/REJECT, duplicate webhook, 429; record results as evidence.
6. Production keys only after the security questionnaire and a separate activation approval; `SOCURE_ENV=production` requires the production host and `SOCURE_WEBHOOK_BEARER_TOKEN`.

Historical note: earlier on 2026-09-10 this section recorded an Alpaca-owned
KYC/CIP model; that decision is superseded (`decision-kyc-model.md` banner).

## Daniel — before remote traffic

Step 4 / B1 bound addendum (service URLs, both audiences, JWKS URL and kid,
ready revisions, admitted SA binding, acceptance conditions) referencing the
alpha.3 digest. Only then may `REFI_INVESTOR_API_ALLOW_REMOTE=1` be reviewed.
