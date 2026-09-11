# Daniel dependency packet — after #105/#106 merged to `main` (updated 2026-09-10)

Contract in force on `main`: `v1.1.0-alpha.3`, `package_content_sha256`
`5eca1200f6af807093ea0986f835235e2da478b69478e621fd54954ba1d77608`.
Only backend-owned or contract-owned items are listed. Nothing here blocks
local implementation; every item blocks genuine connected acceptance.

**KYC — founder decision 2026-09-10 (later revision).** ReFi owns KYC for the
initial Alpha with **Socure** (Build Your Own UI; KYC + Fraud + Watchlist >
DocV Step Up). The earlier Alpaca-owned-CIP note is superseded; the Alpaca
account-opening questions below are about brokerage onboarding only. Stytch owns authentication only; ReFi owns eligibility, advisory
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

## Alpaca account onboarding / KYC boundary (priority; founder wording 2026-09-10)

Founder decision (revised 2026-09-10): ReFi owns KYC via Socure. The questions
below concern the **brokerage account-opening boundary** only.

Current alpha.3 exposes brokerage connection using an existing Alpaca
account/credential relationship, but exposes no account-application,
applicant-PII, KYC/CIP-application, or application-status operation.

Please confirm (exact operation/object/status names where possible):

1. For initial Alpha, will users use pre-created/existing Alpaca PAPER accounts
   and then connect them to ReFi?
2. Or will your backend expose an Alpaca Broker API onboarding flow?
3. If backend-owned onboarding is intended, what service and operation create
   the brokerage account?
4. What operation receives applicant information?
5. What backend object exposes brokerage application/KYC status?
6. What exact condition means the account is ready for ReFi brokerage
   connection?
7. Does brokerage connection occur before or after Alpaca approval?
8. **KYC evidence (K1, revised).** ReFi will include in
   `createComplianceProfileAttestation` a `kyc` block derived only from a
   FINAL Socure decision: `status` = `passed` | `failed`, `provider` =
   `socure-kyc-adapter`, `level` = the Socure workflow name, `evidence_ref` =
   an opaque ReFi session reference (`kyc-session:refi-kyc-…`). Please confirm
   this satisfies your trusted-provenance expectation, or state the exact
   `provider` / `level` / `evidence_ref` vocabulary you want.
9. Does this require an alpha.3 addendum or new frontend projection?
10. Will B3 test identities receive pre-created Alpaca PAPER accounts?

Status until answered: **ALPACA ACCOUNT OPENING: DANIEL DEPENDENCY** ·
**ATTESTATION KYC EVIDENCE VOCABULARY: DANIEL CONFIRMATION** (ReFi-owned
Socure evidence implemented) · **BROKERAGE CONNECTION: CODE COMPLETE,
FIXTURE-PROVED**. Question 1/2 = "A1"; question 8 = "K1" in our other documents.

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
