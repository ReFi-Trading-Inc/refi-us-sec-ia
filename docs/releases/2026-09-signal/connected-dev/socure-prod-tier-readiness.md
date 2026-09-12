# Track A — Production app tier readiness for `refi-socure-prod`

Status 2026-09-12: the Production Socure environment is provisioned dark on the **staging** app tier. The `prod` tier (`NEXT_PUBLIC_REFI_ENV=prod` at build, `REFI_ENV=prod` at runtime) removes every prototype default, so each value below must exist before the prod-tier revision can boot. Nothing here enables Socure traffic; `REFI_KYC_PROVIDER` stays `unconfigured` until the activation directive.

## Values the prod tier requires

| Key                                                                                | Kind                         | Owner / source                | Where it lives                                                         | Status                                                                                                             |
| ---------------------------------------------------------------------------------- | ---------------------------- | ----------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_REFI_ENV=prod`                                                        | build constant               | ReFi                          | Cloud Build substitution                                               | ready (manifest + cloudbuild below)                                                                                |
| `REFI_ENV=prod`                                                                    | runtime                      | ReFi                          | manifest                                                               | ready                                                                                                              |
| `NEXT_PUBLIC_API_BASE_URL`                                                         | build constant (https URL)   | ReFi                          | deterministic Cloud Run URL or custom domain                           | ready (`https://refi-socure-prod-252145723256.us-central1.run.app`; custom domain later)                           |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`                                             | build constant, public       | founder (WalletConnect Cloud) | Cloud Build substitution                                               | **needed**                                                                                                         |
| `NEXT_PUBLIC_POSTHOG_KEY`                                                          | build constant, public       | founder (PostHog project)     | Cloud Build substitution                                               | **needed**                                                                                                         |
| `NEXT_PUBLIC_SENTRY_DSN`                                                           | build constant, public       | founder (Sentry project)      | Cloud Build substitution                                               | **needed**                                                                                                         |
| `SESSION_SECRET`, `IP_HASH_SECRET`, `ELIGIBILITY_JWT_SECRET`, `SESSION_JWT_SECRET` | secrets                      | generated                     | Secret Manager `prod-*`                                                | ready (generated at apply)                                                                                         |
| `REFI_DATA_ADAPTER=live`                                                           | runtime                      | ReFi                          | manifest                                                               | ready                                                                                                              |
| `ALPHA_HANDOFF_PUBLIC_KEY_JWK`                                                     | non-secret public key (JSON) | game side / founder           | Secret Manager `prod-alpha-handoff-public-jwk` (public, but versioned) | **needed** (a real P-256 public JWK; the claim route stays `FLAG_ALPHA_CLAIM_ROUTE=off` until the handoff is live) |
| `ALPHA_HANDOFF_ISSUER`, `ALPHA_HANDOFF_AUDIENCE`                                   | runtime                      | ReFi + game                   | manifest                                                               | proposed `refi-alpha` / `refi-us-sec-ia` (confirm)                                                                 |
| `BFF_ASSERTION_ISSUER`, `INVESTOR_API_AUDIENCE`                                    | runtime                      | Dan (D-017)                   | manifest                                                               | optional until connected mode; proposed `urn:refinity:bff:prod` / `urn:refinity:investor-api:prod`                 |
| `REFI_RELEASE_STAGE`                                                               | runtime                      | ReFi                          | manifest                                                               | proposed `signal` (confirm)                                                                                        |
| `REFI_AUTH_PROVIDER`                                                               | runtime                      | ReFi                          | manifest                                                               | `unconfigured` (Stytch production not authorized)                                                                  |
| `REFI_INVESTOR_API_MODE=client`, `REFI_INVESTOR_API_ALLOW_REMOTE=0`                | runtime                      | ReFi                          | manifest                                                               | ready (Daniel remote not authorized)                                                                               |
| `GCP_PROJECT_ID=refi-socure-prod`, `REFI_BACKING__KYC_*=durable`                   | runtime                      | ReFi                          | manifest                                                               | ready                                                                                                              |
| `NEXT_PUBLIC_SOCURE_SDK_KEY`                                                       | build constant, public       | Socure Production dashboard   | Cloud Build substitution                                               | activation directive only                                                                                          |
| `SOCURE_*`                                                                         | runtime + secrets            | Socure Production             | Secret Manager `socure-*-prod` (0 versions)                            | activation directive only                                                                                          |

Connected-mode checks (`REFI_INVESTOR_API_CREDENTIAL_MODE=native-cloud-run`, persistent BFF signing key, connected store namespace) do not apply while the service is not a connected deployment; they become Dan's dependency when the investor API is wired.

## Deliverables in this PR

- `infra/gcp/socure-prod/service.prod-tier.yaml`: the prod-tier manifest (dark), with the three founder-supplied public constants and the handoff JWK read from Secret Manager.
- `infra/gcp/socure-prod/cloudbuild.prod-tier.yaml`: builds with `NEXT_PUBLIC_REFI_ENV=prod` and the public constants as substitutions.
- `infra/gcp/socure-prod/provision-prod-tier-secrets.sh`: creates the additional secret containers (`prod-alpha-handoff-public-jwk`, `prod-bff-assertion-private-jwk`) with no versions.

## Exit gate

`refi-socure-prod` serves a prod-tier revision (`REFI_ENV=prod`) with provider unconfigured: `/` 200, `/api/health` 200, webhook 404, investor routes 401, anonymous-route sweep unchanged. Then the only remaining Production step is the Socure activation directive.

## Founder inputs (clipboard path for anything sensitive; the three public constants may be pasted in chat)

1. WalletConnect project id, PostHog key, Sentry DSN.
2. Alpha handoff public JWK (public key JSON) → `! pbpaste | gcloud secrets versions add prod-alpha-handoff-public-jwk --data-file=- --project refi-socure-prod`
3. Confirm issuer/audience/release-stage values above.
