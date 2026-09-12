# ReFinity frontend integration package v1.1.0-alpha.2

This is the self-contained frontend-development boundary for the closed U.S.
invite-only Alpha. All 41 public route contracts and schemas are implemented.
The backend Cloud Run service shells are provisioned, but the connected release
is not ready: both public-facing backend features are disabled, external trust
is unbound, and real Alpaca/account/trading acceptance remains unverified.
`connected_alpha_verified=false`; this is not a connected-Alpha certificate and
simulator output is never production evidence.

## Package map

| File | Consumer use |
| --- | --- |
| `contract.json` | Source inventory, ownership, error profiles and later backend gates. |
| `openapi.json` | Generate the HTTP client and operation methods. This is OpenAPI 3.1. |
| `schemas.json` | Validate the closed JSON Schema 2020-12 request, response, identity, Record and event types. |
| `examples.json` | Synthetic success, pending, denial, replay, stale, cursor and SSE fixtures. Never replace these with real credentials or PII. |
| `capabilities.json` | Separate implemented wire contracts from connected capability availability. |
| `connection.dev.json` | Exact selected/provisioned Dev facts, dated observations, frontend actions, backend deliverables and typed connection bindings. |
| `tools/conformance.py` | Repository-independent validator and deterministic local simulator. |
| `bundle.json` | Package/source versions, artifact hashes and the package content digest. |

All request and response objects are closed. Treat an unknown field, enum,
Record variant or SSE variant as a contract-version mismatch; do not ignore it
silently. IDs are opaque, timestamps are UTC RFC 3339 and financial quantities
are decimal strings.

## Capability and external-input register

`capabilities.json` is the release-truth register. Its `routes` and `schemas`
arrays use `status=implemented` only for wire boundaries that exist and pass
deterministic conformance. `connected_capabilities` separately uses:

- `available` for a capability usable in the declared `availability_scope`;
- `pending_backend` for work completed at its listed later `ATD` gates; and
- `pending_external` for a connection or owner input completed at its listed
  later `ATD` gates.

Every pending capability has an owner, bounded claim, dependencies and later
gates. The `binding_register` is the authoritative inventory of connection
facts and actions. A null `value` means genuinely not supplied or produced. A
non-null value with `value_state=selected_not_operational` or
`provisioned_not_enabled` is known but must not be treated as usable. Each
binding states the current condition, responsible owner, required action and
acceptance condition. Sensitive Alpaca credentials are supplied only through
protected local bootstrap and are explicitly excluded from a connection
addendum.

The readiness states are independent assertions. The package records that the
service shells are provisioned, while the connected backend release, external
trust, Alpaca verification and connected Alpha verification remain false. The
`frontend_development` object declares that no pending binding is required to
generate a client, model states or execute the deterministic simulator.

## Current Dev handoff state and responsibilities

Already selected and delivered in this package:

- frontend BFF base: `https://bff-dev.refi.trading`;
- frontend BFF assertion JWKS URL:
  `https://bff-dev.refi.trading/.well-known/jwks.json`;
- the four application issuer/audience values and the two separate Google OIDC
  target audiences in `connection.dev.json`;
- active WIF pool ID/resource, planned provider ID and fixed BFF service account;
- provisioned `identity-ccid` and Investor API service URLs, explicitly marked
  feature-disabled and not ready for connected use; and
- the backend public JWKS path/derived URL, explicitly marked inaccessible
  until the backend completes its public-key route activation.

The OpenAPI document is intentionally one contract with two runtime owners.
`exchangeIdentity` and `getIdentityJwks` carry operation-level `identity-ccid`
servers; all Investor operations use the global Investor API servers. The
`.invalid` entries are non-routable safety placeholders. Use the loopback
server for the simulator and do not substitute the provisioned Cloud Run URLs
until the connection addendum promotes them to operational.

The selected BFF JWKS URL is not an unanswered URL question. The BFF base
returned HTTP 200 while that JWKS route returned HTTP 503 on 2026-09-03. The
frontend must make that exact route return a valid ES256 JWKS and prove key
rotation. The upstream user-identity JWKS is a separate endpoint and is still
unknown.

The frontend system must provide or complete only the IDs listed by
`frontend_required_actions` in `connection.dev.json`: its upstream identity
provider identifier, exact identity issuer/audience/JWKS and redirect URIs;
operation of the already-selected BFF assertion JWKS; the deployed BFF
workload-token OIDC issuer, allowed audiences and immutable subject values; and
the joint integration/security/escalation contacts. It supplies subject claim
values, not a CEL expression. The backend constructs and owns the restrictive
WIF CEL condition.

The backend independently owes every ID in `backend_pending_deliverables`: it
must configure and activate the two services, make its own identity-result JWKS
public, construct the WIF provider/grants, publish accepted revisions/digests
and support contact, produce safe connected fixture IDs, and issue the
hash-bound Dev connection addendum. The Alpaca paper fixture credentials and
campaign scope are backend-owner inputs explicitly listed under
`backend_owner_inputs_not_requested_from_frontend`; do not ask the frontend for
them.

## Verify before integration

Run from this extracted directory with Python 3.11 or newer and no repository
checkout:

```bash
python3 tools/conformance.py validate
python3 tools/conformance.py self-test
```

For a long-running simulator, use one terminal:

```bash
python3 tools/conformance.py serve --host 127.0.0.1 --port 8765
```

Then use a second terminal:

```bash
python3 tools/conformance.py probe --base-url http://127.0.0.1:8765
```

The simulator accepts only its synthetic headers/examples and binds to
loopback by default. Never give it real user assertions, Alpaca credentials or
production data. Generate the frontend client from `openapi.json`, then run its
own request/response validation against the simulator journey.

## System ownership boundary

| Concern | Frontend system (browser plus frontend backend/BFF) | Trading backend |
| --- | --- | --- |
| User experience | Login, invitations, onboarding, suitability/KYC questionnaire and status presentation | No browser UI and no questionnaire scoring |
| Identity | Own upstream identity provider and claims; BFF protects browser sessions | Resolve verified upstream identity to opaque backend user/account ownership |
| Compliance profile | Validate the substantive questionnaire/KYC result and version it | Validate transport/schema/provenance/replay, store attestation, calculate trading authorization and hard stops |
| Service authentication | Obtain Google OIDC through the approved WIF/provider binding; mint a fresh user assertion per Investor API attempt | Verify Google caller, assertion signature/claims/JTI and account ownership |
| Broker credentials | Ask for Alpaca keys and environment, transmit once through the BFF, never persist/log/cache them | Store credential versions in Secret Manager and own validation, rotation, revocation and broker host selection |
| Account information | Render only Investor API projections | Own reconciliation, canonical valuation/positions and account-scoped activity |
| Portfolio | Present templates, allocation preview and subscription state | Own templates, percentage allocation, membership, recommendations and automated lifecycle |
| Trading | Never create legs/orders or infer completion | Own intent, risk, plan, submission, fills, reconciliation, controls and audit evidence |

There is no browser-direct backend access, Spanner access, secret-read route,
public order route, transfer route, liquidation route or Admin route in this
package.

## Token and key direction

1. The frontend BFF obtains a Google OIDC token for `identity-ccid` using the
   exact `identity_ccid_google_oidc_audience` and calls
   `POST /api/v1/identity/exchanges` with the upstream `identity_assertion` and
   the bound state/challenge/nonce/redirect/network values. The browser does
   not call this route directly.
2. Identity CCID returns only a short-lived signed `identity_result`. The BFF
   verifies it using public `GET /.well-known/jwks.json`. That JWKS route needs
   no credential and may be cached only according to its response header.
3. For every Investor API attempt, the BFF obtains a Google OIDC token using
   the exact `investor_api_google_oidc_audience` and signs a fresh, single-use ES256
   `X-Refinity-User-Assertion`. Send both:

```text
Authorization: Bearer <google-oidc-id-token>
X-Refinity-User-Assertion: <fresh-frontend-es256-jwt>
X-Correlation-Id: <caller-generated-opaque-id>
```

The credentials are independent. A Google token never identifies the user and
a user assertion never grants service invocation. The user assertion includes
the frozen claims in `BffAssertionClaims`: original `auth_time` is required,
`amr` is optional factual provenance and `acr` is prohibited. It contains no
account ID, allocation, compliance decision or trading permission. Every retry
uses a fresh assertion/JTI even when an idempotency key is retained.

Do not log, trace, persist or return Google tokens, identity assertions,
identity results, user assertions, Alpaca keys, nonces, challenges or invitation
tokens. Never use a downloaded service-account JSON key; the approved path is
WIF/service-account impersonation once the pending binding is supplied.

## Required frontend integration order

1. Validate this package and generate models/client code.
2. Implement BFF-only identity exchange and backend-result verification. After
   exchange, call `listAccounts`; the identity result deliberately contains no
   account ID or trading authority.
3. Read onboarding, eligibility, KYC and advisory-profile projections. The
   frontend owns substantive suitability/KYC validation; do not call the
   removed legacy questionnaire mutations.
4. Submit the normalized, versioned compliance result through
   `createComplianceProfileAttestation` for the owned account. Then read current
   authorization. Submit and display the exact effective disclosures/consents.
5. Ask the user for direct Alpaca credentials and `paper|live`; call
   `createBrokerageConnection` once. Poll its returned `status_path` and/or
   consume account events until the connection and credential states settle.
6. Request explicit sync when needed. Read canonical valuation and positions;
   do not calculate account truth from browser data or by calling Alpaca.
7. List templates and select `SP500-Following`. Obtain a fresh allocation
   preview using the intended decimal-string percentage.
8. Submit `join_template` or `update_allocation` with the same percentage and
   preview ID. An accepted subscription is the instruction to trade and
   maintain the portfolio; there is no second automation switch.
9. Poll the action receipt and render account-owned Records. Consume SSE for
   timely updates and reconcile UI state back to GET projections/Records.
10. For leave or disconnect, show the no-liquidation meaning and follow a
    returned acknowledgment continuation exactly. Never imply a transfer,
    liquidation or deletion of audit evidence.

Steps whose capability is `pending_backend` or `pending_external` may return
the documented safe unavailable/pending result in Dev. That does not prevent
implementing every state now and does not authorize fabricated success.

## Alpaca environment and credential rules

The only Alpha broker value is `alpaca`. Ask the user whether the connected
account is `paper` or `live` and send only that enum. The trading backend owns
the immutable mapping:

| Input | Backend-selected trading host |
| --- | --- |
| `paper` | `https://paper-api.alpaca.markets` |
| `live` | `https://api.alpaca.markets` |

Never accept, construct or send a host URL. Paper and live use the same
production-grade lifecycle; the environment is routing metadata, not a reduced
product mode. Changing environments requires disconnecting the old connection
and creating a new one. Credential rotation uses the dedicated rotation route
and sends a complete replacement pair. Credentials are write-only and can
never be reconstructed from a response.

## Percentage allocation and subscription meaning

Allocation is an exact decimal-string fraction of account equity:
`0 < allocation_percent <= 1` for active membership. For example, `"0.25"`
means 25 percent; never send a binary float or a currency amount. Obtain a
short-lived preview immediately before join/update and retain its ID, bound
snapshot/target/price versions, feasibility, reason codes and expiry. Submit
the same template and percentage with that preview ID.

A preview is non-economic: it places no order, reserves no cash and changes no
membership. Join/update acceptance creates the durable instruction for backend
automation, but `202` is not evidence that any order or fill occurred. Leaving
stops future maintenance after required safety handling and does not sell
positions. Disconnecting or revoking credentials also does not liquidate or
transfer anything.

## HTTP state, idempotency and concurrency

- `200` is a completed read or exact replay representation. `201` is a newly
  persisted resource. `202` means durably accepted/pending; follow the returned
  status path or stable receipt ID.
- Every Investor API POST/PATCH/DELETE requires `Idempotency-Key` as declared
  by OpenAPI. Reuse a key only with byte-for-byte equivalent semantics. Changed
  reuse returns `409 IDEMPOTENCY_KEY_REUSED`.
- Do not implement generic automatic mutation retries. After an ambiguous
  transport failure, a deliberate recovery attempt may use a fresh user
  assertion and the same key/body so the backend can return the original result.
- `PATCH` requires `If-Match`; action and disconnect operations may require it
  for a version-bound continuation. On version conflict, refresh the resource
  and require a new user decision where economics or safety meaning changed.
- On `ACKNOWLEDGMENT_REQUIRED`, show the redacted continuation, then send the
  exact confirmation/reference with a new idempotency key and matching
  `If-Match`. Do not broaden the action or treat the first request as applied.
- Ordinary GETs have a total BFF budget of ten seconds and at most two jittered
  retries for transport failure or `502/503/504`; every attempt has a new user
  assertion. Mutations are not automatically retried. Honor integer
  `Retry-After` on `429`.
- All investor and identity-exchange responses are `private, no-store`. The
  public backend JWKS response is the sole bounded-cache exception.

## Pagination, polling and SSE

List cursors are opaque and bound to the account, caller and query. Never parse,
edit or reuse a cursor with changed filters/page size/account. Follow
`next_cursor` only while `has_more=true`; a cursor error means restart the list
from a fresh first page.

Use polling for required correctness and SSE for timely account UI updates.
The frontend backend/BFF—not an unauthenticated browser `EventSource`—opens the
account stream with both credentials. Store the last fully processed
`event_id`, reconnect with `Last-Event-ID`, and deduplicate by event ID. Preserve
event order as received but refresh the corresponding GET projection when UI
correctness matters. A disconnect, keepalive or duplicate is not a state
change. If the cursor expired, reload current projections/Records and begin a
fresh stream. A revoked account closes the stream; do not silently reconnect
without re-establishing user/session authority.

Records are the account-safe durable activity view. SSE is notification and
resume transport, not a separate source of trading truth. Unknown Record/event
variants require a newer contract package.

## Error handling and escalation

Every public JSON failure uses `{error:{code,message,correlation_id}}`. The
message is safe display context, not a programmatic discriminator. Branch on
HTTP status and `error.code` only.

| Condition | Frontend behavior | Owner/escalation |
| --- | --- | --- |
| `401` | Renew Google identity as appropriate and create a fresh user assertion; stop after bounded failure | Frontend trust owner first; backend identity owner if the configured issuer/audience/JWKS values agree |
| Uniform `404 RESOURCE_NOT_FOUND` | Treat absent and foreign resources identically; never reveal ownership guesses | Refresh the owned account list; escalate persistent own-account mismatch to backend integration support |
| `409` stale/version/reconciliation/acknowledgment | Refresh named projections and follow only an explicit continuation | Backend lifecycle support if state does not converge; never force success client-side |
| `422` | Correct the closed request against OpenAPI/schema; do not retry unchanged | Frontend integration owner; package/schema contradiction goes to backend contract owner |
| `429` | Honor `Retry-After`, reduce polling/reconnect pressure | Frontend integration owner, then backend operations if sustained |
| `503 SERVICE_UNAVAILABLE` | Keep accepted state unknown unless a durable receipt exists; consult capability status | Backend integration/operations; expected while the named connected capability is pending |
| Credential compromise | Stop showing/reusing the input and initiate the rotation/revoke procedure | Security escalation immediately; never paste credentials into a ticket or chat |
| Incorrect valuation, position, order or unknown outcome | Stop new user mutation prompts for the affected account and retain safe IDs/correlation | Backend trading operations; never attempt client-side repair or liquidation |

An escalation may include package version/digest, operation ID, UTC time,
`correlation_id`, owned opaque account/resource IDs, HTTP status/error code and
last processed event ID through an approved secure channel. It must exclude all
tokens, assertions, credentials, raw request/response headers, questionnaire
answers and broker payloads.

The later immutable Dev connection addendum must bind this package digest and
promote the provisioned `identity_ccid_base_url`, `identity_ccid_jwks_url` and
`investor_api_base_url` to accepted operational values. It must confirm the
already-selected `frontend_bff_jwks_url`; supply the backend-created
`wif_provider_name`, accepted frontend `wif_allowed_audiences` and
`wif_allowed_subjects`; bind service revisions/image digests and safe fixture
IDs; and include `support.integration_contact`, `support.security_contact`,
`support.trading_operations_contact` and `support.escalation_channel`. A known
URL is not evidence of availability. Null fields remain genuinely unknown and
must not be guessed.

## Delivery truth

Use `capabilities.json` for current machine-readable status. `implemented`
means the route/schema boundary exists and passed deterministic conformance. It
does not mean Alpaca, Spanner, WIF, Dev deployment or the automated lifecycle
has passed connected acceptance. Only a later hash-bound connection addendum
may supply those values, and only a later connected release may set
`connected_alpha_verified=true`.
