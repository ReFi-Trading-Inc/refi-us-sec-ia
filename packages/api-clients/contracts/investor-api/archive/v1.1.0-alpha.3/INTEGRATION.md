# Frontend integration next steps

As of 2026-09-09 UTC. Owners: frontend system team (BFF, sessions, user
authentication, compliance decisions and UI); ReFinity backend team (identity
linkage, account authority, brokerage, portfolio automation and execution).

This is the ordered integration work list accompanying **v1.1.0-alpha.3**.
It supersedes alpha.2 for new integration. Read the package README.md and
MIGRATION.md, then follow this document (also bundled as INTEGRATION.md).
The exact content digest is `bundle.json.package_content_sha256`; validate it
with the bundled tool. Alpha.2 remains unchanged as issued history, not the
current integration target. Alpha.3 corrects error profiles and documents the
native-Cloud-Run topology; methods, paths, request/response fields, JWT claims
and event shapes are unchanged.

**Handoff instructions:** deliver this Markdown file together with the complete
`v1.1.0-alpha.3/` directory, including `tools/`. The team currently has alpha.2
at `packages/api-clients/contracts/investor-api/v1.1.0-alpha.2`; vendor alpha.3
alongside it and update package.ts, validation.ts, generation commands and
version/hash assertions to select alpha.3. References to
backend source/planning below are audit references only: no backend checkout,
private correspondence or historical planning document is required to follow
this handoff. The package contains exact schemas/examples; this document supplies
the sequence, deployment correction and completion criteria. Do not copy
example account/template IDs into connected configuration.

Steps **0–3** and implementation of **5–8** can proceed immediately. Step **4**
is the unavoidable backend activation exchange; it blocks real cross-system
testing, not client/UI implementation. Return Appendix A in one batch. Backend
returns Appendix B, including invitations through a protected channel. Repeat
correspondence is needed only for changed bindings or a failed acceptance check.
Completion means every
applicable operation in Appendix C is wired, tested and observable—not merely
a successful login or brokerage connection.

## Starting state and explicit correction

The reviewed frontend snapshot is `a4326aa`; paths below are relative to that
frontend repository. Its nine vendored alpha.2 files matched the issued backend
package byte for byte. It must now upgrade to alpha.3. No frontend files were
changed during this audit; strict-client experiments used a temporary copy.

The issued connection sheet specifies external WIF and impersonation of the
backend-provisioned BFF service account. That was the external-hosting design,
not an absence of a decision. **The September 9 decision for GCP-hosted BFFs
supersedes that transport guidance:** use the actual Cloud Run runtime service
account's Google ID token directly. No runtime WIF exchange, service-account
JSON key or impersonation of a backend runtime account is needed. Frontend
deployment-pipeline federation is a separate concern. The existing backend WIF
pool remains an unused external-host fallback, not a native-path prerequisite.

Backend code now accepts an explicitly configured native email/Google uniqueId
pair at both boundaries and Terraform uses that same identity for invocation
IAM. Missing configuration does not admit a frontend caller. Backend admission
also now initializes canonical account preferences/domain state transactionally
when accepted frontend attestation and consent complete admission; it does not
reset existing preferences or require an operator bootstrap for those defaults.
Neither change enables trading for new accounts or removes any trading gate.
These repairs and the alpha.3 boundary correction are deployed: ready revisions
`identity-ccid-00010-ng9` and `investor-api-00022-chj`. The focused backend suite
passes 282 tests, including onboarding rollback, preservation of account defaults,
all public-route error profiles and transactional preference confirmation.
Eleven real-domain HTTP cases passed the actual frontend strict TypeScript/Ajv
client in a temporary copy, including a continuation-preserving adapter proof.
Package validation/self-test and reproducibility pass. This is local/deployment
verification, not proof of a real frontend-authenticated session.

Current connectivity is **not enabled**: the actual frontend runtime identity
and upstream user-identity trust are unbound; both API feature gates remain
disabled. Backend public JWKS returned HTTP 200 with one public key on September
9; selected frontend BFF JWKS returned HTTP 503. Some real broker execution and
reconciliation have been proved independently, but frontend-authenticated
HTTP/SSE acceptance and complete automated-Alpha acceptance remain open.

## Ordered checklist

### 0. Frontend: establish the package and automated-trading release scope

- [ ] From the extracted package directory run with Python 3.11+:

  ```bash
  python3 tools/conformance.py validate
  python3 tools/conformance.py self-test
  # Optional local development server, never given real credentials:
  python3 tools/conformance.py serve --host 127.0.0.1 --port 8765
  # In another terminal:
  python3 tools/conformance.py probe --base-url http://127.0.0.1:8765
  ```

  Reuse `@refi/api-clients/investor-api`; map operations by `operationId` in
  `openapi.json`. Its global server is Investor API, but identity operations
  have their own server. Never use `.invalid` placeholders as a real target.
- [ ] Audit `apps/web/src/lib/sec203a/release-policy.ts`,
  `apps/web/src/lib/bff/handler.ts` and `apps/web/src/lib/config/env.ts`.
  `REFI_RELEASE_STAGE` currently defaults to `signal`; that is **not** this
  automated Alpha's product scope. Make the supported subscription/allocation
  and preference workflows available for the invited automated cohort.
  Do not blindly set `managed_paper`: that branch currently admits every action
  in the frontend action enum, including capabilities absent from our package.
  Keep an explicit allowlist of the contracted operations. No direct order,
  admin intervention, risk override, transfer or liquidation route is added.
- [ ] Keep browser-facing BFF routes separate from identically prefixed
  outbound backend routes. Real onboarding, snapshots and trading views must
  use the frozen client, not prototype-store/demo projections. Frontend-owned
  questionnaire/session records remain frontend-owned.

**Done when:** package checks pass, every operation is mapped to its owning
BFF adapter/test, and no non-executing release flag silently blocks the required
portfolio workflows. Simulator success is local evidence only.

### 1. Frontend: bind a real GCP runtime identity

- [ ] Deploy the BFF with its own dedicated user-managed Cloud Run service
  account. Return its **actual** project, service name, region, ready revision,
  service-account email and Google `uniqueId`. Obtain the last two from
  `gcloud iam service-accounts describe EMAIL --project=FRONTEND_PROJECT
  --format='json(email,uniqueId)'`. Proposed names or the GitHub deployment
  service account are not runtime identity evidence.
- [ ] Implement native Google ID-token acquisition in
  `apps/web/src/lib/investor-api/gateway.ts` and its server environment schema.
  It currently has only a simulator bearer or an unavailable-credential error.
  Maintain **separate audience-bound token providers** for the two targets;
  a cached token may only be reused for its own audience and valid lifetime.
  Use runtime metadata/Google authentication libraries, not access tokens.
  No token or private key goes to the browser, logs, package or email.
  The ID token must identify the exact runtime SA by `email` and immutable
  `sub`, with `email_verified=true`; use the full-format metadata identity
  token when acquiring it directly. Do not substitute a human `gcloud` token
  or the CI deployment identity for the runtime acceptance test.

Connected server configuration must include `REFI_INVESTOR_API_MODE=client`,
`REFI_INVESTOR_API_ASSERTION_MODE=mint`,
`BFF_ASSERTION_ALLOW_EPHEMERAL_KEY=0` and the two base URLs below. Extend the
frontend-only credential-mode enum with a native mode and wire it to the actual
token provider; no existing enum value currently implements native Google
credentials. Set `REFI_INVESTOR_API_ALLOW_REMOTE=1` only after step 4.
Do not allow simulator credentials, MSW identity fallback or mock KYC controls
on that connected deployment. The BFF's browser session store, one-time login
state and result-JTI consumption must work across Cloud Run instances/restarts.

| Request destination (server environment value) | Exact Google ID-token `aud` |
| --- | --- |
| `REFI_IDENTITY_CCID_BASE_URL=https://identity-ccid-74kl57biwa-uw.a.run.app` | `https://identity-ccid.dev.refi.internal` |
| `REFI_INVESTOR_API_BASE_URL=https://investor-api-74kl57biwa-uw.a.run.app` | `https://investor-api.dev.refi.internal` |

These audiences are already configured Cloud Run **custom audiences**, not
resolvable service URLs. Correct the frontend migration-plan table that says
the audience is always the target service URL. Google token goes in
`Authorization: Bearer ...`; Investor user assertion is the separate
`X-Refinity-User-Assertion` header. Identity exchange receives the upstream
identity assertion in its JSON body, not that Investor header.
See Google's [service-to-service authentication](https://docs.cloud.google.com/run/docs/authenticating/service-to-service)
and [custom audiences](https://docs.cloud.google.com/run/docs/configuring/custom-audiences).

**Done when:** Appendix A contains deployed runtime identity facts and each
outbound target uses its own audience. Backend IAM acceptance waits for step 4;
no downloaded credential or shared backend service account is needed.

### 2. Frontend: complete real user authentication and return its trust facts

- [ ] Select and implement email-first authentication in the frontend system;
  do not wait for `identity-ccid` to send email challenges. It verifies a trusted
  upstream signed assertion and owns backend identity linkage, not a mailbox
  login service. Replace the MSW/demo session path in
  `apps/web/src/lib/bff/auth.ts` for connected Dev. Wallet login is not required.
- [ ] Return the provider ID, exact HTTPS assertion issuer, audience, public
  HTTPS JWKS URL and exact allowed HTTPS callback/redirect URIs. Also provide
  integration/security contacts. These are user-authentication trust facts,
  **not** Google service-token audiences, deployment-WIF claims or guessed URLs.
- [ ] Match the backend's closed upstream assertion profile below. If a hosted
  IdP emits an incompatible raw token, implement a frontend-owned ES256 bridge
  that first validates that IdP's real authentication result. Keep its logical
  trust/key boundary distinct from the per-request BFF assertion. Backend never
  accepts fabricated verified email, a demo subject or an unverified bridge.

The upstream profile is implemented by
`IdentityAssertionVerifier` (backend audit reference),
not a nonexistent `IdentityAssertionClaims` definition in the package:

- Protected header has exactly `alg=ES256`, `typ=JWT`, `kid`.
- Required claims are exactly `iss`, `aud`, `sub`, `email`, `email_verified`,
  `iat`, `nbf`, `exp`, `jti`, `sid`, `auth_time`; optional `amr` is a nonempty
  unique array of nonempty strings. `acr` and other extra claims are rejected.
- `iss`/`aud` must match the supplied and backend-bound upstream configuration;
  `email_verified` is boolean true. `sub` is a stable opaque external identity,
  not a real name, email address or backend `user_id`.
- `sub`, `jti`, `sid` match `^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$`.
  Timestamps are integer Unix seconds; lifetime is at most 300 seconds, with
  30 seconds clock skew. Preserve actual underlying `auth_time`, never replace
  it with assertion-mint time. No account ID, permissions or compliance verdict
  is embedded in this identity token.

Provider ID must match `^[a-z][a-z0-9_-]{1,31}$`; upstream audience is one
nonempty string of at most 256 characters, not a JWT audience array. HTTPS
issuer/JWKS/redirects must have no embedded credentials or fragments; redirect
URIs match exactly, without wildcard or implicit trailing-slash normalization.
If an IdP subject contains characters outside the opaque-ID pattern, keep a
durable frontend mapping to an opaque ID; do not derive it from mutable email.

**Done when:** a real verified login produces the closed assertion above,
repeat login preserves external identity, failed/unverified login cannot mint
one, and issuer/audience/JWKS/provider/redirect values are ready in Appendix A.

### 3. Frontend: activate BFF signing and the already-selected public JWKS

- [ ] Make `https://bff-dev.refi.trading/.well-known/jwks.json` operational,
  public and key-only; this URL is already selected, not a new requested choice.
  Wire `apps/web/src/lib/investor-api/user-assertion.ts` to the real signer.
  GCP KMS P-256 signing is compatible; publish its corresponding public EC JWK
  with the same `kid`. Test JOSE ES256 signature encoding and rotation against
  the actual verifier. Do not publish private material.
- [ ] Preserve these existing application JWT pairs without renaming:

| Token | `iss` | `aud` |
| --- | --- | --- |
| Backend identity result verified by BFF | `urn:refinity:identity-ccid:dev` | `urn:refinity:frontend-bff:dev` |
| BFF per-request Investor assertion | `urn:refinity:bff:dev` | `urn:refinity:investor-api:dev` |

Backend identity-result verification JWKS is
`https://identity-ccid-74kl57biwa-uw.a.run.app/.well-known/jwks.json`.
Follow package `IdentityHandoffResult` and `BffAssertionClaims`, including
protected `kid`, ES256, short lifetime, replay control and original `auth_time`.
`amr` is optional in Alpha; preserve it unchanged when present. Correct the old
frontend auth comments saying it is required or that the JWKS URL is undecided.

The per-request BFF token has exactly `iss`, `aud`, `sub`, `iat`, `nbf`, `exp`,
`jti`, `sid`, `auth_time`, plus optional `amr`; do not copy the identity result's
`email` or `email_verified` into it. Its maximum lifetime is **120 seconds**
(the frontend's current 60-second mint is appropriate), not the upstream
identity assertion's 300 seconds. Use the same closed ES256/typ/kid header,
opaque-ID pattern and 30-second skew. SSE ends at assertion expiry; reconnect
with a freshly minted assertion while retaining the last processed event ID.
The old frontend comment that backend always returns `STEP_UP_REQUIRED` after
ten minutes is not a current alpha.2 operation guarantee. Preserve genuine
`auth_time` and frontend session/reauthentication policy, but do not wait for
an undocumented backend refresh/step-up endpoint or error to implement login.

JWKS must return JSON `{"keys":[...]}` with public keys containing distinct
`kid`, `kty="EC"`, `crv="P-256"`, `alg="ES256"`, base64url `x`/`y` and
optionally `use="sig"`; never `d`. JOSE ES256 signatures are 64-byte `r || s`,
not the DER signature encoding a KMS operation may return. All replicas must
serve the same key set. Publish the next public key before using it; retain
the retiring public key through cached-key and issued-token validity windows.
Backend JWKS caches are capped at 300 seconds, with 30-second negative-key
cache and 30-second clock skew. For planned rotation, publish at least five
minutes before switching and retain the old key at least ten minutes after
the last old-key token; emergency revocation uses backend coordination instead.

**Done when:** public JWKS works without a cookie/Google token, a freshly signed
token verifies against it from another instance, and rotation/restart tests
show no ephemeral-key or encoding failures.

### 4. Backend: apply returned non-secret bindings and open invited integration

- [ ] Backend reviews and applies `frontend_native_bff_binding` with the exact
  email and 21-digit Google uniqueId. It pins both API verifiers and grants
  only the required invocation rights. No frontend Spanner, trading, broker
  credential, backend KMS or backend-secret access is granted. Native and
  external-WIF configurations cannot be simultaneously selected.
- [ ] Backend configures upstream issuer/audience/JWKS/provider/redirects and
  operational BFF JWKS, verifies them, then enables the two API feature gates.
  Issue scoped invitations for real integration users through the existing
  backend invitation authority. Do not ask frontend to self-authorize admission
  or call an invented human-approval API.
- [ ] Backend returns a hash-bound Dev connection addendum recording the above
  exact runtime facts, revised authentication topology and availability. Until
  then do not promote `REFI_INVESTOR_API_ALLOW_REMOTE` or represent the frozen
  package's fixtures as connected acceptance. These are binding/deployment
  actions after steps 1–3, not another frontend contract redesign.
- [ ] **Adopt the backend's alpha.3 correction.** Alpha.2 already declares
  `consent_receipt_id` and `continuation_ref`; those fields are unchanged.
  Alpha.3 declares the preference acknowledgment/error profile and normalizes
  runtime action statuses and public errors. Apply MIGRATION.md. In the frontend
  client, extend `InvestorApiError` in `src/investor-api/errors.ts` to retain
  optional `components["schemas"]["ErrorEnvelope"]["error"]["continuation"]`;
  forward `envelope.error.continuation` in `failureFromResponse` in client.ts.
  Preserve that validated object through the BFF response and confirmation UI,
  for both preferences and disconnect. The reviewed client currently drops it.
  Do not parse error messages, bypass validation or reconstruct continuation
  fields. Backend HTTP/domain responses passed all eleven strict TypeScript client
  cases; the adapter change also passed in a temporary copy. Frontend must apply
  and test that small change in its own repository.

**Done when:** Appendix B is returned, real identity exchange/Investor requests
can run, alpha.3 is vendored and the acknowledgment adapter/confirmation flow
passes. Local verification is not real connected acceptance.
No new user is authorized to trade merely by opening transport: the backend
operator separately admits the named test accounts to execution and later
the reviewed Alpha cohort. Frontend never writes those controls.

### 5. Frontend: exchange identity and resolve account ownership

- [ ] Call the package `exchangeIdentity` operation with real upstream assertion
  and server-owned `state`, `challenge`, `nonce`, `redirect_uri`,
  `network_context`; include the issued invitation token for initial admitted
  onboarding. Use the exact `IdentityExchangeRequest` schema. Bind and verify
  browser login state server-side; `network_context` is a protected opaque
  rate-limit context, not raw PII or a newly random bypass value for each retry.
- [ ] Verify `data.identity_result` (JWT) against backend JWKS, signature,
  issuer/audience, expiry and request binding; reject replay before issuing a
  frontend-owned secure session. Persist identity-result JWT `sub` (the opaque
  backend `user_id`) as Investor assertion subject, plus `sid`, original `auth_time` and optional
  `amr`. Do not use an external IdP subject as the backend user ID.
- [ ] Use `listAccounts` to resolve canonical accounts for that user, then
  explicit selection when multiple exist. Remove prototype-store `all[0]` and
  demo-persona mappings from the real path. Account selection never establishes
  ownership; backend rechecks every account-scoped request.

For one login attempt generate independent cryptographically random base64url
`state`, `challenge` and `nonce` (22–128 characters); `network_context` uses the
same allowed encoding/length but a stable protected rate-limit identity.
These are opaque exchange bindings, **not** an undocumented backend PKCE
challenge endpoint. Bind the browser callback to the pending server-side
login and send the allowed redirect URI. The signed result contains no nonce,
state or account ID: verify the result against the expected pending exchange,
upstream email/session/authentication facts and actual response, not imaginary
JWT claims. The result retains upstream `iat`/`nbf`/`exp` and `sid`; exchanging
it does not renew its lifetime. Atomically consume its `jti` once in the BFF's
shared store before creating the session. No public backend consume endpoint
or DB access is required. A lost response can be recovered using the identical
still-valid exchange request; changed binding fields with the same upstream
JTI are rejected. Never create two sessions from a recovered result.

First login needs a backend-issued email/campaign-bound invitation. Confirm
campaign scope with Appendix B; omit acquisition for its default `direct`
scope unless the issued invitation specifies otherwise. Later login of an
already-linked identity does not require creating another account/invitation.
`joinWaitlist` is an authenticated acquisition/status operation, not an
anonymous signup route or a self-issued invitation. Game acquisition, if used,
must carry the legitimate frontend-owned handoff provenance from the package;
it never grants trading access. Do not turn it on using simulator receipts.

**Done when:** repeated login maps to the same backend user, session refresh
preserves original authentication time, zero/one/many accounts are handled,
and logout/account switching tears down old streams and cached account data.

### 6. Frontend: finish admission, then connect Alpaca without a circular gate

- [ ] Submit real, versioned compliance/profile attestations via the package;
  frontend owns their evaluation. Read effective disclosures and call
  `recordConsent` with `consent_key = disclosure_key`, exact version/hash and
  actual user action. That key mapping is already correct in the reviewed
  frontend snapshot. Do not invent a separate consent-key lookup or force
  eligible decisions just to bypass backend gates.
  Specifically, `apps/web/src/lib/compliance/attestation-mapping.ts` currently
  **builds but does not submit** the request and its types forbid emitting
  `trading_eligibility="eligible"`. Wire durable decision delivery to
  `createComplianceProfileAttestation`. The frontend decision owner must
  authorize and implement the real eligible path for invited Alpha users;
  do not replace every pending decision with eligible. The current KYC adapter
  choices are unconfigured/mock, so connect the actual frontend-approved
  evidence source or approved manual decision flow. `not_required` is supported
  only when that is the frontend decision owner's real policy, not a dev bypass.
- [ ] Remove the unconditional `getAccountAuthorization.status === AUTHORIZED`
  prerequisite in `apps/web/src/lib/investor-api/brokerage-connection.ts`.
  An admitted account with no connection legitimately reports `DENIED` with
  `BROKER_CONNECTION_MISSING`. Requiring trading authorization before calling
  `createBrokerageConnection` prevents the first connection. Guide the user
  through onboarding, then submit the owned-account connection command and
  handle its canonical result/errors; do not relabel DENIED as AUTHORIZED.
- [ ] Submit Alpaca key/secret and `account_environment` (`paper` or `live`)
  through the BFF to the canonical backend connection route. The reviewed UI
  currently restricts connection to paper: retain that explicit initial test
  choice, not a claim that the backend is paper-only. Expose environment
  selection before offering live accounts. Backend selects the allowlisted
  broker host. SnapTrade and custom-broker administration are not Alpha blockers.
- [ ] Never keep raw credentials in browser storage, traces or analytics.
  `202` is acceptance, not completed sync. Poll the returned connection/status
  and canonical snapshots; request the contracted sync when needed. Use
  backend account/activity endpoints, not browser Alpaca calls or direct DB
  access. Existing broker positions/orders must be reconciled, not silently
  adopted or ignored by frontend onboarding.

Attestation delivery rules (no questionnaire redesign is requested):

- `schema_version="1.0"`; `attestation_id` is stable for the decision and
  `decision_sequence` is a persisted, monotonically increasing account-wide
  integer, starting at 1. Changes in KYC, questionnaire or eligibility all
  consume a new sequence; do not use a questionnaire-only counter if those
  events can occur independently. Retry the exact old decision/body/key;
  changed decisions get new IDs/keys/sequences. Concurrent delivery must not
  let an older response replace the latest frontend state.
- Send `decision_version`, `kyc.status`, all four `investor_profile` fields
  (`status`, `profile_version`, `questionnaire_version`, `risk_band`),
  `trading_eligibility`, `effective_at` and `evidence_sha256` as defined in
  `ComplianceProfileAttestationRequest`. `decision_version` and risk-band
  labels are frontend-owned, not another backend vocabulary to request.
  Evidence SHA-256 is lowercase hex of the frontend's reproducible retained
  decision evidence; do not send raw answers/documents to the trading backend.
- Alpha admission requires effective accepted evidence with KYC `passed` or
  `not_required`, profile `eligible`, trading eligibility `eligible`, and
  effective consent. Other states remain real blocked/pending states.
  Expiry may be null/omitted under the schema; do not invent an expiry policy.
  If null, use current attestation as the primary profile status: the legacy
  advisory-profile compatibility projection currently omits non-expiring
  attestations. An empty legacy projection is not proof that submission failed.
- Deliver subsequent failed/withdrawn/expired decisions too. Use the backend
  returned `ACCEPTED`/`SUPERSEDED` and authorization projection, not HTTP 201
  alone, to update status. A stored attestation is not necessarily permission
  to trade. A withdrawn consent likewise must not be displayed as active.

**Done when:** either ordering of consent/attestation converges without manual
account rows, first connection is possible despite `BROKER_CONNECTION_MISSING`,
and `CONNECTED`/`VALID` plus fresh reconciled account truth—not a 202 alone—
drives the next onboarding step. Persist safe receipt/resource IDs for retry,
but clear credential input after transmission.

### 7. Frontend: integrate portfolio maintenance and observable completion

- [ ] Read catalog, preferences and fresh account truth after admission.
  Backend creates defaults and the SP500 execution policy; no VaR questionnaire
  or operator account reset is required. Obtain preview, then join/update with
  that preview and its freshness/version requirements. Allocation is a decimal
  fraction: `"0.10"` means 10%, not `"10"`.
- [ ] Treat subscription plus allocation as an instruction to automate the
  portfolio, not a non-executing signals subscription. Backend owns weights,
  risk checks, orders and reconciliation. Never reconstruct its execution
  decisions or add a frontend-supplied trading-enable flag.
  Convert a UI percentage to the exact decimal-string fraction using decimal
  arithmetic (25% → `"0.25"`), not a binary floating-point intermediary. Use
  returned portfolio/security IDs rather than display names or tickers as keys.
  Monetary values and quantities remain decimal strings through transport;
  formatting for display must not change a retried request's values. Alpha
  permits one active portfolio per account; do not expose multi-portfolio
  allocation until the backend policy/contracts support it.
- [ ] Display asynchronous receipt/connection/action state, snapshot freshness,
  Records and account events. Implement pagination and SSE resume through the
  BFF with account isolation; use canonical GET results after notifications.
  Keep per-attempt JWT `jti` fresh while retaining the same idempotency key and
  identical body for a retry of the same action. Follow each operation's
  conflict/step-up/continuation profile rather than blindly retrying mutations.

- [ ] Implement `leave_template` through `createAccountAction`, with only its
  `template_id` parameter: no zero allocation, preview, order, or liquidation.
  Show that future maintenance stops; existing assets remain. For credential
  rotation submit the complete new pair to `rotateBrokerageCredentials` on
  the same connection/environment; reconnecting paper as live requires normal
  disconnect then a new connection. Show `ROTATING`/`INVALID`/`REVOKED` and
  blocked or stale truth honestly. There is no separate public revoke endpoint
  in alpha.2: security emergencies go to backend operations; do not invent one.
- [ ] For normal disconnect, first send `disconnectBrokerageConnection` without
  a body. If it returns `ACKNOWLEDGMENT_REQUIRED`, display the exact requested
  disclosure/version/hash and exposure meaning, record actual consent, then
  retry with new `Idempotency-Key`, current connection `state_version` as
  `If-Match`, and body `{continuation_ref, consent_receipt_id}`. Poll until
  `DISCONNECTED`; `DISCONNECTING` may legitimately wait for cancellation and
  reconciliation. Leaving, disconnecting and revoking never imply liquidation.
  Do not run destructive lifecycle tests on an account with ongoing work
  without coordinating the test account with backend operations.
- [ ] For preferences use wire names `drift_threshold`, `min_order`,
  `excluded_assets`, `fractional_enabled`. Exclusions are canonical security
  IDs, not ticker strings; supplied nulls are invalid. Send current preference
  `version` as integer-string `If-Match` (not a snapshot version or arbitrary
  ETag). Re-read on conflict. For expanding/mixed confirmation, the schema
  already permits the same preference patch plus both `consent_receipt_id` and
  `continuation_ref`, using the recorded requested disclosure, a new key and
  current preference version. The initial acknowledgment error's client
  acceptance remains subject to the backend package correction in step 4.

**Done when:** preview/join/update/leave, preference updates, rotation/disconnect,
and every read/receipt/event branch in Appendix C operate through the real BFF
  with canonical state and no false trade-completed message.
Market-closed or stale-input periods may leave execution pending/blocked;
display the actual reason and latest snapshot time instead of prompting a
second subscription. Alpha uses IEX under backend freshness/price policy; SIP
or a frontend quote source is not an integration prerequisite.

### 8. Joint: prove the connected boundary before calling integration complete

- [ ] Run package conformance locally, then real two-credential positive and
  negative HTTP tests: wrong Google caller/subject/audience, invalid/expired
  user JWT, replay, unknown signing key, foreign-account and unauthenticated
  access. Do not share tokens in the resulting report.
- [ ] Use two real invited users for isolation: login/re-login, account
  resolution, attestation/consent, first Alpaca connection, sync, preferences,
  preview/join, receipt polling, Records and account-scoped SSE/reconnect.
  Credentials come from account owners through the actual flow, not package
  fixtures. Confirm no repeated manual backend row insertion is needed.
- [ ] Backend completes market-dependent full-basket/sell/reconciliation and
  capacity gates in the [ordered delivery specification](frontend_contract_delivery_alignment_checklist.md),
  separately from frontend transport completion. The final connection/release
  evidence must state what is actually proved; neither this list nor simulator
  success is an automated-Alpha readiness certificate.

**Done when:** record one concise acceptance matrix with operation ID, test
scenario, pass/fail/blocked, UTC time and safe correlation/receipt IDs. Include
package digest, frontend revision and backend binding-addendum identifier.
Prove the main journey with real authentication and real Alpaca paper accounts;
use deterministic fault injection for unsafe/uncontrollable negative cases
and label it as such. No fictional fixtures close real connected tests.
Full integration requires both frontend delivery and the backend-owned open
items in Appendix B to be closed; a blocked item must not be checked off.

## Appendix A — one return packet from frontend

Return the following non-secret facts to Daniel through the existing integration
channel. Null means **fill before requesting activation**, not an accepted
runtime placeholder. This is a coordination form, not an API request or a
Terraform file. No further architecture choice is needed from backend for
native service auth. Frontend chooses its own IdP, session store and GCP project;
backend resources remain in `refinity-dev/us-west1`.

```json
{
  "contract_version": "v1.1.0-alpha.3",
  "package_content_sha256": "c1b53c906653ca8860bf66cfc0df8fa862ff34d6cbf77298ac83cb55f006cb09",
  "runtime_auth_mode": "native_cloud_run",
  "frontend_project_id": null,
  "frontend_region": null,
  "frontend_service_name": null,
  "frontend_ready_revision": null,
  "frontend_source_revision": null,
  "frontend_runtime_service_account_email": null,
  "frontend_runtime_service_account_unique_id": null,
  "frontend_bff_base_url": "https://bff-dev.refi.trading",
  "frontend_bff_jwks_url": "https://bff-dev.refi.trading/.well-known/jwks.json",
  "frontend_bff_current_signing_kid": null,
  "upstream_identity_provider_id": null,
  "upstream_identity_assertion_issuer": null,
  "upstream_identity_assertion_audience": null,
  "upstream_identity_jwks_url": null,
  "upstream_identity_current_signing_kid": null,
  "allowed_redirect_uris": [],
  "integration_contact": null,
  "security_contact": null,
  "escalation_channel": null
}
```

Attach public JWKS/ready-revision test results and describe the verified login
source (hosted IdP or frontend bridge) and how opaque subjects remain stable.
Return uniqueId as a string, not a JavaScript number. The actual user invite
email(s), selected campaign and intended paper test-account owners can be
provided separately through the protected coordination channel. Never send
Alpaca secrets, JWTs, signing private keys, session cookies or invitation tokens
in this form. Frontend does not need to retrieve the backend owner's existing
paper credentials or an existing test fixture's external identity.

## Appendix B — backend deliverables; the only planned return dependencies

| ID | Backend action/output | Needed before |
| --- | --- | --- |
| B1 | Review Appendix A, bind exact caller email/subject and upstream trust, make both API gates operational; return hash-bound Dev connection addendum with exact audiences/URLs/JWKS, ready revisions/digests, enabled scope and integration/security/trading-operations contacts. It explicitly supersedes the old WIF fields, rather than pretending native values are WIF claims. | Real identity/API/SSE testing. Frontend implements steps 0–3 and 5–8 beforehand. |
| B2 | Supplied by alpha.3: corrected error profiles, runtime status/error mapping, exact bundle digest, MIGRATION.md and local conformance tooling. Eleven real-domain HTTP response cases pass the strict TypeScript client; continuation-preserving adapter change is separately proved in a temporary copy. Frontend vendors/regenerates alpha.3 and applies the adapter change in step 4. No new backend decision or confirmation fields are awaited. | Expanding/mixed preference branch and full contract integration acceptance. |
| B3 | Issue email/campaign-bound invitations for the agreed real test identities, arrange secure delivery, and identify the permitted account-level execution scope. IDs are resolved through exchange/listAccounts; backend may confirm safe IDs after that. | First connected onboarding; separate explicit execution admission before trade-producing subscription tests. |
| B4 | Provide the agreed market-session test opportunity and backend order/fill/reconciliation observations for the integration accounts; complete remaining full-basket/sell/capacity/recovery gates and issue truthful final connected-release evidence. | Declaring the automated Alpha operational end to end, not writing the frontend client/UI. |

B1–B3 can be returned together where ready. Keep completed independent work
moving while B4 waits on market conditions. Backend will not ask the frontend
for account snapshots, an Alpaca host URL, SP500 weights, VaR policy, database
credentials, a new BFF JWKS URL, WIF subject rules or a questionnaire rescore.
These are already defined here or remain backend/compliance-owner concerns.

## Appendix C — full operation-to-workflow coverage

Use this as the frontend implementation/test checklist; an operation need not
get its own screen. It must have a typed adapter and defined use/error behavior.
No direct broker/admin/order API is implied. In this table `I` expands to
`/api/v1/investor`, `A` to `I/accounts/{account_id}` and `C` to
`A/brokerage-connections/{connection_id}`. Actual request/response definitions,
parameters and allowed error codes are under the operation in `openapi.json`;
matching reusable types are in `schemas.json`, example bodies in
`examples.json.requests` and response cases in `examples.json.responses`.
Do not concatenate these abbreviations at runtime: use the generated routes.

| Done | Workflow | Operation ID | Method and path |
| --- | --- | --- | --- |
| [ ] | Public identity verification key | `getIdentityJwks` | GET `/.well-known/jwks.json` on Identity |
| [ ] | Login exchange | `exchangeIdentity` | POST `/api/v1/identity/exchanges` on Identity |
| [ ] | Account selection | `listAccounts` | GET `I/accounts` |
| [ ] | Account overview | `getAccount` | GET `A` |
| [ ] | Current trading eligibility, not broker-connect prerequisite | `getAccountAuthorization` | GET `A/authorization` |
| [ ] | Onboarding status | `getOnboardingStatus` | GET `I/onboarding/status` |
| [ ] | Eligibility projection | `getEligibility` | GET `I/eligibility` |
| [ ] | KYC projection | `getKycStatus` | GET `I/kyc` |
| [ ] | Legacy profile history/empty state | `listAdvisoryProfiles` | GET `I/advisory-profiles` |
| [ ] | Legacy profile current/empty state | `getCurrentAdvisoryProfile` | GET `I/advisory-profiles/current` |
| [ ] | Deliver frontend decision | `createComplianceProfileAttestation` | POST `A/compliance-profile-attestations` |
| [ ] | Current decision truth | `getCurrentComplianceProfileAttestation` | GET `A/compliance-profile-attestations/current` |
| [ ] | Decision history | `listComplianceProfileAttestations` | GET `A/compliance-profile-attestations` |
| [ ] | Acquisition/status, no self-admission | `joinWaitlist` | POST `I/waitlist` |
| [ ] | Effective disclosure/version/hash | `listEffectiveDisclosures` | GET `I/disclosures` |
| [ ] | Accept/withdraw consent | `recordConsent` | POST `I/consents` |
| [ ] | Consent history/status | `listConsents` | GET `I/consents` |
| [ ] | Connected broker inventory | `listBrokerageConnections` | GET `A/brokerage-connections` |
| [ ] | Initial Alpaca credentials | `createBrokerageConnection` | POST `A/brokerage-connections` |
| [ ] | Connection/sync polling | `getBrokerageConnection` | GET `C` |
| [ ] | Replace complete credential pair | `rotateBrokerageCredentials` | POST `C/credentials/rotate` |
| [ ] | Refresh canonical account truth | `syncBrokerageConnection` | POST `C/sync` (no body) |
| [ ] | Normal safe disconnect | `disconnectBrokerageConnection` | DELETE `C` (optional confirmation body) |
| [ ] | Current valuation/freshness | `getAccountValuation` | GET `A/valuation` |
| [ ] | Valuation history | `listAccountValuations` | GET `A/valuations` |
| [ ] | All position pages | `listAccountPositions` | GET `A/positions` |
| [ ] | Portfolio catalog | `listTemplates` | GET `I/templates` |
| [ ] | Selected portfolio/version | `getTemplate` | GET `I/templates/{template_id}` |
| [ ] | Current subscription/allocation | `listAccountMemberships` | GET `A/memberships` |
| [ ] | Non-economic allocation preview | `createAllocationPreview` | POST `A/allocation-previews` |
| [ ] | Join/update/leave | `createAccountAction` | POST `A/actions` |
| [ ] | Action completion/replay | `getAccountActionReceipt` | GET `A/actions/{action_receipt_id}` |
| [ ] | Current preferences/version | `getAccountPreferences` | GET `A/preferences` |
| [ ] | Change preferences; B2 correction for acknowledgment | `updateAccountPreferences` | PATCH `A/preferences` |
| [ ] | Preference history | `listAccountPreferenceHistory` | GET `A/preferences/history` |
| [ ] | Recommendation list | `listAccountRecommendations` | GET `A/recommendations` |
| [ ] | Recommendation details/reasons | `getAccountRecommendation` | GET `A/recommendations/{recommendation_id}` |
| [ ] | Paged recommendation deltas | `listAccountRecommendationLegs` | GET `A/recommendations/{recommendation_id}/legs` |
| [ ] | Durable activity/trade chronology | `listAccountRecords` | GET `A/records` |
| [ ] | Account-safe record details | `getAccountRecord` | GET `A/records/{record_id}` |
| [ ] | Account notifications/resume | `streamAccountEvents` | GET `A/events` |

For the primary onboarding test use this exact progression: exchange → accounts
→ onboarding/current attestation/disclosures → submit decision and consent →
connect → connection/sync and fresh valuation/positions → catalog/preferences
→ preview → join → receipt/membership → recommendation/Records/events.
The order of decision and consent may swap. Do not wait for a nonempty legacy
advisory-profile result when a valid current non-expiring attestation exists.
Test update/leave/rotation/disconnect separately after the primary journey.

## Appendix D — request, recovery and completion rules

1. **Envelope and headers.** JSON successes use `data`; errors use `error`.
   Use `Content-Type: application/json` when sending a JSON body, fresh Google
   and Investor credentials as applicable, and `X-Correlation-Id`. Every
   Investor mutation, including preview and sync, requires `Idempotency-Key`
   (8–128 characters); identity exchange has its own JTI/binding replay model.
   A 200 authorization response may contain DENIED. Treat each operation's
   specified success status as exact; do not assume every mutation returns 201.
2. **Retry versus new decision.** Ordinary GET budget is ten seconds total,
   with at most two jittered retries on transport/502/503/504. Mutations are
   never automatically replayed as new actions. Retain safe pending action
   metadata, and after an ambiguous response deliberately recover with the
   identical body/key and a new per-attempt assertion. If a body contains
   credentials, do not persist it in the generic retry store. If the transient
   credential input was lost, query existing connections first and ask the
   owner to re-enter keys only when necessary. Do not generate duplicate
   connections/subscriptions just because a response was lost.
3. **Version/preview conflicts.** An expired/stale preview requires fresh
   canonical account/target input and a new preview. Explain changed economics
   and re-confirm before a new action. `VERSION_CONFLICT` requires a fresh
   resource version; never retry a stale `If-Match` indefinitely. `If-Match`
   is a plain or quoted integer string, not `*` or a weak ETag. Actions may
   omit it unless an explicit current domain version is available; preference
   PATCH requires the current preference version. Do not substitute a different
   resource's version.
4. **Pending is not failure or completion.** Follow a response's validated
   same-account relative `status_path` or its named GET operation; never fetch
   an arbitrary external URL from response data. Poll with bounded backoff
   (frontend default: 2, 5, then 10 seconds while visible; honor rate limits),
   pause background polling and offer manual refresh. A UI timeout leaves the
   action pending/unknown, not rejected. Recommendation or action `APPLIED`
   does not prove broker fills. Records and reconciled snapshots supply those.
5. **Pagination and SSE.** Follow `next_cursor` only when `has_more=true`;
   keep account, filters and page size unchanged. Cursor invalid/expired means
   restart from page one. BFF opens the stream with both credentials and
   `Accept: text/event-stream`; browser connects only to its authenticated
   same-origin BFF. Preserve `id`, `event`, multiline `data`, ordering and
   keepalive comments; disable proxy buffering/cache. Commit the last fully
   processed event ID, deduplicate and reconnect with `Last-Event-ID` and new
   credentials. Reload GET projections after gaps. Ordinary ten-second GET
   budgets are not SSE lifetime limits. Test disconnect, authorization expiry,
   account switch and reconnect across separate Cloud Run instances; do not
   reconnect a revoked session indefinitely.
6. **Safe errors.** Branch on operation-specific HTTP status and `error.code`,
   not message text. Authentication failure needs bounded credential/session
   repair; an IAM-level 403 may be non-JSON and means transport is not admitted.
   Uniform `404 RESOURCE_NOT_FOUND` does not reveal whether another user owns
   the ID. `422` means correct the closed request. Honor integer `Retry-After`
   on `429`. Unavailable services/503, `EXECUTION_DISABLED`, stale truth,
   unexplained holdings or reconciliation holds must be displayed and escalated,
   not translated to success or fixed by submitting orders from the frontend.
   Preserve any explicit step-up/acknowledgment requirement; do not manufacture
   a newer `auth_time`. Unknown error/Record/event variants are compatibility
   failures, not fields to silently discard.
7. **Privacy and support.** Keep account/session responses `private, no-store`;
   bounded public JWKS caching is the exception. Redact credentials/assertions
   before application/APM/proxy logging. For a failure send Daniel/backend
   operations the package version/digest, frontend revision, UTC time,
   operation, HTTP status/code and safe correlation/receipt IDs through the
   agreed channel. Never include raw headers, tokens, credentials, answers or
   full broker payloads. Backend responds with correction/binding instructions;
   frontend never repairs Spanner or live broker state directly.

Final acceptance must include: two-user foreign-account denial; first and
repeat login; real decision delivery and later withdrawal/expiry; consent
accept/withdraw; connect/sync/rotate/disconnect; all paged reads; allocation
preview/join/update/leave; both restrictive and acknowledged expanding
preference changes after B2; lost-response/idempotent recovery; Records/SSE
resume and account isolation; and display of actual order/fill/reconciliation
outcomes under B4. Neither the lack of a market session nor an open B2 may be
hidden by marking the integration fully complete.
