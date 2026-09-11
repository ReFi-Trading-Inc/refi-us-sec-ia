# Alpha Activation Readiness Matrix and launch assessment — 2026-09-10

`main` = `a6a3f18129384e8872059ad2484e33f595543b46` (#105 merge `6a1d505`, #106 merge
`a6a3f18`). Contract `v1.1.0-alpha.3`, digest
`5eca1200f6af807093ea0986f835235e2da478b69478e621fd54954ba1d77608`.
Phase: **US Investor Integration Foundation** (unchanged). KYC/CIP model:
**Alpaca-owned brokerage KYC/CIP** (`decision-kyc-model.md`).

Exact distinctions (founder review 2026-09-10): **ALPACA KYC/CIP POLICY
DECISION: COMPLETE** ≠ **ALPACA KYC/CIP INTEGRATION: DANIEL DEPENDENCY**;
**ALPACA ONBOARDING BOUNDARY: DANIEL DEPENDENCY** ≠ **BROKERAGE CONNECTION:
CODE COMPLETE, FIXTURE-PROVED**. No Alpaca application/KYC runtime state exists
in the frontend.

Status vocabulary (exactly one per row): CODE COMPLETE · EXTERNAL ACTIVATION
REQUIRED · DANIEL DEPENDENCY · CONNECTED ACCEPTANCE REQUIRED · BLOCKED.
"CODE COMPLETE" means the frontend/BFF code exists on `main` with fixture-level
tests; it never means connected-accepted.

## Matrix

| Row                            | Status                            | Evidence / what is missing                                                                                                                                                                         |
| ------------------------------ | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stytch project                 | EXTERNAL ACTIVATION REQUIRED      | founder creates the project (`founder-activation-actions.md` §Stytch)                                                                                                                              |
| Stytch credentials             | EXTERNAL ACTIVATION REQUIRED      | project id/secret into Secret Manager; `REFI_AUTH_PROVIDER=stytch`; code path exists (#104)                                                                                                        |
| Stytch redirect                | EXTERNAL ACTIVATION REQUIRED      | exact HTTPS redirect `https://<bff host>/us/auth/callback` = `REFI_AUTH_CALLBACK_URL`                                                                                                              |
| connected GCP project          | EXTERNAL ACTIVATION REQUIRED      | `refi-us-connected-investor` not created; provisioning script on #98 (unmerged, not executed)                                                                                                      |
| runtime service account        | EXTERNAL ACTIVATION REQUIRED      | email + uniqueId needed for Appendix A and Daniel's admission                                                                                                                                      |
| Firestore                      | EXTERNAL ACTIVATION REQUIRED      | durable connected store code exists (#103); database not provisioned                                                                                                                               |
| Secret Manager                 | EXTERNAL ACTIVATION REQUIRED      | secrets listed in founder actions §GCP 8                                                                                                                                                           |
| KMS Investor assertion key     | EXTERNAL ACTIVATION REQUIRED      | signer code exists (#102); key `assertion` not created; `kid` unknown                                                                                                                              |
| KMS identity-bridge key        | EXTERNAL ACTIVATION REQUIRED      | bridge signer code exists (#105); key `identity-bridge` not created                                                                                                                                |
| Cloud Run BFF                  | EXTERNAL ACTIVATION REQUIRED      | image/service not deployed; needs project, SA, secrets                                                                                                                                             |
| identity JWKS                  | CODE COMPLETE                     | `/.well-known/identity-bridge-jwks.json` served from the bridge key; publishes a real `kid` only after KMS activation                                                                              |
| Investor API JWKS              | CODE COMPLETE                     | `/.well-known/jwks.json`; same activation note                                                                                                                                                     |
| Daniel B1 addendum             | DANIEL DEPENDENCY                 | bound Dev connection addendum (URLs, audiences, JWKS/kid, revisions, admitted SA, acceptance conditions) referencing the alpha.3 digest                                                            |
| closed Alpha admission binding | DANIEL DEPENDENCY                 | backend-issued invitations (B3) and `closed_alpha_campaign_scope` (value null in `capabilities.json`); frontend gate + fixture tests exist                                                         |
| Alpaca KYC/CIP policy decision | CODE COMPLETE (decision recorded) | founder decision 2026-09-10 in `decision-kyc-model.md`; a policy status, not an integration status                                                                                                 |
| Alpaca onboarding boundary     | DANIEL DEPENDENCY                 | alpha.3 exposes no account-opening, applicant, KYC/CIP application or application-status operation; journey step marked EXTERNAL BOUNDARY TBD; packet questions 1–2 (A1)                           |
| Alpaca KYC/CIP integration     | DANIEL DEPENDENCY                 | no runtime state, projection or wording introduced; depends on the boundary above and on the attestation `kyc` evidence question (packet question 8 (K1))                                          |
| Alpaca PAPER account           | EXTERNAL ACTIVATION REQUIRED      | a real Alpaca paper account + key pair for each test identity (Alpaca-side, outside ReFi); `alpaca_fixture_credential_pair` pending_external                                                       |
| brokerage connection           | CODE COMPLETE                     | FIXTURE-PROVED: create/list/get/rotate/disconnect adapters on `main`; expects an existing account/credential relationship; connected acceptance still required (`connected_alpaca_verified=false`) |
| account sync                   | CONNECTED ACCEPTANCE REQUIRED     | sync adapter + freshness handling on `main`; unproved against remote                                                                                                                               |
| AccountAuthorization           | CONNECTED ACCEPTANCE REQUIRED     | read + 403 `ACCOUNT_AUTHORIZATION_REQUIRED` handling on `main`; backend rules unproved; `reason_codes` unenumerated (Daniel)                                                                       |
| Signal adapters                | CODE COMPLETE                     | reads, catalog, preferences (+ alpha.3 confirmation), preview, records, events on `main` with fixture tests                                                                                        |
| Records Center                 | CODE COMPLETE                     | account-records routes (access-logged) on `main`                                                                                                                                                   |
| multi-user isolation           | CODE COMPLETE                     | two-user cross-user isolation harness on `main` (fixture); genuine two-identity run = CONNECTED ACCEPTANCE later                                                                                   |
| Managed Paper adapters         | CODE COMPLETE                     | allocation preview/join/update/leave, rotate/sync, economic gating on `main`                                                                                                                       |
| execution lifecycle            | DANIEL DEPENDENCY                 | backend-owned (intents → plans → orders); frontend only observes receipts/events                                                                                                                   |
| fills                          | DANIEL DEPENDENCY                 | backend-owned; surfaced via events/records only after remote acceptance                                                                                                                            |
| reconciliation                 | DANIEL DEPENDENCY                 | backend-owned; `reconciliation_hold_status` vocabulary unbound                                                                                                                                     |

Nothing is BLOCKED in the sense of "cannot proceed once its owner acts"; every
non-code row has a named owner and action.

## Launch distance (revised for Alpaca-owned KYC/CIP)

No calendar estimate is stated; each phase is gated by the named dependencies.

### Code readiness — what remains to write

1. Nothing for the Alpaca account/KYC step until Daniel answers questions 1–2: no
   projection, state model or wording is written against an unbound boundary.
2. After questions 1–2 / 8: the attestation `kyc` evidence rule (`not_required` vs a
   bound `passed`), retiring `KYC_EVIDENCE_MOCK`/`_MISSING` as the standing
   outcome.
3. After questions 1–2: whatever `lib/kyc/` change the bound boundary requires, per
   `lib-kyc-classification.md` (audit only today; hardening candidate F-1
   recorded, not applied).
4. Appendix A packet values once provisioning exists (mechanical).
5. Optional: `reason_codes` / `required_steps` handling once Daniel publishes
   vocabularies.

### Infrastructure readiness — what must be provisioned (founder)

GCP project, billing, APIs, Artifact Registry, Cloud Run service, runtime SA +
IAM, Firestore, Secret Manager secrets, KMS `assertion` + `identity-bridge`
keys, Cloud Run deployment; Stytch project, redirect URI, magic link + OTP,
credentials. None started; separate activation approval required.

### Daniel readiness — what must be supplied

B1/Step 4 bound addendum; B3 test identities/invitations; the Alpaca block (questions 1–10: boundary, onboarding
ownership, applicant data, status, readiness, ordering, attestation `kyc`
evidence, addendum, B3 accounts); `brokerage_mutation`
error-profile answer; vocabularies for `reason_codes`, `required_steps`,
`Account.status`, `management_scope_status`, `reconciliation_hold_status`;
`closed_alpha_campaign_scope` value; exact remote services and audiences.

### Alpaca readiness — what must be proven

The account/KYC step itself is boundary-TBD (questions 1–2, A1). Independently: a real
Alpaca **PAPER** account/credential relationship per test identity; credential
validation + sync through Daniel's integration (`connected_alpaca_verified` →
true).

### Connected Identity Alpha — exact remaining conditions

genuine Stytch login · identity bridge signed by the KMS bridge key · remote
identity exchange against identity-ccid · durable cloud session state in
Firestore · backend identity resolution · account ownership resolution ·
closed-Alpha admission gate proved with a backend-issued invitation. **No
separate third-party KYC provider is required.**

### Connected Signal Alpha — exact remaining conditions

admitted real user · Alpaca account/KYC step completed through the bound
boundary (TBD) · real brokerage connection `CONNECTED`/`VALID` · fresh account truth ·
attestation accepted per K1 · Signal data (catalog, preferences, records) from
the remote Investor API · records access-logged · two-user isolation proved
with two real identities.

### Managed Paper Alpha — exact remaining conditions

Alpaca PAPER connection · `AccountAuthorization=AUTHORIZED` from the backend ·
confirmed preferences (acknowledgment continuation) · template membership
ACTIVE · risk decisions, execution plans, orders, fills and reconciliation
observed through backend receipts/events · Daniel's execution scope admitted
for the cohort. No live keys; no live capital.
