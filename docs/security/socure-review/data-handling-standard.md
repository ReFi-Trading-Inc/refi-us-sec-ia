# Data handling standard

Status: POLICY ADOPTED, ORGANIZATIONAL ACTION PENDING

Owner: Zeshan. Adopted: 2026-09-10. Applies to everyone with access to ReFi
systems, code, or data. Classes are defined in `data-classification-policy.md`.
Pending action: personnel acknowledgment (see the training record template).

## 1. Least privilege and need-to-know

- Access is granted per person, per system, for a stated purpose, and removed
  when the purpose ends (`access-control-overview.md` §7).
- Runtime identities get the narrowest role that works: the Firestore app
  service account holds `roles/datastore.user` only (`infra/terraform/main.tf`);
  the connected BFF runtime account is designed to hold Secret Manager
  accessor on its own secrets and `roles/cloudkms.signerVerifier` on two keys
  only (`founder-activation-actions.md` item 6; signing-key runbook §2a).
- CI holds `contents: read` by default (`.github/workflows/ci.yml`).

## 2. No production secrets in source

- Secrets never enter git, tickets, chat, screenshots, or documents.
  `.gitignore` ignores `.env*` except `.env.example`; `gitleaks` is a blocking
  CI job; the env schema rejects placeholder secrets in production (DP-02).
- Local development uses `.env.local` (gitignored) with locally generated
  values (`openssl rand -hex 32` per `apps/web/.env.example`).

## 3. No Restricted data in ordinary logs

Code rules already in the tree, cited as the standard:

- `apps/web/src/lib/config/env.ts:140` and `:280` — private JWK and
  server-only secrets are documented "never logged".
- `apps/web/src/lib/investor-api/google-id-token.ts:21` — the Google ID token
  text is never logged, thrown, or returned.
- `apps/web/app/api/v1/investor/broker/connection/[id]/rotate/route.ts:7` —
  broker credentials are validated by shape, forwarded once and forgotten:
  never logged, never stored.
- `apps/web/app/api/us/eligibility/route.ts:99` — no PII in telemetry; DOB and
  raw IP are never logged (DP-01).
- Migration plan §14 (`docs/releases/2026-09-signal/gcp-bff-migration-plan.md`)
  defines the never-log list for the connected BFF (Google tokens, identity
  assertions and results, user assertions, Alpaca keys, nonces, challenges,
  invitation tokens; headers `Authorization`, `X-Refinity-User-Assertion`,
  `Cookie`, `Set-Cookie`; fields matching `*_secret|*_token|api_key|api_secret`).
  The log-level scrubber described there is planned, not yet in the tree.

Policy extension for KYC: onboarding payloads sent to Socure (names, DOB,
address, SSN, document data, DocV tokens) are never logged. Log the Socure
reference id, the decision, and reason codes only. `DP-01` is currently
UNVERIFIED in the control matrix (no test asserts absence of PII in logs);
that gap applies to this rule too and is listed in `README.md`.

## 4. Encryption

TLS for every network hop; provider-managed encryption at rest for every
managed store; KMS custody for signing keys. Details and exceptions in
`encryption-architecture.md`. No one may add an unencrypted transport or a
self-managed disk store for CONFIDENTIAL or RESTRICTED data.

## 5. Secure sharing

- CONFIDENTIAL: share through the system that holds it (GCP console with
  IAM, GitHub with repository access) rather than by copying it out.
- RESTRICTED: do not share the value. Grant access to the store instead. If a
  secret must be handed over during provisioning, use the provider's own
  mechanism (Secret Manager version, Vercel sensitive variable) and never
  email, chat, or a shared document.
- External parties (Socure, Stytch, Daniel's backend team) receive
  configuration by name and public material only (issuer URNs, audiences,
  JWKS URLs, `kid`s — see Appendix A in `connected-dev/appendix-a-packet.json`).

## 6. Local devices

- Only devices meeting `endpoint-security-baseline.md` may hold INTERNAL or
  CONFIDENTIAL data; RESTRICTED data does not live on laptops beyond
  `.env.local` for local development, which must contain only locally
  generated or non-production values.
- Production customer exports are never downloaded to a laptop.
- Screen lock and disk encryption are mandatory (baseline §3–§4).

## 7. Removable media

Removable media (USB drives, SD cards, external disks) are not used for
CONFIDENTIAL or RESTRICTED data. Transfers use the managed stores above.

## 8. Deletion

- Records entities (receipts, access logs, decision records, disclosure
  acknowledgments) are append-only and are never deleted by engineering
  action; retention is a counsel determination (RB-03; runbook §3).
- Secrets are rotated, then the old version disabled and destroyed.
- Local copies (`.env.local`, prototype-store directories, Playwright
  reports) are deleted when a device is retired or reassigned.

## 9. Vendor handling

| Vendor               | Role                                                                                                                   | Data class                         | State on `main @ 57a336d`                                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Socure**           | FUTURE processor of RESTRICTED data (KYC, fraud, watchlist, DocV)                                                      | RESTRICTED                         | Selected; account verification pending; no credentials, no code path, no traffic. The repo's `decision-kyc-model.md` still records "no separate KYC vendor" — see `README.md`. |
| **Stytch**           | Authentication processor (email magic link / OTP, headless)                                                            | CONFIDENTIAL (email, auth factors) | Decided 2026-09-09 (`decision-identity-provider.md`); code path present behind `REFI_AUTH_PROVIDER=stytch`; no project created, no traffic (`founder-activation-actions.md`).  |
| **Google Cloud**     | Infrastructure processor (Cloud Run, Firestore, Secret Manager, KMS, Artifact Registry, Cloud Logging)                 | up to RESTRICTED                   | Demo service `demo-web` runs in `refi-game-prod` (`infra/cloudrun/README.md`); connected project `refi-us-connected-investor` not created.                                     |
| **Vercel**           | Infrastructure processor (web hosting, env storage, logs)                                                              | up to RESTRICTED (env values)      | Vercel projects `refi-us-sec-ia-web` and `refi-us-sec-ia-demo` referenced in repo docs (`gcp-bff-migration-plan.md` §1; `infra/cloudrun/README.md`).                           |
| **Alpaca**           | Brokerage (paper only); reached via Daniel's backend, never from the browser or directly from the BFF with broker keys | CONFIDENTIAL                       | `decision-kyc-model.md` §9: PAPER only; credentials held by the backend (IB-12, IB-08).                                                                                        |
| **Sentry / PostHog** | Error and product telemetry                                                                                            | CONFIDENTIAL, no PII               | `@sentry/nextjs` dependency; PostHog key is a `NEXT_PUBLIC_` value; DP-01 governs content.                                                                                     |
| **GitHub**           | Source control and CI                                                                                                  | INTERNAL                           | Organization `ReFi-Trading-Inc`; branch protection verified via API (`change-management.md`).                                                                                  |

Vendor onboarding rule: before RESTRICTED data flows to a vendor, its
security posture is reviewed and recorded, a data-processing agreement is in
place (counsel), and the integration passes the trust-boundary review in
`threat-model.md`. For Socure this has not yet happened.

## 10. Incident reporting

Anyone who suspects a mishandling of CONFIDENTIAL or RESTRICTED data reports
it immediately to the owner per `docs/incident-response-runbook.md` §4. Do not
attempt to clean up first; containment and evidence preservation come from
the runbook (§0 golden rule). Reporting a mistake is expected and is never
penalized.
