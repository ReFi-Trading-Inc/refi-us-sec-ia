> **SUPERSEDED 2026-09-10 (later the same day).** Also superseded: the "INTERNAL REFI HUMAN CLOSED-ALPHA APPROVAL" step — admission is now automatic on a final trusted Socure ACCEPT (`decision-alpha-admission-automatic.md`); human review is exception-based. The founder selected **Socure** as ReFi's own KYC provider for the initial US Alpha (`decision-kyc-provider-socure.md`). The Alpaca-owned KYC/CIP model below is retained as history; the Alpaca account-opening boundary questions to Daniel remain open independently of KYC.

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

**Founder review 2026-09-10:** ReFi has selected Alpaca-owned KYC/CIP for the
initial Alpha, but the authoritative technical onboarding boundary is awaiting
Daniel's backend binding. **No Alpaca application/KYC runtime state is
introduced until that binding exists.** This is a factual decision record; it
describes no implementation for the Alpaca account/KYC step.

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

## 2. Product journey (current factual form, until Daniel answers A1)

```
PUBLIC APPLICATION
→ ELIGIBILITY
→ STYTCH AUTHENTICATION
→ ADVISORY PROFILE
→ DISCLOSURES / CONSENTS
→ CLOSED ALPHA ADMISSION
→ ALPACA ACCOUNT / KYC STEP — EXTERNAL BOUNDARY TBD
→ REFI BROKERAGE CONNECTION
→ ACCOUNT SYNC
→ ACCOUNT AUTHORIZATION
→ SIGNAL
→ MANAGED PAPER
```

The Alpaca account/KYC step is deliberately marked **EXTERNAL BOUNDARY TBD**
and carries no implementation detail until Daniel answers. No separate ReFi KYC
provider sits between authentication and that step. The first-broker-connection
correction stands: `AccountAuthorization.status === AUTHORIZED` is **not**
required before `createBrokerageConnection`.

### Account opening versus brokerage connection (formal distinction)

| Concept                                    | Status                                                                                                                                                                                                                                                                                | Owner / evidence                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Account opening / brokerage onboarding** | **Unknown integration boundary — awaiting Daniel A1.** Potential implementations (not chosen): investor opens an Alpaca PAPER account separately; ReFi links an existing Alpaca PAPER account; Daniel exposes an Alpaca Broker API onboarding projection; another backend-owned flow. | DANIEL DEPENDENCY                                            |
| **Brokerage connection**                   | **Known alpha.3 operation** (`createBrokerageConnection` and the list/get/rotate/sync/disconnect family); expects an existing account/credential relationship; implementation kept as is.                                                                                             | CODE COMPLETE, FIXTURE-PROVED (connected acceptance pending) |

A connection status is never a KYC status. `CONNECTED`/`VALID` means the link
works; it is not an Alpaca approval claim and not ReFi `AccountAuthorization`.

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
| Which service receives customer onboarding data?              | **Not defined in alpha.3.** No BFF or backend operation receives applicant PII; the package forbids sending raw answers/documents to the trading backend. Where applicant data goes depends on the boundary Daniel binds (questions 1–2, A1).                                                                                             |
| Which service receives Alpaca account status?                 | **None in alpha.3.** No Alpaca account-status field exists. The backend schema has a `KycVerifications` table (provider, status, level, …) and Daniel's lifecycle checklist plans "KYC status/initiation" routes, but none are exposed.                                                                                                   |
| Which service exposes KYC/account-approval status to the BFF? | `getKycStatus` returns a **constant** projection: `status=NOT_REQUIRED`, `level=CLOSED_US_INVITE_ALPHA`, `public_launch_eligible=false`, `policy_version`. No provider, reason, timestamp or action-required field.                                                                                                                       |
| Is account status in account truth?                           | `Account.status`, `management_scope_status`, `reconciliation_hold_status` and `AccountValuation.status` are **free strings without a declared vocabulary** (examples `active`, `ACTIVE`, `CLEAR`, `READY`). `AccountAuthorization.status` ∈ `AUTHORIZED\|DENIED\|PENDING\|SUSPENDED` with **unenumerated** `reason_codes`.                |
| Does the frontend need a dedicated projection?                | **Yes, but it can only be contract-backed from `BrokerageConnection`** (`connection_status` ∈ `PENDING_VALIDATION\|CONNECTED\|STALE\|ERROR\|DISCONNECTING\|DISCONNECTED\|REVOKED`; `credential_status` ∈ `PENDING\|VALID\|INVALID\|ROTATING\|REVOKED`). See §5.                                                                           |

**Consequence.** The frontend does not possess a contract-supported Alpaca
onboarding state machine and must not invent one. The integration boundary for
the Alpaca account/KYC step is a **Daniel dependency** (packet, "Alpaca account
onboarding and KYC/CIP"). The frontend does not choose among the possible
implementations listed in §2.

## 4. Customer data collection and the PII boundary

Today **ReFi collects no brokerage-application PII** (legal name, date of birth,
residential address, tax residency and identifier, citizenship, phone,
employment, affiliations, investment profile, trusted contact, documents):
no contract operation accepts them and the boundary that would is TBD. ReFi collects only what
its own advisory/eligibility records require (jurisdiction, advisory profile
answers, disclosures, consents) plus the Stytch-verified email.

Do not implement new personal-data fields until a backend contract or the
Alpaca onboarding path requires them. If the bound path routes applicant data
through ReFi or Daniel's backend, the fields and their authoritative store are
defined by that contract version, not by the frontend.

| Field / artifact                                                                                | Browser collects | → ReFi BFF        | → Daniel backend            | → Alpaca                                 | ReFi stores               | Encrypted           | Retention          | Advisory record? | Brokerage-only? |
| ----------------------------------------------------------------------------------------------- | ---------------- | ----------------- | --------------------------- | ---------------------------------------- | ------------------------- | ------------------- | ------------------ | ---------------- | --------------- |
| Email (Stytch-verified)                                                                         | yes              | yes               | yes (identity result claim) | no (user's own Alpaca login is separate) | yes (session/subject map) | at rest (Firestore) | account lifetime   | yes              | no              |
| Jurisdiction / eligibility answers                                                              | yes              | yes               | evidence hash only          | no                                       | yes (decision evidence)   | at rest             | per records policy | yes              | no              |
| Advisory profile answers                                                                        | yes              | yes               | evidence hash only          | no                                       | yes                       | at rest             | per records policy | yes              | no              |
| Disclosures / consent receipts                                                                  | yes              | yes               | `recordConsent`             | no                                       | yes                       | at rest             | per records policy | yes              | no              |
| Alpaca API key pair                                                                             | yes (once)       | pass-through only | yes (credential custody)    | n/a                                      | **never**                 | n/a (not retained)  | none               | no               | yes             |
| Legal name, DOB, address, tax id, citizenship, phone, employment, affiliations, trusted contact | **no** (today)   | no                | no                          | boundary TBD                             | **never**                 | n/a                 | none               | no               | yes             |
| Government ID images / biometrics                                                               | **no**           | no                | no                          | boundary TBD                             | **never**                 | n/a                 | none               | no               | yes             |

Rules: never persist government ID images, biometric evidence or tax
identifiers in ReFi Firestore unless an approved architecture explicitly
requires it; never log onboarding payloads or credentials (existing IB controls
cover the key pair). This table is re-issued against the bound contract before
any PII path is implemented.

## 5. Brokerage onboarding state — no runtime model until Daniel binds it

Product states the investor experience will eventually need (mandate §8: not
started, application started, information required, under review, approved,
rejected, action required, account active, restricted) have **no authoritative
backend field in alpha.3**. Per founder review 2026-09-10 no runtime state
model, projection module or wording set for them is introduced; a speculative
projection added earlier on this branch was removed. What exists today is the
existing `BrokerageConnectionView` in
`apps/web/src/lib/investor-api/brokerage-connection.ts`, which projects only the
alpha.3 `connection_status` / `credential_status` truth and makes no
onboarding/KYC claim.

Wording rules that will apply once a binding exists: describe the brokerage
state; never collapse non-approved states into "KYC failed"; never display
"ReFi approved your identity", "SEC verified", "KYC certified" or "Fully
verified".

## 6. Action-required flow

Alpaca requires more information → the investor completes it through whatever
path the bound boundary defines → the updated status reaches ReFi through the
Daniel-defined binding → the investor continues after approval. No handling is
implemented for this until the binding exists. ReFi never overrides Alpaca's
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
owns CIP. Whether the attestation should therefore carry `not_required` or a `passed`
derived from a backend binding is **his call** (packet question 8, "K1"). Until answered the attestation chain keeps stopping at
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

## 8. Existing generic KYC seams — audited, not refactored

Founder review 2026-09-10: no refactor, rename or re-homing of `lib/kyc/` into
Alpaca onboarding code until Daniel answers A1. The file-by-file classification
(demo/mock only · historical unused · connected runtime dependency · generic
frontend gate) with importers, runtime paths, connected-mode use, removability
and A1 dependency is in `lib-kyc-classification.md`. Summary: no vendor SDK,
secret, env or name exists; the mock adapter and its controls stay inside the
demo boundary; connected native mode fails closed against mock evidence
(env invariant on mock controls, provenance refusal at attestation, release
policy withholding the mock action). Hardening candidate F-1 (force
`REFI_KYC_PROVIDER=unconfigured` on connected deployments) is recorded, not
applied.

## 9. Alpaca PAPER only

Initial connected execution is **Alpaca PAPER** (`account_environment=paper`,
hard-coded in `brokerage-connection.ts`). No live keys, no live capital.
Brokerage approval in the Alpha is never described as approval for live-capital
investing.
