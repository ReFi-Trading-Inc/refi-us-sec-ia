# Secrets management

Status: IMPLEMENTED (evidence cited)

No secret value appears in this document. Variables are referenced by name.

## 1. Where secrets live

| Location                                      | Used for                                                                                                                                                                     | State                                                                                               |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Google Secret Manager (connected GCP project) | `SESSION_JWT_SECRET`, `IP_HASH_SECRET`, Stytch project id/secret, `BRIDGE_ASSERTION_*` / `BFF_ASSERTION_*` JWKs (or KMS references) — `founder-activation-actions.md` item 8 | Module exists (`infra/terraform/modules/secret-manager/`); project not created                      |
| Cloud KMS (connected GCP project)             | `assertion`, `identity-bridge` signing keys (non-exportable)                                                                                                                 | Code path exists; keys not provisioned                                                              |
| Vercel project environment (sensitive-marked) | Session/eligibility/IP-hash secrets, service-account key JSON for Firestore where used, handoff verification key, demo handoff private key                                   | In use for the Vercel projects (`infra/cloudrun/README.md` documents the sensitive-value behaviour) |
| Cloud Run env with `secret_key_ref`           | Same names, injected from Secret Manager                                                                                                                                     | Terraform module (`modules/cloud-run-service/main.tf`); demo deploy currently passes an env file    |
| Developer `.env.local`                        | Locally generated values only                                                                                                                                                | gitignored                                                                                          |

Secret Manager access is per secret, granted to the runtime service account
only (`roles/secretmanager.secretAccessor`, `modules/secret-manager/main.tf`).
The migration plan §8 separates true secrets from public configuration
(issuers, audiences, public JWKs stay plain env vars).

## 2. How code reads secrets

- Single entry point: `apps/web/src/lib/config/env.ts`. `serverEnv` is
  imported only from server components, route handlers, and middleware;
  `clientEnv` carries only `NEXT_PUBLIC_*` values.
- `NEXT_PUBLIC_*` never carries a secret: those values are inlined into the
  browser bundle at build time (`apps/web/.env.example` "Public (exposed to
  browser)" section). The list today: API base URL, WalletConnect project id,
  PostHog key, Sentry DSN, `NEXT_PUBLIC_REFI_ENV`.
- Server-only secrets require ≥32 characters; production applies no defaults
  and fails boot on any missing or placeholder value (DP-02). Security
  decisions gate on server-only `REFI_ENV` (AC-02).
- Connected-deployment invariants (`env.ts`): KMS or secret-store signer only
  (no ephemeral key), durable store, live adapter, no mock KYC controls,
  distinct bridge and assertion keys, distinct Google audiences.
- Tokens and credentials are not logged (`data-handling-standard.md` §3).

## 3. Rotation (current reality)

- Manual. Runbook §1 lists the rotation levers and their effect
  (`SESSION_JWT_SECRET` invalidates all sessions; `ALPHA_HANDOFF_PUBLIC_KEY_JWK`
  rejects in-flight handoff tokens; etc.). Procedure: set the new value in
  Secret Manager / Vercel, redeploy, disable the old version.
- Signing-key rotation has a written procedure with a required JWKS overlap
  of at least ten minutes (`docs/security/RUNBOOK-bff-assertion-signing-key.md`
  §4; KMS variant in §2a).
- No scheduled rotation cadence is enforced by tooling. Policy: rotate on
  personnel change, on suspected exposure (immediately), and at least
  annually; record each rotation in the PR or ticket by variable name.

## 4. Leak prevention

- gitleaks v8.30.1 runs over the tracked tree as a blocking step of the
  `Security scans` check on every push and PR (`.github/workflows/ci.yml`).
- Local pre-commit runs `lint-staged` (formatting) — gitleaks is **not** in
  the hook; developers may run `gitleaks git --pre-commit --staged` manually.
  Stating this plainly: the enforced secret scan is in CI, not pre-commit.
- `.gitignore` excludes all `.env*` files except `.env.example`, and the
  prototype-store directories.
- `apps/web/.env.example` ships placeholders only; the schema rejects them in
  production.
- Vercel sensitive variables are write-only after creation; `vercel env pull`
  returns empty strings for them (`infra/cloudrun/README.md`).

## 5. Socure keys — planned placement (none provisioned)

| Name                              | Class                         | Planned location                              | Notes                                                                                                                                                                 |
| --------------------------------- | ----------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SOCURE_API_KEY`                  | RESTRICTED, server-only       | Secret Manager (connected) / Vercel sensitive | Read via `serverEnv` only; used by the BFF for server-side Socure API calls; never in a `NEXT_PUBLIC_` name                                                           |
| `NEXT_PUBLIC_SOCURE_SDK_KEY`      | Public SDK key (not a secret) | Plain env / build arg                         | Intended for the browser SDK ("Build Your Own UI"); must be a key Socure designates as public/client-side; restrict by domain in the Socure dashboard where supported |
| Webhook signing secret (name TBD) | RESTRICTED, server-only       | Secret Manager / Vercel sensitive             | For verifying Socure callbacks, if used                                                                                                                               |

Neither variable exists in `env.ts` or `.env.example` at `57a336d`. Adding
them will also require revising the provider-neutrality contract assertion
noted in `README.md`. No Socure credential has been issued to ReFi.
