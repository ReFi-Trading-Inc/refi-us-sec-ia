# KYC/CIP model for the initial US Alpha — founder decision 2026-09-10

**Decision (founder, 2026-09-10): Option 1 — Alpaca-owned brokerage KYC/CIP.**
ReFi does **not** integrate Persona, Socure, Veriff, Alloy or any other
separate identity-verification provider for the initial Alpha. Do not select or
integrate another vendor unless the founder changes this decision.

This supersedes, for the initial Alpha only, the 2026-09-04 note that "the
frontend/BFF owns the KYC provider lifecycle; no provider has been selected"
(`../c1b2-browser-direct-reclassification.md`). Older planning documents that
name CCID, ComplyCube or a "KYC vendor commitment" are historical and are not
edited; this document is the current authority.

Program phase is unchanged: **US Investor Integration Foundation**. This
decision changes architecture and readiness documentation; it authorizes no
external activation (no GCP provisioning, Stytch traffic, KMS use, remote
identity/Investor API traffic, Alpaca calls or live-capital path).

## 1. Responsibility boundaries

| Owner            | Owns                                                                                                                                                                                                                                                              | Does not decide                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Stytch           | email / magic-link / OTP authentication, session and factor evidence, genuine `auth_time`                                                                                                                                                                         | eligibility, Alpha admission, brokerage KYC, account authorization, suitability, risk, execution |
| ReFi (BFF/UI)    | jurisdiction screening, product eligibility, advisory profile, disclosures, consent, internal closed-Alpha admission gate (frontend gate; backend-owned activation), Stytch→ReFi identity bridge, investor-facing state, records, account-scoped product controls | brokerage CIP on Alpaca's behalf                                                                 |
| Alpaca           | brokerage account application requirements, KYC/CIP, identity/document requirements, approval / rejection / onboarding review, Alpaca action-required states                                                                                                      | ReFi eligibility, ReFi admission, ReFi account authorization                                     |
| Daniel's backend | canonical account ownership, brokerage credential custody, account truth, `AccountAuthorization`, templates, intents, risk, execution plans, orders, broker lifecycle, fills, reconciliation                                                                      | —                                                                                                |

Three states that must never be conflated: **Stytch authentication is not
KYC**; **ReFi closed-Alpha admission is not brokerage KYC**; **Alpaca account
approval is not ReFi `AccountAuthorization`**.

## 2. Product sequence (initial US connected Alpha)

```
PUBLIC APPLICATION
→ AUTOMATED ELIGIBILITY SCREENING
→ STYTCH AUTHENTICATION
→ ADVISORY PROFILE
→ REQUIRED DISCLOSURES / CONSENTS
→ INTERNAL REFI HUMAN CLOSED-ALPHA APPROVAL
→ ALPACA ACCOUNT ONBOARDING
→ ALPACA KYC / CIP / ACCOUNT APPROVAL
→ BROKERAGE CONNECTION / ACCOUNT SYNC
→ REFI BACKEND ACCOUNT AUTHORIZATION
→ REFI SIGNAL
→ MANAGED PAPER
```

No separate ReFi KYC provider sits between authentication and Alpaca
onboarding. The first-broker-connection correction stands: `AccountAuthorization
.status === AUTHORIZED` is **not** required before `createBrokerageConnection`
(alpha.3 `INTEGRATION.md` §"first connection"; an admitted account with no
connection legitimately reports `DENIED` / `BROKER_CONNECTION_MISSING`).

## 3. What alpha.3 actually exposes for Alpaca onboarding (audit 2026-09-10)

Audited: `packages/api-clients/contracts/investor-api/v1.1.0-alpha.3/*`
(41 operations), the frozen client, Daniel's `september-12-launch/*` notes and
the backend source snapshot `refinity-main-main-Sept-10-2026`. Nothing below is
invented; "not present" means absent from the package and the backend snapshot.

| Question                                                      | Finding                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alpaca account creation in alpha.3?                           | **Not present.** No applicant/onboarding submission operation; `POST …/eligibility` and `POST …/advisory-profiles` are listed under `excluded_public_operations`. The only PII field in the package is `IdentityHandoffResult.email`.                                                                                                     |
| Does brokerage connection assume an existing Alpaca account?  | **Yes.** `createBrokerageConnection` takes `broker="alpaca"`, `account_environment=paper\|live`, and the user's full Alpaca **API key pair** (`BrokerageCredentials.api_key/api_secret`, writeOnly). `broker_account_id` appears only on the response (nullable), discovered by the backend from the keys.                                |
| Does Daniel's backend create or link the Alpaca account?      | **Links credentials only.** The backend snapshot references the Alpaca Trading/Data APIs (`paper-api.alpaca.markets`, `api.alpaca.markets`, `data.alpaca.markets`) and contains no Alpaca **Broker API** integration (no `broker-api.alpaca`, no account/applicant creation). Alpaca account opening happens **outside ReFi**, at Alpaca. |
| Which service receives customer onboarding data?              | Under the shipped model: **Alpaca directly** (the user opens the account at Alpaca). Neither the BFF nor Daniel's backend receives applicant PII; the package forbids sending raw answers/documents to the trading backend (`INTEGRATION.md` "Evidence SHA-256 … do not send raw answers/documents").                                     |
| Which service receives Alpaca account status?                 | **None in alpha.3.** No Alpaca account-status field exists. The backend schema has a `KycVerifications` table (provider, status, level, …) and Daniel's lifecycle checklist plans "KYC status/initiation" routes, but none are exposed.                                                                                                   |
| Which service exposes KYC/account-approval status to the BFF? | `getKycStatus` returns a **constant** projection: `status=NOT_REQUIRED`, `level=CLOSED_US_INVITE_ALPHA`, `public_launch_eligible=false`, `policy_version`. No provider, reason, timestamp or action-required field.                                                                                                                       |
| Is account status in account truth?                           | `Account.status`, `management_scope_status`, `reconciliation_hold_status` and `AccountValuation.status` are **free strings without a declared vocabulary** (examples `active`, `ACTIVE`, `CLEAR`, `READY`). `AccountAuthorization.status` ∈ `AUTHORIZED\|DENIED\|PENDING\|SUSPENDED` with **unenumerated** `reason_codes`.                |
| Does the frontend need a dedicated projection?                | **Yes, but it can only be contract-backed from `BrokerageConnection`** (`connection_status` ∈ `PENDING_VALIDATION\|CONNECTED\|STALE\|ERROR\|DISCONNECTING\|DISCONNECTED\|REVOKED`; `credential_status` ∈ `PENDING\|VALID\|INVALID\|ROTATING\|REVOKED`). See §5.                                                                           |

**Consequence.** Two integration models satisfy "Alpaca-owned KYC/CIP"; alpha.3
and the backend implement only the first:

- **Model B (shipped): investor self-opens an Alpaca account** at Alpaca
  (Alpaca performs its own KYC/CIP on that retail account), generates API keys,
  and connects them through ReFi. ReFi/Daniel have no in-band view of Alpaca's
  application state; "brokerage account approved" is only _implied_ by
  `CONNECTED`/`VALID` plus fresh reconciled account truth.
- **Model A (not built): Alpaca Broker API** — ReFi/Daniel submit the applicant
  to Alpaca, receive account status (`SUBMITTED`, `APPROVAL_PENDING`,
  `ACTION_REQUIRED`, `APPROVED`, `REJECTED`, `ACTIVE`, …) and surface it. This
  requires backend work, a new contract version, and a PII path that does not
  exist today.

Which model the initial Alpha uses is a **Daniel dependency** (see the packet).
The frontend does not choose; it prepares the projection that is contract-backed
today and marks every Model-A state as unbound.

## 4. Customer data collection and the PII boundary

Under Model B **ReFi collects no brokerage-application PII**: the investor
supplies legal name, date of birth, residential address, tax residency and
identifier, citizenship, phone, employment, affiliations, investment profile,
trusted contact and documents **to Alpaca**, at Alpaca. ReFi collects only what
its own advisory/eligibility records require (jurisdiction, advisory profile
answers, disclosures, consents) plus the Stytch-verified email.

Do not implement new personal-data fields until a backend contract or the
Alpaca onboarding path requires them. If Daniel selects Model A, the fields and
their authoritative store are defined by that contract version, not by the
frontend.

| Field / artifact                                                                                | Browser collects | → ReFi BFF        | → Daniel backend            | → Alpaca                                 | ReFi stores               | Encrypted           | Retention          | Advisory record? | Brokerage-only? |
| ----------------------------------------------------------------------------------------------- | ---------------- | ----------------- | --------------------------- | ---------------------------------------- | ------------------------- | ------------------- | ------------------ | ---------------- | --------------- |
| Email (Stytch-verified)                                                                         | yes              | yes               | yes (identity result claim) | no (user's own Alpaca login is separate) | yes (session/subject map) | at rest (Firestore) | account lifetime   | yes              | no              |
| Jurisdiction / eligibility answers                                                              | yes              | yes               | evidence hash only          | no                                       | yes (decision evidence)   | at rest             | per records policy | yes              | no              |
| Advisory profile answers                                                                        | yes              | yes               | evidence hash only          | no                                       | yes                       | at rest             | per records policy | yes              | no              |
| Disclosures / consent receipts                                                                  | yes              | yes               | `recordConsent`             | no                                       | yes                       | at rest             | per records policy | yes              | no              |
| Alpaca API key pair                                                                             | yes (once)       | pass-through only | yes (credential custody)    | n/a                                      | **never**                 | n/a (not retained)  | none               | no               | yes             |
| Legal name, DOB, address, tax id, citizenship, phone, employment, affiliations, trusted contact | **no** (Model B) | no                | no                          | yes (at Alpaca)                          | **never**                 | n/a                 | none               | no               | yes             |
| Government ID images / biometrics                                                               | **no**           | no                | no                          | yes (at Alpaca)                          | **never**                 | n/a                 | none               | no               | yes             |

Rules: never persist government ID images, biometric evidence or tax
identifiers in ReFi Firestore unless an approved architecture explicitly
requires it; never log onboarding payloads or credentials (existing IB controls
cover the key pair). If Model A is adopted this table is re-issued against the
new contract before any PII path is implemented.

## 5. Brokerage onboarding state model (product layer)

Product states required (mandate §8), with what backs each today. The typed
projection lives in `apps/web/src/lib/brokerage/onboarding-projection.ts`; the
contract assertions prove that the mapper emits **only** backed states and that
no runtime value is fabricated for an unbound state.

| Product state          | Investor-facing wording                      | Backed by (alpha.3)                                                                 | Status                                                       |
| ---------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `not_started`          | Brokerage verification not started           | no `BrokerageConnection` for the account                                            | contract-backed                                              |
| `application_started`  | Brokerage application started                | —                                                                                   | **unbound** (Model A / Daniel binding)                       |
| `information_required` | Additional information required              | —                                                                                   | **unbound**                                                  |
| `under_review`         | Brokerage account under review               | —                                                                                   | **unbound** (Alpaca review is not visible)                   |
| `approved`             | Brokerage account approved                   | —                                                                                   | **unbound** (approval only implied)                          |
| `rejected`             | Brokerage application not approved           | —                                                                                   | **unbound**                                                  |
| `action_required`      | Action required on your brokerage connection | `credential_status` ∈ `INVALID\|REVOKED`, or `connection_status` ∈ `ERROR\|REVOKED` | contract-backed (connection-level only)                      |
| `connection_pending`   | Brokerage verification in progress           | `connection_status=PENDING_VALIDATION` or `credential_status ∈ PENDING\|ROTATING`   | contract-backed                                              |
| `account_active`       | Brokerage account connected                  | `connection_status=CONNECTED` and `credential_status=VALID`                         | contract-backed (link works; not an Alpaca "approved" claim) |
| `stale`                | Brokerage data needs a refresh               | `connection_status=STALE`                                                           | contract-backed                                              |
| `disconnected`         | Brokerage account disconnected               | `connection_status` ∈ `DISCONNECTING\|DISCONNECTED`                                 | contract-backed                                              |
| `restricted`           | Brokerage account restricted                 | —                                                                                   | **unbound** (`Account.status` etc. have no vocabulary)       |

Never collapse non-approved states into "KYC failed". Never display "ReFi
approved your identity", "SEC verified", "KYC certified" or "Fully verified".
The generic frontend lifecycle (`not_started → in_progress →
additional_info_required → under_review → passed | failed`) in
`apps/web/src/lib/kyc/` is retained as a **projection scaffold only**: nothing
hard-codes a vendor (a contract assertion forbids vendor names), the mock
adapter is a development control and never evidence, and the frontend is never
authoritative for the decision. Refactor plan and classification: §8.

## 6. Action-required flow

Alpaca requires more information → the investor completes it **at Alpaca** (Model
B) or through the Daniel-defined path (Model A) → the updated status reaches ReFi
(today: only via connection validation / sync; Model A: via the new status
binding) → the investor continues after approval. ReFi never overrides Alpaca's
review state, and internal closed-Alpha admission never bypasses Alpaca's
account approval. Connection-level action-required states (`INVALID`, `REVOKED`,
`ERROR`) are handled by the existing rotate / reconnect / sync adapters.

## 7. Entry criteria

Verified against alpha.3 `INTEGRATION.md` §"attestation" (admission requires
effective accepted evidence with KYC `passed` **or `not_required`**, profile
`eligible`, trading eligibility `eligible`, effective consent) and §"first
connection" (no `AUTHORIZED` prerequisite for connect); economic mutations
(`updateAccountPreferences`, allocation join/update) return 403
`ACCOUNT_AUTHORIZATION_REQUIRED` when the backend denies.

**Signal cohort (real, initial):** valid Stytch authentication → durable ReFi
identity (bridge, exchange, connected session) → eligible jurisdiction →
completed advisory profile → required disclosures and consents → ReFi
closed-Alpha admission (backend invitation, frontend gate) → attestation
accepted by the backend with `kyc.status` per §7.1 → Alpaca brokerage account
exists and is connected (`CONNECTED`/`VALID`) where account data is required →
fresh account truth. `AccountAuthorization=AUTHORIZED` is required **only** for
the economic operations the Signal surface exposes (preference PATCH is one);
read-only Signal views do not require it. The package defines no "Signal"
subscription object; Signal is a frontend release-stage allowlist.

**7.1 Attestation `kyc.status` under Alpaca-owned CIP — Daniel binding
required.** alpha.3 permits `not_required` "only when that is the frontend
decision owner's real policy, not a dev bypass". Under the founder decision,
ReFi's real policy for the initial Alpha is that ReFi performs no KYC and Alpaca
owns CIP. Whether the attestation should therefore carry `not_required` (level
naming Alpaca-owned CIP, evidence_ref naming the brokerage connection) or
whether Daniel wants a `passed` derived from an Alpaca status binding is **his
call** (packet Q-K1). Until answered the attestation chain keeps stopping at
`KYC_EVIDENCE_MISSING`/`KYC_EVIDENCE_MOCK`; no frontend path fabricates
`passed`.

**Managed Paper:** all Signal prerequisites; template membership
(`AccountMembership.status=ACTIVE`); required preference state (alpha.3
preference confirmation with acknowledgment continuation, PR #106); backend
`AccountAuthorization.status=AUTHORIZED`; permitted trading-control state
(`management_scope_status`, `reconciliation_hold_status` — vocabulary to be
bound); Alpaca **PAPER** connection (`account_environment=paper`); current
broker sync (`BrokerageSyncReceipt COMPLETE`, `FRESH` valuation/positions);
remote backend readiness (B1 addendum, `connected_alpaca_verified`). Managed
Paper has no per-trade user approval; backend risk and execution are
authoritative.

## 8. Existing generic KYC seams — classification (mandate §7)

Audit 2026-09-10 of `apps/web`, `packages/`, `scripts/`, `compliance/`: **no
vendor SDK, vendor secret, vendor env or vendor name exists** (contract
assertion `VENDOR_NAMES` forbids them in the eight KYC modules). Classification:

| Seam                                                                                                             | Verdict                                                                                                             | Note                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| lifecycle enum, session types, lifecycle→attestation normaliser, `NOT_REQUIRED` guard (`lib/kyc/provider.ts`)    | KEEP as projection                                                                                                  | vendor-neutral; becomes the investor-facing projection over Alpaca onboarding once bound                                                       |
| `KycProviderAdapter` interface, `kind: "mock"`, `continuePath`, `getKycProvider`, `REFI_KYC_PROVIDER`            | REFACTOR → external-verification/account-onboarding projection                                                      | provider-selection indirection exists only for a hosted vendor flow; rename/reshape when the Daniel binding lands; do not delete state machine |
| `establishTrustedKycProvenance`, provenance trust model                                                          | REFACTOR                                                                                                            | the trusted source becomes "backend/Alpaca status", not a vendor adapter; keep the "mock is never trusted" invariant                           |
| `KYC_EVIDENCE_MOCK` / `KYC_EVIDENCE_MISSING` / `KYC_PROVENANCE_UNTRUSTED` blocked reasons                        | KEEP (`_MOCK` removable later)                                                                                      | still the correct fail-closed outcome today                                                                                                    |
| `MockKycProvider`, mock controls route, `REFI_KYC_MOCK_CONTROLS`, mock hooks/panel, `advanceMockKycVerification` | RETAIN as development control, REMOVE from any connected tier (already withheld by release policy / env invariants) | not vendor-specific; presenter/dev control only; delete once the real binding replaces the scaffold                                            |
| demo client fake `kyc: { status: "passed", provider: "demo-provider-adapter" }`                                  | REMOVE (vendor-specific fake)                                                                                       | demo tier only; must not survive into any connected tier (already impossible by env invariant)                                                 |
| `kycCopy` strings, account badge labels, "Identity verified" checklist label                                     | REWORD to brokerage wording when the projection is bound                                                            | see §5 wording                                                                                                                                 |
| `getKycStatus` client route, `KycStatus` schema, demo `getKycStatus` branch                                      | KEEP                                                                                                                | backend-owned constant projection                                                                                                              |

None of the REFACTOR/REMOVE items is executed by this document; they are listed
as remaining code work in `activation-readiness-2026-09-10.md` and depend on the
Daniel binding (Model A vs B) to avoid building against an invented boundary.

## 9. Alpaca PAPER only

Initial connected execution is **Alpaca PAPER** (`account_environment=paper`,
hard-coded in `brokerage-connection.ts`). No live keys, no live capital.
Brokerage approval in the Alpha is never described as approval for live-capital
investing.
