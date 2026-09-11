# Daniel dependency packet — after #105/#106 merged to `main` (updated 2026-09-10)

Contract in force on `main`: `v1.1.0-alpha.3`, `package_content_sha256`
`5eca1200f6af807093ea0986f835235e2da478b69478e621fd54954ba1d77608`.
Only backend-owned or contract-owned items are listed. Nothing here blocks
local implementation; every item blocks genuine connected acceptance.

**KYC/CIP boundary — founder decision 2026-09-10.** For the initial Alpha the
founder selected **Alpaca-owned brokerage KYC/CIP**. ReFi will not integrate
Persona, Socure, Veriff, Alloy or any other separate identity-verification
provider. Stytch owns authentication only; ReFi owns eligibility, advisory
profile, disclosures, consent and internal closed-Alpha admission; Alpaca owns
brokerage KYC/CIP and account approval; your backend owns account ownership,
credential custody, account truth, `AccountAuthorization`, risk, execution,
fills and reconciliation. **Please confirm the backend integration model
supports this** (questions A1–A8 and K1 below). Full write-up:
`decision-kyc-model.md`.

## B1 / Step 4 — bound connected addendum

Please return the hash-bound Dev connection addendum referencing alpha.3 and the
digest above, with exact:

- identity-ccid and investor-api service URLs;
- Identity Google OIDC audience and Investor API Google OIDC audience (we have
  `https://identity-ccid.dev.refi.internal` / `https://investor-api.dev.refi.internal`
  from `connection.dev.json`; confirm they are the bound values);
- backend identity JWKS URL and current `kid`;
- ready revisions and image digests for both services;
- the runtime service-account binding you will admit (we will return the
  frontend SA email and uniqueId in Appendix A once the founder provisions it);
- the remote acceptance conditions and the enabled scope.

Until this arrives `REFI_INVESTOR_API_ALLOW_REMOTE` stays OFF.

## B3 — real test identities

When ready for connected acceptance: email/campaign-bound invitations for the
agreed test identities, secure delivery path, and the permitted account-level
execution scope.

## Alpaca onboarding ownership (new 2026-09-10)

Our audit of alpha.3 and the backend snapshot found: no Alpaca account-creation
or applicant-submission operation; `createBrokerageConnection` takes the user's
existing Alpaca API key pair; no Alpaca account-status field anywhere;
`getKycStatus` is a constant (`NOT_REQUIRED` / `CLOSED_US_INVITE_ALPHA`);
`Account.status`, `management_scope_status`, `reconciliation_hold_status` and
`AccountValuation.status` are free strings; `reason_codes` and
`required_steps` are unenumerated; the backend uses the Alpaca Trading/Data
APIs only (no Broker API). Please confirm or correct:

- **A1.** Which backend service initiates or owns Alpaca account onboarding — or
  is the shipped model that the investor self-opens an Alpaca account at Alpaca
  and only connects API keys (Model B in `decision-kyc-model.md` §3)?
- **A2.** Does the frontend submit applicant information through ReFi backend
  endpoints, or through an Alpaca-hosted flow? (Today: neither exists in
  alpha.3; we collect no brokerage-application PII.)
- **A3.** Which service exposes Alpaca KYC/account status to the BFF?
- **A4.** What is the canonical backend object containing Alpaca account status?
  (`KycVerifications` exists in the Spanner DDL but is not exposed.)
- **A5.** Which status indicates brokerage onboarding is complete enough for
  first connection? (Today we infer nothing before `createBrokerageConnection`;
  after it, `CONNECTED`/`VALID` plus fresh account truth.)
- **A6.** Does your backend create the Alpaca account before or after brokerage
  connection — or never (Model B)?
- **A7.** Does alpha.3 currently expose all required onboarding status? Our
  reading: **no** for application-started / information-required / under-review /
  approved / rejected / restricted; **yes** only for connection-level states.
- **A8.** Are any new frontend projections required? We have prepared a
  contract-backed projection over `BrokerageConnection`
  (`apps/web/src/lib/brokerage/onboarding-projection.ts`) with the six Alpaca
  application states declared but unbound; tell us which binding (new fields,
  enumerated `reason_codes` / `required_steps`, an `Account.status` vocabulary,
  or a new operation) should back them.
- **A9 (PAPER).** Confirm the initial Alpha uses `account_environment=paper`
  only and that no live-key path is admitted for the cohort.

## KYC evidence in the attestation under Alpaca-owned CIP (new 2026-09-10)

- **K1.** alpha.3 admits `kyc.status ∈ {passed, not_required}` and says
  `not_required` is valid "only when that is the frontend decision owner's real
  policy". Under the founder decision ReFi performs no KYC. Should the initial
  Alpha attestation carry `kyc.status=not_required` with a `level` naming
  Alpaca-owned CIP and `evidence_ref` naming the brokerage connection, or do you
  want `passed` derived from an Alpaca status binding (A3/A4)? Until you answer
  our chain keeps stopping at `KYC_EVIDENCE_MISSING`; nothing fabricates
  `passed`.
- **K2.** Does the attestation-then-connect ordering in Appendix C stand if the
  KYC evidence depends on the connection (K1 second option), or may the order
  swap for this cohort?

## `brokerage_mutation` error profile

alpha.3 `brokerage_mutation` declares neither `ACCOUNT_AUTHORIZATION_REQUIRED`
nor `ACKNOWLEDGMENT_BINDING_INVALID`. Our disconnect adapter fails closed
(contract mismatch) if either arrives. Question:

> Should `brokerage_mutation` formally include `ACCOUNT_AUTHORIZATION_REQUIRED`
> and `ACKNOWLEDGMENT_BINDING_INVALID`, or should the backend guarantee those
> errors are never emitted from brokerage disconnect?

We will not normalise either response until you answer (an alpha.4 with a
migration note, per your `connection_addendum_policy`).

## Appendix A digest defect (no action needed before implementation continues)

`v1.1.0-alpha.3/INTEGRATION.md` Appendix A sample packet still shows
`package_content_sha256: c1b53c90…` (the alpha.2 digest) next to
`contract_version: v1.1.0-alpha.3`. The correct alpha.3 digest is
`5eca1200f6af807093ea0986f835235e2da478b69478e621fd54954ba1d77608`.
Our packet will carry the alpha.3 digest; your source document should be
corrected eventually. We did not edit the vendored file.
