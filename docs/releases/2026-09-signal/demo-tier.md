# Demo tier — isolated walkthrough deployment (slice 1: tier + sign-in)

**Purpose.** A stable, clearly isolated deployment Zeshan can use to walk the
September product end to end as development progresses. It is simulator/demo
backed and says so; it never claims connected `refinity-dev`, production KYC,
human admission, or Alpaca execution unless the integration is actually
connected.

## 1. Tier architecture (existing primitives, no new framework)

|                                          | Production                                                                                              | Demo                                                                                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel project                           | `refi-us-sec-ia-web`, Production target (alias `bff-dev.refi.trading`, `refi-us-sec-ia-web.vercel.app`) | same project, a **long-lived `demo` branch** deployed as a Vercel Preview with **branch-scoped Preview env vars** and a branch domain (proposed `demo.refi.trading`); Deployment Protection off for that branch only |
| Build constant `NEXT_PUBLIC_REFI_ENV`    | `prod`                                                                                                  | `demo` (new enum value — labels the tier client-side; not a security gate)                                                                                                                                           |
| Runtime tier `REFI_ENV` (server-only)    | `prod`                                                                                                  | `demo` (new enum value — the ONLY gate for the demo sign-in)                                                                                                                                                         |
| Browser mock layer (MSW)                 | off                                                                                                     | **off** (`NEXT_PUBLIC_REFI_DATA_ADAPTER=live`) — no fake sign-in path; the persona route is the single sign-in                                                                                                       |
| Eligibility-cookie dev identity fallback | off (`REFI_ENV≠dev`)                                                                                    | off (`REFI_ENV≠dev`) — demo is not weaker than dev                                                                                                                                                                   |
| Investor API upstream                    | connection addendum (not yet)                                                                           | Daniel's simulator or the follow-up demo data adapter; until then account-scoped reads report `upstream.state ≠ ok` and show empty, never fabricated, data                                                           |
| KYC                                      | real provider (none yet; fails closed)                                                                  | mock adapter with server-side controls (`REFI_KYC_PROVIDER=mock`)                                                                                                                                                    |
| Alpha claim                              | flag + production public JWK                                                                            | flag + **demo-tier public JWK** (separate key pair; not generated here)                                                                                                                                              |
| Indicator                                | none                                                                                                    | persistent slim bar: "DEMO · simulated data · no real KYC, admission, brokerage, or orders · persona: X"                                                                                                             |

Separation is technical, not cosmetic: every demo surface is dark (404) unless
the server-only runtime tier is exactly `demo`, proved by the main E2E lane at
`REFI_ENV=prod` and by contract assertions at `prod`, `staging`, and `dev`.

## 2. Sign-in mechanism chosen

**Chosen: the existing BFF session cookie, minted server-side for a fixed
persona.** `POST /api/demo/session {persona}` signs the same HS256
`us_session_v1` the BFF already verifies (`SESSION_JWT_SECRET`), with the
subject fixed to `demo-applicant-01` or `demo-admitted-01`. This is the same
mechanism the E2E suite has used since PR #39/#40 (`e2e/session.ts`), moved
behind a tier gate — no second authentication architecture.

Why not email login: identity-ccid's `exchangeIdentity` needs Daniel's
connection addendum (JWKS, issuer, audience, dev URL), so a real email login is
blocked on him. Why not the dev fallback: it derives identity from the
eligibility cookie and is deliberately `REFI_ENV=dev`-only; demo must not be
weaker than dev.

Properties: closed persona enum, strict body (extra keys → 400), same-origin
browser POST only, HttpOnly session cookie, no query-string identity, no
account id minted or linked, admission never asserted (`authorityAsserted:
false`). The display cookie `us_demo_persona` is not HttpOnly on purpose and is
never read by any auth path (assertion).

## 3. Personas

| Persona       | Subject             | Cookies at sign-in                                       | Story                                                                                                                                                                               |
| ------------- | ------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **applicant** | `demo-applicant-01` | session only (eligibility cookie cleared)                | public applicant → eligibility → onboarding → WAITLISTED / pending internal review. No Alpha trading authority.                                                                     |
| **admitted**  | `demo-admitted-01`  | session + eligibility decision (`rule_id: demo-persona`) | a person whose human admission has already occurred **in the backend of record**; used later for Alpaca connection, authorization, subscription, recommendations, execution records |

The admitted persona's admission state is **not** a frontend flag: it must come
from the demo backend/simulator projection (`getOnboardingStatus`,
`getAccountAuthorization`). Account scope is resolved per request by the BFF
against `listAccounts`. This slice implements neither downstream surface.

## 4. Game host cleanup

`play.refi.trading` no longer resolves; the game is deployed at
`game.refi.trading`. Changed: the alpha-claim client's retry link
(`GAME_URL`) and the current integration map. Left as written: dated historical
notes. Not touched: the untracked local `docs/security/THREAT_MODEL-alpha-handoff.md`
(not in git). The mint-handoff service's Terraform already defaults
`allowed_origin` to `https://game.refi.trading`; nothing to change there, and
no cross-origin shell claim API is introduced — the shell claim POST stays a
same-origin browser POST after the redirect.

## 5. Critical identity rule

Per the game's own `docs/HANDOFF.md`, `AlphaHandoffToken.sub` is the game's
`session_id` today and is spoofable pending identity hardening. Therefore game
handoff data is **acquisition/demo lineage only**: score, arenas, player id, a
reference back to the game. It never establishes investor identity, KYC
identity, Alpha admission, account ownership, `AccountAuthorization`, trading
eligibility, broker authority, or subscription authority. A valid token does
not bypass sign-in; the game `sub` never becomes the Investor API user id; game
score never touches the Investor Profile (assertion: the engine, entities,
attestation mapping, auth, and account-scope modules import no handoff data).

## 6. Mint-handoff deployment audit (read-only, 2026-09-05)

| Question                                                    | Finding                                                                                                                                                                                                                                              |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is the Cloud Run `mint-handoff` service deployed?           | **Unknown.** `gcloud` needs an interactive re-login (`Reauthentication failed`); not run. The game repo ships `infra/terraform` for it (service `mint-handoff`, SA `refi-alpha-handoff`, region `us-central1`), which proves intent, not deployment. |
| Documented project/service                                  | Terraform: service `mint-handoff`, Secret Manager `alpha-handoff-private-key` and `handoff-database-url`; project id is a variable, not recorded.                                                                                                    |
| Does the current game build have `VITE_HANDOFF_URL`?        | **No.** The deployed `game.refi.trading` bundle contains the bridge ("ENTER REFI") and one Cloud Run URL (`refi-persistence-api`) but no `mint-handoff` URL and no handoff string.                                                                   |
| Mode                                                        | **LINK mode** (`HANDOFF_MODE = HANDOFF_URL ? 'MINTED' : 'LINK'`): the bridge navigates to the marketing site; no token is minted.                                                                                                                    |
| Private signing key configured?                             | **Unknown** (Secret Manager not readable from here).                                                                                                                                                                                                 |
| Does the shell demo tier have the corresponding public JWK? | **No demo tier exists yet.** Production holds `ALPHA_HANDOFF_PUBLIC_KEY_JWK` (value not readable). Whether it matches any service key is unknown.                                                                                                    |
| `SHELL_BASE_URL`                                            | Code default `https://refi-us-sec-ia-web.vercel.app` (Terraform variable default the same); the deployed value is unknown.                                                                                                                           |

Not done in this slice: deploying or re-keying the mint service, generating
keys, or setting `VITE_HANDOFF_URL`.

## 7. Future `joinWaitlist` seam (recorded, not wired)

Daniel's `joinWaitlist { acquisition_source: GAME, game_handoff_receipt_id }`
is the right place for game lineage in the backend record. The rule:

> game receipt **+** an authenticated formal applicant (shell session) → backend
> waitlist lineage. Never: game `session_id` → investor identity.

Concretely: after a claim, the shell stores the receipt against the
`AlphaApplication`; only once the applicant has a durable authenticated shell
identity does the BFF call `joinWaitlist` with the stored receipt id under that
identity. Claiming a token alone never calls `joinWaitlist`, and no game
possession confers admission.

## 8. Vercel configuration to create the tier (not executed here)

External configuration, to be applied once this slice merges:

1. Create branch `demo` from main (kept in step with main by fast-forward).
2. Vercel → Environment Variables → target **Preview**, branch **demo**:
   `NEXT_PUBLIC_REFI_ENV=demo`, `REFI_ENV=demo`, `NEXT_PUBLIC_REFI_DATA_ADAPTER=live`,
   `REFI_DATA_ADAPTER=mock`, `REFI_RELEASE_STAGE=signal`, `REFI_KYC_PROVIDER=mock`,
   `REFI_KYC_MOCK_CONTROLS=1`, fresh 32+ char `SESSION_JWT_SECRET`,
   `SESSION_SECRET`, `IP_HASH_SECRET`, `ELIGIBILITY_JWT_SECRET`, a real
   `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, `NEXT_PUBLIC_API_BASE_URL` = the
   demo origin, PostHog/Sentry values, and `FLAG_ALPHA_CLAIM_ROUTE=on` with a
   **demo-only** `ALPHA_HANDOFF_PUBLIC_KEY_JWK` (pair generated out of band).
   Investor API variables are added with the follow-up demo data adapter.
3. Assign the branch domain (proposed `demo.refi.trading`) and disable
   Deployment Protection for that branch only.
4. Verify `/us/demo` renders and `/api/demo/session` answers 200; verify the
   production alias still answers 404 on both.

## 9. Demo data adapter (slice 2) — the demo world

**What.** `apps/web/src/lib/investor-api/demo-client.ts` is an in-process,
server-only stand-in for the Investor API. It implements the frozen client's
`call(operationId, options)` for every read the product uses and validates
each response against the v1.1.0-alpha.2 response schema before returning it
(`assertMatches`), so demo data cannot drift from the contract. It is
constructed only by `investorApiClientFor` when `REFI_ENV=demo` **and**
`REFI_INVESTOR_API_MODE=demo`; on any other tier the gateway throws
(`DemoUpstreamNotPermittedError`, contract-asserted), so production can never
be pointed at it.

**Authority model unchanged.** Account scope is still `resolveAccountScope`
against `listAccounts`; admission is still `getOnboardingStatus` /
`getAccountAuthorization`; the browser asserts nothing. Personas select a
WORLD: the applicant has no accounts and is WAITLISTED (`INTERNAL_REVIEW`
required); the admitted persona has one AUTHORIZED account.

**The admitted world (deterministic, seeded):** connected paper Alpaca
connection (`CONNECTED`/`VALID`); S&P 500 following template (503
constituents) with an ACTIVE 60% membership; 24 positions with real tickers
and prices; a 90-day reconciled equity history; preferences v1 (drift 3%, min
order $25, tobacco exclusions, fractional on); three recommendations —
`recommendation_demo_0003` CURRENT (24 legs, 4.1% turnover), `_0002`
SUPERSEDED, `_0001` BLOCKED (`RECONCILIATION_HOLD`, `STALE_VALUATION`); ~50
records across all 16 variants including a full execution chain per
recommendation (intent → risk → plan → 6 orders → fills → reconciliation)
with one risk decision DENIED. Legs reconcile mathematically (tested).

**The one mutation:** `updateAccountPreferences` (If-Match on the preference
version, deterministic Idempotency-Key). It bumps the version, marks the
CURRENT recommendation SUPERSEDED, generates a new CURRENT recommendation
honouring the new exclusions/min order, and appends a preference record plus a
fresh execution chain — so "change a preference and watch advice change" is
real and prior advice is preserved. Every other mutation (brokerage, allocation
preview, account action, attestation, waitlist, identity) throws
`DemoUnsupportedOperationError`: the demo never fabricates a write it does not
own. State: deterministic base world per process; preference deltas live in
process memory.

**Product surfaces added/changed in slice 2:** `GET /api/v1/investor/portfolio`
(valuation, bounded history, positions, memberships, preferences; C1b-2 rows
15/16/24) and `PATCH /api/v1/investor/preferences` (the four IB-06 fields,
dedicated PATCH per D-018, Signal-allowed `updateAccountPrefs`); Home and
Portfolio pages now render reconciled backend truth (the client-side
`useSimulation` and the "Simulated Data" badge are deleted); the account page
gains the Preferences card; Activity renders all 16 record variants read-only
with an execution-chain category badge and amounts (D-LAUNCH-06 CLOSED — YES;
rebaseline §7 implemented). No control exists on any record, leg, or
recommendation.

**Demo lane env:** `REFI_INVESTOR_API_MODE=demo` (Vercel demo branch env adds
the same). The main and Signal lanes keep Daniel's simulator.
