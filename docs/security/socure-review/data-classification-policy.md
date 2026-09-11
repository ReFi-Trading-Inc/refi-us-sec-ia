# Data classification policy

Status: POLICY ADOPTED, ORGANIZATIONAL ACTION PENDING

Owner: Zeshan. Adopted: 2026-09-10. Pending action: every person with
repository, cloud, or vendor-dashboard access acknowledges this policy
(recorded in `security-training-record-template.md`).

## 1. Classes

| Class            | Definition                                                                                          | Examples                                                                                                                                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **PUBLIC**       | Intended for anyone.                                                                                | Marketing site copy under `apps/web/app/us/_content/`, published JWKS (public keys only, DP-04), this repository's open documentation.                                                                                                                       |
| **INTERNAL**     | Not for publication; low harm if disclosed.                                                         | Source code, CI configuration, architecture docs, decision logs, non-secret environment variable **names**, aggregate telemetry.                                                                                                                             |
| **CONFIDENTIAL** | Harm to ReFi, a partner, or an individual if disclosed; access on a need-to-know basis.             | Investor account and profile records, disclosure acknowledgments, action receipts and record-access logs (RB-01..RB-04), correlation-id-linked request logs, vendor contracts and pricing, partner API contracts (Daniel's Investor API), security findings. |
| **RESTRICTED**   | Highest harm; regulatory or identity-theft consequence; strict access, storage, and logging limits. | Authentication secrets; API keys; SSN / national ID numbers; KYC applicant PII; identity documents (images, extracted document data); biometric information (selfie/liveness data); private cryptographic keys; production customer exports.                 |

When in doubt, classify up. Derived data inherits the class of its source
unless it is irreversibly aggregated or hashed (for example, HMAC-SHA256 hashed
IP / user-agent per DP-01 is CONFIDENTIAL, not RESTRICTED).

## 2. Requirements by class

### PUBLIC

- Storage: anywhere. Transmission: any. Access: none required.
- Logging: unrestricted. Retention: as useful. Disposal: none required.
- Incident escalation: none, unless integrity is affected (defacement → SEV2
  per the runbook).

### INTERNAL

- Storage: the GitHub repository (`ReFi-Trading-Inc/refi-us-sec-ia`), GitHub
  Actions, approved SaaS accounts, managed devices meeting
  `endpoint-security-baseline.md`.
- Transmission: HTTPS-only services; no personal email or consumer chat.
- Access: GitHub organization membership; least privilege per
  `access-control-overview.md`.
- Logging: unrestricted.
- Retention: repository history is permanent by design (books-and-records
  posture, CM-06). Disposal: not required.
- Incident escalation: SEV3 unless it reveals a CONFIDENTIAL/RESTRICTED path.

### CONFIDENTIAL

- Storage: Cloud Firestore in the ReFi GCP project (durable store,
  `infra/terraform/main.tf`: delete protection and point-in-time recovery
  enabled), Cloud Logging / Vercel logs, Sentry (`@sentry/nextjs`), PostHog
  (non-PII events only per DP-01). The prototype filesystem store is
  permitted only on local, CI, and demo tiers (see
  `encryption-architecture.md` §4).
- Transmission: TLS only; between ReFi services and partners, authenticated
  channels (Google ID token for service identity, ES256 user assertion for
  the user, DP-04 / IB-12).
- Access: authenticated investor sees only their own records (AC-04, two-user
  isolation harness, PR #102 series); staff access via GCP IAM roles granted
  per person; never shared accounts.
- Logging: may be logged with the correlation id; never log raw IP, DOB, or
  full email where a hash suffices (DP-01).
- Retention: books-and-records entities are append-only and immutable (RB-03);
  retention period is a counsel determination (Rule 204-2 is the draft hook
  in `compliance/CONTROL_MATRIX.md`). Operational logs: platform default
  unless a legal hold applies.
- Disposal: only by documented process after counsel confirmation; never
  ad hoc deletion of records entities.
- Incident escalation: SEV2 on suspected exposure; SEV1 on confirmed
  cross-account exposure (`docs/incident-response-runbook.md` §0).

### RESTRICTED

- Storage:
  - Secrets and API keys: Google Secret Manager in the connected GCP project
    (`infra/terraform/modules/secret-manager/`; accessor role granted to the
    runtime service account only) or the Vercel project's environment
    variables marked sensitive. Never in source, never in `.env.example`,
    never in a ticket, chat, or document.
  - Private cryptographic keys: Cloud KMS non-exportable key versions
    (`assertion`, `identity-bridge`; `docs/security/RUNBOOK-bff-assertion-signing-key.md`
    §2a). Where a JWK is still used (pre-KMS tiers), it is a Secret Manager /
    Vercel sensitive value; the per-process ephemeral key is permitted only on
    a single-process local or CI run (`BFF_ASSERTION_ALLOW_EPHEMERAL_KEY`).
  - KYC applicant PII, identity documents, biometrics: **ReFi's target
    design is that these are captured and held by Socure**, with ReFi holding
    only a Socure reference id, decision/status, and reason codes. ReFi does
    not store identity-document images or biometric data in its own stores.
    This is design intent; the Socure integration is not implemented (see
    `README.md`).
  - SSN / national ID: never stored by ReFi; if a flow requires it to pass
    through the BFF to Socure, it is forwarded once, never persisted, never
    logged (pattern already used for broker credentials:
    `apps/web/app/api/v1/investor/broker/connection/[id]/rotate/route.ts`).
  - Production customer exports: only in the GCP project, in a bucket or
    Firestore export with per-person IAM; never on a laptop or removable
    media.
- Transmission: TLS with an authenticated endpoint; server-to-server only.
  Browser-side vendor SDKs receive only public SDK keys and short-lived
  session tokens (see `threat-model.md`).
- Access: named individuals with a documented need; runtime service accounts
  scoped to the single secret or key they use; no human reads a production
  secret value except during provisioning or rotation.
- Logging: **never.** Secrets, tokens, assertions, cookies, credentials, and
  applicant PII are excluded from logs (code rule cited in
  `data-handling-standard.md` §3).
- Retention: secrets live until rotated; retired secret versions are
  disabled then destroyed. Applicant PII retention is governed by Socure's
  terms plus counsel's determination for ReFi's own reference records.
- Disposal: Secret Manager version destroy / Vercel variable deletion; KMS
  key-version destroy after the JWKS overlap window; customer exports
  deleted at end of use with the deletion recorded.
- Incident escalation: any suspected exposure is SEV1 (runbook §0, §2.4);
  rotate first, investigate second.

## 3. Tie to the actual architecture

| Store / channel                                           | Class ceiling                           | Evidence                                                                    |
| --------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------- |
| Git repository                                            | INTERNAL                                | gitleaks blocking in CI; `.gitignore` ignores `.env*` except `.env.example` |
| `apps/web/.env.example`                                   | INTERNAL (names and placeholders only)  | file content; DP-02                                                         |
| Vercel env (`refi-us-sec-ia-web`, `refi-us-sec-ia-demo`)  | RESTRICTED (sensitive-marked values)    | `infra/cloudrun/README.md` (sensitive values are not readable back)         |
| Google Secret Manager (connected project)                 | RESTRICTED                              | `infra/terraform/modules/secret-manager/main.tf`; not yet provisioned       |
| Cloud KMS `assertion`, `identity-bridge`                  | RESTRICTED (non-exportable)             | signing-key runbook §2a; `founder-activation-actions.md` items 9–10         |
| Cloud Firestore (durable store, connected store)          | CONFIDENTIAL                            | `infra/terraform/main.tf`; `apps/web/src/lib/connected-store/index.ts`      |
| Prototype filesystem store (`/tmp` on Vercel, local disk) | CONFIDENTIAL, demo/local/CI only        | `apps/web/src/lib/prototype-store/store.ts`                                 |
| Cloud Run env (secret refs)                               | RESTRICTED via `secret_key_ref`         | `infra/terraform/modules/cloud-run-service/main.tf`                         |
| Sentry / PostHog                                          | CONFIDENTIAL; no RESTRICTED, no raw PII | DP-01; `apps/web/app/api/us/eligibility/route.ts`                           |

No secret is in source: enforced by the blocking gitleaks job and by the
zod environment schema in `apps/web/src/lib/config/env.ts`, which requires
≥32-character secrets, rejects the prototype placeholders when
`NEXT_PUBLIC_REFI_ENV=prod`, and keeps `serverEnv` unreachable from browser
bundles (DP-02).
