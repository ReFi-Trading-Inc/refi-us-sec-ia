# Real/mock boundary map — where production code ends and mocks begin

**Date:** 2026-07-24 · **Audience:** Daniel (backend handoff) + anyone testing
a Vercel _Preview_ deployment. · **Companions:**
[`system-integration-map.md`](system-integration-map.md),
[`integration-roadmap.md`](integration-roadmap.md) (items 1.5/D8, 2.2/D4, 2.3).

Every Vercel **Preview** deployment runs in **mock mode** (the Preview env
scope sets no variables, so dev defaults apply); **Production** sets
`NEXT_PUBLIC_REFI_ENV=prod` + `REFI_ENV=prod`, which disables every mock
below and **fails closed** at the identity wall. In mock mode a persistent
amber banner (`apps/web/app/_components/MockModeBanner.tsx`) marks the
boundary at runtime.

## The funnel, annotated

| Step                                    | Real or mock?  | What actually runs                                                                                                                                        |
| --------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/us` marketing pages, disclosures      | **REAL**       | Static pages + shared tokens; no backend.                                                                                                                 |
| Eligibility decision                    | **REAL**       | `POST /api/us/eligibility` — real rule engine, HS256-signed `us_eligibility_v1` cookie, rate limit (`apps/web/app/api/us/eligibility/route.ts`).          |
| Alpha-claim (game handoff)              | **REAL**       | ES256 verify, pinned iss/aud, 10-min max-age, single-use jti (`apps/web/app/api/v1/investor/alpha-claim/route.ts`); Firestore-durable when flags flipped. |
| Wallet connect (MetaMask etc.)          | **REAL**       | wagmi + RainbowKit against the real wallet; nothing mocked.                                                                                               |
| **→ Identity verification (SIWE)**      | **MOCK**       | ← **THE BOUNDARY.** `/siwe/nonce`, `/siwe/verify`, `/auth/session` are MSW browser mocks; nothing server-side exists. Production dead-ends here (D8).     |
| KYC                                     | **MOCK**       | `/ccid/*` ComplyCube mocks.                                                                                                                               |
| Broker connect + account/positions      | **MOCK**       | `/v1/brokers/*` fixtures ("Maya" persona).                                                                                                                |
| Onboarding/portfolio/recommendation UI  | **REAL shell** | Real components + BFF entity logic (`apps/web/src/lib/prototype-store/*`), but fed by mock data and a dev identity (below).                               |
| Trading backend (signals, risk, orders) | **ABSENT**     | Nothing in this repo talks to `refinity-main` yet — that is Phase 2.6 Track 2 (proxy PR-E, then entity flips `msw→backend`).                              |

## The three mock mechanisms (and their off switches)

1. **Browser MSW worker** — `packages/api-clients/src/mocks/handlers.ts`
   (fixtures in `.../mocks/fixtures/maya.ts`), booted by
   `apps/web/app/_msw/init.ts`. Intercepts identity (`/siwe/*`,
   `/auth/*`), KYC (`/ccid/*`), and broker/portfolio (`/v1/*`) calls in the
   browser before they reach any network.
   **Off switch:** `NEXT_PUBLIC_REFI_ENV=prod` _or_
   `NEXT_PUBLIC_REFI_DATA_ADAPTER=live` (production sets the former).

2. **Server-side dev identity fallback** —
   `apps/web/src/lib/bff/auth.ts` (`devFallback()`). Without a real signed
   session, the BFF derives a deterministic identity from the eligibility
   cookie so `/api/v1/investor/*` routes work end-to-end.
   **Off switch:** `REFI_ENV` anything other than `"dev"` — staging/prod fail
   closed. A present-but-invalid session cookie is always a hard 401, never a
   silent downgrade.

3. **Prototype store backing** — `apps/web/src/lib/prototype-store/*`. The
   entity logic is REAL (it's the BFF's contract implementation); only the
   persistence swaps: filesystem by default, Firestore per-entity via
   `REFI_BACKING__*=durable` (see `infra/terraform/README.md`).

## For Daniel: the swap points

- **Identity (D8)** — `apps/web/src/lib/bff/auth.ts` is deliberately the
  _single_ module that swaps to your `auth-siwe` / account-auth service; the
  MSW `/siwe/*` + `/auth/session` handlers then get deleted. Direction per
  roadmap 1.5: email-native Signal-mode path, wallet deferred to
  ExecutionPolicy signing. **Blocked on your D8 decision.**
- **API base (D4)** — production `NEXT_PUBLIC_API_BASE_URL` currently points
  at `https://api.refi.trading`, which does not resolve; it needs your staging
  base URL + service auth.
- **Data (2.3)** — entity-by-entity flips from Maya fixtures to Admin Portal
  projections through the Phase 2.6 outbound proxy (PR-E), tracked in
  [`phase2-6-next-pr-sequence.md`](phase2-6-next-pr-sequence.md).

## Environment matrix

| Variable                        | Production                                     | Preview (mock demo)                                    | Effect                                            |
| ------------------------------- | ---------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------- |
| `NEXT_PUBLIC_REFI_ENV`          | `prod`                                         | unset → `dev`                                          | Gates MSW init + client behavior                  |
| `REFI_ENV` (server-only)        | `prod`                                         | unset → `dev`                                          | Gates the BFF dev-identity fallback (fail-closed) |
| `NEXT_PUBLIC_REFI_DATA_ADAPTER` | n/a (MSW off anyway)                           | unset → `mock`                                         | Browser MSW on/off                                |
| `NEXT_PUBLIC_API_BASE_URL`      | `https://api.refi.trading` (unresolvable — D4) | unset → `http://localhost:3000` (MSW intercepts first) | Where un-mocked calls would go                    |
| `REFI_BACKING__*`               | unset → filesystem                             | unset → filesystem                                     | Prototype-store persistence (Firestore optional)  |
