# Contract package reconciliation — v1.1.0-alpha.2 (received 2026-09-03)

**Addendum to** [SHIP_CONTRACT.md](SHIP_CONTRACT.md) and
[backend-observation-2026-08-30.md](backend-observation-2026-08-30.md).
Fires trigger 1 of the 2026-08-26 hold state (package arrival). It does **not**
fire trigger 2: the package settles the _target_ Alpha operating model but does
not, by itself, answer the historical D-LAUNCH-06 question about the September
13 artifact (§3). Per the standing rule, launch truth is updated here
**before** anything changes implementation.

**Revision 2 (2026-09-03, same day):** corrected on Zeshan's review — D-LAUNCH-06
stays OPEN; Vercel is recorded as current deployed state only, with a Cloud Run
BFF as the target architecture (§4a).

**Basis:** Daniel's frontend integration package
`refinity-main-main-contracts-frontend-v1.1.0-alpha.2/contracts/frontend/v1.1.0-alpha.2/`
(nine files, delivered 2026-09-03) and his wider repository snapshot
`refinity-main-main` (same date), both supplied for this purpose. Read-only
inspection; nothing in either was modified. The package directory is
byte-identical to `contracts/frontend/v1.1.0-alpha.2/` inside the wider repo.

## Authority pins

| Artifact                                                          | SHA-256                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| Package content digest (`bundle.json.package_content_sha256`)     | `c1b53c906653ca8860bf66cfc0df8fa862ff34d6cbf77298ac83cb55f006cb09` |
| Source contract `investor-api-v1.1.0-alpha.2.json` (per bundle)   | `b51556df2a28b531dad0a81d0001685da110bfdf7b2bd38e8e2ac899f22e0278` |
| `bundle.json` file                                                | `f1e1e39e8aea1659907f3419b54c858bfc52ec6fd550e46e506126cba1000355` |
| `docs/planning/frontend_contract_delivery_alignment_checklist.md` | `a5cf21da1b517607a0f64771281b6403b91a89a6c6a1f836886ef7be2481a034` |

The Ship Contract's authority-pin rule says a later revision from Daniel "gets
its own hash/version row plus an explicit amendment." The rows above are the
hash rows. **The amendment is not written here** — it is a scope decision
(§3) that belongs to Zeshan, not to this reconciliation.

## 1. What the package is

- **41 public operations**, OpenAPI 3.1, closed JSON Schema 2020-12 objects,
  synthetic examples, a Python conformance validator and deterministic
  loopback simulator. `contract_implemented=true`.
- Both `python3.11 tools/conformance.py validate` and `self-test` **pass**
  locally (the tool needs Python ≥ 3.11; system 3.9 fails on the simulator).
- **Readiness states, from `bundle.json`:** services provisioned = true;
  connected release ready = false; external trust bound = false; Alpaca
  verified = false; connected alpha verified = false.
- **Nine connected capabilities:** three `available` (client generation,
  simulator, implemented HTTP boundary); four `pending_backend`; two
  `pending_external` — the latter waiting on frontend-owned bindings (§4).
- Two runtime owners in one document: `exchangeIdentity` and
  `getIdentityJwks` are `identity-ccid`; the other 39 are Investor API.
- No browser-direct access, no order/transfer/liquidation/secret/Admin route.
  `POST /eligibility` and `POST /advisory-profiles` are explicitly removed.

This closes **D-SIGNAL-02** as "package received" (not "connection bound"): the
dev URLs are supplied but marked `provisioned_not_enabled`; seeded fixture IDs
and the WIF provider are `not_supplied`, owed by the backend.

## 2. What changed in Daniel's plan since 2026-08-30

The six MC checklists this repo has been reading are now **stubs** (≈58 lines
each, "retained foundation summary"), with the full versions archived. All
current account and execution work is specified by one new document:
`frontend_contract_delivery_alignment_checklist.md`, titled **"Alpha Automated
Trading and Frontend Contract Delivery Checklist"** — 75 / 170 items checked
as of 2026-09-03.

Its §0 "Owner-confirmed operating decisions" are all checked:

- **ATD-001** — every connected Alpaca account gets the same production-grade
  snapshot → decision → risk → execution → order → fill → reconciliation
  lifecycle. Paper vs live is host routing, "not a ReFinity product mode."
- **ATD-002** — allocation is an exact decimal fraction of account equity.
- **ATD-003** — "**Subscription activates trading.** A user subscribes in order
  to trade the portfolio … do not add a second `autopilot_enabled` switch."
- **ATD-005** — the frontend asks `paper|live` and sends write-only Alpaca
  credentials; the backend derives the host.

The package README repeats this in its own words: an accepted subscription "is
the instruction to trade and maintain the portfolio; there is no second
automation switch." The Record and SSE variant lists include `account_intent`,
`risk_decision`, `execution_plan`, `order`, `fill`. `contract.json.product.mode`
is `automated_portfolio_management`.

## 3. Reconciliation against the frozen Ship Contract — CONFLICT

The Ship Contract (authority: `exec_overview_v2.md` / `arch_migration_overview.md`
as received 2026-08-23) defines September 13 as **Signal Dev Release 1**: "no
paper or live order effect … the absence of an execution path is a structural
property of deployment and IAM." Its safety list requires no executable
`AccountIntent`, no order submission, no Signal identity with broker-write
authority.

The package and the ATD checklist define the Alpha as **execution-capable
automated portfolio management** with Alpaca write credentials held by the
backend and orders placed on the user's behalf once a subscription is active.

| Ship Contract (frozen 2026-08-23)                     | Package + ATD checklist (2026-09-03)                                                                                        |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Signal-only; recommendation is the product            | Subscription is the instruction to trade (ATD-003)                                                                          |
| No order submission, no executable intent             | intent/risk/plan/order/fill Records and SSE variants are in-contract                                                        |
| No Signal identity with broker-write authority        | Backend stores write-capable Alpaca keys; frontend collects them                                                            |
| Live-key acceptance removed from frontend (#49)       | Frontend must ask `paper\|live` and forward the key pair once (ATD-005)                                                     |
| identity-ccid verifies email and issues the assertion | **Frontend owns the upstream identity provider**; identity-ccid only exchanges our assertion (ATD-030, §"Identity linkage") |
| `amr` required in v1                                  | `amr` optional; `acr` prohibited (ATD-040..042)                                                                             |

**What this establishes, and what it does not.** Daniel's governing document
establishes that the **target Alpha product is execution-capable automated
portfolio management**. That conflicts with the frozen Signal-only Ship
Contract **at the target-product level**.

It does **not** answer the exact historical D-LAUNCH-06 question:

> Does the **September 13 artifact** submit orders to any broker account, paper
> or live, on a user's behalf?

A full-text search of the package (`README.md`, `contract.json`,
`capabilities.json`, `connection.dev.json`) and of the ATD checklist finds no
statement binding the automated-trading target to September 13, or to any
date. The execution capabilities are all `pending_backend` in the package's own
register, and the connected-Alpha gate (ATD-130..137) is 0 / 8. So the target
is known; the September artifact's behaviour is not.

Therefore:

- **D-LAUNCH-06 remains OPEN**, pending one explicit sentence from Daniel tying
  or not tying execution to the September 13 artifact.
- **The Ship Contract is not amended.** The hash rows above are recorded so
  that, once the sentence arrives, an amendment (if any) pins to exact
  versions.
- **No execution, brokerage-connection, or subscription surface is built** in
  this repository until that sentence is on file.

Daniel's package unlocks contract integration (§7) and architecture work
(§4a). It does not authorize turning the September Signal artifact into an
execution-capable product — and it does not authorize the opposite inference
either. What must not happen is what the 2026-08-30 observation warned against:
an undeclared thinning or an undeclared widening.

## 4. What Daniel needs from this repository (12 IDs)

From `connection.dev.json.frontend_required_actions`. Nothing here blocks
client generation or simulator work (`frontend_development.ready=true`).

| ID                                       | Status here today                                                                                                                                                                                                                                                                                                                                                   | Owner / decision                                                                                                                                                                                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend_bff_jwks_url`                  | URL is **already selected** (`https://bff-dev.refi.trading/.well-known/jwks.json`) and the route exists in `apps/web/app/.well-known/jwks.json/route.ts`. It returns **503** today because the current Vercel deployment has no signing key configured (`BFF_ASSERTION_PRIVATE_KEY_JWK` absent from Vercel Production). Daniel observed the same 503 on 2026-09-03. | **Target:** the BFF on Cloud Run signs with a non-exportable Cloud KMS P-256 key and publishes its public JWK at this same hostname (§4a). Placing a production private JWK in Vercel env is **not** the target solution; it is at most a temporary bridge and is not recommended here. |
| `wif_oidc_issuer`                        | Only meaningful if the BFF stays outside GCP. If the BFF runs on Cloud Run under a dedicated service account, native service-to-service auth (`roles/run.invoker`) may replace the external OIDC → WIF exchange entirely.                                                                                                                                           | **Ask Daniel first** (clarification Q2) before supplying any value. Do not lock to Vercel OIDC.                                                                                                                                                                                         |
| `wif_allowed_audiences`                  | Same as above.                                                                                                                                                                                                                                                                                                                                                      | Same.                                                                                                                                                                                                                                                                                   |
| `wif_allowed_subjects`                   | Same as above.                                                                                                                                                                                                                                                                                                                                                      | Same.                                                                                                                                                                                                                                                                                   |
| `frontend_upstream_identity_provider_id` | **No upstream IdP exists.** Sessions are MSW-minted (bucket A). Our code assumed identity-ccid did the email verification; the package says we do.                                                                                                                                                                                                                  | **Decision needed:** self-issued magic-link JWT from the BFF, or a hosted IdP.                                                                                                                                                                                                          |
| `frontend_upstream_identity_issuer`      | Follows the IdP decision.                                                                                                                                                                                                                                                                                                                                           | —                                                                                                                                                                                                                                                                                       |
| `frontend_upstream_identity_audience`    | Follows the IdP decision.                                                                                                                                                                                                                                                                                                                                           | —                                                                                                                                                                                                                                                                                       |
| `frontend_upstream_identity_jwks_url`    | Follows the IdP decision. Must be a separate endpoint from the BFF assertion JWKS.                                                                                                                                                                                                                                                                                  | —                                                                                                                                                                                                                                                                                       |
| `frontend_identity_redirect_uris`        | Follows the IdP decision; exact HTTPS URIs for the Dev BFF flow.                                                                                                                                                                                                                                                                                                    | —                                                                                                                                                                                                                                                                                       |
| `support.integration_contact`            | Not supplied.                                                                                                                                                                                                                                                                                                                                                       | Zeshan.                                                                                                                                                                                                                                                                                 |
| `support.security_contact`               | Not supplied.                                                                                                                                                                                                                                                                                                                                                       | Zeshan.                                                                                                                                                                                                                                                                                 |
| `support.escalation_channel`             | Not supplied; must exclude credentials/tokens.                                                                                                                                                                                                                                                                                                                      | Zeshan + Daniel.                                                                                                                                                                                                                                                                        |

Daniel's own outstanding deliverables (`backend_pending_deliverables`):
`identity_ccid_base_url`/`_jwks_url` and `investor_api_base_url` promotion to
operational (features currently disabled; identity-ccid JWKS returns 403),
`wif_provider_name`, service revisions/digests, `real_connected_fixture_ids`,
`support.trading_operations_contact`, and the hash-bound connection addendum.
His "couple of finalizations" are these.

## 4a. Architecture posture (governing decision, Zeshan 2026-09-03)

**GCP is the target architecture for the ReFi server-side/BFF layer. Vercel is
current, transitional infrastructure — not the target trust boundary.**

| Concern                   | Current deployed state (Vercel, `refi-us-sec-ia-web`)             | Target                                                                                            |
| ------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| BFF runtime               | Next.js route handlers under `apps/web/app/api/**` on Vercel      | ReFi BFF on **Cloud Run** under a dedicated GCP service account                                   |
| Service-to-service auth   | None live; package assumes external OIDC → WIF → SA impersonation | **Native Cloud Run IAM** (`run.invoker`) where Daniel's topology permits; WIF only if it does not |
| Assertion signing (ES256) | Env-var private JWK (absent → 503)                                | **Cloud KMS** non-exportable P-256 key; public JWK published from KMS                             |
| Secrets                   | Vercel environment variables                                      | **Secret Manager**                                                                                |
| External hostname         | `bff-dev.refi.trading` → Vercel                                   | `bff-dev.refi.trading` preserved as the logical hostname; runtime moves behind it                 |
| Frontend hosting          | Vercel                                                            | Decided by measurement in the migration plan — BFF-first is preferred                             |

Consequences for this document: no engineering effort goes into Vercel-specific
WIF, signing-key, or backend-service integration unless strictly necessary as a
temporary bridge; the WIF rows in §4 are held until Daniel answers whether a
GCP-hosted BFF can use native invocation; a design-only migration plan is a
parallel workstream (no cloud resources created or modified). The 12 IDs Daniel
lists are still owed, but several may change shape or disappear under the
GCP-native path.

## 5. Where our existing code already lines up

- `apps/web/src/lib/investor-api/user-assertion.ts` — ES256, 2-minute max TTL,
  `iss urn:refinity:bff:dev`, `aud urn:refinity:investor-api:dev`, `sid`,
  `auth_time` preserved, no `account_id`. **Matches `BffAssertionClaims`.** One
  delta: it treats `amr` as required; the package makes it optional and
  prohibits `acr`. Adjust when the identity slice lands.
- `apps/web/src/lib/investor-api/routes.ts` — route constants from the
  2026-08-17 reply. The prefix and account-scoped shape match; literals must
  now be regenerated from `openapi.json` rather than hand-maintained.
- `apps/web/app/.well-known/jwks.json/route.ts` — correct shape, correct cache
  TTL, overlap window supported. Only the production key is missing.
- `apps/web/src/lib/bff/auth.ts` — the swap point is right, but its comment
  and design assume identity-ccid verifies email. Under the package we verify
  our own IdP's assertion, exchange it at `POST /api/v1/identity/exchanges`
  via the BFF's Google credential, then verify the returned
  `IdentityHandoffResult` against identity-ccid's JWKS.

## 6. Calendar

The package is the **F1 frontend-development boundary**, not a connected
release. ATD §12 (connected-Alpha binding gate, ATD-130..137) is 0 / 8. A
connected anything by 2026-09-12 is not on the table from either side; a
frontend integrated against the deterministic simulator is. The three launch
options in the 2026-08-24 audit still stand and still wait on D-LAUNCH-06.

## 7. What this repository does next

Valid under either D-LAUNCH-06 answer, in this order:

1. **Measured package → client diff** for all 41 operations (operations
   present/new/obsolete, schema and enum deltas, auth, idempotency,
   correlation, account scoping, Records/SSE variants, consent mapping,
   identity operations). Reviewed before any code changes.
2. **Client generation / contract conformance slice** — derive typed
   models/client in `packages/api-clients` from the exact `openapi.json` and
   `schemas.json`, preserving the package hashes and version; contract tests
   against the loopback simulator only. No network to disabled services, no
   browser-direct access, no identity-provider choice, no WIF implementation.
3. **Design-only GCP BFF migration plan** (§4a) — in parallel; no
   infrastructure mutation.
4. **C1b-2** — reclassify the remaining browser-direct endpoints against the
   41-route manifest. `/v1/documents/acknowledge` maps to
   `POST /api/v1/investor/consents` (closes D-DISCLOSURE-01's contract
   question).

**Blocked until D-LAUNCH-06 is answered explicitly:** brokerage-connection UI
(`paper|live` + write-only key pair), allocation preview, subscription, and any
execution-adjacent surface. #49's live-key removal stands until formally
superseded.

**Not decided here:** the upstream identity provider. The package puts the IdP
on the frontend side; the choice is Zeshan's and is not implied by any slice
above.

Investor Profile slices 2–3 remain valid under every reading and continue. PR
#65 (slice 2, head `a21b9f7e`) is stopped for independent final review, not
merged on its own report.
