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

## KYC/CIP model — decided 2026-09-10: Alpaca-owned brokerage KYC/CIP

**Initial Alpha KYC model: Alpaca-owned brokerage KYC/CIP.** The founder
selected Option 1 (see `decision-kyc-model.md`). ReFi does not integrate
Persona, Socure, Veriff, Alloy or any other separate identity-verification
provider for the initial Alpha; no vendor SDK, secret or environment variable
is to be added. The frontend mock adapter remains a non-evidence development
control only. Historical note: until 2026-09-10 this section recorded a
separate provider decision as an unresolved founder blocker; that blocker is
removed. What replaces it is a **Daniel binding** (how Alpaca account/KYC
status reaches the BFF — see `daniel-dependency-packet.md`) and an **Alpaca
PAPER onboarding path** proven through Daniel's integration. Nothing here
requires founder action beyond confirming the decision with counsel.

## Daniel — before remote traffic

Step 4 / B1 bound addendum (service URLs, both audiences, JWKS URL and kid,
ready revisions, admitted SA binding, acceptance conditions) referencing the
alpha.3 digest. Only then may `REFI_INVESTOR_API_ALLOW_REMOTE=1` be reviewed.
