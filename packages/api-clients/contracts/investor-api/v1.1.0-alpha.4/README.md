# ReFinity frontend integration package v1.1.0-alpha.4

This supersedes alpha.2 for new integration. All 41 route methods remain. Funding fields and recommendation response schemas change as specified in MIGRATION.md. Error profiles describe actual
preference acknowledgment, validation and denial behavior; native Cloud Run is
the selected deployment path. Read **MIGRATION.md**, then **INTEGRATION.md**.
The latter is the full ordered implementation and acceptance handoff, included
here so no backend repository or private correspondence is needed.

## Package map

`contract.json` is the route/error inventory; `openapi.json` generates clients;
`schemas.json` validates closed JSON; `examples.json` supplies synthetic examples;
`capabilities.json` and `connection.dev.json` separate code from live readiness;
`tools/conformance.py` validates and simulates locally; `bundle.json` hashes every
artifact; `MIGRATION.md` describes the delta and `INTEGRATION.md` gives the work order.

## Capability and external-input register

All public boundaries are implemented. `connected_alpha_verified=false` and
all other connected verification flags remain false: no live frontend trust has
been bound or real frontend-authenticated trading acceptance certified. Backend
broker tests do not certify frontend integration. Null bindings are genuinely
unsupplied. Known URLs alone are not permission or connectivity evidence.

## Current Dev handoff state and responsibilities

Backend public JWKS is operational. Both API feature gates remain disabled
pending the exact frontend runtime identity and upstream login trust. Frontend
supplies its actual SA email/Google uniqueId, upstream provider/issuer/audience/
JWKS/redirects, operational BFF JWKS and contacts. Backend applies exact IAM/
trust, returns invitations securely and publishes the hash-bound connection
addendum. Native runtime authentication does not require an external WIF issuer,
provider or SA impersonation. The old pool is an external-host fallback only.

## Verify before integration

Run from this extracted directory with Python 3.11+, no dependencies:

```bash
python3 tools/conformance.py validate
python3 tools/conformance.py self-test
python3 tools/conformance.py serve --host 127.0.0.1 --port 8765
```

In another terminal: `python3 tools/conformance.py probe --base-url http://127.0.0.1:8765`.
Use real credentials only against the activated real boundary, never this simulator.

## System ownership boundary

Frontend owns user login/sessions, questionnaire/KYC decisions and their
attestation. Backend owns opaque user/account linkage, account authority,
broker credentials, snapshots, portfolio automation, trade execution and audit.
Only BFF-to-backend calls are supported. No direct browser Spanner/broker access,
frontend order creation, public risk override or secret-read API is provided.

## Token and key direction

Google service token goes in `Authorization`; each Investor attempt gets a fresh
ES256 `X-Refinity-User-Assertion` with backend user ID and original `auth_time`.
`amr` is optional; `acr` prohibited. Identity input, identity result and Investor
assertion are three different tokens. Exact audiences/JWKS/claims and native
email/subject pinning are in INTEGRATION.md. No downloadable SA JSON key.

## Required frontend integration order

Follow steps 0–8 in INTEGRATION.md: package/scope → native BFF identity → real
login and signing → backend binding → identity/account selection → attestation/
consent/Alpaca → portfolio/account activity → full connected acceptance.
The 41-operation coverage table and one facts-return form are included there.

## Alpaca environment and credential rules

Send `broker=alpaca`, `account_environment=paper|live` and the full key pair.
Backend chooses the fixed host; never send an arbitrary URL. Environment change
requires disconnect/new connection; rotation replaces keys on the same connection.
No credentials in logs/storage/fixtures. Paper is real API testing with simulated
funds, not a lower-standard execution path. SnapTrade remains a later integration.

## Percentage allocation and subscription meaning

`"0.25"` means 25% of current equity. Preview then join/update the same template
and fraction. Subscription is the instruction to trade/maintain the portfolio.
Leaving or disconnecting does not liquidate positions. Account truth is canonical
backend valuation/positions, not frontend market-data arithmetic.

## HTTP state, idempotency and concurrency

Use exact operation success statuses and closed schemas. `202` is not a fill.
All Investor mutations require `Idempotency-Key`; retry the same action with
the same body/key and fresh assertion, never a newly invented economic action.
Preference PATCH requires current preference `If-Match`. Handle acknowledgment
as unapplied, record the required consent, then confirm with a new key and both
declared confirmation fields. Preserve the structured error continuation.

## Pagination, polling and SSE

Poll canonical GETs for correctness. Paginate with opaque same-query cursors.
BFF opens SSE with both credentials, persists the last processed event ID,
deduplicates, and reconnects using `Last-Event-ID`. Handle expiry/revocation and
refresh snapshots after gaps; stream notifications are not a second ledger.

## Error handling and escalation

Branch on declared HTTP/code, not message. `ACKNOWLEDGMENT_REQUIRED` carries
structured `error.continuation`; do not discard it in the client error class.
`VERSION_CONFLICT`, invalid binding, 401, uniform foreign-account 404, validation
422, rate-limit 429 and safe dependency 503 are defined in the route profiles.
The connection addendum supplies `identity_ccid_base_url`,
`identity_ccid_jwks_url`, `investor_api_base_url`, confirms
`frontend_bff_jwks_url`, and binds `frontend_native_binding`,
`frontend_runtime_service_account_email`, `frontend_runtime_service_account_unique_id`.
It also supplies `support.integration_contact`, `support.security_contact`,
`support.trading_operations_contact` and `support.escalation_channel`.
Report safe operation/correlation/receipt IDs, never credentials or raw payloads.

## Delivery truth

This is an implemented frontend-development package, not a connected Alpha
certificate. Final real frontend trust, invited-user integration and full
automated lifecycle proof remain separate gates. Do not mutate this version
after issuance; future operational facts belong in the digest-bound addendum.


Funding and recommendation read changes: read [MIGRATION.md](MIGRATION.md) and [FUNDING.md](FUNDING.md).
