# Alpha.4 integration — implementation and remaining gates

This is the compact implementation overlay for [the ordered checklist](integration-roadmap.md).
Work stays on `integration/refinity-dev` in each separate repository; nothing is
merged into main. No owner-account changes or trade submissions are part of this
market-closed checkpoint. UI/UX and Socure/provider evaluation remain Zeshan's work.

## Implemented on the integration branches

- Client generation, validation, examples and runtime pins select alpha.4.
  Old bundles moved unchanged into `packages/api-clients/contracts/investor-api/archive/`.
  Issued package bytes are immutable; current status lives here, not in the bundle.
- Recommendation list/detail use actual content/lifecycle status, timestamps,
  lineage, summary and nullable funding evidence. Turnover is converted exactly
  from a fraction when the compatibility view asks for percent. Missing historical
  template IDs use canonical detail, not guesses. The compatibility freshness
  view leaves unavailable policy/time fields empty; display helpers show a dash,
  not an invented timestamp. `canonical` detail is available for new consumers.
- Position, membership and connection reads exhaust bounded pagination (20 × 100) or fail explicitly. Valuation-history and recommendation lists expose
  continuation/truncation. No silent 500-position portfolio cutoff.
- Funding warnings are account-owned recommendation projections, grouped by
  template. Amounts stay decimal strings. Incomplete, null, stale, superseded or
  same-timestamp data cannot clear an existing warning. A strictly newer, fresh,
  current sufficient assessment can resolve it. `fundingComplete=false` means the
  page set is partial, not that absent portfolios are funded.
- Broker connection/rotation accept explicit paper/live selection and matching
  key prefixes; rotation also checks the stored connection environment. No
  arbitrary host input, Broker API account creation or new live-trading grant.
- Preview/join/update/leave/connect/rotate/sync BFF POSTs require a stable
  `Idempotency-Key` header. It identifies a **logical action**, not its permanent
  parameters or current minute. The server derives an account/action/connection-
  scoped upstream key; changed bodies under the same ID must be rejected by the
  backend. A deliberately new action gets a new ID, including a fresh preview
  after expiry. Exact retries retain the ID and payload.
- The broker hook retains only the opaque pending ID in sessionStorage; keys
  are transient and are not React Query mutation variables. Recovery requires
  re-entering the same pair. `resetOperation()` explicitly abandons that pending
  operation before a changed-credential attempt; no automatic new-key retry.
- Events invalidate canonical reads on initial/reconnect and on compliance,
  broker, allocation and trading-control events. Streams renew at 50 seconds
  through fresh session/scope/token validation. Expired cursors clear the browser
  resume ID and cause canonical refresh. Session/account changes clear cached
  account data, stream history and pending browser operation identity.
- Attestation routes always re-resolve owned accounts. Automated Alpha can
  forward eligible only when the existing profile evaluation and trusted KYC
  both permit it; legacy read-only stages stay pending. Questionnaire answers,
  scoring, real provider constructors and independent backend gates are unchanged.
- A durable decision journal separates account decision sequence from answer
  version, so new provider evidence can supersede a Dev fixture without asking
  users to resubmit their answers. Identical evidence/retries keep the same ID,
  effective time and sequence across processes. Conflicts are not auto-resubmitted.
- Backend branch: consent, attestation and allocation-preview idempotent replay
  return contract-required HTTP 201, not undeclared 200. Dev fixture ingress is
  restricted as below; invalid provenance uses existing 422 VALIDATION_ERROR.

## Development-only KYC source — implemented, OFF, not connected acceptance

`apps/web/src/lib/integration-dev/kyc-pass.ts` is an explicit test source, never a
production provider. No mock callbacks, forged login or blanket admission.

Activation needs all of these server-side facts, not browser parameters:

- `REFI_INTEGRATION_KYC_MODE=test_pass` (default `off`).
- `REFI_INTEGRATION_KYC_SUBJECTS`: exact backend opaque user IDs from authenticated
  `authId`, not emails, external login subjects or display names.
- `REFI_INTEGRATION_KYC_ACCOUNTS`: exact owned backend account IDs.
- `REFI_INTEGRATION_KYC_GENERATION`: positive integer, default 1; explicit renewal
  only. A fixture expires after four hours and never renews automatically.
- Project `refinity-dev`, service `refi-frontend-integration`, security tier
  `staging`, native-cloud-run credentials, provider `unconfigured`. A configured
  Socure/other provider cannot be overridden by this path.
- Metadata must confirm runtime SA
  `refi-frontend-runtime@refinity-dev.iam.gserviceaccount.com`.
- The backend guard must be deployed and `DEVELOPMENT_KYC_ACCOUNT_IDS` must name
  the same test accounts. It also requires Dev project/environment, exact native
  caller email and subject `104683840377279941448`, and bounded expiry.

Evidence says `refinity-dev-kyc-fixture-v1` / development-only simulated pass,
uses durable namespaced Firestore, and does not satisfy production provenance.
Real login, ownership, assessed profile, disclosures/consents, membership,
admission, AccountAuthorization, broker readiness and all execution gates remain.
No existing owner account is automatically allowlisted.

To retire: set mode `withdraw`, POST the existing authenticated attestation route
for each named test account, verify the backend's withdrawal acknowledgment, then
set mode `off` and remove allowlists. Withdrawal refuses to overwrite a real
provider decision. Switching a flag off alone does not revoke a persisted
attestation; the bounded expiry is the backstop. A later genuine provider decision
uses a higher durable sequence. Real connected withdrawal/hold tests remain open.

## Remaining work — do not confuse local coverage with live verification

1. **Login/trust:** the isolated deployment still has authentication unconfigured
   and remote backend calls off. No Stytch credential was found in the checked
   local configuration or project secrets. Obtain approved test-project values
   and callback registration, then verify exact backend bridge/Investor bindings.
   Keep the selected final JWKS URL; no silent DNS change or fabricated login.
2. **Backend delivery:** these backend corrections are on a separate GitLab
   integration branch, not deployed by the frontend pipeline. The current backend
   release script requires clean main equal to origin/main; do not merge or bypass
   that guard under this instruction. Use an explicitly reviewed development-branch
   release path before activating fixture acceptance.
3. **Authority:** independent membership/pre-broker admission and normal disconnect
   recovery remain backend FI-002/003/004, not new endpoints hidden in alpha.4.
   Billing/trial-start authority stays deferred; the agreed duration default is
   configurable three calendar months.
4. **Durable profile/submission state:** decision identity is durable, but existing
   profile-v2 answers/assessments directly use prototype storage. Submission records
   already select Firestore in this deployment; their state transitions and newest-
   acknowledged pointer still use non-atomic read/modify/write. Add tested atomic
   transitions and a durable profile adapter before claiming multi-instance
   onboarding/restart acceptance. Do not change questionnaire evaluation or simply
   flip versioned writes to Firestore without atomicity.
5. **UI handoff:** select paper/live explicitly, retain logical IDs across retries
   for allocation and maintenance controls, use exact new recommendation/funding
   fields and handle pending/refused outcomes. No new screen or provider flow was
   designed in this checkpoint; only compatibility formatting was adjusted.
6. **Connected acceptance:** verify real two-user ownership, consent/attestation
   replay, pre-broker admission, connect/sync, fresh preview/subscription, all
   holdings, warnings and SSE through the real BFF. Market-closed/stale gates stay
   intact. Trade-producing lifecycle tests require approved open-market conditions.

The 41 issued operations remain available through the typed client. Existing
simulator/client checks are local evidence only, not a claim that all 41 have been
accepted through real authentication. Follow the unchecked gates in the roadmap.

## Verification at this checkpoint

- 369 client/unit tests; full contract assertions; web typecheck; boundary tripwire
  (335 files, zero violations); connected deployment configuration tests: passed.
- 17 targeted Chromium tests against the production build and alpha.4 loopback
  simulator: onboarding reads/denials, disclosures/consent, recommendations and
  event delivery. Browser dependencies installed locally; no real credentials used.
- 7 deployment-controller tests; current package validate/self-test; alpha.2/3
  archived package validation; exact comparison with backend alpha.4: passed.
- Backend commit `28ade7a6` on GitLab `integration/refinity-dev`: all 180 Investor
  API regression tests passed (including the 95 focused API/security/funding tests).
  Pushed, not deployed.
- No trades, provider requests, live-user acceptance or runtime fixture activation
  are implied by these results. Deployment outcome is recorded separately below.

## Deployed frontend checkpoint — September 12, 2026 UTC

- Code commit `09842e4bac758238c652b616950c227f5f9522d9`, Cloud Build
  `0122dd1d-1c9d-4634-b5c4-240ea9b88487`: **SUCCESS**. Documentation-only follow-up
  commits do not redeploy this artifact.
- `refi-frontend-integration-00009-tad` serves 100% of the isolated service traffic.
  Origin: `https://refi-frontend-integration-182665799543.us-west1.run.app`.
- `/api/health` and both distinct JWKS endpoints return 200; anonymous dashboard
  and session calls return 401. The release pipeline also passed its native
  runtime identity, named Firestore and KMS probe before promotion.
- Authentication remains `unconfigured`, remote backend calls remain off, and
  development KYC is not activated. This is a verified deployment of the integration
  code, **not** verified connected user admission/trading.

## Main synchronization — September 12, 2026 UTC

Imported frontend main through `866fc11` into `integration/refinity-dev`, retaining
our alpha.4 implementation and isolated GCP configuration. Local backup branch
`backup/integration-before-main-6aae367` retains the exact pre-merge state.
The shared contract assertions merged cleanly and retain both sets of checks.
A pre-existing test-fixture typing issue was corrected; no provider flow was
rewritten. Both package/web typechecks, 369 client tests, full contract assertions,
boundary/deployment checks and 22 production-build Chromium tests passed.
KYC browser tests use the local mock, not Socure acceptance. No Socure provisioning
script was executed, and main and the separate GitLab backend were not modified.
