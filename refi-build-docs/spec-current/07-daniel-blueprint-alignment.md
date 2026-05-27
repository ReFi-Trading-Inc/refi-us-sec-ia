# Daniel Blueprint Alignment Audit

> **⚠️ SUPERSEDED FOR FORWARD PLANNING — 2026-05-20**
>
> This document was a pre-rescope audit against Daniel's PDF blueprints
> (the IO docs and as-built docs). It assumed Daniel would publish his own
> investor-facing API surface that the UI would consume.
>
> After reading Daniel's actual `refinity-main-main` codebase
> (`08-daniel-rescope-plan.md`), we discovered:
>
> 1. **No investor-facing REST API exists in Daniel's backend.** `routing-api` is a 0-LOC skeleton; the implemented services are an internal Pub/Sub pipeline.
> 2. **The frontend team owns the BFF** (`10-bff-architecture-decision.md`).
> 3. **Every UI surface backs onto either** a Spanner SELECT, a Pub/Sub publish, or a UI-owned shim.
>
> For **forward planning**, use:
>
> - `08-daniel-rescope-plan.md` — Daniel actual-code analysis + new ticket plan (MIG-P2.5R)
> - `09-daniel-answers-and-product-reframe.md` — Q1/Q2/Q3/Q5 answers + tier model + invalidated work
> - `10-bff-architecture-decision.md` — BFF host ADR
> - `06-backend-contract-map.md` — current BFF-endpoint-by-endpoint mapping (rewritten 2026-05-20)
>
> This file is kept as **historical reference** for the pre-Daniel-code-read assumptions and for the per-domain alignment notes that remain accurate at the contract-shape level (SIWE error envelope, Daniel's KYC enum vs ours, etc.). The drift verdicts (DRIFT / INVENTED / MISSING) are still correct against the PDF blueprints — they just don't reflect the absence of any deployable Daniel service the UI would point at.
>
> ---

**Author:** UI agent search pass
**Date:** 2026-05-19
**Save location:** `refi-build-docs/spec-current/07-daniel-blueprint-alignment.md`
**Scope of sources actually read:**

- `API and Event Contracts.pdf` — full (12 pages)
- `Phase 2 Low-Level/Compliance Adapter.pdf` — full (9 pages)
- `Phase 2 Low-Level/Wallet Sign-In (SIWE).pdf` — full (10 pages)
- `Phase 2 Low-Level/CCID KYC (Onboarding Attestation).pdf` — full (10 pages)
- `Phase 2 Low-Level/ACE Integration Contract.pdf` — full (7 pages)
- `UI UX Handoff (Netlify Demo to Production Integration).pdf` — full (8 pages)
- `Phase 1 - DEV Checkpoints.pdf` — full (1-page index only; content is in per-checkpoint pages not exported as PDF)
- `Progress and Revision Entries.pdf` — full (6 pages, 19/8/25 → 28/8/25)
- `Observability Spec and Alerts-as-Code.pdf` — full (7 pages)
- UI repo: `packages/api-clients/openapi/refi-api.yaml`, `packages/api-clients/src/generated/api.ts`, `packages/api-clients/src/mocks/handlers.ts`, `packages/api-clients/src/hooks/{auth,broker,kyc}.ts`, `apps/web/proxy.ts`, `apps/web/app/us/app/_components/CompliancePreview.tsx`, `apps/web/app/api/us/eligibility/route.ts` + `rules.ts`, `apps/web/app/us/onboarding/broker/page.tsx` (error map only), `refi-build-docs/spec-current/{06-backend-contract-map.md, MIG-P2.5-audit.md}`

**Not read (budget/relevance):** `Phase 2 High-Level.pdf`, `Phase 2 Low-Level (parent).pdf` (the 39 KB index), `Phase 1 Low-Level (parent).pdf`, `Bridge Plan` sub-PDFs (A–K), `UI UX Admin/Explorer Specs`, `Threat Model STRIDE`, `PRDs and Acceptance Criteria`, `Phase 2 DEV Checkpoints`, `Phase 1 High-Level`. These are noted in section 12 as follow-up reads where a contract is asserted by reference but not confirmed first-hand.

---

## 0. Headline finding (read this before anything else)

**The user's premise that "Daniel has completed Phase 1 and parts of Phase 2" appears to be a documentation claim, not a code-shipping claim.**

The `Progress and Revision Entries.pdf` log runs from 19/8/25 to 28/8/25 and every single entry is "Documented X" or "Modified Y diagrams." There is no entry such as "Deployed", "Shipped staging endpoint", "Service live", "Webhook reachable", "CI green for service Z." Daniel has authored a very thorough architecture blueprint and per-component low-level designs (file names of Python modules, MongoDB collection schemas, Redis key patterns), but the artifacts the UI would actually need to wire to — a published OpenAPI bundle, a staging URL, signed example payloads, a test webhook — are **not visible in the Architecture folder we were pointed at.** The PDFs frequently contain `(or .go)`, `(exact path may vary by environment)`, `(or whatever Chainlink ACE supports in our established environment)` — phrasings that indicate "design intent" rather than "deployed contract."

**Implication for Wave 2 of MIG-P2.5:** every endpoint our UI calls today is mocked by MSW (`packages/api-clients/src/mocks/handlers.ts`), and we have **no evidence** any of those endpoints have a real implementation at a staging URL. The "internet advisory operation" Phase 2 slice (SIWE auth, CCID KYC, Compliance Adapter, Eligibility, ACE/broker) is **fully specified** by Daniel — but it does not appear to be **fully implemented** by Daniel, based on what we can see. The UI should treat Daniel's PDFs as **the contract to mock against**, not as endpoints to point at. This actually simplifies Wave 2: stop guessing, start mirroring Daniel's documented contracts in our MSW handlers and OpenAPI YAML.

If this premise is wrong — i.e., Daniel has shipped Phase 2 services to a staging environment and the URLs simply weren't passed to us — then sections 11 and 12 below need to be re-asked of Daniel directly.

---

## 1. Phase 1 & Phase 2 completion status — per Daniel's docs

| Service                                                                                                                                                                                                       | Daniel's spec status                                                                                                                                  | Daniel's implementation evidence                                                                                                                                                    | Notes                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Phase 1: 11 Core Services (Account Intent Builder, Cloud Scheduler, Data Loader, Execution Gateway, Inference Worker, Portfolio Engine, Pub/Sub Bus, Risk Engine, Trade Manager, Trainer, Training Scheduler) | Low-level designed per `Phase 1 Low-Level/*.pdf` (sub-folder listing, contents not read this pass)                                                    | "Documented 11 low-level Core Services Components architecture for Phase 1" (Progress log, 20/8/25). Plus 4 Phase 1 dev checkpoints + script designs (a-e). **No "shipped" entry.** | Treat as design-complete, implementation-unknown                        |
| Phase 2: SIWE                                                                                                                                                                                                 | Fully specified in `Wallet Sign-In (SIWE).pdf` — 10 pages, 6 stages A–F, full error code list, full MongoDB collection layout, full Redis key pattern | "Documented 4 low-level Identity and Compliance Components architecture for phase 2" (Progress log, 21/8/25). No deploy entry.                                                      | Treat spec as the contract; assume no live endpoint                     |
| Phase 2: CCID/KYC                                                                                                                                                                                             | Fully specified in `CCID KYC.pdf` — 10 pages, 6 stages A–F, ComplyCube-style provider abstraction, attestation lifecycle, compliance trigger          | Documented 21/8/25. No deploy entry.                                                                                                                                                | Same                                                                    |
| Phase 2: Compliance Adapter                                                                                                                                                                                   | Fully specified in `Compliance Adapter.pdf` — 9 pages, 8 stages A–H, cache TTL semantics, trigger evaluation, fail-closed posture                     | Documented 21/8/25. No deploy entry.                                                                                                                                                | Same — this is THE binding for our `CompliancePreview` gate             |
| Phase 2: ACE Integration Contract                                                                                                                                                                             | Fully specified in `ACE Integration Contract.pdf` — 7 pages, 8 stages, retry/circuit breaker, response mapping                                        | Documented 21/8/25 (named "ACE Integration Contract" in 21/8 rename)                                                                                                                | Stateless client _inside_ Compliance Adapter — UI doesn't call directly |
| Phase 2: rest (Risk Engine extensions, Token Policy module — Phase 4 mostly)                                                                                                                                  | Per `Phase 2 High-Level.pdf` and `Phase 2 Low-Level.pdf` (parent, not read this pass)                                                                 | "Documented 4 phase 2 Dev checkpoints" (23/8/25)                                                                                                                                    | Not confirmed first-hand this pass                                      |
| Phase 3 (Audit / Merkle / Anchor / Explorer)                                                                                                                                                                  | Specified, 5 components documented 21/8/25; script designs 25/8/25                                                                                    | No deploy.                                                                                                                                                                          | Out of scope for our P2.5                                               |
| Phase 4 (On-chain driver, Token Policy, DePIN attestations)                                                                                                                                                   | Specified                                                                                                                                             | No deploy.                                                                                                                                                                          | Out of scope                                                            |

**There is no Phase 1 or Phase 2 entry in `Progress and Revision Entries.pdf` that says anything was deployed, shipped, or made reachable.** Every entry is a documentation milestone. (Citation: `Progress and Revision Entries.pdf:p1–6`)

---

## 2. Endpoint-by-endpoint alignment

### 2.1 Auth / SIWE

| Endpoint                                     | Daniel                                                                                                                                                                                                                        | UI today                                                                                                                                         | Verdict            | Notes                                                                                                                                                                                                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /siwe/nonce`                            | `→ {nonce}` bound to `{domain, origin, uri, chainId}` (SIWE.pdf:p8)                                                                                                                                                           | `POST /siwe/nonce` (handlers.ts:107,110 supports both verbs); returns `{nonce}` only                                                             | **DRIFT**          | Daniel specifies GET only and binds nonce to `{domain, origin, uri, chainId}`; we don't pass those, we don't read them server-side, and our `siweNonce()` hook (`hooks/auth.ts:53`) uses POST                                                          |
| `POST /siwe/verify`                          | Body `{message, signature}` → `{access_token/cookies, refresh_token/cookies, account_id}` (SIWE.pdf:p8)                                                                                                                       | Body `{message, signature}` → `{ok: true}` + `Set-Cookie: us_session_v1` (handlers.ts:113)                                                       | **DRIFT**          | We return just `{ok}`. Daniel returns `account_id` (and tokens or cookies). Our `AuthSession` includes `account_id` separately via `/auth/session` — works, but a verify success response that doesn't include `account_id` forces a second round-trip |
| `POST /auth/refresh`                         | Rotate refresh, return new tokens (SIWE.pdf:p8)                                                                                                                                                                               | Returns `{ok: true}` + reissues cookie (handlers.ts:118)                                                                                         | **MATCH (loose)**  | Cookie-mode is fine; just no payload schema confirmed                                                                                                                                                                                                  |
| `POST /auth/logout`                          | Daniel name (SIWE.pdf:p8)                                                                                                                                                                                                     | UI calls `POST /auth/revoke-all` (handlers.ts:123, `useSignOut` at `hooks/auth.ts:84`)                                                           | **DRIFT**          | We named it `/auth/revoke-all`. Daniel calls it `/auth/logout` with optional "device-wide revoke by account." Rename or accept Daniel's name                                                                                                           |
| `POST /wallets/link`, `POST /wallets/unlink` | Defined (SIWE.pdf:p8)                                                                                                                                                                                                         | Not present in UI hooks or handlers                                                                                                              | **MISSING IN UI**  | Multi-wallet linking unused today; safe deferral                                                                                                                                                                                                       |
| `GET /auth/session`                          | Not defined in SIWE.pdf — the spec assumes auth state lives in cookie+JWT and middleware decodes it                                                                                                                           | Defined in `refi-api.yaml:11` and consumed by `useAuthSession()`                                                                                 | **INVENTED BY UI** | Convenient but Daniel never speced a "current session" GET. We may keep ours as a UI-internal endpoint or replace with cookie-decode middleware                                                                                                        |
| SIWE error envelope                          | `{code, message, retryable, correlationId, details}` (API and Event Contracts.pdf:p9) with codes `NONCE_INVALID`, `SIGNATURE_INVALID`, `POLICY_VIOLATION`, `CHAIN_DENIED`, `ACCOUNT_BLOCKED`, `REFRESH_REVOKED` (SIWE.pdf:p9) | `SiweErrorCode` enum in `generated/api.ts:40-47` covers all six + `UNKNOWN`; `siweErrorCode()` parses `error.body.code` (`hooks/auth.ts:99-118`) | **MATCH**          | Codes match exactly. The envelope shape `{code, message, retryable, correlationId, details}` is not yet asserted in `refi-api.yaml` — add in MIG-P2.5-04                                                                                               |

### 2.2 CCID / KYC

| Endpoint                      | Daniel                                                                                                                | UI today                                                                                                                                                               | Verdict                         | Notes                                                                                                                                                                                                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /ccid/start`            | Body `{kind: "KYC"\|"KYB", jurisdiction, entity_fields?}` → `{session_url or client_token, session_id}` (CCID.pdf:p8) | No body; returns `{provider_url, provider_reference}` (handlers.ts:130, hook `useKycStart` at `hooks/kyc.ts:36` sends no body)                                         | **DRIFT**                       | We don't send `kind` or `jurisdiction`. Daniel returns `session_id` — we return `provider_reference`. Names differ but the field is conceptually the same                                                                                                                                                      |
| `GET /ccid/status`            | `?account_id=...` → "latest attestation summary" (CCID.pdf:p8)                                                        | No query; returns `KycStatus{status, provider?, last_updated?, provider_reference?}` (handlers.ts:129, `hooks/kyc.ts:25`)                                              | **DRIFT**                       | Daniel keys by `account_id` query param; we infer from session cookie. Our enum (`KycStatusValue`) differs from Daniel's — see Section 7                                                                                                                                                                       |
| `POST /ccid/issue_or_refresh` | `→ {attestation_id, status, expires_at}` (CCID.pdf:p8)                                                                | Not implemented                                                                                                                                                        | **MISSING IN UI**               | Backend-internal; UI may not need it directly. Compliance trigger handles refresh                                                                                                                                                                                                                              |
| `POST /ccid/invalidate`       | Mark revoked, optional upstream revoke (CCID.pdf:p8)                                                                  | Not implemented as `/ccid/invalidate`; instead we have `POST /compliance/invalidate-cache` (handlers.ts:143, hook `useComplianceInvalidateCache` at `hooks/kyc.ts:70`) | **INVENTED BY UI**              | Our endpoint name belongs to the Compliance Adapter admin surface (CompAdapter.pdf:p8 "POST /compliance/{account_id}/invalidate"), not CCID. Path drift: Daniel uses `/compliance/{account_id}/invalidate` (path param). We use `/compliance/invalidate-cache?account_id=...` (query param). Rename for Wave 2 |
| `POST /ccid/webhook/provider` | Server-to-server only (CCID.pdf:p8)                                                                                   | Dev-only `useKycSimulateWebhook` mutation (handlers.ts:138, `hooks/kyc.ts:52`)                                                                                         | **MATCH (dev-only simulation)** | UI must never call this in prod. Hook name makes intent explicit. Good                                                                                                                                                                                                                                         |

### 2.3 Compliance Adapter

| Endpoint                                                                                                        | Daniel                                                                                                                                                                                                                                     | UI today                                                                                                                                                                                                                                | Verdict                                 | Notes                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /compliance/{account_id}`                                                                                  | Query `intent_notional, jurisdiction, trigger`; returns `{verdict, expiry_at, reasons[], cache_hit, policy_version}` (CompAdapter.pdf:p8)                                                                                                  | UI calls `POST /orders/preview` with `OrderRequest` body; returns `OrderPreviewResult{status, reasons[], source, latency_ms}` (handlers.ts:204, generated/api.ts:123)                                                                   | **DRIFT — semantic**                    | Two different shapes. Daniel: cache-style verdict per account with hints. UI: per-order preview with full request body. Our shape _is closer to what an investor-facing preview should be_ but the field naming diverges everywhere                             |
| Internal `POST /internal/verdict`                                                                               | `{account_id, route, need_fresh_ace}` → `{status: ALLOW\|REVIEW\|DENY, expiry, reasons[], source: cache\|fresh}` (API Contracts.pdf:p5)                                                                                                    | Same as above                                                                                                                                                                                                                           | **DRIFT (UI exposes adapter directly)** | Daniel meant `/internal/verdict` to be called by the Risk Engine, _not_ by the browser. We are calling the Compliance Adapter directly from the UI. That's fine for the SEC IA slice (no Risk Engine yet), but the contract drift is real                       |
| Field `cache_hit: boolean` (Daniel) vs `source: "cache" \| "fresh"` (UI)                                        | (CompAdapter.pdf:p8)                                                                                                                                                                                                                       | (generated/api.ts:126)                                                                                                                                                                                                                  | **DRIFT**                               | Trivially mappable but currently misaligned                                                                                                                                                                                                                     |
| Field `expiry_at` (Daniel) vs not-emitted (UI)                                                                  | (CompAdapter.pdf:p8)                                                                                                                                                                                                                       | UI does not display verdict expiry at all                                                                                                                                                                                               | **MISSING IN UI**                       | UI should render "valid until HH:MM" — relevant to investor trust and matches Daniel's TTL semantics                                                                                                                                                            |
| Field `policy_version` (Daniel)                                                                                 | (CompAdapter.pdf:p7)                                                                                                                                                                                                                       | UI does not request or display it                                                                                                                                                                                                       | **MISSING IN UI**                       | This is needed for audit linkage in the RecommendationDetail (MIG-P2.5-19 already includes `automation_eligibility.advisory_context` with version refs — wire `policy_version` into that)                                                                       |
| Field `latency_ms` (UI extension)                                                                               | Not in Daniel                                                                                                                                                                                                                              | (generated/api.ts:128)                                                                                                                                                                                                                  | **INVENTED BY UI**                      | Probably fine; Daniel keeps latency in telemetry only                                                                                                                                                                                                           |
| Admin: `POST /compliance/{account_id}/refresh`, `POST /compliance/{account_id}/invalidate` (CompAdapter.pdf:p8) |                                                                                                                                                                                                                                            | UI exposes `/compliance/invalidate-cache?account_id=...` only                                                                                                                                                                           | **DRIFT (path)**                        | See 2.2 — our path doesn't follow Daniel's `/compliance/{account_id}/...` REST style                                                                                                                                                                            |
| Reason codes                                                                                                    | Daniel names two explicitly: `ACE_UNAVAILABLE` (Adapter.pdf:p8) and `INCOMPLETE_KYC` (Adapter.pdf:p8). API Contracts.pdf:p9 also lists `COMPLIANCE_UNAVAILABLE`, `POLICY_BLOCK`, `BROKER_UNAVAILABLE`, `STALE_PRICES`, `IDEMPOTENT_REPLAY` | Our MSW returns `POSITION_SIZE_LIMIT`; MIG-P2.5-03 specs 7 named codes: `ALLOW`, `REVIEW_CONCENTRATION`, `REVIEW_TAX_IMPACT`, `DENY_POSITION_SIZE`, `DENY_DISCLOSURE_REQUIRED`, `DENY_STALE_BROKER_DATA`, `DENY_COMPLIANCE_UNAVAILABLE` | **DRIFT — see §5 deep dive**            | Daniel does not enumerate our 7 codes anywhere visible. He defines the _envelope_, not the _taxonomy_. We can keep ours — but we should align with Daniel's two-word `INCOMPLETE_KYC` style and add `ACE_UNAVAILABLE` as alias of `DENY_COMPLIANCE_UNAVAILABLE` |

### 2.4 ACE (UI does NOT call directly)

| Endpoint                                                                                                     | Daniel | UI today | Verdict                                    |
| ------------------------------------------------------------------------------------------------------------ | ------ | -------- | ------------------------------------------ |
| ACE Integration Contract is a library `ACEClient.evaluate(ACEContext)` (ACE.pdf:p2) — **never called by UI** | Daniel | —        | **N/A** — UI correctly never references it |

### 2.5 Broker / ACE-trading (Phase 4 in Daniel's model; Phase 2 IA in ours)

| Endpoint                                                                    | Daniel                                                                                                                                                                                                                              | UI today                                                            | Verdict               | Notes                                                                                                                                                                                                  |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /v1/brokers/supported`, `connection`, `account`, `positions`, `orders` | **Not specified in any Daniel doc read this pass.** Daniel's broker surface in `Trade Manager.pdf` (Phase 1 Low-Level, not read) and Phase 4 docs is concerned with order routing, not investor-facing broker connection management | UI has all 5 (handlers.ts:149-189)                                  | **INVENTED BY UI**    | This is the broker-onboarding surface (Alpaca API-key intake). Daniel doesn't appear to spec it because Daniel's architecture assumes the broker is wired by ops, not by the end user. Big gap to flag |
| `POST /v1/brokers/connect/keys` (Alpaca API-key intake)                     | Not specified                                                                                                                                                                                                                       | UI has it; returns `{ok, connection}` (handlers.ts:172)             | **INVENTED BY UI**    | Schema gap noted in `06-backend-contract-map.md:104`. Error codes 401/403/422 mapped at `apps/web/app/us/onboarding/broker/page.tsx:131-144` — entirely UI-owned mapping                               |
| `POST /v1/brokers/connect/start` (OAuth flow)                               | Not specified                                                                                                                                                                                                                       | Stub                                                                | **INVENTED BY UI**    | Same                                                                                                                                                                                                   |
| `POST /v1/brokers/disconnect`                                               | Not specified                                                                                                                                                                                                                       | Stub                                                                | **INVENTED BY UI**    | Same                                                                                                                                                                                                   |
| Stale-broker-data signal                                                    | Not specified in Daniel docs read                                                                                                                                                                                                   | UI plans `data_stale?: boolean` on `BrokerConnection` (MIG-P2.5-11) | **MISSING IN DANIEL** | Investor-facing concept Daniel hasn't speced                                                                                                                                                           |

### 2.6 Orders

| Endpoint                                                                                                                                                                             | Daniel                                                                                                                     | UI today                                                                                                  | Verdict                 | Notes                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Daniel's order surface is event-bus (`orders.cmd` → driver → `orders.evt`) per API Contracts.pdf:p7. There is **no REST POST /orders documented in any of the 5 Phase 2 PDFs read.** | Daniel                                                                                                                     | UI has `POST /orders`, `GET /orders`, `DELETE /orders/{id}` (refi-api.yaml:203-244, hooks/orders.ts)      | **INVENTED BY UI**      | The UI is exposing a REST shim over what Daniel models as a pub/sub flow. This is acceptable (the REST endpoint can publish to `orders.cmd`), but Daniel hasn't published its OpenAPI                                                                                                            |
| Order status enum                                                                                                                                                                    | Daniel orders.evt status: `submitted, mined, reverted, acked, partial, filled, cancelled, rejected` (API Contracts.pdf:p7) | UI `OrderStatus`: `accepted, filled, partially_filled, canceled, rejected, pending` (generated/api.ts:89) | **DRIFT — enum values** | We have `accepted` and `pending` (not in Daniel). Daniel has `submitted`, `mined`, `reverted`, `acked`, `partial`. We spell `canceled` (US) vs Daniel `cancelled` (UK), `partially_filled` vs `partial`. **All 6 of our values need realignment** if we want to consume Daniel's events directly |
| `clientOrderId` semantics                                                                                                                                                            | Required in `orders.cmd` (API Contracts.pdf:p7), idempotency key                                                           | Our `Order.id` is server-issued; no `client_order_id` field at all                                        | **MISSING IN UI**       | We should add `client_order_id` for end-to-end correlation with Daniel's eventual `OrderIdMap`                                                                                                                                                                                                   |
| `Idempotency-Key` header on POST                                                                                                                                                     | Required (API Contracts.pdf:p10)                                                                                           | Not sent by `useSubmitOrder`                                                                              | **MISSING IN UI**       | Add for Wave 2                                                                                                                                                                                                                                                                                   |

### 2.7 Recommendations

| Endpoint                                                  | Daniel                                                                                                                                                                                                                                                           | UI today                               | Verdict                                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| `GET /v1/recommendations`, `GET /v1/recommendations/{id}` | **Not specified in any Daniel doc read.** Daniel's `Inference Worker.pdf` and `Portfolio Engine.pdf` (Phase 1 Low-Level, not read) presumably define how recommendations are _generated_, but there is no investor-facing recommendation API in the Phase 2 docs | UI has both (refi-api.yaml:245-269)    | **INVENTED BY UI / MISSING IN DANIEL**                                        |
| `PATCH /v1/recommendations/{id}`                          | Not specified                                                                                                                                                                                                                                                    | Planned (MIG-P2.5-12)                  | Same                                                                          |
| `RecommendationDetail` deep shape (MIG-P2.5-19)           | Not specified                                                                                                                                                                                                                                                    | UI specced (MIG-P2.5-audit.md:699-742) | **INVENTED BY UI** — but a forward-looking proposal Daniel should sign off on |

### 2.8 Activity / Audit

| Endpoint              | Daniel                                                                                                              | UI today                                                                        | Verdict                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `GET /v1/activity`    | Not specified. Daniel's Audit Writer (Phase 3) emits `audit.evt` to a bus; the Explorer API (Phase 3) reads from it | UI has shallow listing (handlers.ts:266)                                        | **DRIFT** — UI flattens what is really an Explorer/audit surface                     |
| `ActivityEvent` shape | Daniel envelope is `{kind, ref_id, emitted_at, correlationId, redactions[], digest}` (API Contracts.pdf:p9)         | UI: `{id, type, description, created_at, metadata?}` (generated/api.ts:141-147) | **DRIFT — schema** — we have no `digest`, `ref_id`, `correlationId`, or `redactions` |

### 2.9 Profile / Strategy / Activation / Documents / Support

| Endpoint                                                  | Daniel                                                                                                                              | UI today                                      | Verdict            |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------ |
| `GET/POST /v1/profile`                                    | Not specified in any read Phase 2 doc; the `accounts` collection holds `kyc_profile_ref` (SIWE.pdf:p7) but the schema isn't exposed | UI fixture has 7 fields (handlers.ts:316-341) | **INVENTED BY UI** |
| `GET /v1/strategies/current`                              | Not specified                                                                                                                       | UI has 9-field `StrategyDescriptor`           | **INVENTED BY UI** |
| `GET /v1/account/activation`, `POST /v1/account/activate` | Not specified                                                                                                                       | UI has both (handlers.ts:372,382)             | **INVENTED BY UI** |
| `POST /v1/documents/acknowledge`, `GET /v1/documents`     | Not specified                                                                                                                       | UI has POST stub; GET planned                 | **INVENTED BY UI** |
| `POST /v1/support/ticket`                                 | Not specified                                                                                                                       | UI has stub                                   | **INVENTED BY UI** |

**Summary:** of ~30 endpoints the UI touches, only **~8 have a Daniel-documented contract** (SIWE 6, CCID 5, Compliance Adapter 3-ish, ACE library 0 — UI never calls). The remaining ~22 are UI-invented because Daniel's blueprint **doesn't model an investor-facing UI**; it models a service mesh for a managed trading platform.

---

## 3. Schema alignment

For each: **D** = Daniel's shape, **U** = ours (`generated/api.ts`), then deltas.

### `OrderPreviewResult` / `Verdict`

- **D:** `{status: ALLOW|REVIEW|DENY, expiry: date-time, reasons: string[], source: cache|fresh, policy_version: string, cache_hit: boolean}` (CompAdapter.pdf:p8, API Contracts.pdf:p6)
- **U:** `{status: ALLOW|REVIEW|DENY, reasons: {code, message}[], source: cache|fresh, latency_ms?}` (generated/api.ts:123)
- **Deltas:** UI missing `expiry` and `policy_version`. UI's `reasons` is `{code,message}[]`; Daniel's is `string[]`. UI's `source` matches D's `source` semantically but D **also** has `cache_hit: boolean` redundantly. UI's `latency_ms` is UI-only.
- **Recommendation:** keep our `reasons[].{code,message}` (better UX); add `expiry: string`, `policy_version: string`; drop expectation that Daniel will return `latency_ms`.

### `BrokerConnection`

- **D:** Not specified anywhere in Phase 2 docs read.
- **U:** `{broker_id, broker_name, status: connected|disconnected|pending, connected_at?}` (generated/api.ts:61); planned `data_stale?: boolean` per MIG-P2.5-11.
- **Verdict:** entirely UI-owned. Safe to keep until Daniel publishes.

### `Recommendation` / `RecommendationDetail`

- **D:** No spec.
- **U:** Shallow `Recommendation` today + deep `RecommendationDetail` proposed in MIG-P2.5-19.
- **Verdict:** UI-owned; the proposed `RecommendationDetail` is **a contract Daniel will need to bless** when Recommendation API surfaces.

### `KycStatus`

- **D:** Daniel uses `status` values across two PDFs: webhook decision is `approved | review | denied` (CCID.pdf:p5 Stage B), attestation `status` is `issued | revoked | pending_issue` (CCID.pdf:p6, p9), session `status` is `created | completed` (CCID.pdf:p4). There is **no single unified user-facing KYC enum** in the doc.
- **U:** `KycStatusValue = not_started | pending | incomplete | under_review | approved | denied` (generated/api.ts:7-13). Polling treats `approved | denied | under_review` as terminal (`hooks/kyc.ts:11-15`).
- **Deltas:** UI's `under_review` ≈ Daniel's webhook `review` decision. UI's `not_started | pending | incomplete` collapse three Daniel concepts (no session, session created, session in-flight). UI's terminal set treats `under_review` as terminal — **bug if Sarah persona is supposed to keep polling.** Daniel's `under_review` is a non-terminal manual-ops state in `webhook signature failure → 401` and `Evidence or mapping failure → mark decision review and require manual ops` (CCID.pdf:p9). The MIG-P2.5-audit:448 also says Sarah's KYC is "under review (polling state visible)" — so our `TERMINAL` set is **internally contradictory** with the persona plan.
- **Recommendation:** keep our 6 values; **remove `under_review` from `TERMINAL`** at `hooks/kyc.ts:11`; add a doc comment mapping each value to Daniel's stage.

### `ActivityEvent`

- **D:** `{kind, ref_id, emitted_at, correlationId, redactions[], digest}` (API Contracts.pdf:p9, AsyncAPI `audit.evt`)
- **U:** `{id, type, description, created_at, metadata?}` (generated/api.ts:141)
- **Deltas:** all 5 of Daniel's fields differ from ours. Daniel models an audit event; we model an activity-feed event for an investor. These are **two different things** — fine to keep both, but our `ActivityEvent` needs a `decision_record_id` / `audit_leaf_hash` field (already noted in `06-backend-contract-map.md:175-177`) to bridge to Daniel's `audit.evt.ref_id` + `digest`.

### `EligibilityDecision`

- **D:** Not specified anywhere. Eligibility is **not a Daniel-owned domain.**
- **U:** `{result, state, ruleId}` (generated/api.ts:149); rule engine in `apps/web/app/api/us/eligibility/rules.ts`; JWT-signed cookie issued by `apps/web/app/api/us/eligibility/route.ts`.
- **Verdict:** **MISSING IN DANIEL — UI-owned in full.** Eligibility (state list, US-person, age ≥ 18, waitlist) is a regulatory-overlay concern that lives entirely in our Next route handler. No deltas to reconcile.

### `AuthSession`

- **D:** Implicit: the JWT carries `{sub: account_id, wal: wallet_id, kyc: kyc_status, ver: siwe}` (SIWE.pdf:p6, Stage D); session collection: `{session_id, account_id, wallet_id, access_jti, refresh_jti, created_at, expires_at, device_fingerprint_hash, ip_hash}` (SIWE.pdf:p6).
- **U:** `{status, account_id?, wallet_id?, roles?, kyc_status?, expires_in_seconds?}` (generated/api.ts:15-22). No `roles` in Daniel.
- **Verdict:** **MATCH (mostly)** — UI's `roles[]` is a UI-only RBAC convenience. Daniel's `kyc` claim maps cleanly to our `kyc_status`. Our `expires_in_seconds` may want to mirror Daniel's `expires_at` instead.

### `Position`

- **D:** Not specified in Phase 2 docs read.
- **U:** Standard Alpaca-style position (generated/api.ts:76-85).
- **Verdict:** **MISSING IN DANIEL** — fine.

### `Order`

- **D:** Daniel's `orders.evt` payload: `{broker_order_id?, fills_delta?, revert_reason?}` (API Contracts.pdf:p7); status enum see §2.6. There is no REST `Order` resource in Daniel.
- **U:** `{id, symbol, qty, side, type, status, limit_price?, filled_qty?, filled_avg_price?, created_at}` (generated/api.ts:106-117).
- **Deltas:** status enum drift (see §2.6). UI missing `client_order_id`, `correlationId`, `revert_reason`, `broker_order_id`. **The UI's `Order` is investor-friendly; Daniel's is operations-friendly.** Both probably need to coexist.

### Documents

- **D:** Not specified.
- **U:** Hardcoded in `apps/web/app/us/_content/disclosures.ts`; MIG-P2.5-06 plans to add `{version, effectiveDate, hash, unlockCondition, requiredForActivation}`.
- **Verdict:** **MISSING IN DANIEL — UI-owned.** Likely safe forever; document acknowledgments are an adviser-overlay concern.

---

## 4. Security / middleware / headers alignment

| Daniel expectation                                                                                                                                             | Our implementation                                                                                                                                                                      | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `correlationId` on every request, threaded through logs and audit events (API Contracts.pdf:p9; SIWE.pdf:p9; CompAdapter.pdf:p3; Observability:p2)             | `proxy.ts:50-54` sets `x-correlation-id` on inbound, echoes on outbound; MSW echoes back (handlers.ts:51-62)                                                                            | **MATCH**                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| CSRF via double-submit or `SameSite=Strict` (SIWE.pdf:p7,p9; UI Handoff:p3)                                                                                    | `proxy.ts:107-120` issues `csrf_v1` cookie (httpOnly:false, sameSite:lax) on `/us/app/*` nav; MSW writes guard `x-csrf-token` (handlers.ts:91-100)                                      | **MATCH (mostly)** — Daniel says `SameSite=Lax/Strict`, we use Lax. Acceptable. SIWE verify intentionally exempt (handlers.ts:114) — matches Daniel's "nonce-as-anti-forgery" model                                                                                                                                                                                                                                                                              |
| HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy (UI Handoff:p4)                                                                              | All set in `proxy.ts:95-105` with HSTS `max-age=63072000; includeSubDomains; preload`                                                                                                   | **MATCH**                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Strict CSP with nonce + `frame-ancestors 'none'`, `base-uri 'self'` (UI Handoff:p4)                                                                            | `proxy.ts:21-45` builds nonce CSP per request; nonce echoed via `x-csp-nonce`                                                                                                           | **MATCH (stricter than Daniel)** — we include `'strict-dynamic'`, add wss:/https: for `connect-src`. Differences are appropriate for our PostHog/Sentry choices. **Note:** Daniel's CSP allow-list at `UI Handoff:p4` is `connect-src 'self' https://api.<env-domain> https://explorer.<env-domain>` — much tighter than our `connect-src 'self' wss: https:`. We should tighten to specific domains for prod (currently allow-everything via `https:` wildcard) |
| HTTP-only, Secure cookies for session (SIWE.pdf:p9)                                                                                                            | Our MSW session cookie: `HttpOnly; SameSite=Lax` (handlers.ts:44-47). Eligibility cookie: `httpOnly: true, secure: true, sameSite: 'lax'` (`route.ts:113-118`)                          | **MATCH**                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Hash and salt IP/device fingerprints (SIWE.pdf:p9)                                                                                                             | Eligibility route HMACs IP+UA with `IP_HASH_SECRET` (`route.ts:82-83`). Salted: yes via secret-keyed HMAC.                                                                              | **MATCH** — and arguably _better_, our HMAC matches Daniel's "Hash and salt" intent directly                                                                                                                                                                                                                                                                                                                                                                     |
| Rate limiting per IP/origin (SIWE.pdf:p4, p9)                                                                                                                  | Eligibility route uses in-memory `createRateLimiter({windowMs: 15min, max: 5})` (`route.ts:15`). MSW handlers have no rate limiting; UI assumes server enforces.                        | **PARTIAL** — eligibility has it; SIWE handlers don't (because MSW). Production must enforce Daniel's per-IP/per-origin Redis token-bucket                                                                                                                                                                                                                                                                                                                       |
| `Idempotency-Key` header on writes (API Contracts.pdf:p10)                                                                                                     | UI does **not** send `Idempotency-Key` on any write                                                                                                                                     | **MISSING IN UI**                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Fail-closed posture on Compliance Adapter unavailable (CompAdapter.pdf:p8 — "return REVIEW with reason ACE_UNAVAILABLE and short TTL")                         | `CompliancePreview.tsx:75,99` treats `query.isError` as `UNAVAILABLE` and disables Submit                                                                                               | **MATCH but stricter than Daniel** — Daniel says backend should return `REVIEW + ACE_UNAVAILABLE`; UI treats network error as the strictest fail-closed (`canSubmit = ALLOW only`, line 99). Our posture is **more conservative than Daniel's** — appropriate for an investor-facing UI but worth flagging                                                                                                                                                       |
| Structured logging with required JSON fields: `correlationId, account_id?, intent_id?, plan_id?, clientOrderId?, error.class?, error.code?` (Observability:p2) | UI does `console.info(JSON.stringify({...}))` for eligibility (`route.ts:100-108`). PostHog/Sentry wiring referenced but not seen this pass. No `intent_id` or `plan_id` anywhere in UI | **PARTIAL DRIFT** — fields not threaded                                                                                                                                                                                                                                                                                                                                                                                                                          |

---

## 5. Compliance Adapter deep-dive

This is **the** fail-closed binding. Cited exclusively from `Compliance Adapter.pdf`.

**Verdict envelope (Daniel, CompAdapter.pdf:p8):**

```
{verdict, expiry_at, reasons[], cache_hit, policy_version}
```

Our shape (`generated/api.ts:123`):

```
{status, reasons: {code,message}[], source: cache|fresh, latency_ms?}
```

**Mapping:**

- `verdict` ↔ `status` (semantically identical, name drift)
- `expiry_at` → **missing in UI**
- `reasons[]` (D: `string[]`) ↔ `reasons[]` (U: `{code,message}[]`) — UI is richer
- `cache_hit: boolean` ↔ `source: cache|fresh` — UI is more readable
- `policy_version` → **missing in UI**

**Named verdict codes (Daniel):**

- Only two codes are explicitly named: `ACE_UNAVAILABLE` (CompAdapter.pdf:p8) and `INCOMPLETE_KYC` (CompAdapter.pdf:p8).
- The broader API Contracts envelope (API Contracts.pdf:p9) lists service-class error codes: `BROKER_UNAVAILABLE, STALE_PRICES, COMPLIANCE_UNAVAILABLE, POLICY_BLOCK, IDEMPOTENT_REPLAY`.
- **Daniel does NOT enumerate concentration/tax-impact/position-size/disclosure verdict codes** — those are _policy_ concerns evaluated by Chainlink ACE, and Daniel keeps them deliberately open-ended ("Map ACE response to internal format `{verdict ALLOW or DENY or REVIEW, reasons[], ttl_hint}`" — ACE.pdf:p3).

**Our 7 specced codes (MIG-P2.5-audit.md:460-466):**

- `ALLOW`, `REVIEW_CONCENTRATION`, `REVIEW_TAX_IMPACT`, `DENY_POSITION_SIZE`, `DENY_DISCLOSURE_REQUIRED`, `DENY_STALE_BROKER_DATA`, `DENY_COMPLIANCE_UNAVAILABLE`.

**Does Daniel agree?** No data either way. Daniel hasn't pinned the policy taxonomy because it depends on ACE policy bundles. **Our 7 are a UI-side fixture set**, not a contract. We should:

1. **Keep our 7 as fixture/scenario labels** in `mocks/fixtures/compliance/verdicts.ts` (MIG-P2.5-03).
2. **Add alias `ACE_UNAVAILABLE` and `INCOMPLETE_KYC`** to match Daniel's two explicitly-named codes — so when Daniel's adapter ships, our reason-renderer recognizes them.
3. **Drop the "ALLOW" code value** — Daniel's `status: ALLOW` doesn't need a reason code; the `reasons[]` array is just empty.
4. **Document in our copy lookup** that `DENY_COMPLIANCE_UNAVAILABLE` is _our_ code for what Daniel returns as `REVIEW + ACE_UNAVAILABLE` — but **our UI escalates REVIEW to DENY on the unavailable path** (CompliancePreview.tsx:75 sets `kind: UNAVAILABLE` on any query error). This is **stricter than Daniel** by design (investor protection). Worth documenting in the brand voice / disclosures doc.

**REVIEW vs DENY rules:**

- Daniel: REVIEW = "needs human attention but not blocked" with short TTL (CompAdapter.pdf:p6, p8). DENY = "do not proceed."
- UI: `CompliancePreview.tsx:99` `canSubmit = verdict.kind === "ALLOW"`. **REVIEW blocks Submit.** This is **stricter than Daniel.** Daniel's REVIEW would allow trade with manual approval; ours requires re-running for ALLOW.
- This is appropriate for an investor self-service UI, but the **MIG-P2.5-19 RecommendationDetail spec** has `automation_eligibility.status: ALLOW|REVIEW|DENY` which suggests "REVIEW means manual approval flow" — there's an internal contradiction between our gate behavior and our schema design.

**Source: cache vs fresh (CompAdapter.pdf:p8):**

- Daniel ships `cache_hit: boolean` and uses cache for the hot path (sub-50ms p95).
- UI uses `source: "cache" | "fresh"` and displays both in dev (`CompliancePreview.tsx:140-144`). Production never displays. **MATCH in spirit.**

**latency_ms:**

- Daniel does **not** ship latency in the response — it's a server-side metric (`ace_evaluate_latency_ms` per Observability:p2).
- UI invented it (`generated/api.ts:128`) for the dev panel. **Drop expectation** that Daniel will populate it; compute UI-side via `Date.now()` deltas if needed.

**Caching behavior:**

- Daniel: TTL clamped by verdict tier (`ttl_min_allow`, `ttl_min_review`, CompAdapter.pdf:p8); background refresh sweeper; serve-first mode (CompAdapter.pdf:p7).
- UI: no awareness of TTL; treats every query as fresh. **MISSING IN UI** — should respect `expiry_at` and short-circuit re-fetch if still valid.

**Retry/timeout:**

- Daniel (ACE.pdf:p4): `connect_timeout 200-300ms`, `request_timeout 800-1500ms`, 2-3 retries on `429|5xx|EOF`, exponential backoff with jitter.
- UI: `apiFetch` retry policy not visible in files read this pass.

**What UI must do on UNAVAILABLE:**

- Daniel (CompAdapter.pdf:p8): "return last known cache if still valid; otherwise return REVIEW with reason ACE_UNAVAILABLE and short TTL."
- UI: `verdict.kind = UNAVAILABLE` and `canSubmit = false` (CompliancePreview.tsx:110-129). Shows warning + retry button. **MATCH in posture, stricter in render** — UI never falls back to "stale cached ALLOW," which is correct for fail-closed.

---

## 6. SIWE auth deep-dive

| Concern                      | Daniel                                                                                                                                                                     | UI                                                                                                                                             | Verdict                                                                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nonce verb                   | `GET /siwe/nonce` (SIWE.pdf:p8)                                                                                                                                            | Both GET and POST mocked; hook uses POST (`hooks/auth.ts:55`)                                                                                  | **DRIFT** — use GET only                                                                                                                          |
| Nonce body                   | `{domain, origin, uri, chainId}` (SIWE.pdf:p4)                                                                                                                             | None sent                                                                                                                                      | **DRIFT** — UI must send these bindings so server can store them with the nonce                                                                   |
| Nonce TTL                    | ~5 minutes (SIWE.pdf:p4)                                                                                                                                                   | Not modeled UI-side                                                                                                                            | OK (server concern)                                                                                                                               |
| Verify body                  | `{message, signature}` where message includes `domain, address, statement?, uri, version, chainId, nonce, issuedAt, expirationTime?, notBefore?, resources?` (SIWE.pdf:p4) | `buildSiweMessage()` produces `domain, address, statement, URI, Version: 1, Chain ID, Nonce, Issued At, Expiration Time` (hooks/auth.ts:31-46) | **MATCH** — `notBefore` and `resources` omitted (optional in Daniel)                                                                              |
| Domain/origin/URI binding    | "exact domain match, origin header matches allowed list, uri allowlist, chainId allowlist" (SIWE.pdf:p4)                                                                   | UI just signs and sends; trusts server                                                                                                         | OK (server concern)                                                                                                                               |
| Replay protection            | "atomically mark nonce used true ... reject if already used" (SIWE.pdf:p4)                                                                                                 | Not modeled UI-side                                                                                                                            | OK                                                                                                                                                |
| Verify response              | `{access_token/cookies, refresh_token/cookies, account_id}` (SIWE.pdf:p8)                                                                                                  | `{ok: true}` + Set-Cookie (handlers.ts:113-117)                                                                                                | **DRIFT** — UI's `useSiweVerify` doesn't expose `account_id` to caller; AuthProvider has to fetch `/auth/session` after. Inefficient but workable |
| Refresh rotation             | "only the newest refresh_jti per session is valid" (SIWE.pdf:p8)                                                                                                           | Not modeled UI-side                                                                                                                            | OK                                                                                                                                                |
| Logout                       | `POST /auth/logout` (SIWE.pdf:p8)                                                                                                                                          | UI uses `/auth/revoke-all` (hooks/auth.ts:87)                                                                                                  | **DRIFT — naming**                                                                                                                                |
| Wallet link/unlink           | `POST /wallets/link`, `/wallets/unlink` (SIWE.pdf:p8)                                                                                                                      | Not implemented                                                                                                                                | **MISSING IN UI** (acceptable for v1)                                                                                                             |
| Admin bypass                 | "Admins can impersonate for support with a short-lived admin JWT" (SIWE.pdf:p7)                                                                                            | Not modeled                                                                                                                                    | **MISSING IN UI** — Phase 4 admin work                                                                                                            |
| Error codes                  | `NONCE_INVALID, SIGNATURE_INVALID, POLICY_VIOLATION, CHAIN_DENIED, ACCOUNT_BLOCKED, REFRESH_REVOKED` + `correlationId` (SIWE.pdf:p9)                                       | All 6 + `UNKNOWN` modeled (generated/api.ts:40-47); error mapper at `hooks/auth.ts:99-118`                                                     | **MATCH**                                                                                                                                         |
| HTTPS-only, SameSite cookies | (SIWE.pdf:p9)                                                                                                                                                              | (handlers.ts:44; `proxy.ts:113-118`)                                                                                                           | **MATCH**                                                                                                                                         |

**Conclusion:** SIWE is the **best-aligned domain** — error codes, cookies, posture all match. The main drift is GET-vs-POST nonce and the missing nonce-binding body. Both are fast fixes for Wave 2.

---

## 7. KYC / CCID alignment

| Concern            | Daniel                                                                                                                             | UI                                                                                                                                                     | Verdict                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------ | ---------- | ---------------------------- | ------- | ---------- | ------------ | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Start session body | `{kind: "KYC"\|"KYB", jurisdiction, entity_fields?}` (CCID.pdf:p4)                                                                 | No body (hooks/kyc.ts:42)                                                                                                                              | **DRIFT** — UI must send `kind` and `jurisdiction`                                                                                                          |
| Start response     | `{session_url or client_token, session_id}` (CCID.pdf:p8)                                                                          | `{provider_url, provider_reference}` (handlers.ts:133-136)                                                                                             | **DRIFT — field names**                                                                                                                                     |
| Status enum        | Webhook decision: `approved                                                                                                        | review                                                                                                                                                 | denied`(CCID.pdf:p5). Attestation status:`issued                                                                                                            | revoked | pending_issue`(CCID.pdf:p6-9). Session status:`created | completed` | UI single enum: `not_started | pending | incomplete | under_review | approved | denied` | **DRIFT — different model.** UI collapses three Daniel concepts into one investor-facing status. That's fine but needs a clear mapping doc |
| Terminal states    | Daniel implies: `approved`, `denied`, `revoked`, `pending_issue` (server resolves async). `review` is a **non-terminal** ops state | UI's `TERMINAL` set: `approved, denied, under_review` (hooks/kyc.ts:11)                                                                                | **CONTRADICTION** — UI treats `under_review` as terminal but Sarah persona in MIG-P2.5-02 expects continued polling on under-review. **Bug; fix in Wave 2** |
| Polling cadence    | Webhook-driven; UI shouldn't busy-poll. CCID.pdf:p10 targets sub-100ms server processing per webhook step                          | UI polls every 5s (hooks/kyc.ts:22)                                                                                                                    | **DRIFT — too aggressive.** Daniel's design wants webhook-then-WebSocket-or-SSE; we're polling. Acceptable in dev; production should switch to push         |
| Webhook simulation | Daniel doc has `POST /ccid/webhook/provider` — server-to-server, signed (CCID.pdf:p4-5)                                            | UI has `useKycSimulateWebhook` dev-only mutation; MSW handler accepts no signature                                                                     | **MATCH (dev posture)** — UI correctly marks "dev-only"                                                                                                     |
| Compliance trigger | Daniel: CCID calls Compliance Adapter `invalidate/refresh` on issue/revoke/expiry (CCID.pdf:p7)                                    | UI exposes `useComplianceInvalidateCache` — but path is `/compliance/invalidate-cache?account_id=`, not Daniel's `/compliance/{account_id}/invalidate` | **DRIFT — path**                                                                                                                                            |
| No PII storage     | Daniel: "Do not store PII — only provider references and salted digests" (CCID.pdf:p9)                                             | UI never sees PII; KycStatus carries `provider`, `provider_reference`, `last_updated` only                                                             | **MATCH**                                                                                                                                                   |

---

## 8. ACE / broker integration alignment

**ACE Integration Contract** is a **server-side library**, not an HTTP endpoint (ACE.pdf:p6 "Internal: library call ACEResult evaluate(ACEContext, correlation_id, timeout_override?)"). The UI **must never call ACE directly** — it calls the Compliance Adapter, which uses the ACE client internally. UI is correctly never wired to ACE. **MATCH (by omission).**

**Broker integration** — Daniel's coverage is very thin in the docs read this pass:

| Concern                                                                                                                                                                                                | Daniel        | UI                                                                                                                                                                                                          | Verdict                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Daniel's `Trade Manager.pdf` (Phase 1 LL) is the broker contract — **not read this pass.** API Contracts.pdf:p9 lists `BROKER_UNAVAILABLE` as a standard error code, but no broker REST API is defined | —             | UI defines: `/v1/brokers/supported`, `/connection`, `/connect/start`, `/connect/keys`, `/disconnect`, `/account`, `/positions`, `/orders`                                                                   | **INVENTED BY UI**                                                                             |
| Alpaca API-key flow                                                                                                                                                                                    | Not in Daniel | UI submits `{broker_id, api_key_id, api_secret_key, environment}` (generated/api.ts:189-194); maps 401/403 → invalid creds, 422 → insufficient perms (`apps/web/app/us/onboarding/broker/page.tsx:131-144`) | **INVENTED BY UI** — and the error mapping is **a UI guess**, not a Daniel-sanctioned contract |
| Stale-data flag                                                                                                                                                                                        | Not in Daniel | Planned `BrokerConnection.data_stale?: boolean` (MIG-P2.5-11)                                                                                                                                               | **MISSING IN DANIEL**                                                                          |

**Major finding:** the broker investor-onboarding flow (manage your own Alpaca keys) is a **pure UI invention** based on Alpaca's published API conventions. Daniel hasn't modeled this. Wave 2 should keep our error mapping but **flag every broker endpoint in `06-backend-contract-map.md` as "no Daniel spec exists" — not just "schema gap."**

---

## 9. Eligibility — UI-owned route handler

**Daniel's coverage:** **zero.** The word "eligibility" does not appear in any of the 9 Daniel PDFs I fully read. Daniel's CCID/KYC handles regulatory-identity onboarding (jurisdiction + entity type); eligibility (US-state + age + US-person + waitlist) is an **adviser-overlay concern** that's regulator-specific to SEC Rule 203A-2(e) and unrelated to Daniel's core architecture.

**UI implementation:** `apps/web/app/api/us/eligibility/route.ts` runs entirely in our Next runtime:

- Validates `{state, isUsPerson, dob}` (zod) (route.ts:17-26)
- Evaluates `eligibilityRules` (4 rules: US-person required, age ≥ 18, state-waitlist {AK,HI,NY}, default-eligible) (rules.ts:19-45)
- HMACs IP+UA with `IP_HASH_SECRET` (route.ts:82-83)
- Signs a 24h JWT with `ELIGIBILITY_JWT_SECRET` (HS256, JOSE) (route.ts:85-97)
- Sets `us_eligibility_v1` cookie: `httpOnly, secure, sameSite: lax, path: /us` (route.ts:112-118)
- Per-IP rate limit: 5 attempts per 15 min (route.ts:15)

**Verdict:** **Entirely UI-owned. No Daniel coordination needed.** This is correct.

**One forward-looking note:** if Daniel ever ships an Account Service (per `/v1/account/activation` in our mocks), the eligibility decision will need to be **mirrored server-side at the Account Service** so activation can re-check it without trusting our JWT. For now, the UI route is the source of truth.

---

## 10. Observability / telemetry contracts

Daniel's `Observability Spec and Alerts-as-Code.pdf` is **operations-focused** (Prometheus metrics, OTel spans, PagerDuty routes). The required log fields (Observability.pdf:p2) are:

```
timestamp, level, service, emitter, correlationId, account_id?, intent_id?,
plan_id?, clientOrderId?, symbol?, route?, driver?, config_hash?,
policy_version?, cache_hit?, verdict?, reasons[]?, error.class?, error.code?
```

**Required trace spans (Daniel):** `risk.evaluate`, `eg.plan`, `tm.submit`/`driver.submit`, `ace.evaluate`, `audit.writer.consume → merkle.rotate → anchor.submit`. All **server-side** spans.

**UI side:**

- `correlationId` threaded by `proxy.ts:50-54` and `handlers.ts:51-62` — **MATCH**
- `CompliancePreview.tsx:32-36` defines `onVerdict({status, source, latency_ms})` telemetry hook — partial **MATCH** (lacks `correlationId, policy_version, account_id`)
- Eligibility route emits structured `console.info` log with `event, result, state, rule_id` (route.ts:101-108) — **PARTIAL MATCH** (lacks `correlationId, ip_hash, ua_hash` from the body of the route — they're computed but not logged)
- No `intent_id` or `plan_id` exists in UI today — would have to flow from server responses
- PostHog wiring referenced (proxy.ts:8-9 reads `NEXT_PUBLIC_POSTHOG_HOST`) but I did not read its event taxonomy this pass
- Sentry DSN allowlisted in CSP (proxy.ts:10-32)
- OTel exporter — not visible in files read this pass

**Frontend-specific events Daniel expects (Observability.pdf says nothing UI-specific):** Daniel's spec is entirely backend-service-centric. There is **no specified UI event taxonomy.** Our `useAnalytics` / PostHog events are entirely UI-defined. The brand-voice / UX docs likely cover them but I did not confirm.

**Verdict:** **MOSTLY MATCH on correlation-id threading.** Gaps: `policy_version`, `account_id`, `intent_id`, `plan_id` not threaded through UI events. Frontend RUM events (Web Vitals, Sentry) are UI-owned, Daniel doesn't constrain.

---

## 11. Phase 2 "internet advisory operation" minimum

The user asserts Daniel completed the slice needed to operate under SEC Internet Advisory Rule 203A-2(e). Based on the Phase 2 LL docs read, that slice would be:

| Service                | Daniel doc                     | UI hook                             | MSW handler                                | Real endpoint reachable?              |
| ---------------------- | ------------------------------ | ----------------------------------- | ------------------------------------------ | ------------------------------------- |
| SIWE Auth              | `SIWE.pdf`                     | `hooks/auth.ts` (all 4 functions)   | handlers.ts:106-127                        | **No evidence**                       |
| CCID KYC               | `CCID KYC.pdf`                 | `hooks/kyc.ts` (4 functions)        | handlers.ts:129-147                        | **No evidence**                       |
| Compliance Adapter     | `Compliance Adapter.pdf`       | `hooks/orders.ts` `useOrderPreview` | handlers.ts:204-229                        | **No evidence**                       |
| ACE library            | `ACE Integration Contract.pdf` | N/A (server-only)                   | N/A                                        | N/A — UI correctly doesn't touch      |
| Eligibility (UI-owned) | (none)                         | N/A                                 | `apps/web/app/api/us/eligibility/route.ts` | **Yes — this is real Next code**      |
| Broker integration     | None in Phase 2 docs           | `hooks/broker.ts` (5 functions)     | handlers.ts:149-189                        | **No evidence; entirely UI-invented** |

**"Wired end-to-end" status:** **No UI surface is wired to a real Daniel endpoint today.** Every Daniel-backed endpoint is mocked in MSW. The single end-to-end real path is the **UI-owned eligibility route** (`/api/us/eligibility`), which doesn't touch Daniel at all.

**Flag for the user:** if the user believes "Phase 2 IA operation slice is live," that belief needs verification with Daniel before any Wave 2 work assumes real-endpoint integration. Wave 2 as currently scoped (personas, RecommendationDetail, verdict matrix, OpenAPI fills) is **MSW-only work and does not require Daniel cutover** — which is actually a happy outcome.

---

## 12. Major risks / blockers / asks for Daniel

Top 10, phrased as "Daniel needs to publish X so UI can replace mock Y":

1. **A staging environment URL.** No PDF cites one. Daniel needs to publish at least `https://api-staging.refi.trading` (or whatever the real host is) so the UI can flip `NEXT_PUBLIC_API_BASE_URL` from MSW interception to real fetch. (Citation gap: nothing in `Progress and Revision Entries.pdf` says "deployed.")
2. **The actual OpenAPI bundle for Compliance Adapter.** The yaml in `API and Event Contracts.pdf:p5` shows only `/internal/verdict` (Risk-Engine-facing). The investor-facing path (whatever Daniel intends for the UI to call) is not published. Without this, the UI's `POST /orders/preview` shape is a guess.
3. **Named verdict-reason code list from Compliance Adapter.** Daniel only names `ACE_UNAVAILABLE` and `INCOMPLETE_KYC` (CompAdapter.pdf:p8). For UI copy mapping we need the full ACE-policy-bundle code list (we currently guess at 7 codes per MIG-P2.5-03).
4. **Recommendation API contract.** No PDF specifies a `GET /v1/recommendations` REST surface. Daniel needs to publish whether recommendations come from the Inference Worker (Phase 1) or a separate Recommendation API service, and what the `RecommendationDetail` shape will be.
5. **Broker API surface.** Daniel hasn't published any investor-facing broker REST API (`/v1/brokers/connection`, `/account`, `/positions`, `/orders`, `/connect/keys`). The UI invented all of it. Daniel needs to either ratify our shape or publish his own — including which broker integration model (Alpaca API-key submission vs OAuth vs IBKR) is canonical.
6. **Order resource shape.** Daniel's `orders.evt` event (API Contracts.pdf:p7) has `status: submitted|mined|reverted|acked|partial|filled|cancelled|rejected`; our `Order.status` is `accepted|filled|partially_filled|canceled|rejected|pending`. **Pick one.**
7. **Activity / Audit event projection.** Daniel's `audit.evt` (API Contracts.pdf:p9) is `{kind, ref_id, emitted_at, correlationId, redactions[], digest}`. Our `ActivityEvent` is investor-friendly. Daniel needs to publish either a projection endpoint (e.g., `GET /v1/activity` reading from audit-event store) or sanction our UI projection.
8. **CCID `KycStatus` unified enum.** Daniel uses three different status enums across three stages (session/webhook-decision/attestation). UI collapses to one. Daniel needs to publish a single user-facing enum spec to anchor our `KycStatusValue`.
9. **`Idempotency-Key` semantics for POSTs.** Daniel says it's required on `/claim/issue` and admin writes (API Contracts.pdf:p10). UI needs Daniel to specify which other endpoints require it (`POST /orders`, `POST /ccid/start`, etc.) before we ship a generic policy.
10. **Profile / Strategy / Activation / Documents / Support API shapes.** None of these are in any Daniel doc read. The UI invented all five. Daniel needs to publish either ratifying specs or his own contracts before MIG-P2.5-04 OpenAPI fill-in.

---

## 13. MIG-P2.5 Wave 2 implications

| Ticket                                            | Daniel-spec relevance                                                                                                                                                                                                                                                                                                                                                                                         | Recommendation                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MIG-P2.5-02** (personas Maya/David/Sarah)       | Daniel doesn't constrain personas. The shapes the personas fill (KycStatus, BrokerConnection, Recommendation, OrderStatus, ActivityEvent) all need adjustment per §3.                                                                                                                                                                                                                                         | **Tighten to match Daniel** on the 4 enum drifts in §3; **keep as-is** on persona structure                                                                                                                                                                                                        |
| **MIG-P2.5-19** (RecommendationDetail)            | Daniel has no Recommendation contract. Our deep shape is a **forward-looking proposal**. The `automation_eligibility` sub-shape uses `status: ALLOW\|REVIEW\|DENY` — matches Daniel's Compliance Adapter verdict envelope. The `advisory_context` sub-shape includes `disclosure_version_set`, `execution_policy_version`, `model_version` — these mirror Daniel's `policy_version` and `bundle_id` from ACE. | **Keep as-is** but **add `automation_eligibility.expires_at` and `automation_eligibility.policy_version` to mirror Daniel's verdict envelope.** Add a doc note: "schema is UI-owned until Daniel publishes Recommendation API; submit for Daniel sign-off when staging available"                  |
| **MIG-P2.5-03** (verdict matrix, 7 codes)         | Daniel names only 2 codes (`ACE_UNAVAILABLE`, `INCOMPLETE_KYC`). Our 7 are UI-side fixtures.                                                                                                                                                                                                                                                                                                                  | **Expand because Daniel specs less than we knew, not more.** Add Daniel's 2 codes as additional fixtures; document that our 7 are UI-side scenario labels not Daniel-contract codes. Keep the matrix                                                                                               |
| **MIG-P2.5-04** (OpenAPI fills)                   | Daniel's published OpenAPI fragments cover Asset Routing, Token Policy, Compliance Adapter `/internal/verdict`, Explorer suggested endpoints (API Contracts.pdf:p1-6). They **do not** cover the surfaces we need: Recommendation API, Order API, Broker API, Profile, Strategy, Activation, Documents, Support.                                                                                              | **Expand because Daniel specs less than we knew.** Wave 2 OpenAPI fill is **mostly UI-invented** — be explicit in the YAML that each block is "UI-authored, pending Daniel ratification." Add error envelope schema `{code, message, retryable, correlationId, details}` from API Contracts.pdf:p9 |
| **MIG-P2.5-22** (split handlers + contract tests) | Daniel doesn't touch this. Our test approach (Pact-style, per API Contracts.pdf:p11) matches Daniel's prescription.                                                                                                                                                                                                                                                                                           | **Keep as-is** but **align test assertions with Daniel's required log fields and error envelope** (§4 and §10). Add a test that asserts the `OkResult` shape only appears on endpoints that genuinely have no other payload — Daniel doesn't have a generic OkResult                               |
| **MIG-P2.5-16** (corr-id + CSRF echo)             | Already matches Daniel (§4).                                                                                                                                                                                                                                                                                                                                                                                  | **Keep as-is.**                                                                                                                                                                                                                                                                                    |
| **MIG-P2.5-23** (support classifier)              | Daniel has zero spec for Support. Our regulatory-framing reference is sound (Rule 203A-2(e)(3)).                                                                                                                                                                                                                                                                                                              | **Keep as-is.** Pure UI domain                                                                                                                                                                                                                                                                     |

**Net call for Wave 2:** Daniel's actual constraints are **lighter** than we assumed. The CCID/SIWE/Compliance Adapter shapes are real contracts to mirror; the Recommendation/Order/Broker/Profile/Strategy shapes are ours to define until Daniel ships. **No Wave 2 ticket needs to be dropped.** Two need adjustment (-03 add Daniel's 2 codes, -19 add `expires_at` + `policy_version` to automation_eligibility), and the rest stand.

---

## 14. Brief notes

### Things Daniel specs that we haven't built yet

- **Wallet link/unlink** (multi-wallet per account) — SIWE.pdf:p7. Not in MIG-P2.5. Probably defer to Phase 3+.
- **`Idempotency-Key` header on all writes** — API Contracts.pdf:p10. Should be in `apiFetch` for Wave 3.
- **`policy_version` in every verdict response** — CompAdapter.pdf:p8. Needs to flow into `RecommendationDetail.automation_eligibility`.
- **`expiry_at` on compliance verdicts** — gives UI the "valid until" copy hook (matches investor expectations).
- **Backend RBAC roles for admin impersonation** — SIWE.pdf:p7. Not in scope for P2.5; Phase 4 admin.
- **Audit `correlationId` → `record_id` projection** — Daniel's audit.evt envelope (API Contracts.pdf:p9). Our `RecommendationDetail.record` already includes `record_id` and `audit_hash`; we need Daniel to confirm projection mapping.
- **Token Policy module** (Phase 4) — API Contracts.pdf:p3-5. EIP-712 PolicyClaims for onchain trading. UI doesn't need yet (no onchain in IA slice).

### Things we have built that Daniel hasn't documented (likely safe but worth knowing)

- **Investor-facing Eligibility route + JWT** (`apps/web/app/api/us/eligibility/route.ts`) — entirely UI-owned regulatory overlay. Daniel has no eligibility concept. Safe.
- **Broker API-key intake flow** (`/v1/brokers/connect/keys`) — UI invention with UI-mapped error codes. Daniel may ratify or replace with OAuth. Document as such.
- **`AccountActivationStatus`** with 6 booleans (eligibility, wallet, kyc, profile, broker, disclosures) — UI invention; Account Service doesn't exist in Daniel docs read.
- **`AdvisoryProfile`** with 7 KYC-suitability fields — UI invention; not in any Daniel doc read.
- **`StrategyDescriptor`** with 9 fields — UI invention.
- **Disclosure documents** (`apps/web/app/us/_content/disclosures.ts`) — entirely UI-owned. Daniel doesn't model document acks.
- **Support ticket flow** (`apps/web/app/api/us/support/route.ts`, `POST /v1/support/ticket`) — UI invention.
- **Sentry + PostHog wiring** in `proxy.ts` — UI's RUM choice; Daniel's Observability spec is pure backend (Prometheus + OTel + PagerDuty), no FE telemetry guidance.

### Sanity check on brand voice / copy doc

I did not deep-read `04-brand-voice.md` this pass. From the visible Daniel docs:

- Daniel's PRDs and Acceptance Criteria doc (not read) likely has copy constraints.
- Daniel's CCID doc explicitly forbids storing PII (CCID.pdf:p9). Our brand voice must support a "we don't store your ID document content; we keep a hashed reference only" line — confirm this is in `04-brand-voice.md`.
- Daniel's Compliance Adapter fail-closed posture ("REVIEW + ACE_UNAVAILABLE + short TTL") is **softer** than our UI's "UNAVAILABLE blocks Submit" posture. Our brand voice should explain the gap to investors: "We block trading when our compliance system is unreachable. This is intentional and stricter than minimum requirements." Worth confirming this is messaged.
- No Daniel doc constrains font, color, or component tone. Brand voice is UI-owned.

---

**End of report.**

Two open-question flags I'd surface to the user before they greenlight Wave 2:

1. **Verify with Daniel whether Phase 2 IA services are deployed anywhere or are blueprint-only.** Our reading of `Progress and Revision Entries.pdf` says "all docs, no deploys" — but a doc-progress log isn't the same as a deploy log. If real staging URLs exist, Wave 2 acceptance criteria should include "real endpoint cutover" gates.
2. **Confirm with Daniel whether he wants UI-invented shapes (Recommendation, Order, Broker, Profile, Strategy, Activation, Documents, Support) ratified as-is or replaced.** Cheapest path: he ratifies what we built. Slowest path: he publishes his own and we re-do MIG-P2.5-04.
