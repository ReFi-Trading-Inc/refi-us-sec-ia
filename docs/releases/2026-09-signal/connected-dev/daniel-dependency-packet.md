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
supports this** (the Alpaca block below). Full write-up:
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

## Alpaca account onboarding and KYC/CIP (priority, 2026-09-10)

Founder decision: for the initial US Alpha, Alpaca owns brokerage KYC/CIP.
ReFi will not integrate a separate KYC vendor.

Current alpha.3 appears to begin at an existing Alpaca brokerage connection
(`createBrokerageConnection` with the investor's API key pair) and exposes no
account-opening, applicant/PII, KYC/CIP-application or application-status
operation; `getKycStatus` is the constant `NOT_REQUIRED` /
`CLOSED_US_INVITE_ALPHA`. We have introduced no onboarding state in the frontend
and will not until you answer:

1. **Boundary (A1).** For the initial Alpha, which applies: (a) the investor opens an
   Alpaca PAPER account separately and ReFi only connects credentials; (b) ReFi
   links an existing Alpaca PAPER account by another means; (c) your backend
   exposes an Alpaca Broker API onboarding projection; (d) another backend-owned
   flow?
2. **Status.** If (c)/(d): which service and object carry Alpaca account / KYC
   status, which value means "ready for first brokerage connection", and will a
   contract version expose it?
3. **Applicant data.** If any applicant information passes through ReFi or your
   backend: which fields, which endpoint, which service stores them?
4. **Attestation `kyc` block (K1).** alpha.3 allows `kyc.status ∈ {passed,
not_required}`; `not_required` is valid only as the decision owner's real
   policy. Under Alpaca-owned CIP, should the initial-Alpha attestation carry
   `not_required` (with what `level` / `evidence_ref`), or a `passed` derived
   from a status you provide? Until answered our chain stops at
   `KYC_EVIDENCE_MISSING`; nothing fabricates `passed`.
5. **PAPER.** Confirm `account_environment=paper` only for the cohort and no
   live-key path.

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
