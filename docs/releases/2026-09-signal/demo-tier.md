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

| Persona       | Subject             | Cookies at sign-in                                       | Story                                                                                                                                                                                                                               |
| ------------- | ------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **applicant** | `demo-applicant-01` | session only (eligibility cookie cleared)                | public applicant → eligibility → onboarding → WAITLISTED / pending internal review. No Alpha trading authority.                                                                                                                     |
| **invited**   | `demo-invited-01`   | session + eligibility decision (`rule_id: demo-persona`) | admitted in the backend of record but not set up: identity → Investor Profile v2 → Alpaca paper keys → holdings ingested → first advice (see §12). Account link `acct_demo_invited_01` is server-derived from the verified subject. |
| **admitted**  | `demo-admitted-01`  | session + eligibility decision (`rule_id: demo-persona`) | a person whose human admission has already occurred **in the backend of record**; used later for Alpaca connection, authorization, subscription, recommendations, execution records                                                 |

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

## 6. Mint-handoff — DEPLOYED 2026-09-06 (supersedes the 2026-09-05 read-only audit)

**Decision (Zeshan, 2026-09-06):** deploy the mint service because demos may
produce real Alpha applicants. Audit first (gcloud re-authenticated): the
service had never been deployed — `refi-game-prod` held only Cloud Run
`refi-persistence-api`, one image and one secret; no mint image, no signing key.

What exists now, all in GCP project `refi-game-prod`, region `us-central1`,
mirroring the game repo's `infra/terraform` (Terraform is not installed on the
operator machine and the repo does not ignore state files, so the same
resources were created with `gcloud`; importing them into Terraform state is a
follow-up):

| Resource                                        | Value                                                                                                                                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Image (Cloud Build, 28 s)                       | `us-central1-docker.pkg.dev/refi-game-prod/refi/mint-handoff:2f6b8b1` (game `main` at `2f6b8b1`)                                                                                          |
| Cloud Run service                               | `mint-handoff`, revision `mint-handoff-00001-fs8`, `https://mint-handoff-783526040680.us-central1.run.app`                                                                                |
| Runtime identity                                | `refi-alpha-handoff@refi-game-prod.iam.gserviceaccount.com` (secretAccessor on the two secrets only)                                                                                      |
| Secrets                                         | `alpha-handoff-private-key` v1 (ES256 P-256 private JWK, `kid alpha-handoff-2026-09-06`); `handoff-database-url` v1 (copy of the persistence database connection string; never displayed) |
| Env                                             | `SHELL_BASE_URL=https://bff-dev.refi.trading`, `ALLOWED_ORIGIN=https://game.refi.trading`; ingress all; invoker `allUsers` (per Terraform)                                                |
| Shell (Vercel `refi-us-sec-ia-web`, production) | `ALPHA_HANDOFF_PUBLIC_KEY_JWK` = the matching public JWK; `FLAG_ALPHA_CLAIM_ROUTE=on`; redeployed                                                                                         |
| Game (Vercel `refi-man-vs-machine`, production) | `VITE_HANDOFF_URL` = the service URL; redeployed — the bundle now carries it, so the bridge is in MINTED mode                                                                             |

The private key exists only in Secret Manager. The public JWK was held in a
temp file for the Vercel write and deleted. Nothing key-shaped is in either repo.

**End-to-end proof (2026-09-06, throwaway session `ses_proof…`):**

1. `POST /mint-handoff` from the game origin → `{ token, redirectUrl }`; header
   `{alg: ES256, kid: alpha-handoff-2026-09-06}`; claims `iss refi-alpha`,
   `aud refi-us-sec-ia`, `exp = iat + 600`, `intendedDestination ELIGIBILITY`,
   progress fields zero for an unknown session; redirect base
   `https://bff-dev.refi.trading/us/alpha-claim?token=…`.
2. Claim on production → **201** `{ applicationRef: "player:<sub>", firstConsumption: true }`.
3. Replay of the same token → **200** with `firstConsumption: false` (the
   route's documented idempotent replay of the original binding; logged).
4. Tampered signature → **401**. 5. Same token at `demo.refi.trading` → **404**
   (`FLAG_ALPHA_CLAIM_ROUTE=off`; the demo tier never binds real applicants).

**What this does and does not create.** A real player's handoff now binds an
application record with lineage (progress snapshot, arenas, intent) on the
production shell and routes into eligibility. It creates no account and no
session: production has no sign-in until the identity-ccid exchange exists, so
the funnel ends at the connect step. The game `sub` is still a browser-generated
session id (the Firebase-verified identity branch `feat/alpha-identity-rebased`
is unmerged), so `sub` remains lineage, never identity or admission. The mint
endpoint accepts any caller server-side (CORS only constrains browsers; a
foreign-origin curl was answered) — the documented identity-hardening follow-on
(threat model G1/G6).

Follow-ups: import the resources into Terraform state; merge and enable the
verified-identity gate; key rotation path (G5) once a second `kid` is needed.

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

## 8. Vercel configuration — APPLIED 2026-09-05 (separate project)

Applied through the Vercel API instead of branch-scoped preview variables: a
**separate project** keeps the demo environment isolated from production
secrets and lets Deployment Protection stay on for real previews while the
demo is public.

| Item                                                | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project                                             | `refi-us-sec-ia-demo` (`prj_uE7IxdTmaIAWfihWIAt5VGhpJMkI`), same repo, root `apps/web`, Node 24.x, Deployment Protection **off**                                                                                                                                                                                                                                                                                                                                                |
| Production branch                                   | `demo/data-adapter` (temporary, so the demo works before PRs #79/#80 merge) → switch to `demo` after the merges                                                                                                                                                                                                                                                                                                                                                                 |
| Public URL                                          | `https://refi-us-sec-ia-demo.vercel.app`; custom domain `demo.refi.trading` added and awaiting DNS                                                                                                                                                                                                                                                                                                                                                                              |
| DNS (registrar-side, nameservers `dns-parking.com`) | CNAME `demo` → `a6e07c0a9073a4d8.vercel-dns-017.com` (or `cname.vercel-dns.com`)                                                                                                                                                                                                                                                                                                                                                                                                |
| Env (Production target)                             | `NEXT_PUBLIC_REFI_ENV=demo`, `REFI_ENV=demo`, `REFI_INVESTOR_API_MODE=demo`, `REFI_DATA_ADAPTER=mock`, `NEXT_PUBLIC_REFI_DATA_ADAPTER=live`, `REFI_RELEASE_STAGE=signal`, `REFI_KYC_PROVIDER=mock`, `REFI_KYC_MOCK_CONTROLS=1`, `FLAG_ALPHA_CLAIM_ROUTE=off`, `NEXT_PUBLIC_API_BASE_URL=https://demo.refi.trading`, placeholder PostHog/Sentry/WalletConnect values, four generated 32-byte secrets (sensitive, never in git), placeholder `ALPHA_HANDOFF_*` (claim route dark) |
| Deploy hook                                         | `demo-branch` → `demo/data-adapter`                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Still on Zeshan's side: the DNS CNAME above; a real `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` if the optional wallet modal should load cleanly; switching the production branch to `demo` after the merges.

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

## 10. Live stream (slice 2b) — the contract's own excitement

The static "log" feel came from snapshot reads. The contract already carries the
live layer: `streamAccountEvents` (SSE, 16 `AccountEvent` types). This slice
wires it end to end without fabricating anything:

- **Demo world clock.** Reference prices drift deterministically per 4-second
  bucket (seeded, identical on every instance); positions and the current
  valuation are marked to market on each read; the CURRENT recommendation's two
  WORKING orders fill on a schedule (order.updated → fill.recorded →
  reconciliation.updated once the chain completes); a `valuation.updated`
  heartbeat is emitted per bucket. Every event is validated against
  `AccountEvent` before it enters the append-only log; `Last-Event-ID` replays
  exactly like the backend.
- **BFF SSE route** `GET /api/v1/investor/events` — session-verified,
  account scope re-authorized, forwards frames from the demo world or the
  frozen client's `stream()` (same code path), keepalives, `no-store`.
- **UI** — a live status strip in the app shell (connection state, last event),
  toasts for fills/orders/recommendation changes/risk denials, and a ticker
  tape on Home and Portfolio showing the backend `reference_price` and the
  change since the previous backend refresh. Events are refresh signals: the
  hook invalidates the named projection and the page refetches backend truth;
  it never writes state from an event body. Motion ≤ 300 ms, marquee 60 s,
  `prefers-reduced-motion` honoured.
- **Presenter control** `POST /api/demo/advance` (demo tier only, same-origin,
  session): forces the next scheduled fill now, so the chain progresses on cue.

Nothing here is a fake buy/sell tape or a client-side price walk; every moving
element traces to a contract event type.

## 11. No wallet step on the demo (2026-09-05)

**Decision (Zeshan):** wallet linking is removed from the demo path — it kept
failing for the audience ("Something went wrong" after a MetaMask connect) and
it is not what the product is about. Root cause was structural, not a bug:
outside local mock mode there is no service that can verify a linking
signature, so the SIWE step could only dead-end.

What changed:

- `MaybeWalletProvider` mounts wagmi/RainbowKit/WalletConnect **only** when
  `NEXT_PUBLIC_REFI_ENV !== "prod"` and the data adapter is `mock`. Demo
  (`NEXT_PUBLIC_REFI_DATA_ADAPTER=live`) and production never mount the wallet
  stack or call the WalletConnect relay; the placeholder
  `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` on the demo project is now unused.
- `/us/auth/connect` is a pass-through: a signed-in visitor is sent to
  `/us/onboarding`; a signed-out visitor sees "Sign-in is not connected in
  this environment" and, on the demo tier, a link to the walkthrough profiles.
  The wagmi card is lazy-loaded and rendered only in mock mode.
- Session is BFF-owned end to end (C1b-2 rows 1–3): `AuthProvider` reads
  `GET /api/v1/investor/session`; the account page's wallet card became a
  **Sign out** card that calls `DELETE /api/v1/investor/session`.
- Wallet is never the login; a wallet address never appears in the session
  projection. Identity remains email-first via identity-ccid (GAP-IDENTITY-018).

Proofs: `apps/web/e2e/auth.spec.ts` (main lane: no wallet button, no relay
traffic, no `/auth/*` calls, DELETE session same-origin + cookie cleared) and
`apps/web/e2e/demo-tier.spec.ts` "Demo tier — no wallet step" (persona link,
pass-through, sign-out). Contract assertion: "no wallet as login".

PR #81 (`fix/connect-page-linking-honesty`) is superseded by this change.

Build note: the root `Providers` now always mounts the `QueryClientProvider`.
Until this change the `/us` tree borrowed the wallet provider's QueryClient
during the pre-MSW render, which only surfaced when CI built with
`NEXT_PUBLIC_REFI_ENV=staging` (the Playwright lanes build as `prod`/`demo`).

## 12. The setup journey — mock Alpaca keys → holdings → risk profile (2026-09-05)

**Direction (Zeshan):** "what is more important is mocking the addition of your
alpaca api keys, ingesting your portfolio, survey for risk profile — that is much
more compelling as a demo than getting stuck on a web3 wallet connect."

New persona **invited** (`demo-invited-01` → `acct_demo_invited_01`). This
deterministic demo persona is seeded as already human-admitted; the backend demo
projections represent that scenario with `OnboardingStatus.state = INVITED` and
`AccountAuthorization.status = AUTHORIZED`. Those are two distinct backend words
— application/onboarding state and account authorization — and neither of them
_is_ human Alpha admission: the operator write that records admission lives
outside the 41 public routes. No brokerage connection, no holdings, no advice.
The walkthrough:

1. **Identity** — the provider-neutral mock adapter; the presenter advances it
   with the on-page controls (`REFI_KYC_MOCK_CONTROLS=1` on the demo tier).
2. **Investor Profile v2** — the real questionnaire; the permitted risk band,
   capacity, willingness and product fit are derived server-side. The result
   screen now continues to the broker step.
3. **Alpaca paper keys** — the form posts ONCE to
   `POST /api/v1/investor/broker/connection` (Signal-allowed `connectBroker`,
   same-origin, session, server-derived account scope). The BFF validates the
   shape (`environment` is the literal `paper`; `PK…` key ids only; live `AK…`
   keys never parse), forwards ONCE to the contract's
   `createBrokerageConnection`, and returns the status projection. Nothing
   logs, stores, hashes or echoes the credentials; the BFF never calls Alpaca.
   **Precondition (D-LAUNCH-06 rebaseline):** before the credential payload is
   built, the BFF reads `getAccountAuthorization` for the resolved account and
   requires exactly `AUTHORIZED`; `PENDING`/`DENIED`/`SUSPENDED` fail closed as
   `412 account_not_authorized` (the existing local-precondition refusal shape,
   cf. `account_not_linked`) with the backend word and no credential in the
   response. Proven for every status with a recording fake client.
4. **The backend's lifecycle** — the demo world answers 202
   `PENDING_VALIDATION`, validates after ~4 s (`CONNECTED` / `VALID`), syncs
   after ~9 s and ingests **nine holdings** (a concentrated self-directed book
   plus cash) as `AccountPosition`s, appends `brokerage_connection`,
   `brokerage_sync` and `valuation` records with their events, and computes the
   **first recommendation** (`CURRENT`, `execution_eligible: false`,
   `MANAGEMENT_NOT_ENABLED`) as template-weight targets against the observed
   holdings. `POST /api/demo/advance` forces validation + sync for the presenter;
   `{ reset: true }` rebuilds the signed-in persona's world from its seed so the
   walkthrough can be run again for the next audience (picker: "Reset walkthrough").
5. **Strategy review** — permitted band, template (`listTemplates`), the
   holdings and guardrails side by side (`GET /api/v1/investor/onboarding` +
   `/portfolio`). No join, no activation.
6. **Setup checklist** — identity / profile / broker read from the record, then
   two separate backend words: **Application / Alpha onboarding**
   (`OnboardingStatus.state`) and **Account authorization**
   (`AccountAuthorization.status`). **No activate verb** (the contract has none;
   C1b-2 row 26 → C). The dashboard continuation is decided by the pure
   `setupGate`: onboarding `READY` AND authorization `AUTHORIZED` AND all three
   steps complete; anything else (`WAITLISTED`, `INELIGIBLE`, `SUSPENDED`,
   `INVITED`; `PENDING`, `DENIED`, `SUSPENDED`) renders the exact backend state
   with pending/refusal copy and no continuation. The invited walkthrough
   reaches `READY` + `AUTHORIZED` after the broker sync.
   **Onboarding aggregate ordering.** `GET /api/v1/investor/onboarding` reads
   the unscoped onboarding status, the template and the identity lifecycle first,
   then resolves authoritative account scope against `listAccounts`, and only for
   the resolved account reads authorization, connection and the BFF-local Profile
   v2 assessment. A zero-account `WAITLISTED` applicant gets nulls, never a
   fabricated account and never a 500.

**Account link.** Demo sessions had no `AuthSessionLink`, so the linked-account
BFF-local features (Investor Profile v2) returned `412 account_not_linked`.
`getAuthContext` now derives `accountId` on the demo tier from a server-only
registry keyed by the VERIFIED session subject (`DEMO_PERSONA_ACCOUNT_LINK`);
the browser still chooses only a persona label, and every account-scoped read
re-authorizes against `listAccounts`.

**Retired with this slice (C1b-2):** rows 10 (`useBrokerSupported`, C), 11
(`useBrokerConnection` → BFF `listBrokerageConnections`), 12
(`useBrokerConnectStart`, C), 13 (`useBrokerConnectApiKey` →
`createBrokerageConnection`, A implemented), 15/16 (`useBrokerAccount`,
`useBrokerPositions` → portfolio), 24 (`useStrategy` → `listTemplates` +
profile + portfolio), 25 (`useActivationStatus` → onboarding summary), 26
(`useActivateAccount`, C — no verb). Row 14 (`useBrokerDisconnect`) is removed
from the browser; the acknowledged `disconnectBrokerageConnection` handoff is a
follow-up. The MSW `/v1/brokers/*`, `/v1/strategies/current`,
`/v1/account/activation|activate` handlers and the Maya/David broker fixtures
are deleted.

Proofs: `apps/web/e2e/demo-tier.spec.ts` "invited investor sets up" (the full
journey, credential never in a URL or response, 409 on a second connection),
`apps/web/e2e/onboarding.spec.ts` (main lane against the simulator: BFF-only,
live key / live environment / cross-origin refused by the BFF, no credential
field in the read), package tests "invited persona" (contract validity of every
step), contract assertion "broker connection".
