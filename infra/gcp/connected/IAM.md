# ReFi US Connected Investor Platform — IAM and resource inventory

Project: `refi-us-connected-investor` (founder decision 2026-09-09). Program
phase: **US Investor Integration Foundation**. This project is the security
and runtime boundary for the connected US investor application. It is not
the demo project (`refi-game-prod`) and it is not a future live-capital
boundary.

**Status:** prepared, **not provisioned**. `provision-us-connected-investor.sh`
is idempotent and must be run by the founder (`gcloud auth login`; Claude's
session cannot run project-creating or IAM-mutating `gcloud` commands, and the
CLI's cached credential has expired). Nothing below exists until it is run.

## Runtime identity

| Principal                                                             | Purpose                                                                                                  |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `refi-bff-runtime@refi-us-connected-investor.iam.gserviceaccount.com` | The Cloud Run BFF's own identity. Its Google ID token (custom audiences) is what Daniel binds in step 4. |

No key file is ever created for it. No human account and no CI deployer
identity is used as the runtime identity.

## Roles granted to the runtime service account, and why

| Role                                 | Scope                                  | Why                                                                                            |
| ------------------------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `roles/cloudkms.signerVerifier`      | key `refi-bff/investor-assertion` only | Sign per-request BFF→investor-api assertions; read its public key for the JWKS                 |
| `roles/cloudkms.signerVerifier`      | key `refi-bff/identity-bridge` only    | Sign the closed upstream identity assertion; read its public key for the bridge JWKS           |
| `roles/datastore.user`               | project                                | Read/write Firestore documents for connected security state (sessions, logins, jtis, subjects) |
| `roles/secretmanager.secretAccessor` | each named secret individually         | Read Stytch and cookie-signing secrets at runtime; no listing, no project-wide access          |
| `roles/logging.logWriter`            | project                                | Structured logs from the runtime (redaction rules apply)                                       |
| `roles/monitoring.metricWriter`      | project                                | Runtime metrics                                                                                |

Deliberately **not** granted: any `cloudkms.admin`/`cryptoKeyEncrypterDecrypter`,
`datastore.owner`, `secretmanager.admin`, `run.admin`, `iam.serviceAccountUser`
on other accounts, any Alpaca or broker-write capability (the BFF never
holds broker credentials), any role in `refinity-*` or `refi-game-prod`.

## Key separation (mandate §15)

| Key                           | Signs                                                                                            | `kid` (planned)        | JWKS                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------- | ---------------------------------------------------- |
| `refi-bff/investor-assertion` | per-request Investor assertion (`iss urn:refinity:bff:dev`, `aud urn:refinity:investor-api:dev`) | `bff-kms-2026-09-1`    | `https://bff-dev.refi.trading/.well-known/jwks.json` |
| `refi-bff/identity-bridge`    | upstream identity assertion consumed by identity-ccid                                            | `bridge-kms-2026-09-1` | bridge JWKS path (identity-bridge slice)             |

Different key, different `kid`, different JWKS, different issuer relationship,
separate rotation record. Both non-exportable, HSM protection level,
`EC_SIGN_P256_SHA256`.

## Resources created by the script

Cloud APIs (run, cloudbuild, artifactregistry, cloudkms, secretmanager,
firestore, iam, iamcredentials, logging, monitoring); runtime service
account; Firestore native database `(default)` in `nam5`; KMS key ring
`refi-bff` with the two keys above; Artifact Registry `refi` (docker);
Secret Manager placeholders `stytch-project-id`, `stytch-secret`,
`session-jwt-secret`, `session-secret`, `eligibility-jwt-secret`,
`ip-hash-secret` (empty — values added by the founder).

## Not created (later slices or other owners)

Cloud Run service `bff-dev` (needs the image and the connected env);
domain mapping `bff-dev.refi.trading` (needs refi.trading verified);
Stytch project (vendor console); Daniel's step-4 bindings.

## Connected env (for the future Cloud Run service; values, not secrets)

```
REFI_ENV=staging                         NEXT_PUBLIC_REFI_ENV=staging (build arg)
REFI_INVESTOR_API_MODE=client            REFI_INVESTOR_API_CREDENTIAL_MODE=native-cloud-run
REFI_INVESTOR_API_ASSERTION_MODE=mint    BFF_ASSERTION_ALLOW_EPHEMERAL_KEY=0
BFF_ASSERTION_SIGNER=kms                 BFF_ASSERTION_KMS_KEY_VERSION=projects/refi-us-connected-investor/locations/us-central1/keyRings/refi-bff/cryptoKeys/investor-assertion/cryptoKeyVersions/1
BFF_ASSERTION_KID=bff-kms-2026-09-1      BFF_ASSERTION_ISSUER=urn:refinity:bff:dev
INVESTOR_API_AUDIENCE=urn:refinity:investor-api:dev
REFI_IDENTITY_CCID_GOOGLE_AUDIENCE=https://identity-ccid.dev.refi.internal
REFI_INVESTOR_API_GOOGLE_AUDIENCE=https://investor-api.dev.refi.internal
REFI_IDENTITY_CCID_BASE_URL=https://identity-ccid-74kl57biwa-uw.a.run.app
REFI_INVESTOR_API_BASE_URL=https://investor-api-74kl57biwa-uw.a.run.app
REFI_INVESTOR_API_ALLOW_REMOTE=0         (stays 0 until Daniel's step 4)
REFI_CONNECTED_STORE_BACKING=durable     REFI_CONNECTED_STORE_NAMESPACE=us-connected-dev
GCP_PROJECT_ID=refi-us-connected-investor
REFI_KYC_MOCK_CONTROLS=0                 REFI_DATA_ADAPTER=live
REFI_TRUST_PROXY_HOST=1                  REFI_RELEASE_STAGE=automated_alpha
```

Audience note (mandate §17): Daniel's document uses
`https://identity-ccid.dev.refi.internal`; the mandate text says
`https://identity.dev.refi.internal`. The code defaults to Daniel's value and
is overridable per tier. Reverify with Daniel before deployment; do not
substitute a service URL.
