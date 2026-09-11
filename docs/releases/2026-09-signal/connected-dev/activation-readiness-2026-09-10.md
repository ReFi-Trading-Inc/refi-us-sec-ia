# Alpha Activation Readiness Matrix and launch assessment — 2026-09-10

`main` = `a6a3f18129384e8872059ad2484e33f595543b46` (#105 merge `6a1d505`, #106 merge
`a6a3f18`). Contract `v1.1.0-alpha.3`, digest
`5eca1200f6af807093ea0986f835235e2da478b69478e621fd54954ba1d77608`.
Phase: **US Investor Integration Foundation** (unchanged). KYC/CIP model:
**Alpaca-owned brokerage KYC/CIP** (`decision-kyc-model.md`).

Status vocabulary (exactly one per row): CODE COMPLETE · EXTERNAL ACTIVATION
REQUIRED · DANIEL DEPENDENCY · CONNECTED ACCEPTANCE REQUIRED · BLOCKED.
"CODE COMPLETE" means the frontend/BFF code exists on `main` with fixture-level
tests; it never means connected-accepted.

## Matrix

| Row                              | Status                        | Evidence / what is missing                                                                                                                                                |
| -------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stytch project                   | EXTERNAL ACTIVATION REQUIRED  | founder creates the project (`founder-activation-actions.md` §Stytch)                                                                                                     |
| Stytch credentials               | EXTERNAL ACTIVATION REQUIRED  | project id/secret into Secret Manager; `REFI_AUTH_PROVIDER=stytch`; code path exists (#104)                                                                               |
| Stytch redirect                  | EXTERNAL ACTIVATION REQUIRED  | exact HTTPS redirect `https://<bff host>/us/auth/callback` = `REFI_AUTH_CALLBACK_URL`                                                                                     |
| connected GCP project            | EXTERNAL ACTIVATION REQUIRED  | `refi-us-connected-investor` not created; provisioning script on #98 (unmerged, not executed)                                                                             |
| runtime service account          | EXTERNAL ACTIVATION REQUIRED  | email + uniqueId needed for Appendix A and Daniel's admission                                                                                                             |
| Firestore                        | EXTERNAL ACTIVATION REQUIRED  | durable connected store code exists (#103); database not provisioned                                                                                                      |
| Secret Manager                   | EXTERNAL ACTIVATION REQUIRED  | secrets listed in founder actions §GCP 8                                                                                                                                  |
| KMS Investor assertion key       | EXTERNAL ACTIVATION REQUIRED  | signer code exists (#102); key `assertion` not created; `kid` unknown                                                                                                     |
| KMS identity-bridge key          | EXTERNAL ACTIVATION REQUIRED  | bridge signer code exists (#105); key `identity-bridge` not created                                                                                                       |
| Cloud Run BFF                    | EXTERNAL ACTIVATION REQUIRED  | image/service not deployed; needs project, SA, secrets                                                                                                                    |
| identity JWKS                    | CODE COMPLETE                 | `/.well-known/identity-bridge-jwks.json` served from the bridge key; publishes a real `kid` only after KMS activation                                                     |
| Investor API JWKS                | CODE COMPLETE                 | `/.well-known/jwks.json`; same activation note                                                                                                                            |
| Daniel B1 addendum               | DANIEL DEPENDENCY             | bound Dev connection addendum (URLs, audiences, JWKS/kid, revisions, admitted SA, acceptance conditions) referencing the alpha.3 digest                                   |
| closed Alpha admission binding   | DANIEL DEPENDENCY             | backend-issued invitations (B3) and `closed_alpha_campaign_scope` (value null in `capabilities.json`); frontend gate + fixture tests exist                                |
| Alpaca onboarding path           | DANIEL DEPENDENCY             | alpha.3 has no account-creation operation; shipped model = investor self-opens an Alpaca account and connects API keys; Model A vs B confirmation = packet A1–A8          |
| Alpaca KYC/CIP status projection | DANIEL DEPENDENCY             | contract-backed projection over `BrokerageConnection` exists (`onboarding-projection.ts`); application/review/approval/rejection/restriction states unbound (A3/A4/A7/A8) |
| Alpaca PAPER account             | EXTERNAL ACTIVATION REQUIRED  | a real Alpaca paper account + key pair for each test identity (Alpaca-side, outside ReFi); `alpaca_fixture_credential_pair` pending_external                              |
| brokerage connection             | CONNECTED ACCEPTANCE REQUIRED | create/list/get/rotate/disconnect adapters on `main` (fixture-proved); `connected_alpaca_verified=false`                                                                  |
| account sync                     | CONNECTED ACCEPTANCE REQUIRED | sync adapter + freshness handling on `main`; unproved against remote                                                                                                      |
| AccountAuthorization             | CONNECTED ACCEPTANCE REQUIRED | read + 403 `ACCOUNT_AUTHORIZATION_REQUIRED` handling on `main`; backend rules unproved; `reason_codes` unenumerated (Daniel)                                              |
| Signal adapters                  | CODE COMPLETE                 | reads, catalog, preferences (+ alpha.3 confirmation), preview, records, events on `main` with fixture tests                                                               |
| Records Center                   | CODE COMPLETE                 | account-records routes (access-logged) on `main`                                                                                                                          |
| multi-user isolation             | CODE COMPLETE                 | two-user cross-user isolation harness on `main` (fixture); genuine two-identity run = CONNECTED ACCEPTANCE later                                                          |
| Managed Paper adapters           | CODE COMPLETE                 | allocation preview/join/update/leave, rotate/sync, economic gating on `main`                                                                                              |
| execution lifecycle              | DANIEL DEPENDENCY             | backend-owned (intents → plans → orders); frontend only observes receipts/events                                                                                          |
| fills                            | DANIEL DEPENDENCY             | backend-owned; surfaced via events/records only after remote acceptance                                                                                                   |
| reconciliation                   | DANIEL DEPENDENCY             | backend-owned; `reconciliation_hold_status` vocabulary unbound                                                                                                            |

Nothing is BLOCKED in the sense of "cannot proceed once its owner acts"; every
non-code row has a named owner and action.

## Launch distance (revised for Alpaca-owned KYC/CIP)

No calendar estimate is stated; each phase is gated by the named dependencies.

### Code readiness — what remains to write

1. Bind the brokerage onboarding projection to Daniel's answer (A3/A4/A8): either
   keep connection-only states (Model B) and reword the KYC page/account card to
   the brokerage wording, or add the status binding for the six unbound states
   (Model A, new contract version).
2. Attestation `kyc` evidence under Alpaca-owned CIP per K1 (`not_required` with
   Alpaca-CIP level/evidence_ref, or `passed` from a binding); retire
   `KYC_EVIDENCE_MOCK` as the standing outcome.
3. Refactor `lib/kyc/` provider-selection indirection into an
   external-verification/account-onboarding projection (rename `REFI_KYC_PROVIDER`
   semantics; keep the lifecycle state machine); remove the demo client's fake
   `passed` attestation block; reword `kycCopy` / "Identity verified" checklist
   label to brokerage wording.
4. Appendix A packet values once provisioning exists (mechanical).
5. Optional: enumerate `reason_codes` / `required_steps` handling once Daniel
   publishes vocabularies.

### Infrastructure readiness — what must be provisioned (founder)

GCP project, billing, APIs, Artifact Registry, Cloud Run service, runtime SA +
IAM, Firestore, Secret Manager secrets, KMS `assertion` + `identity-bridge`
keys, Cloud Run deployment; Stytch project, redirect URI, magic link + OTP,
credentials. None started; separate activation approval required.

### Daniel readiness — what must be supplied

B1/Step 4 bound addendum; B3 test identities/invitations; A1–A9 Alpaca
onboarding boundary; K1/K2 attestation evidence rule; `brokerage_mutation`
error-profile answer; vocabularies for `reason_codes`, `required_steps`,
`Account.status`, `management_scope_status`, `reconciliation_hold_status`;
`closed_alpha_campaign_scope` value; exact remote services and audiences.

### Alpaca readiness — what must be proven

A real Alpaca **PAPER** account per test identity with a key pair (opened at
Alpaca under Alpaca's own KYC/CIP); credential validation + sync through
Daniel's integration (`connected_alpaca_verified` → true); the behaviour of
Alpaca action-required / restricted states as seen through the backend.

### Connected Identity Alpha — exact remaining conditions

genuine Stytch login · identity bridge signed by the KMS bridge key · remote
identity exchange against identity-ccid · durable cloud session state in
Firestore · backend identity resolution · account ownership resolution ·
closed-Alpha admission gate proved with a backend-issued invitation. **No
separate third-party KYC provider is required.**

### Connected Signal Alpha — exact remaining conditions

admitted real user · Alpaca PAPER account opened and connected (KYC/CIP at
Alpaca) · real brokerage connection `CONNECTED`/`VALID` · fresh account truth ·
attestation accepted per K1 · Signal data (catalog, preferences, records) from
the remote Investor API · records access-logged · two-user isolation proved
with two real identities.

### Managed Paper Alpha — exact remaining conditions

Alpaca PAPER connection · `AccountAuthorization=AUTHORIZED` from the backend ·
confirmed preferences (acknowledgment continuation) · template membership
ACTIVE · risk decisions, execution plans, orders, fills and reconciliation
observed through backend receipts/events · Daniel's execution scope admitted
for the cohort. No live keys; no live capital.
