# Connected backend integration — ordered implementation checklist

Updated September 12, 2026 UTC. This is the **active frontend-repository work
queue** for Daniel/ReFinity on `integration/refinity-dev`. Start at the first
unchecked item below. It is the frontend execution view of backend `FI-001..010`,
not a replacement backend migration plan. The archived
[old roadmap](archive/pre-connected-dev/integration-roadmap.md) is historical:
Admin Portal proxy, Signal-first/Managed-later, game migration and production
cutover are not prerequisites for this work.

Read [the work split](integration-collaboration.md), the
[contract entry point](../packages/api-clients/contracts/investor-api/README.md)
and [actual deployment status](../infra/cloudrun/CONNECTED_DEV.md) before editing.
Use operation IDs and closed schemas in the package, not old comments or assumed
API names. References below are paths relative to this frontend checkout unless
explicitly marked **backend** (the separate ReFinity/GitLab repository).
References shortened to `src/lib/...` mean `apps/web/src/lib/...`.

## Target, ownership and current truth

Alpha means automated SP500-following trading through a dedicated user-linked
Alpaca account, not just constituents/recommendations. Users can sign up/sign in
and become admitted before connecting Alpaca. A ready broker, independent
AccountAuthorization, active portfolio subscription and percentage allocation
are separate prerequisites for trading. No frontend order construction, direct
Spanner/broker access, manual admission setter or second automation toggle.

- Daniel owns server/BFF/client integration, backend contracts/authority and GCP
  runtime. Zeshan owns UI/UX, pages/navigation, Socure/provider flows, questionnaire
  evaluation and compliance decisions. No screen redesign in this queue.
- The owner now permits an explicit development-only KYC-pass source for named
  test users. Step 2 defines it; do not weaken genuine provider provenance or
  enable blanket mock admission. Real KYC acceptance still belongs to Zeshan.
- Only `refinity-dev/us-west1` is in scope. GitHub frontend and GitLab backend
  stay separate. Vercel, game/demo, other projects and public DNS stay unchanged.
- Latest issued contract: **alpha.4**, content hash
  `a6db935b6a398bff00a7ccee4cb268ee565249bbd75c23e36594c9f6b698e7c3`.
  Client imports, generation, validation and CURRENT/TARGET now select alpha.4.
  Old versions are archived unchanged. Connected acceptance is still open; see
  [implementation status and exact remaining gates](alpha4-integration-status.md).
- Alpha.4 does **not** contain the new independent cohort-membership/admission/
  commercial-entitlement contracts proposed at backend FI-002/003/010. Backend
  owns implementing those and issuing any necessary successor. Do not invent
  missing endpoints or add fields to this immutable version.
- Frontend hosting/CI, native identity, named Firestore and separate KMS keys are
  verified. Actual Stytch login, exact backend trust activation and real BFF API/
  SSE acceptance are not thereby verified. `REFI_INVESTOR_API_ALLOW_REMOTE=0`
  remains until reviewed binding; KYC simulation must not change that by itself.

## Completed preparation — do not repeat

- [x] FI-001: integration branch created from shared main `b3e7a1a`; ownership
      and bidirectional merge procedure documented. At this audit branch HEAD is
      `f061a8e`; newer `main` changes exist through `866fc11` and are not merged yet.
- [x] FI-008 hosting subset: `refi-frontend-integration`, native runtime
      `refi-frontend-runtime@refinity-dev.iam.gserviceaccount.com`, Google subject
      `104683840377279941448`, named durable store and distinct KMS signers verified.
- [x] Integration-only Cloud Build CI/CD works, including candidate-at-zero-
      traffic verification and promotion. Source `639a9a2`, build
      `c236414c-00ad-44c9-926a-fbf667ed1a63` passed. Docs/Terraform-only edits skip
      application deployment; infrastructure is operator-reviewed, not CI-applied.
- [x] Whole alpha.4 package copied from backend checkout `07ae53be`; exact-byte
      comparison, bundled `validate` and `self-test` pass. This closes copying only.

## Ordered work

### 1. FI-005A — adopt the already-issued alpha.4 client

- [x] Rechecked branches/upstream. Owner now explicitly requests **no main merge**;
      both repositories use `integration/refinity-dev`. Main through `866fc11` was
      inspected, not merged. Preserve Zeshan’s provider work and deployment targets.
- [x] Read package MIGRATION/FUNDING and inspect
      `packages/api-clients/src/investor-api/{package,validation,client,errors}.ts`,
      `packages/api-clients/package.json`, package tests, and
      `apps/web/src/lib/investor-api/{upstream-state,recommendations,account-actions}.ts`.
      Update generation/import/version/hash pins, validators and CURRENT/TARGET
      metadata together; preserve validated `error.continuation` already implemented.
- [x] Update actual recommendation mappings: list `RecommendationSummary` vs
      detail `Recommendation`, lineage/summary/content/lifecycle statuses and
      timestamps. Remove assumptions of obsolete `status`, `freshness` and
      `estimated_turnover_percent`. Turnover is a decimal fraction. Do not fabricate
      old fields or treat `execution_eligible=false` as disabled account automation.
      Expose truthful server views; hand any required presentation adaptation to
      Zeshan without editing his screens or returning placeholder success values.
- [x] Carry nullable `funding_assessment` through preview/recommendation server
      responses. Preserve exact decimal strings, provenance and null semantics.
      Update alpha.3-era fixtures/assertions and conformance tests, preserving
      historic-package integrity tests. Archive old versions only with their test/
      import paths updated; no active runtime import may remain on an old version.

**Exit:** package conformance, generation, typecheck and focused client/BFF tests
pass on one coherent version. Alpha.4 adoption can finish before new FI-002/003
endpoints exist; do not wait to fix already-known funding/recommendation reads.

### 2. FI-003D — implement the development-only KYC acceptance source

Source/local tests are implemented; activation, backend deployment and real
withdrawal/independent-hold acceptance remain unchecked. Use the exact scope and
retirement procedure in [implementation status](alpha4-integration-status.md).

- [x] Inspect existing `apps/web/src/lib/kyc/{provider,provenance,index}.ts`,
      `src/lib/compliance/{attestation-mapping,attestation-submission}.ts`, server
      environment validation and related contract assertions. Existing generic mock
      evidence is intentionally rejected; setting `REFI_KYC_PROVIDER=mock` alone
      does not implement this requirement.
- [x] Add a separate, server-only development fixture boundary, proposed path
      `apps/web/src/lib/integration-dev/kyc-pass.ts`. Proposed controls are
      `REFI_INTEGRATION_KYC_MODE=off|test_pass|withdraw` (default off) and a server-only exact
      test-subject allowlist. Require project `refinity-dev`, the isolated integration
      service/runtime identity and a named test user. Missing/wrong scope refuses
      startup or fixture creation; never infer permission from `REFI_ENV=staging`
      (that is this frontend's security tier, not a Google project).
- [x] Emit the package's normalized `kyc.status=passed` through an explicitly
      labelled development evidence path. Retain reproducible fixture evidence,
      stable IDs and hash, developer-fixture provider/reference labels, decision
      version and monotonic sequence. Do not label it Socure or production-provider
      proof, fake provider callbacks, forge verified email or modify real provider
      provenance constructors. If an existing narrow wire field cannot honestly
      carry provenance, resolve it with the backend owner before changing schemas.
- [ ] Reuse actual attestation delivery/retry and backend recomputation. Make
      only the narrow adapter/guard change needed to accept authorized development
      evidence in this scope. Any backend allowance must enforce the same Dev/test
      boundary, not accept fixture provenance for ordinary users or future prod.
      Do not globally suppress the existing mock-provenance assertions.
- [x] KYC pass is **not** an investor-profile pass: retain existing questionnaire
      evaluation, pending/ineligible/review states and original evidence. It does not
      grant consent, membership, admission, payment, AccountAuthorization, brokerage
      readiness or execution scope. Use real authenticated test subjects and an
      explicitly approved Alpaca Paper account for economic tests. All other broker,
      snapshot, allocation, freshness, idempotency and audit paths stay real.
- [ ] Prove off/default, wrong project/service, non-allowlisted user, adverse
      profile, independent hold and replay/restart behavior. Test disabling the
      fixture and superseding/withdrawing its persisted attestation; turning off a
      flag must not leave indefinite test eligibility behind.

**Exit:** named development users can proceed through genuine backend admission
machinery with clearly simulated KYC only. No UI/provider flow changes, blanket
pass, invented admission endpoint or claim of real provider acceptance. This
owner-approved exception supersedes frozen package wording that forbids every
connected KYC mock; it does not relax final real-user acceptance.

### 3. FI-002/003/004 — close backend authority and connection gaps

- [ ] **Backend-owned:** implement independent accepted cohort membership;
      invitation expiry limits redemption only (configurable three-calendar-month
      default, shorter allowed). Do not silently extend old invitations or use an
      onboarding-status allowlist as membership. Existing accepted users must not
      lose membership merely because the invitation later expires.
- [ ] Persist canonical pre-broker admission, reasons, rule/evidence versions,
      decision/validity times and append-only history. Recompute on attestation,
      consent, membership/identity changes and expiries without another login. A
      positive KYC result must not clear unrelated holds. Admission supports no broker
      and no portfolio subscription; trading readiness remains separate.
- [ ] Complete normal disconnect drain/finalization and interrupted credential
      retirement (backend ATD-054/FI-004). AccountAuthorization must not block first
      connection or necessary maintenance; use ownership/action-specific protections.
      Align actual acknowledgment/error profiles. Existing operator cleanup is not
      normal disconnect acceptance.
- [ ] Define separate entitlement read semantics now; default trial is three
      calendar months for paper/live. Do not guess trial-start/billing authority or
      implement payment logic in this frontend step. Backend changes stay in GitLab.

**Exit:** focused backend provenance, expiry, isolation, idempotency and recovery
tests pass; missing public shapes are explicit. This work can run alongside
independent local frontend steps, but its corresponding connected gates stay open.

### 4. FI-005B — adopt a successor only when new wire shapes require one

- [ ] Backend verifies/issues any FI-002/003/004 contract additions, updates its
      stable discovery pointer and supplies migration/examples/conformance together.
      Do not rewrite alpha.4 bytes or invent future membership/admission endpoints.
- [ ] Vendor and select that verified successor atomically, reusing step 1's
      funded/recommendation adapters. Record explicit not-needed if all corrections
      fit current wire semantics; a version bump is not an end in itself.

**Exit:** frontend and backend agree on the actual selected package; absent
features remain pending, never synthetic successful reads.

### 5. FI-008B — finish login and exact native trust binding

- [ ] Reuse `src/lib/auth/connected-login.ts`, connected-session/replay storage,
      gateway/Google token providers and existing KMS signers. Stytch real login is
      separate from simulated KYC: obtain approved test-project credentials and exact
      callback registration if not already configured; never fabricate a verified
      login or persist secrets in this repo. First/return login must preserve identity.
- [ ] Use known runtime facts above, not the build SA or a new WIF pool. Google
      ID-token audiences remain `https://identity-ccid.dev.refi.internal` and
      `https://investor-api.dev.refi.internal`. Keep bridge, backend identity result
      and per-request Investor assertions distinct; original `auth_time`, optional
      `amr`, no `acr`, fresh per-attempt JTI and correct replay controls.
- [ ] Isolated origin is
      `https://refi-frontend-integration-182665799543.us-west1.run.app`; its callback
      is `/us/auth/callback`, and both public key endpoints already work. Selected
      final Investor JWKS remains `https://bff-dev.refi.trading/.well-known/jwks.json`.
      No silent DNS cutover: configure any temporary trust explicitly and preserve
      distinct `/.well-known/identity-bridge-jwks.json` and Investor keys.
- [ ] **Backend ATD-046:** verify/pin actual caller email/subject and upstream
      provider/issuer/audience/JWKS/redirects; publish digest-bound connection facts
      and enable reviewed integration scope. Only then set remote calls on. Resolve
      backend `user_id` from verified exchange, and owned `account_id` via
      `listAccounts`; never use email/external subject or local first-account guesses.

**Exit:** real first/repeat login, zero/one/many account selection, wrong caller/
audience/user/expiry and cross-account denials verified; durable session recovery
works. KYC simulation does not close the real-login or backend-binding gate.

### 6. FI-006 — complete broker and portfolio command integration

Logical action IDs, transient credentials and explicit environment adapters are
implemented locally. Unchecked items below retain connected/restart/UI-consumer
acceptance; they are not instructions to redo the completed adapter code.

- [x] Update non-KYC `src/lib/investor-api/{brokerage-connection,
brokerage-maintenance,account-actions,acknowledgment}.ts` and their BFF handlers.
      Explicit paper/live value goes to the backend's fixed host selection, not an
      arbitrary URL. UI selector remains Zeshan's work. Do not open Alpaca Broker API
      accounts, enable unapproved live trading or add SnapTrade in this phase.
- [ ] Keep credentials transient/write-only. Fix permanent allocation-preview
      hashes, minute-bucket sync identity and key-ID-only rotation identity: one
      logical action has a durable ID/body/key; identical retries preserve it, a new
      action gets a new ID. Never persist broker secrets in generic recovery state.
- [ ] Use exact decimal allocation fractions (`"0.25"` = 25%), fresh feasible
      preview and current versions for join/update. Stale previews require a new
      preview/key, not replay as new consent. Preserve acknowledgment continuation,
      actual version/hash-bound consent (`consent_key=disclosure_key`), new confirmation
      key and required If-Match. A 202 is pending, not connected, applied or filled.
- [ ] Poll action/connection/sync truth. Test connect, refresh, rotation, leave
      and normal disconnect, including ambiguous responses and restart recovery.
      Leave/disconnect stops future management, never implies liquidation.

**Exit:** success, denial, changed-input, exact replay, lost-response and
underfunding cases pass. Real destructive/economic tests require a named approved
account; do not reset the backend's ongoing owner account to test onboarding.

### 7. FI-007 — complete account reads, funding notices and activity

Funding projection, pagination and event renewal adapters are implemented. Final
checks below still require connected ownership/cursor/session acceptance.

- [x] Fix `portfolio.ts`/`pagination.ts` five-page/500-position truncation.
      Return all 503+ holdings through bounded pagination or explicit continuation;
      do not discard a truncation flag. Check connection and membership pages too.
- [x] Preserve canonical valuation/position decimals and freshness. Follow
      FUNDING.md for available allocated capital, required capital/equity, shortfall,
      limiting constituents and broker vs additional user minimums. SUFFICIENT does
      not override other gates; INCOMPLETE/null never means sufficient or zero.
- [ ] Wire `recommendations.ts`, `account-records.ts`, `events.ts` and BFF routes.
      Funding notices use existing `recommendation.updated` plus canonical detail;
      account/portfolio deduplication, initial load and reconnect recovery are
      required. Stale/superseded/null evidence cannot clear an active warning.
- [ ] Preserve SSE event IDs/envelopes, renew both credentials as needed, resume
      from last processed ID and refresh GETs after gaps. Account switch/logout
      closes old streams/caches. No buffering, cross-account cache or second ledger.
      Supply data/status hooks only; notice components/copy/design stay with Zeshan.

**Exit:** >500 positions, cursor expiry, funding states, stale/reordered events,
SSE reconnect and ownership denial pass; Records reflect real lifecycle truth.

### 8. FI-009 — connected development milestone (simulated KYC labelled)

- [ ] Use the package INTEGRATION Appendix C 41-operation inventory as the
      coverage reference. Reuse existing typed methods/tests; classify each as used
      by a workflow, callable/tested without a screen, or explicitly deferred with
      reason. No new screen merely to exercise an endpoint, no silently dropped route.
- [ ] Through the real BFF prove login → identity/owned account → attestations/
      actual consent → admission without broker → connect/sync → fresh account truth
      → preview/subscription/receipt → full holdings/recommendations/Records/SSE.
      Only KYC provider evaluation is simulated. Include denial, isolation, retry,
      revocation and expiry; do not certify real provider compliance from this run.
- [ ] Separate market-independent requests from approved trade-producing tests;
      market closure/stale inputs must produce honest blocked/pending states. Prove
      real buy/sell-to-close/reconciliation/audit only in approved market conditions.
- [ ] Record one compact result set: selected package/hash, frontend/backend
      revisions/binding, operation/scenario, real vs simulated, pass/fail/blocked and
      safe receipt IDs. Hand Zeshan only the remaining UI/UX/provider-owned changes.

**Exit:** available server/client integration is verified. Report unresolved
external inputs precisely; do not mark full Alpha or cohort acceptance complete.

### 9. FI-010 and final Alpha exit — after the integration milestone

- [ ] **Backend/business owners:** settle trial-start and billing source, then
      enforce configurable three-calendar-month grants/paid entitlement, provenance,
      expiry and queued-work rechecks. Nonpayment stops ordinary trading, not sign-in,
      membership/history or safe cancel/reconciliation; never auto-liquidate.
- [ ] **Zeshan:** finish real Socure/KYC/provider and UI integration. Disable the
      development fixture, supersede/withdraw test attestations and verify real
      provider evidence/revocation with existing contracts before real-user launch.
- [ ] **Joint:** merge reviewed work into shared main and test the exact combined
      revision. Run the full two-positive/one-negative-or-review campaign with real
      KYC; only positive trading cases need separate real Alpaca Paper accounts.
      Close remaining backend ATD acceptance/release gates and issue the immutable
      connected addendum. Do not repeat completed backend basket proofs without a
      relevant change, but do not substitute them for BFF/cohort acceptance.

**Final exit:** all required integration and independent Alpha gates pass with
real provider evidence, scoped execution and truthful package/release records.
Domain/public-launch decisions remain separately owned, not this coding queue.

## Verification and work rhythm

Use local generation/typecheck/client/BFF tests per coherent slice, then the
existing branch pipeline. Build/deploy related changes together; do not create
one evidence document or run a broad campaign per field. Preserve immutable
package formatting (`.prettierignore` already covers version directories).
Keep commits/pushes frequent; coordinate merges with Zeshan without changing
his Vercel deployment or provider behavior. A missing external value blocks only
its connected test, not independent implementation in the other numbered steps.
