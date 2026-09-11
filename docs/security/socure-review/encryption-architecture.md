# Encryption architecture

Status: IMPLEMENTED (evidence cited)

Questionnaire answers: encryption in transit **YES**; encryption at rest
**YES for every production-class store**, with the demo/prototype exception
in §4 stated explicitly.

## 1. In transit

- All public endpoints are served over HTTPS with provider-managed TLS
  certificates: Vercel for `refi.trading` / `bff-dev.refi.trading`
  (`gcp-bff-migration-plan.md` §1) and Cloud Run for `demo-web`
  (`infra/cloudrun/`). No plaintext HTTP listener exists in the application;
  the container listens on port 3000 behind the platform's TLS terminator.
- HSTS (2 years, preload), nonce CSP, `X-Frame-Options: DENY`, `nosniff`,
  Referrer-Policy, and Permissions-Policy are set on every response by
  `apps/web/proxy.ts` (SH-01; CSP leg asserted in CI).
- Cookies are `httpOnly`, `secure`, `sameSite=lax`
  (`apps/web/app/api/us/eligibility/route.ts`).
- Service-to-service: the BFF authenticates to Daniel's services with a
  Google-issued ID token bound to a custom audience and identifies the user
  with an ES256 assertion (IB-12, DP-04). Upstream JWKS URLs are pinned
  configuration, never derived from tokens.
- Future Socure calls are server-side HTTPS from the BFF with the API key in
  a header; the browser talks only to Socure's SDK endpoints with the public
  SDK key (`threat-model.md`).

## 2. At rest (provider-managed)

| Store                                       | Encryption                                                                          | ReFi evidence                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Cloud Firestore (durable / connected store) | Google default encryption at rest (provider fact)                                   | `infra/terraform/main.tf`; delete protection + PITR enabled                         |
| Google Secret Manager                       | Google default encryption at rest (provider fact)                                   | `infra/terraform/modules/secret-manager/main.tf`                                    |
| Artifact Registry (container images)        | Google default encryption at rest (provider fact)                                   | `infra/terraform/modules/artifact-registry/`; `infra/cloudrun/cloudbuild.demo.yaml` |
| Cloud Logging                               | Google default encryption at rest (provider fact)                                   | migration plan §14                                                                  |
| Vercel environment variables                | Encrypted at rest by Vercel; sensitive-marked values are write-only (provider fact) | `infra/cloudrun/README.md` (sensitive values cannot be read back)                   |
| GitHub repository                           | Provider-encrypted at rest (provider fact); holds INTERNAL data only                | gitleaks gate                                                                       |

No customer-managed encryption keys (CMEK) are configured; Google-managed keys
are used. Say "Google-managed encryption" rather than "CMEK" on questionnaires.

## 3. Key custody (signing keys)

- Two ES256 (P-256) signing keys are designed as Cloud KMS asymmetric keys:
  `assertion` (BFF → Investor API user assertion) and `identity-bridge`
  (frontend → identity-ccid bridge assertion). Key versions are non-exportable
  `EC_SIGN_P256_SHA256`; the private key never leaves KMS; the runtime service
  account holds `roles/cloudkms.signerVerifier` on those keys only
  (`docs/security/RUNBOOK-bff-assertion-signing-key.md` §2a;
  `founder-activation-actions.md` items 6, 9, 10). Sharing any material
  between the two keys fails boot (`apps/web/.env.example`, identity-bridge
  section).
- The KMS signer code path exists (`BFF_ASSERTION_SIGNER=kms`,
  `BRIDGE_ASSERTION_SIGNER=kms`; contract assertions "assertion-signer(kms):
  private key never leaves the client", DP-04). **The KMS keys are not
  provisioned** — the connected GCP project has not been created.
- Pre-KMS tiers use a private JWK held in Secret Manager / Vercel sensitive
  env; the ephemeral per-process key is allowed only for single-process local
  or CI runs and is refused on connected deployments.
- Only public key material is published (`/.well-known/jwks.json`,
  `/.well-known/identity-bridge-jwks.json`; DP-04 "JWKS publishes public
  material only").
- Symmetric secrets (`SESSION_JWT_SECRET`, `SESSION_SECRET`,
  `ELIGIBILITY_JWT_SECRET`, `IP_HASH_SECRET`) are ≥32 characters, server-only,
  and are the rotation levers in the runbook §1.

## 4. Where "encrypted at rest: YES" is NOT supportable today

**Prototype filesystem store** (`apps/web/src/lib/prototype-store/store.ts`).

- What it is: JSON files, one per key, written to
  `apps/web/.refi-prototype-store/` locally or, on Vercel, to the OS temp
  directory (`/tmp/refi-prototype-store`, per-instance, ephemeral). On the
  Cloud Run demo it is the container's local disk. It is documented as "NOT a
  compliance system of record" (`docs/bff-prototype-state-contract.md`).
- What it holds on demo tiers: the mock KYC session state
  (`apps/web/src/lib/kyc/mock-provider.ts` imports the prototype store),
  Investor Profile v2, receipts and other walkthrough state
  (`infra/cloudrun/README.md`).
- Why it is out of scope for the "at rest" claim: ReFi does not control or
  attest the encryption of a serverless function's temp directory or a Cloud
  Run container's ephemeral disk. Treat it as unencrypted for questionnaire
  purposes.
- Why it is acceptable: it is demo / local / CI only, holds synthetic persona
  data, and is structurally excluded from connected deployments —
  `apps/web/src/lib/config/env.ts` fails boot on a connected deployment unless
  `REFI_CONNECTED_STORE_BACKING=durable`, with the message "no
  process-memory or /tmp security state", and `REFI_KYC_MOCK_CONTROLS` must
  be `0` there. The connected store refuses any namespace naming demo, mock,
  prototype, or simulator (`apps/web/src/lib/connected-store/index.ts`).
- Residual: whether the Vercel production project (`refi-us-sec-ia-web`) has
  its alpha-funnel entities switched to `REFI_BACKING__*=durable` is a
  deployment setting not recorded in the repository; the threat model
  (§2.4, #27) still lists "ephemeral books-and-records" as open. Verify the
  Vercel production setting before answering for that tier.

**Local developer machines.** `.env.local` and prototype-store directories
live on laptops; at-rest protection there is FileVault per
`endpoint-security-baseline.md`, which is not yet verified.

## 5. No plaintext production secrets in source

- `.gitignore` ignores `.env`, `.env.local`, `.env.*.local`, and `.env*`
  (last-match rule re-allowing only `.env.example`).
- `apps/web/.env.example` contains placeholders and names only.
- `apps/web/src/lib/config/env.ts` (zod) rejects the built-in
  `prototype-only-*` placeholder secrets when `NEXT_PUBLIC_REFI_ENV=prod`,
  requires ≥32-character secrets, and keeps `serverEnv` off the client
  (`typeof window` guard; DP-02).
- gitleaks runs as a blocking CI job on every push and PR.
