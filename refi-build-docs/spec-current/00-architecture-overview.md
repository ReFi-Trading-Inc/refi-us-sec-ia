# 00 — Architecture Overview

**Audience:** everyone touching the build
**Purpose:** one shared mental model of the system topology
**Status:** UI Phase 2 entry. Phase 1 (backend + UI scaffolding) complete or in flight. Phase 3 and 4 are future.

---

## The product in one paragraph

ReFi.Trading USA is the US product surface of the ReFi platform. Users connect their own brokerage account (Alpaca first, IBKR and Tradier next; assets stay at the broker, not at ReFi), authenticate with a crypto wallet via Sign-In With Ethereum, complete KYC via Chainlink CCID, and use software-generated personalized investment recommendations. Live trading actions are compliance-gated through a Chainlink ACE policy cache that returns `ALLOW`, `REVIEW`, or `DENY`. The UI shows a fail-closed posture: anything non-ALLOW blocks submission with a reason. Records of every recommendation, eligibility check, broker order, and compliance verdict are hashed and rolled into Merkle interval roots written to the ReFIN L2 audit chain (Phase 3), with periodic anchoring to Ethereum L1 for permanence.

The US surface adds on top of the platform a state-residence eligibility gate, US-specific regulatory disclosures, US-eligible broker filtering, and SEC-sensitive copy rules. It does not replace any platform component.

## Layered topology

```
User browser
    │
    │ Next.js App Router (apps/web)
    │   /us/*           US product surface (this build)
    │   /landing        marketing
    │   /explorer       audit explorer (Phase 3+)
    │   /admin          asset routing admin (Phase 4+)
    │
    ▼
Identity & Compliance layer
    SIWE service       (Phase 2)   /siwe/*  /auth/*
    CCID provider      (Phase 2)   /ccid/*
    Compliance Adapter (Phase 2)   verdict cache; consults ACE
    Chainlink ACE      (Phase 2)   policy decision service
    Chainlink CCID     (Phase 2)   KYC attestation
    │
    ▼
Trading core (Phase 1, running)
    Data Loader              ─┐
    Inference Worker          │
    Training Scheduler        │
    Trainer (retrain/tune)    │   on Pub/Sub event bus
    Portfolio Engine          │
    Account Intent Builder    │
    Risk Engine               │
    Execution Gateway         │  per-broker drivers:
        Alpaca driver         │   - Alpaca (built)
        IBKR driver           │   - IBKR (next)
        Tradier driver        │   - Tradier (next)
    Trade Manager            ─┘
    │
    ▼
Data stores
    MongoDB Atlas       primary system of record
    Redis Memorystore   locks, hot caches, rate limits, session backing
    GCS                 model artifacts, transform scalers,
                        audit preimages (Phase 3)
    │
    ▼
Audit & ledger (Phase 3)
    Audit Writer        hashes leaves: risk, compliance, execution
    Merkle Builder      interval roots
    ReFIN L2 chain      audit ledger + DePIN contracts (Phase 4)
    Anchor Job (CCIP)   periodic anchoring to Ethereum L1
    Explorer API        resolve hash → leaf → interval → L2 → L1
    │
    ▼
External integrations
    Market data provider    OHLCV
    Broker APIs             Alpaca, IBKR, Tradier
    Ethereum L1             permanence anchor
```

## What runs where

| Layer | Runtime | Owner |
|---|---|---|
| Next.js app (`apps/web`) | Cloud Run | Frontend |
| Wallet provider (browser) | Browser via wagmi/RainbowKit | Frontend |
| SIWE service | Cloud Run (Python or Node) | Backend (Daniel) |
| CCID integration | Cloud Run | Backend (Daniel) |
| Compliance Adapter | Cloud Run | Backend (Daniel) |
| All Phase 1 core services | Cloud Run | Backend (Daniel) |
| MongoDB Atlas | Atlas-hosted | Backend (Daniel) |
| Redis | Memorystore | Backend (Daniel) |
| GCS | Native | Shared |
| Audit + ReFIN + Explorer | Phase 3 — TBD | Backend (Daniel) |

## Phase status

| Phase | What it adds | Status |
|---|---|---|
| Phase 1 | Trading core + per-broker drivers + walk-forward RL inference + brokered execution | Backend running; UI Phase 1 scaffolding in flight |
| Phase 2 | SIWE wallet auth + CCID KYC + Compliance Adapter with cached ACE verdicts | **Entry point now** |
| Phase 3 | Cryptographic audit chain (Audit Writer → Merkle → ReFIN L2 → L1 anchor) + Explorer API | Future |
| Phase 4 | Asset Routing + Token Policy + On-Chain Driver + zk-VaR + DePIN | Future |

## Key contract: how the UI talks to the backend

**One pattern, no exceptions.** The UI never imports a database client, never calls a broker directly, never calls Chainlink directly. The UI calls backend HTTP endpoints documented in OpenAPI specs published by Daniel's services. Generated TypeScript SDKs live in `packages/api-clients`. React hooks wrap the SDKs.

```
React component
   │
   │ uses hook
   ▼
React Query hook in packages/api-clients
   │
   │ calls generated SDK method
   ▼
OpenAPI-generated TypeScript client
   │
   │ HTTP fetch with x-correlation-id header,
   │ HTTP-only session cookie, CSRF token on writes
   ▼
Backend service (Cloud Run)
```

During development, MSW (Mock Service Worker) intercepts the same fetch calls and returns schema-compliant fixtures so the UI runs end-to-end without the backend reachable. MSW handlers live in `packages/api-clients/src/mocks/`.

## Key contract: real-time data

Phase 1 and Phase 2 deliberately keep most of the UI on simulated passive feeds. A `useSimulation` hook in `apps/web/app/_hooks/` emits synthetic `orders.evt` lifecycle events and derives trades, positions, and portfolio metrics. **A visible "Simulated Data" badge appears on every screen showing this data.**

Live data only arrives in Phase 2 for **user-initiated actions** — preview and submit go through real backend endpoints, returning real compliance verdicts. Passive market and position feeds stay simulated through Phase 2.

Phase 3 introduces live audit trail data (Explorer reads). Phase 4 introduces live on-chain lifecycle events.

## Key contract: authentication

Authentication is **SIWE only** (Sign-In With Ethereum, EIP-4361). There is no email/password path.

The session is an HTTP-only secure cookie with a CSRF token on writes. Refresh tokens rotate. The auth context exposes `{status, account_id, wallet_id, roles[], kyc_status}`. Six standardized error codes the UI must handle:

- `NONCE_INVALID`
- `SIGNATURE_INVALID`
- `POLICY_VIOLATION`
- `CHAIN_DENIED`
- `ACCOUNT_BLOCKED`
- `REFRESH_REVOKED`

The US surface adds one more constraint: a server-side `EligibilityDecision` cookie issued by the `/us/eligibility` flow must be present before the SIWE connect screen is shown. This is the only thing the US surface adds to the auth contract.

## Key contract: compliance

Every trade preview and submit consults the Compliance Adapter, which returns one of:

```
{
  status: "ALLOW" | "REVIEW" | "DENY",
  reasons: [{ code: string, message: string }],
  source: "cache" | "fresh"
}
```

UI rules:
- `ALLOW` → Submit enabled.
- `REVIEW` → Submit disabled. Show reasons. User can request review.
- `DENY` → Submit disabled. Show reasons.
- Adapter unreachable → Treated as rejection with synthesized code `COMPLIANCE_UNAVAILABLE`.

This is **fail-closed**. There is no codepath where Submit is enabled without a fresh `ALLOW`.

## Key contract: broker connection

The UI is broker-agnostic. The user picks from a list of available brokers (filtered to US-eligible brokers on `/us`), and the backend routes to the correct driver. The UI never knows which broker is on the other end of a given order.

```
GET  /v1/brokers/supported       → [{broker_id, name, status, capabilities}]
POST /v1/brokers/connect/start   → returns OAuth URL or device-code flow
GET  /v1/brokers/connection      → user's current connection
POST /v1/brokers/disconnect      → revoke
GET  /v1/brokers/account         → cash, buying power, equity
GET  /v1/brokers/positions       → list of positions
GET  /v1/brokers/orders          → list of orders
```

**Implication:** No Alpaca-specific UI code. No IBKR-specific UI code. The broker driver layer on the backend handles per-broker translation.

## Monorepo layout (the only correct one)

```
refi-monorepo/
├── apps/
│   └── web/                              # Next.js App Router application
│       ├── app/
│       │   ├── _components/              # internal app components
│       │   │   ├── dashboard/
│       │   │   ├── trading/
│       │   │   └── shared/
│       │   ├── _providers/
│       │   │   └── wallet/               # wagmi + RainbowKit
│       │   ├── _hooks/
│       │   ├── landing/                  # marketing
│       │   ├── auth/                     # global SIWE flow
│       │   ├── explorer/                 # Phase 3+
│       │   ├── admin/                    # Phase 4+
│       │   └── us/                       # US product surface
│       │       ├── page.tsx              # /us landing
│       │       ├── eligibility/
│       │       ├── onboarding/
│       │       ├── disclosures/
│       │       ├── app/                  # authenticated US area
│       │       │   ├── home/
│       │       │   ├── portfolio/
│       │       │   ├── recommendations/
│       │       │   ├── activity/
│       │       │   ├── documents/
│       │       │   ├── account/
│       │       │   └── support/
│       │       └── _content/             # US-specific copy
│       ├── middleware.ts                 # session check, CSP, x-correlation-id
│       ├── next.config.ts
│       └── package.json
├── packages/
│   ├── ui/                               # shared design system
│   │   ├── src/
│   │   │   ├── components/               # Button, Card, Badge, Table, etc.
│   │   │   ├── tokens/                   # design tokens
│   │   │   └── icons/                    # curated lucide-react re-exports
│   │   └── package.json
│   ├── api-clients/                      # OpenAPI-generated SDKs + hooks
│   │   ├── openapi/                      # checked-in OpenAPI specs from backend
│   │   ├── src/
│   │   │   ├── generated/                # generated TS clients
│   │   │   ├── hooks/                    # React Query hooks
│   │   │   └── mocks/                    # MSW handlers
│   │   └── package.json
│   └── config/                           # shared eslint, tsconfig, tailwind
│       ├── eslint/
│       ├── tsconfig/
│       ├── tailwind/
│       └── blocked-terms.ts              # SEC-sensitive copy scanner input
├── .github/workflows/
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

## Data contracts the UI consumes (from Daniel's V2 doc)

These are the named contracts. UI types are generated from OpenAPI; do not reinvent them.

| Contract | From endpoint | Used by |
|---|---|---|
| `AuthSession` | `GET /auth/session` | auth context |
| `KycStatus` | `GET /ccid/status` | onboarding |
| `OrderPreviewResult` | `POST /orders/preview` | trading preview |
| `Order` | `POST /orders`, `GET /orders` | trading submit |
| `orders.evt` (stream) | WebSocket or SSE | lifecycle chips |
| `Position` | `GET /v1/brokers/positions` | portfolio view |
| `BrokerAccount` | `GET /v1/brokers/account` | portfolio header |
| `BrokerConnection` | `GET /v1/brokers/connection` | broker status |
| `RouteDecision` (Phase 4) | `GET /v1/route/{symbol}` | routing badge |
| `PolicyDecision` (Phase 4) | `GET /policy/{chainId}/{token}` | token policy claim |
| `ClaimResponse` (Phase 4) | `POST /claim/issue` | on-chain submit |
| `ExplorerRecord` (Phase 3) | `GET /v1/resolve/{hash}` | explorer view |

## What the US surface adds (and only this)

1. State-of-residence + age + US-person eligibility gate.
2. US-specific copy applied to platform screens (per SEC-sensitive language rules).
3. US-eligible broker filter on the broker connect screen.
4. US-specific regulatory disclosures (pending counsel decision on framing).
5. State-by-state feature availability (some features may be unavailable in specific states).

Everything else is inherited from the platform.

## What changes from earlier guidance

If you've read the earlier ChatGPT-generated build spec, the following items are **wrong in that document** and corrected here:

| Wrong in ChatGPT spec | Correct |
|---|---|
| Cloud SQL Postgres + Drizzle | MongoDB Atlas + Redis + GCS |
| Custom email/password auth | SIWE (EIP-4361) only |
| Custom Form CRS / ADV 2A placeholders | Chainlink CCID + ACE; framing pending counsel |
| Single Next.js app | Monorepo: `apps/web` + `packages/ui` + `packages/api-clients` + `packages/config` |
| SnapTrade as broker abstraction | Per-broker drivers (Alpaca, IBKR, Tradier); UI is broker-agnostic |
| Custom `RepositoryInterface` pattern | OpenAPI-generated SDKs + React hooks |
| Custom domain types (`Recommendation`, etc.) | Generated from OpenAPI; named contracts from Daniel's V2 doc |
| Examiner Export as core UX | Explorer (Phase 3) is the user-facing audit surface; examiner export is admin-only |
