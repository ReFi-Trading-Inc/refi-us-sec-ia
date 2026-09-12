# Production configuration classification — `refi-socure-prod` (Track A correction, 2026-09-12)

Rule (founder 2026-09-12): a disabled capability never requires its configuration; an enabled capability fails closed without its real configuration; no dummy values, ever. Implemented as `REFI_RUNTIME_PROFILE` (`full` | `socure_kyc`) in `apps/web/src/lib/config/env.ts`. `REFI_RELEASE_STAGE` is untouched: release stage and runtime capability are different concepts.

| Setting | Class | `socure_kyc` profile | `full` profile in prod |
| --- | --- | --- | --- |
| `REFI_ENV`, `NEXT_PUBLIC_REFI_ENV` | SOCURE_KYC_REQUIRED | required | required |
| `NEXT_PUBLIC_API_BASE_URL` | SOCURE_KYC_REQUIRED | required (https) | required |
| `SESSION_SECRET`, `IP_HASH_SECRET`, `ELIGIBILITY_JWT_SECRET`, `SESSION_JWT_SECRET` | SOCURE_KYC_REQUIRED (session boundary for the KYC surface) | required, Secret Manager | required |
| `REFI_DATA_ADAPTER=live` | SOCURE_KYC_REQUIRED | required (`live`) | required |
| `GCP_PROJECT_ID`, `REFI_BACKING__KYC_EVALUATION=durable`, `REFI_BACKING__KYC_WEBHOOK_EVENT=durable` | SOCURE_KYC_REQUIRED (Firestore KYC state) | required | required when KYC enabled |
| `REFI_KYC_PROVIDER` (`unconfigured` dark / `socure` active), `REFI_KYC_MOCK_CONTROLS=0` | SOCURE_KYC_REQUIRED | required; `mock` refused | `mock` refused on connected |
| `SOCURE_ENV`, `SOCURE_API_BASE_URL` | SOCURE_KYC_REQUIRED | required (production host pinned) | same |
| `SOCURE_API_KEY`, `SOCURE_WORKFLOW_NAME`, `SOCURE_WEBHOOK_BEARER_TOKEN`, `NEXT_PUBLIC_SOCURE_SDK_KEY` | SOCURE_KYC_REQUIRED **only when provider=socure** | activation directive only | same |
| `SOCURE_WEBHOOK_ENFORCE_SENDER_IP`, `REFI_TRUST_PROXY_HOST` | SOCURE_KYC_REQUIRED (edge hardening) | required | same |
| `REFI_AUTH_PROVIDER=unconfigured` | SOCURE_KYC_REQUIRED (synthetic/authorized session boundary; Stytch refused in this profile) | `unconfigured` | connected: Stytch |
| `NEXT_PUBLIC_SENTRY_DSN` | OBSERVABILITY_OPTIONAL | optional; if set, scrubbing rules apply (see below) | required |
| `NEXT_PUBLIC_POSTHOG_KEY` | ANALYTICS_OPTIONAL | not set: analytics disabled on Restricted-data screens | required |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | UNRELATED_TO_THIS_RUNTIME | not required, not set | required |
| `ALPHA_HANDOFF_PUBLIC_KEY_JWK`, `ALPHA_HANDOFF_ISSUER`, `ALPHA_HANDOFF_AUDIENCE`, `FLAG_ALPHA_CLAIM_ROUTE` | UNRELATED_TO_THIS_RUNTIME (game handoff) | not required; claim route must be `off` | required; claim route fails closed without them |
| `BFF_ASSERTION_ISSUER`, `INVESTOR_API_AUDIENCE`, `BFF_ASSERTION_*`, `REFI_INVESTOR_API_BASE_URL`, `REFI_IDENTITY_CCID_BASE_URL`, `REFI_INVESTOR_API_CREDENTIAL_MODE`, `REFI_CONNECTED_STORE_*` | CONNECTED_INVESTOR_REQUIRED (Daniel) | not required; `REFI_INVESTOR_API_ALLOW_REMOTE=0` | required on a connected deployment |
| `STYTCH_*` | CONNECTED_INVESTOR_REQUIRED | refused | required when `REFI_AUTH_PROVIDER=stytch` |
| `REFI_RELEASE_STAGE` | release policy (not a capability) | default `signal` | as configured |
| `DEMO_HANDOFF_PRIVATE_KEY_JWK`, demo routes | UNRELATED_TO_THIS_RUNTIME | never set; demo tier refused | demo tier only |

## Sentry, if ever enabled on this runtime
`sendDefaultPii=false`; drop request bodies, headers and query strings in `beforeSend`; never the Socure API key, the webhook token, raw KYC PII or the DocV token. Not enabled for the dark baseline.

## What changed in the manifests
`service.prod-tier.yaml` and `cloudbuild.prod-tier.yaml` set `REFI_RUNTIME_PROFILE=socure_kyc` and no longer carry WalletConnect, PostHog, Sentry or alpha-handoff values. `provision-prod-tier-secrets.sh` no longer creates handoff/BFF containers (they belong to the connected-investor runtime). Sender-IP enforcement is `0` in the production manifests until the genuine Sandbox delivery proof passes (founder §14); the sandbox manifest keeps `1`.
