# Contract package reconciliation — v1.1.0-alpha.2 (received 2026-09-03)

**Addendum to** [SHIP_CONTRACT.md](SHIP_CONTRACT.md) and
[backend-observation-2026-08-30.md](backend-observation-2026-08-30.md).
Fires trigger 1 of the 2026-08-26 hold state (package arrival) and, as it turns
out, trigger 2 (D-LAUNCH-06 answered in writing). Per the standing rule, launch
truth is updated here **before** the answer changes implementation.

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

**This is the D-LAUNCH-06 answer, in writing, from Daniel's own governing
document: yes, the Alpha submits orders on the user's behalf.** It is the
opposite of what the Ship Contract froze. Per the hold-state rule, the register
is updated (this PR) and **no implementation follows until Zeshan decides**
between:

1. **Amend the Ship Contract** to the ATD definition (Alpha = automated
   trading, first fixture on Alpaca paper), re-pin authority to the ATD
   checklist hash above, and reopen the Gate A/Gate B analysis — live external
   users with execution moves counsel review (Gate B) ahead of any activation.
2. **Hold the Signal definition** for this repository's September artifact and
   treat execution capability as backend-only / not surfaced — which the
   package's own capability register allows (execution capabilities are all
   `pending_backend`), but which contradicts ATD-003's "no second switch."
3. Something else Daniel and Zeshan agree in writing.

What must not happen is what the 2026-08-30 observation warned against: an
undeclared thinning or an undeclared widening.

## 4. What Daniel needs from this repository (12 IDs)

From `connection.dev.json.frontend_required_actions`. Nothing here blocks
client generation or simulator work (`frontend_development.ready=true`).

| ID                                       | Status here today                                                                                                                                                                                                                                                                                                                                               | Owner / decision                                                                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `frontend_bff_jwks_url`                  | URL is **already selected** (`https://bff-dev.refi.trading/.well-known/jwks.json`) and the route exists in `apps/web/app/.well-known/jwks.json/route.ts`. It returns **503** in production because `BFF_ASSERTION_PRIVATE_KEY_JWK` is not set in the Vercel Production environment (confirmed via `vercel env ls`). Daniel observed the same 503 on 2026-09-03. | Ops: generate an ES256 P-256 key with `kid`, set the env var, verify 200 + rotation overlap. Needs Zeshan's go — production config change. |
| `wif_oidc_issuer`                        | Our BFF runs on Vercel; Vercel OIDC federation is the natural issuer. Not yet enabled/verified for project `refi-us-sec-ia-web`.                                                                                                                                                                                                                                | Verify in Vercel project settings, then supply.                                                                                            |
| `wif_allowed_audiences`                  | Vercel OIDC audience form is `https://vercel.com/<team-slug>`; team slug `z333qs-projects`. Verify against an actual issued token before sending.                                                                                                                                                                                                               | Same.                                                                                                                                      |
| `wif_allowed_subjects`                   | Vercel subject form is `owner:<team>:project:<project>:environment:<env>`. Decide whether only `production` or also `preview` may impersonate the BFF SA. Preview should not.                                                                                                                                                                                   | Zeshan.                                                                                                                                    |
| `frontend_upstream_identity_provider_id` | **No upstream IdP exists.** Sessions are MSW-minted (bucket A). Our code assumed identity-ccid did the email verification; the package says we do.                                                                                                                                                                                                              | **Decision needed:** self-issued magic-link JWT from the BFF, or a hosted IdP.                                                             |
| `frontend_upstream_identity_issuer`      | Follows the IdP decision.                                                                                                                                                                                                                                                                                                                                       | —                                                                                                                                          |
| `frontend_upstream_identity_audience`    | Follows the IdP decision.                                                                                                                                                                                                                                                                                                                                       | —                                                                                                                                          |
| `frontend_upstream_identity_jwks_url`    | Follows the IdP decision. Must be a separate endpoint from the BFF assertion JWKS.                                                                                                                                                                                                                                                                              | —                                                                                                                                          |
| `frontend_identity_redirect_uris`        | Follows the IdP decision; exact HTTPS URIs for the Dev BFF flow.                                                                                                                                                                                                                                                                                                | —                                                                                                                                          |
| `support.integration_contact`            | Not supplied.                                                                                                                                                                                                                                                                                                                                                   | Zeshan.                                                                                                                                    |
| `support.security_contact`               | Not supplied.                                                                                                                                                                                                                                                                                                                                                   | Zeshan.                                                                                                                                    |
| `support.escalation_channel`             | Not supplied; must exclude credentials/tokens.                                                                                                                                                                                                                                                                                                                  | Zeshan + Daniel.                                                                                                                           |

Daniel's own outstanding deliverables (`backend_pending_deliverables`):
`identity_ccid_base_url`/`_jwks_url` and `investor_api_base_url` promotion to
operational (features currently disabled; identity-ccid JWKS returns 403),
`wif_provider_name`, service revisions/digests, `real_connected_fixture_ids`,
`support.trading_operations_contact`, and the hash-bound connection addendum.
His "couple of finalizations" are these.

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
options in the 2026-08-24 audit now collapse into the §3 decision above.

## 7. What this repository does next (in order, after the §3 decision)

1. **Client generation slice** — generate typed client + models from
   `openapi.json`/`schemas.json` into `packages/api-clients`, replacing the
   hand-written 20-operation `refi-api.yaml`. Contract tests against the
   loopback simulator. Independent of §3.
2. **BFF JWKS goes live** — set the production key, prove 200 and rotation.
   Independent of §3; needs Zeshan's go.
3. **Upstream identity provider decision**, then the identity-exchange slice
   (`GAP-IDENTITY-018`).
4. **C1b-2** — reclassify the remaining browser-direct endpoints against the
   41-route manifest. `/v1/documents/acknowledge` maps to
   `POST /api/v1/investor/consents` (closes D-DISCLOSURE-01's contract
   question).
5. **Brokerage connection UI** (`paper|live` + write-only key pair) — **only
   under option 1**, and only after #49's rationale is formally superseded.
6. **Allocation preview / subscription** — same gate as 5.

Investor Profile slices 2–3 remain valid under every reading and continue.
