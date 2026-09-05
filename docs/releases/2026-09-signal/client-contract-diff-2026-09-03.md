# Package → client diff — v1.1.0-alpha.2 against `packages/api-clients` (2026-09-03)

> **2026-09-04:** §7's "building UI on brokerage-connection, allocation-preview, or `createAccountAction` … stay blocked" is superseded — in scope after admission/authorization gates per [dlaunch06-execution-rebaseline-2026-09-04.md](dlaunch06-execution-rebaseline-2026-09-04.md) §4.

**Purpose.** The measured difference between Daniel's frozen frontend contract
(`v1.1.0-alpha.2`, 41 operations) and what this repository currently models,
produced **before** any client code changes, per Zeshan's 2026-09-03 work
order. Companion to
[package-reconciliation-2026-09-03.md](package-reconciliation-2026-09-03.md).
Nothing in this document changes code; §12 proposes the smallest PR that would.

**Package pins** (from `bundle.json`): package content
`c1b53c906653ca8860bf66cfc0df8fa862ff34d6cbf77298ac83cb55f006cb09`;
`openapi.json`
`fba0cff90d62dc9e883e71367b5632efc9168a02bf73df00537bead6d44dfae9`;
`schemas.json`
`e2a4569eb934c1252b0e504a80aac19c13510ef9444f6b13f5fe6ecfa0f3cda3`.

## 0. What exists on our side today

| Surface                                              | Contents                                                                                                                                                                                                            | Authority                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `packages/api-clients/openapi/refi-api.yaml`         | 20 hand-written operations, 13 schemas (`OkResult AuthSession KycStatus BrokerInfo BrokerConnection BrokerAccount Position OrderRequest Order OrderPreviewResult Recommendation ActivityEvent EligibilityDecision`) | Pre-migration, browser-direct era. **None** of Daniel's.                          |
| `packages/api-clients/src/generated/_openapi.gen.ts` | `openapi-typescript@7.13.0` output of the yaml (894 lines, gitignored, regenerated on `pnpm generate`)                                                                                                              | Derived                                                                           |
| `packages/api-clients/src/compat.ts`                 | Flat aliases + frontend-only shims ("pending backend / OpenAPI alignment")                                                                                                                                          | Frontend assumption                                                               |
| `packages/api-clients/src/hooks/*.ts`, `src/mocks/*` | React Query hooks and MSW handlers keyed to the 20 yaml paths                                                                                                                                                       | Frontend                                                                          |
| `apps/web/src/lib/investor-api/routes.ts`            | 12 outbound route constants from Daniel's 2026-08-17 written reply                                                                                                                                                  | Daniel, pre-package; "literals verified against the exported contract on receipt" |
| `apps/web/src/lib/investor-api/user-assertion.ts`    | ES256 `X-Refinity-User-Assertion` minting                                                                                                                                                                           | Daniel 2026-08-17/19                                                              |
| `apps/web/app/api/**` (22 `route.ts`)                | The browser-facing BFF, served from the prototype store                                                                                                                                                             | Ours; not part of this diff                                                       |

The yaml's 20 operations are consumed only by `src/hooks/*` and
`src/mocks/handlers.ts` (two files per path; `/orders/preview` has zero
consumers; `/v1/us/eligibility` one). Nothing under `apps/web/app` imports a
yaml path string directly.

## 1. Operations already represented

**Zero exact package operation matches** (path + method) exist in the
hand-written `refi-api.yaml`: 0 of 41. The overlap that does exist is
conceptual and path-level, recorded separately here via the `routes.ts`
constants:

| `routes.ts` constant          | Package operation(s)                                                              | Match                        |
| ----------------------------- | --------------------------------------------------------------------------------- | ---------------------------- |
| `ONBOARDING_STATUS`           | `getOnboardingStatus` GET `/api/v1/investor/onboarding/status`                    | exact                        |
| `ELIGIBILITY`                 | `getEligibility` GET `/api/v1/investor/eligibility`                               | path exact; **POST removed** |
| `KYC`                         | `getKycStatus` GET `/api/v1/investor/kyc`                                         | exact                        |
| `ADVISORY_PROFILES`           | `listAdvisoryProfiles` GET                                                        | path exact; **POST removed** |
| `ADVISORY_PROFILE_CURRENT`    | `getCurrentAdvisoryProfile` GET                                                   | exact                        |
| `DISCLOSURES`                 | `listEffectiveDisclosures` GET                                                    | exact                        |
| `CONSENTS`                    | `listConsents` GET, `recordConsent` POST                                          | exact                        |
| `ACCOUNT_AUTHORIZATION`       | `getAccountAuthorization`                                                         | exact                        |
| `ACCOUNT_ACTIONS`             | `createAccountAction` POST; **new** `getAccountActionReceipt` GET `/actions/{id}` | partial                      |
| `ACCOUNT_PREFERENCES`         | `getAccountPreferences` GET, `updateAccountPreferences` PATCH                     | exact                        |
| `ACCOUNT_PREFERENCES_HISTORY` | `listAccountPreferenceHistory`                                                    | exact                        |
| `ACCOUNT_EVENTS`              | `streamAccountEvents` (SSE)                                                       | exact                        |

12 of 12 constants survive with their paths. Two of them lose their POST
method (§3).

## 2. New operations (not modelled anywhere on our side) — 27

| Group                    | Operations                                                                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity (identity-ccid) | `getIdentityJwks` GET `/.well-known/jwks.json`; `exchangeIdentity` POST `/api/v1/identity/exchanges`                                                                        |
| Accounts                 | `listAccounts`, `getAccount`                                                                                                                                                |
| Compliance attestation   | `listComplianceProfileAttestations`, `createComplianceProfileAttestation`, `getCurrentComplianceProfileAttestation`                                                         |
| Brokerage connection     | `listBrokerageConnections`, `createBrokerageConnection`, `getBrokerageConnection`, `disconnectBrokerageConnection`, `rotateBrokerageCredentials`, `syncBrokerageConnection` |
| Account truth            | `getAccountValuation`, `listAccountValuations`, `listAccountPositions`                                                                                                      |
| Templates / allocation   | `listTemplates`, `getTemplate`, `createAllocationPreview`, `listAccountMemberships`                                                                                         |
| Recommendations          | `listAccountRecommendations`, `getAccountRecommendation`, `listAccountRecommendationLegs`                                                                                   |
| Records                  | `listAccountRecords`, `getAccountRecord`                                                                                                                                    |
| Waitlist                 | `joinWaitlist` POST `/api/v1/investor/waitlist` (`acquisition_source: DIRECT                                                                                                | GAME`) |
| Action receipt           | `getAccountActionReceipt`                                                                                                                                                   |

Generating types for all 27 is contract work and is valid under either
D-LAUNCH-06 answer. **Building UI on the brokerage-connection, allocation-preview,
or `createAccountAction` operations is not** — those stay blocked (reconciliation
§7).

## 3. Removed / obsolete on our side

**All 20 operations in the hand-written YAML are obsolete as the authoritative
outbound Investor API contract.** None has a same-path successor in the
package; the package is a different API. This is a statement about the
_outbound contract_ only. Some of the underlying concepts remain valid as
**BFF-local** functionality that Daniel's Investor API never owned (browser
session handling is the clear case); those concepts live on in
`apps/web/app/api/**`, not in the outbound client, and their disposition below
says so.

| Yaml operation(s)                                                                      | Disposition                                                                                                                |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `getAuthSession`, `authRefresh`, `authRevokeAll`                                       | BFF-owned session — never a backend operation. Belongs to `apps/web/app/api/v1/investor/session`, not the outbound client. |
| `siweNonce`, `siweVerify`                                                              | SIWE is wallet-linking only, not login (README, `useSiweAuth.ts`). No package equivalent; not part of Alpha.               |
| `getCcidStatus`, `startCcid`                                                           | Superseded by `exchangeIdentity` (BFF-only, Google-authenticated).                                                         |
| `getSupportedBrokers`, `getBrokerConnection`, `startBrokerConnect`, `disconnectBroker` | Superseded by the six `*BrokerageConnection*` operations; broker is fixed `alpaca`; **blocked surface**.                   |
| `getBrokerAccount`, `getBrokerPositions`                                               | Superseded by `getAccountValuation` / `listAccountPositions` (backend-reconciled truth, never broker-direct).              |
| `getBrokerOrders`, `listOrders`, `previewOrder`                                        | **No public equivalent by design** — orders are Records (`record_type: order                                               | fill`) and SSE; `previewOrder` had zero consumers. |
| `listRecommendations`, `getRecommendation`                                             | Superseded by account-scoped `listAccountRecommendations` / `getAccountRecommendation` / `listAccountRecommendationLegs`.  |
| `listActivity`                                                                         | Superseded by `listAccountRecords` / `getAccountRecord`.                                                                   |
| `postEligibility`                                                                      | **Explicitly excluded** (`contract.json.excluded_public_operations`); replaced by `createComplianceProfileAttestation`.    |

Also obsolete: the two POSTs implied by `routes.ts` comments on `ELIGIBILITY`
and `ADVISORY_PROFILES` ("GET | POST"). The package removes both questionnaire
writers.

## 4. Schema differences

| Ours (`refi-api.yaml`)                                           | Package                                                                                                                                                                           | Delta                                                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 13 open objects, `additionalProperties` unspecified              | 96 closed objects (`additionalProperties:false`), every response wrapped in an `*Envelope` (`{data}`), errors `{error:{code,message,correlation_id}}`                             | Envelope + closedness are new; unknown field = contract-version mismatch, must fail loudly |
| `Recommendation` (flat, our fields)                              | `Recommendation` {`recommendation_id, account_id, template_id, status, execution_eligible, leg_count, estimated_turnover_percent, freshness`} + separate `RecommendationLeg` page | Total rewrite; legs are paged separately                                                   |
| `Position` {symbol, qty:number, side:long/short}                 | `AccountPosition` with decimal-string quantities and `freshness_status`                                                                                                           | Numbers → decimal strings (package rule: financial values are strings)                     |
| `KycStatus` enum pending/incomplete/approved/denied/under_review | `KycStatus` object (read-only projection); attestation carries `kyc.status: passed                                                                                                | failed                                                                                     | pending                                                                                                                                       | not_required                                                                                                     | expired              | withdrawn` | Enum vocabulary changes; ours is not a subset |
| `BrokerConnection.status: connected/disconnected/pending`        | `BrokerageConnection.connection_status` (7 values) + `credential_status` (5 values) + `account_environment: paper                                                                 | live`                                                                                      | Two-axis state; **blocked surface**                                                                                                           |
| `EligibilityDecision.status: ALLOW                               | DENY`                                                                                                                                                                             | `EligibilityStatus.decision: ELIGIBLE                                                      | INELIGIBLE                                                                                                                                    | PENDING`                                                                                                         | Rename + third state |
| `ActivityEvent`                                                  | `AccountRecord` = `oneOf` 16 variants discriminated by `record_type` const, shared `AccountRecordDetails`                                                                         | Rewrite                                                                                    |
| — (none)                                                         | `Freshness` {`freshness_status: fresh                                                                                                                                             | stale                                                                                      | expired`, `fresh_until`, `expires_at`, `freshness_policy_version`, `freshness_reason_codes`} with if/then: fresh ⇒ zero reason codes, else ≥1 | New cross-cutting object; note **lowercase** here vs UPPERCASE `freshness_status` on Template/Position/Valuation |
| — (none)                                                         | `Page` {`next_cursor`, `has_more`} on every list                                                                                                                                  | New; opaque cursors bound to account+caller+query                                          |
| `OrderRequest`, `Order`, `OrderPreviewResult`                    | None                                                                                                                                                                              | Delete                                                                                     |

`openapi.json.components.schemas` (96) and `schemas.json.$defs` (96) carry the
same names; `schemas.json` is the closed JSON Schema 2020-12 form. Generating
from `openapi.json` and validating at runtime from `schemas.json` are both
supported by the package's own README.

## 5. Enum differences worth a fixture each

Every package enum (28) is new to us. Ones with the highest mismatch risk:

- `OnboardingStatus.state` — nine values (`WAITLISTED … READY | INELIGIBLE | SUSPENDED`); our `AccountActivationStatus` shim is six booleans.
- `AccountAuthorization.status: AUTHORIZED|DENIED|PENDING|SUSPENDED`.
- `ActionReceipt.status: ACCEPTED|APPLIED|REJECTED|DUPLICATE`.
- `AdvisoryProfile.risk_calibration: CONSERVATIVE|MODERATE|GROWTH|AGGRESSIVE|UNAVAILABLE` and `pass_fail: PASS|FAIL|REVIEW` — the Investor Profile engine (PR #64) must map its reason-coded result into these, not invent parallel names.
- `ComplianceProfileAttestationRequest.trading_eligibility: eligible|ineligible|pending` (lowercase) vs `EligibilityStatus.decision` (UPPERCASE) — same concept, two casings, both in-contract.
- `WaitlistRequest.acquisition_source: DIRECT|GAME` — the alpha-claim handoff maps to `GAME`.

## 6. Auth requirements

| Operation set              | Package security                                                          | Ours today                                                                    |
| -------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 39 Investor API operations | `googleOidc` **and** `userAssertion` (`X-Refinity-User-Assertion`, ES256) | `user-assertion.ts` mints the assertion; **no Google OIDC credential exists** |
| `exchangeIdentity`         | `googleOidc` only (assertion is the request body)                         | Not implemented (`GAP-IDENTITY-018`)                                          |
| `getIdentityJwks`          | none (public, bounded cache)                                              | Not implemented; note our own JWKS route is the _other_ direction             |

`BffAssertionClaims` vs `user-assertion.ts`: identical required set (`iss aud
sub iat nbf exp jti sid auth_time`). **Delta:** we treat `amr` as required; the
package makes it optional and forbids `acr`. `jti`/`sid`/`sub` patterns
(`^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$`) are new constraints to assert in tests.

How the Google credential is obtained is an **architecture question**
(reconciliation §4a): Vercel-hosted BFF ⇒ external OIDC → WIF; Cloud Run BFF ⇒
metadata-server ID token. The client must take the bearer as an injected
dependency and never decide this itself.

## 7. Idempotency requirements

| Header            | Required on                                                                                                                                                                                                                                                                                  | Optional on                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `Idempotency-Key` | all 10 mutations: `createAccountAction`, `createAllocationPreview`, `createBrokerageConnection`, `disconnectBrokerageConnection`, `rotateBrokerageCredentials`, `syncBrokerageConnection`, `createComplianceProfileAttestation`, `updateAccountPreferences`, `recordConsent`, `joinWaitlist` | —                                                      |
| `If-Match`        | `updateAccountPreferences`                                                                                                                                                                                                                                                                   | `createAccountAction`, `disconnectBrokerageConnection` |

Ours: `client.ts` has no idempotency support, and `bffMutate` handles the
browser→BFF hop only. Rules to encode: same key ⇒ byte-identical body; changed
reuse ⇒ `409 IDEMPOTENCY_KEY_REUSED`; **no automatic mutation retries**; a
deliberate recovery attempt reuses key+body with a **fresh** assertion/JTI.

## 8. Correlation requirements

Package: `X-Correlation-Id` is caller-generated, opaque, sent on every request
and echoed on every response (`components.headers.CorrelationId`; 48
references). Error bodies carry `correlation_id`.

Ours: `client.ts` already generates `x-correlation-id` and rotates it from
response headers — same concept, **lowercase header name** and browser-side
storage. The outbound client must generate per BFF→backend call, server-side,
and never forward a browser-supplied value.

## 9. Account scoping

31 of 41 operations are under `/api/v1/investor/accounts/{account_id}/…`.
`account_id` rides in the **path**, never in the assertion (matches
`routes.ts` `accountScoped()` and `user-assertion.ts`'s "account_id MUST NOT
appear"). Foreign or absent resources return a uniform `404
RESOURCE_NOT_FOUND`. After `exchangeIdentity`, the BFF must call `listAccounts`
to learn account IDs — the identity result carries none.

Un-scoped: identity (2), `listAccounts`, advisory-profiles (2), consents (2),
disclosures, eligibility, kyc, onboarding status, templates (2), waitlist.

## 10. Records and SSE variants

- `AccountRecord`: `oneOf` **16** variants, each `record_type` a `const`
  (`compliance_profile_attestation, consent_receipt, brokerage_connection,
brokerage_sync, allocation, preference, action_receipt, recommendation,
account_intent, risk_decision, execution_plan, order, fill, reconciliation,
valuation, trading_control`), shared envelope `{record_id, account_id,
correlation_id, created_at, source_version, details}`; `details` has
  `entity_id, status, reason_codes, effective_at, completed_at, quantity,
notional, currency, related_record_id`.
- `AccountEvent`: `oneOf` **16** variants, `event_type` = `<record_type>.updated`
  (except `fill.recorded`), shared `{event_id, account_id, occurred_at,
correlation_id, data}`; `data` has `entity_id, record_id, state_version,
status, reason_codes`.
- Transport: `streamAccountEvents` is `text/event-stream`, header
  `Last-Event-ID`, opened by the **BFF** with both credentials — never a browser
  `EventSource`. Errors: `CURSOR_INVALID`, `CURSOR_EXPIRED`.
- Ours: `ActivityEvent` is a single flat type; the prototype `records` route
  has its own vocabulary. **Note for D-LAUNCH-06:** `account_intent`,
  `risk_decision`, `execution_plan`, `order`, `fill` variants exist in the
  type system regardless of whether the September artifact ever emits them;
  generating their types is not building an execution surface, and rendering
  them would be.

## 11. Consent / disclosure and identity mappings

| Ours                                                                                                                           | Package                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/investor/disclosures/{id}/acknowledge` body `{version}` → prototype `appendDisclosureAck` (`upstreamGap: G-005`) | `recordConsent` POST `/api/v1/investor/consents` body `{account_id, consent_key, disclosure_key, disclosure_version:int, disclosure_hash, action: ACCEPT                                                                                                             | WITHDRAW}`+`Idempotency-Key`; `201`new /`200`replay /`409` stale                                 |
| `GET /api/v1/investor/disclosures` (prototype)                                                                                 | `listEffectiveDisclosures` → `Disclosure{status: EFFECTIVE                                                                                                                                                                                                           | RETIRED}`; exact `disclosure_hash` must be echoed back on consent                                |
| Legacy browser-direct `/v1/documents/acknowledge`                                                                              | Gone; D-DISCLOSURE-01's contract question closes on `recordConsent`                                                                                                                                                                                                  |
| `getCcidStatus` / `startCcid`; `bff/auth.ts` assumes identity-ccid verifies email                                              | `exchangeIdentity` body `{identity_assertion, state, challenge, nonce, redirect_uri, network_context, invitation_token?, acquisition?}` → `IdentityHandoffResult` (ES256, `email`, `email_verified`, `amr?`, ≤5 min, single-use), verified against `getIdentityJwks` | **Direction change:** we supply the upstream identity assertion; the IdP choice is not made here |

## 12. Proposed smallest atomic client-generation PR

**Branch off pinned `main`; one PR; `packages/api-clients` + one BFF module.**

1. **Vendor the exact package, hashes included.**
   `packages/api-clients/contracts/investor-api/v1.1.0-alpha.2/{openapi.json,schemas.json,examples.json,bundle.json}`
   copied byte-for-byte; a `PACKAGE.md` records `package_content_sha256` and
   the source contract SHA; a vitest asserts each vendored file's SHA-256 equals
   `bundle.json.artifacts[].sha256`. (`README.md`, `capabilities.json`,
   `connection.dev.json`, `tools/conformance.py` are **not** vendored — they
   are governance/ops, and `connection.dev.json` holds URLs we must not bake in.)
2. **Generate, don't hand-write.** Add `generate:investor-api` →
   `openapi-typescript contracts/investor-api/v1.1.0-alpha.2/openapi.json -o
src/generated/investor-api.gen.ts` (v7.13 supports OpenAPI 3.1). Output
   stays gitignored like the existing gen file.
3. **Typed outbound client, server-only.** `src/investor-api/client.ts` using
   `openapi-fetch` over the generated paths, constructor takes `{baseUrl,
getBearer(): Promise<string>, mintAssertion(): Promise<string>}` as injected
   dependencies; adds `X-Correlation-Id` per call; requires `Idempotency-Key`
   on the 10 mutations at the type level; no retries on mutations; GET budget
   10 s / ≤2 jittered retries on transport or 502/503/504 with a fresh
   assertion per attempt. Marked `server-only`; **no export reaches browser
   bundles** (a tripwire test greps `apps/web/app/**/*.tsx` for the import).
4. **Runtime validation from `schemas.json`.** `schemas.json` is **JSON Schema
   2020-12**; validation must use Ajv's 2020-12 mode (`Ajv2020` from
   `ajv/dist/2020`), never the default draft-07 instance, so `$defs`,
   `if/then/else` and `unevaluatedProperties` semantics are honoured rather
   than silently downgraded. Compiled per `$defs` name; unknown field / enum /
   variant ⇒ typed `ContractVersionMismatch` error, never silently ignored.
   Decimal strings stay strings.
5. **Contract tests against the loopback simulator only — blocking in CI.**
   A vitest suite spawns `tools/conformance.py serve --port <ephemeral>` from
   the **un-vendored** package path (`REFI_CONTRACT_PACKAGE_DIR`) and runs the
   README journey (identity exchange → listAccounts →
   onboarding/eligibility/kyc → templates → records → SSE resume), plus
   `conformance.py validate` and `self-test` as separate assertions.
   **CI must install and pin Python ≥ 3.11** (`actions/setup-python` with an
   exact version) and run this suite as a required check; a missing or wrong
   Python runtime in CI is a **configuration failure, not a skip**. Only the
   local developer convenience command (`pnpm test:contract --local`) may skip
   with an explicit message when Python ≥ 3.11 is absent, and that path is
   never what the protected branch gate runs. No network to any `.run.app` or
   `refi.internal` host; a test asserts the client refuses non-loopback
   `baseUrl` unless an explicit `allowRemote` flag is set (which nothing sets).
6. **`routes.ts` becomes derived.** Replace the 12 hand-written constants with
   values read from the generated paths type; keep `withAccountId`. Delete the
   "GET | POST" comments on eligibility/advisory-profiles.
7. **`user-assertion.ts`:** `amr` optional, `acr` rejected; add tests for the
   `jti`/`sid`/`sub` patterns. No other change.
8. **Leave `refi-api.yaml`, its gen file, `compat.ts`, hooks and MSW handlers
   untouched** in this PR. They are obsolete (§3) but removing them is a
   separate, larger slice that touches `apps/web` consumers; doing it here
   would break atomicity.

**Explicitly not in the PR:** any React hook, any `apps/web` page or BFF route
change, any identity-provider choice, any WIF or Google-credential
implementation (the `getBearer` dependency is injected and unimplemented),
any brokerage/allocation/action UI, any launch-scope wording.

**Gates:** `pnpm typecheck`, `pnpm lint`, `pnpm test` (adds the hash test, the
schema-validation tests, the loopback contract suite, the no-browser-import
tripwire), `pnpm route-manifest` unchanged (no new BFF routes). The CI
workflow change that pins Python ≥ 3.11 is part of the same PR — the suite
must be visibly red in CI without it before it is green with it.

**Estimated diff:** ~4 vendored JSON files (≈430 KB, no logic), 5–6 new TS
files, 2 edited (`routes.ts`, `user-assertion.ts`), 1 `package.json` script.

Awaiting review of this diff before implementation.
