# 02 — Phase 2 Build Plan

**Audience:** UI engineering lead, Claude Code operator
**Purpose:** ticket-by-ticket execution plan from current state to Phase 2 exit
**Status:** ready to execute pending five open questions (see `decisions/open-questions.md`)

---

## Scope

This plan covers two bodies of work executed in sequence:

1. **UI Phase 1 catch-up.** Bootstrap the monorepo, migrate the existing Bolt React build into it, scaffold the API client package with MSW mocks, and stand up Phase 1 components against simulated data. This is the work Daniel's V2 PDF specifies under "UI Phase 1 Pre-Start" and the four sub-phases that follow. If any of it is already complete in another branch or workstream, skip and note.

2. **UI Phase 2 delivery.** Add SIWE authentication, KYC onboarding via CCID, and live compliance gating for previews and submissions. The passive market and positions feed stays simulated. Build the `/us` overlay on top.

Phase 3 (Explorer) and Phase 4 (Asset Routing, Token Policy, On-Chain) are explicitly out of scope.

## Stack baseline (non-negotiable)

| Concern | Choice |
|---|---|
| Framework | Next.js 16.x App Router |
| React | 19.x (Next.js 16 bundles canary; treat as 19-stable) |
| Language | TypeScript strict |
| Styling | Tailwind CSS; design tokens from `packages/ui` |
| Forms | `react-hook-form` + `zod` |
| Data fetching | TanStack Query for client-driven reads; React Server Components for initial paint; Server Actions for mutations where appropriate |
| Wallet | `wagmi` + `@rainbow-me/rainbowkit` + `viem` |
| Mocks | MSW (Mock Service Worker) |
| Testing | Vitest unit, Playwright E2E, `vitest-axe` for accessibility |
| Observability | `@sentry/nextjs`, PostHog, `@vercel/otel` with Cloud Trace exporter |
| Monorepo | `pnpm` workspaces + Turborepo |
| CI | GitHub Actions with WIF auth to GCP |
| Deployment | Cloud Run via Artifact Registry |

**Do not use** (these are wrong choices that came from the archived spec):
- Cloud SQL, Postgres, Drizzle, `pg` — backend is MongoDB
- Custom session/JWT/Identity Platform — we use SIWE
- React Router, `react-router-dom` — App Router only
- Supabase — removed
- SnapTrade SDKs — replaced by per-broker drivers behind backend API

## Pre-flight: open questions to resolve before Ticket 1

These must be answered by Zeshan and Daniel before any code is written. They are tracked in `decisions/open-questions.md`. The build plan assumes they will be answered; ticket details may shift slightly based on the answers.

1. **Regulatory framing for `/us`.** Digital-adviser path vs non-advisory tech platform.
2. **OpenAPI publication path.** Where Daniel publishes the Phase 1 OpenAPI specs that drive `packages/api-clients`.
3. **Monorepo tooling.** Confirm pnpm + Turborepo (recommendation) or specify alternative.
4. **Broker connect UX.** Alpaca OAuth flow vs API-key entry.
5. **WalletConnect project ID.** Provisioning and storage.

## Phase 1 catch-up tickets

Each ticket lists files touched, dependencies, and acceptance criteria. Tickets are sized for one or two pair-days of engineering work.

### MIG-P1-01 — Monorepo bootstrap

**Owner:** UI lead
**Depends on:** Open question 3 answered.

**Tasks:**
- Initialize root `package.json` with workspaces.
- Create `pnpm-workspace.yaml`, `turbo.json`.
- Create directory skeleton per architecture overview: `apps/web/`, `packages/ui/`, `packages/api-clients/`, `packages/config/`.
- Set up shared `tsconfig.base.json` in `packages/config/tsconfig/` extending `@tsconfig/strictest`.
- Set up shared ESLint config in `packages/config/eslint/` with `eslint-config-next` plus Prettier integration.
- Configure Husky pre-commit hook running lint + typecheck on staged files.
- Configure Commitlint with Conventional Commits.
- Set up Tailwind config in `packages/config/tailwind/` with the brand tokens (charcoal, mint, status colors per design system). Both `apps/web` and `packages/ui` extend this config.
- Path aliases in `packages/config/tsconfig/base.json`: `@ui/*` → `packages/ui/src/*`, `@api/*` → `packages/api-clients/src/*`, `@lib/*` → `apps/web/src/lib/*`.
- Create `CODEOWNERS` covering `apps/web/**`, `packages/ui/**`, `packages/api-clients/**`.

**Acceptance:**
- `pnpm install` succeeds at root and installs all packages.
- `pnpm typecheck` runs across all packages.
- `pnpm lint` runs across all packages.
- `pnpm -F web dev` starts a blank Next.js dev server.
- Husky blocks a commit with type errors.

### MIG-P1-02 — Next.js app shell

**Owner:** UI lead
**Depends on:** MIG-P1-01.

**Tasks:**
- Initialize Next.js 16 App Router in `apps/web/`.
- Create base `app/layout.tsx`, `app/page.tsx` (placeholder), `app/not-found.tsx`, `app/error.tsx`, `app/loading.tsx`.
- Create route group skeletons (empty `page.tsx` files): `app/landing/`, `app/auth/`, `app/explorer/`, `app/admin/`, `app/us/`.
- Create `apps/web/middleware.ts` with placeholder logic (correlation ID generation, request logging) to be filled in later tickets.
- Set up `next.config.ts` with: experimental config as needed, image domains, security headers stub.
- Verify Tailwind classes resolve via the shared config.
- Verify Inter and JetBrains Mono fonts load.

**Acceptance:**
- `/` renders placeholder.
- `/us`, `/landing`, `/explorer`, `/admin`, `/auth` render placeholders.
- TypeScript strict passes on the app.
- Lighthouse on `/` shows no critical errors.

### MIG-P1-03 — Design system migration into `packages/ui`

**Owner:** Frontend engineer
**Depends on:** MIG-P1-02.

**Tasks:**
- Migrate primitives from the Bolt build's design system into `packages/ui/src/components/`:
  - `Button` (primary mint, secondary outline, tertiary text, danger)
  - `Card`
  - `Badge` (with status color map: active/approved/rejected/warning/expired/system)
  - `Input`, `Select`, `Checkbox`, `Radio` (form primitives)
  - `Table` (header, body, sortable, hover, selected row)
  - `StatusBanner`
  - `Toast` and `ToastProvider`
  - `Skeleton` and `SkeletonProvider` (1500ms linear shimmer per design system)
  - `Gauge` (vertical fill bar, mint/warning/error zones)
- Create `packages/ui/src/tokens/` with TypeScript exports of all design tokens.
- Create `packages/ui/src/icons/index.ts` re-exporting only the curated subset of lucide-react icons used in the app (target ~25 icons; do not re-export the whole library).
- Set up Storybook in `packages/ui` (optional for Phase 1 but recommended).
- All components are TypeScript strict, accept ARIA props, support keyboard navigation.

**Acceptance:**
- Every primitive renders in Storybook (or a dev showcase route if Storybook is deferred).
- Color contrast passes WCAG AA on all variants.
- `prefers-reduced-motion` disables shimmer animations.
- Components are tree-shakeable.

### MIG-P1-04 — Migrate Bolt routes into `apps/web/app/us/`

**Owner:** Frontend engineer
**Depends on:** MIG-P1-02, MIG-P1-03.

**Tasks:**
- For each route in the existing Bolt build, create a corresponding Next.js page using the migration matrix from the archived ChatGPT spec section 5 (preserved for routing reference only — do not migrate the auth or data-fetching patterns).
- Replace `BrowserRouter` / `Routes` / `Route` with App Router file system.
- Replace `NavLink` with `next/link` + `usePathname` for active state.
- Replace `Navigate` with `redirect()` from `next/navigation`.
- Replace `Outlet` with `children` in layouts.
- Replace `useNavigate()` with `useRouter()` in client components.
- Apply the SEC-sensitive language replacement table to all migrated copy.
- Remove all Supabase imports and `src/lib/supabase.ts`. Remove `@supabase/supabase-js` from dependencies.
- Move all copy strings into `apps/web/app/us/_content/*.ts` files.

**Files touched:** Most pages under `apps/web/app/us/`. The existing Bolt `src/pages/*` content is copied and adapted.

**Acceptance:**
- All routes from the Bolt build are reachable at their corresponding `/us/*` paths (per migration matrix).
- No Supabase imports remain.
- No React Router imports remain.
- Copy uses approved terminology (passes blocked-term scanner — set up in MIG-P1-10).
- All pages render without errors (data is stubbed at this point; live data wires up in later tickets).

### MIG-P1-05 — Wallet provider scaffolding

**Owner:** Frontend engineer
**Depends on:** MIG-P1-02, open question 5 (WalletConnect project ID).

**Tasks:**
- Install `wagmi`, `viem`, `@rainbow-me/rainbowkit`.
- Create `apps/web/app/_providers/wallet/WalletProvider.tsx` that wraps `WagmiProvider` and `RainbowKitProvider`.
- Configure supported chains (Ethereum mainnet at minimum; testnets for dev environments).
- Configure WalletConnect with the project ID (sourced from env var).
- Wrap `apps/web/app/layout.tsx` with `WalletProvider`.
- Add a wallet UI somewhere visible (e.g., navbar) that lets users see their connected state. **Phase 1: the wallet renders but is not gated to SIWE.** SIWE is wired in Phase 2 Ticket 04.

**Acceptance:**
- Wallet connect button renders.
- User can connect MetaMask or WalletConnect in dev.
- Wallet address displays after connect.
- Disconnect works.
- No SIWE flow yet (that's Phase 2).

### MIG-P1-06 — API client package with MSW

**Owner:** Full-stack engineer
**Depends on:** MIG-P1-01, open question 2 (OpenAPI publication path).

**Tasks:**
- Create `packages/api-clients/openapi/` and check in initial OpenAPI specs from Daniel's Phase 1 services. If Daniel's services don't expose OpenAPI yet, hand-write skeleton specs based on the contracts in `00-architecture-overview.md`.
- Install `openapi-typescript` and configure a generation script in `packages/api-clients/package.json` that writes to `packages/api-clients/src/generated/`.
- Install `openapi-fetch` for the runtime client wrapper.
- Create domain-grouped React Query hooks in `packages/api-clients/src/hooks/`:
  - `useSession` (calls `/auth/session`)
  - `useKycStatus` (calls `/ccid/status`)
  - `useBrokerConnection`, `useBrokerSupported`, `useBrokerAccount`, `useBrokerPositions`, `useBrokerOrders`
  - `useOrders` with sub-methods `preview`, `submit`, `cancel`, `list`
  - `useRecommendations`, `useRecommendation(id)`
  - `useActivity`
- Install MSW. Create `packages/api-clients/src/mocks/handlers.ts` with handlers that return schema-compliant fixtures matching the OpenAPI types.
- Create two canonical mock personas: "Maya Thompson" (US, CA, Alpaca connected, ReFi Signal user) and "David Kim" (US, NY-pending-eligibility waitlist, no broker). Fixture data lives in `packages/api-clients/src/mocks/fixtures/`.
- Set up MSW to run in browser during dev (`apps/web/app/_msw/init.ts`) and in tests.

**Acceptance:**
- `pnpm -F api-clients generate` produces TypeScript types from OpenAPI.
- `useSession` hook returns a session object in dev mode (from MSW).
- `useBrokerConnection` returns a mock connection for "Maya".
- `useOrders.preview` returns an `OrderPreviewResult` with `status: 'ALLOW'` for in-range orders, `'DENY'` for out-of-range, with reasons.
- MSW handler list is exhaustive enough that every page in `/us/app/*` renders without 404s.

### MIG-P1-07 — Dashboard scaffolding with `useSimulation` hook

**Owner:** Frontend engineer
**Depends on:** MIG-P1-04, MIG-P1-06.

**Tasks:**
- Create `apps/web/app/_hooks/useSimulation.ts` that emits synthetic `orders.evt` lifecycle events on a tick (every 5 seconds in dev).
- Derive `positions`, `trades`, `portfolioMetrics` from the synthesized events.
- Render a persistent "Simulated Data" badge in the app shell.
- Wire `/us/app/home` and `/us/app/portfolio` to consume the simulation hook for passive data.
- Active actions (`useOrders.preview`, `useOrders.submit`) still go through the MSW-mocked API.
- Charts use Recharts; numeric values use the font-mono utility class.

**Acceptance:**
- `/us/app/home` shows portfolio value updating every 5s.
- Portfolio chart animates without exceeding 300ms transition duration.
- "Simulated Data" badge is visible on every screen using the hook.
- `prefers-reduced-motion` disables the simulation tick animation but preserves the data flow.

### MIG-P1-08 — Eligibility flow

**Owner:** Frontend engineer
**Depends on:** MIG-P1-04, MIG-P1-06.

**Tasks:**
- Implement `/us/eligibility` page per US overlay spec section 1.
- Build the form with `react-hook-form` + `zod`.
- Create a Next.js route handler at `apps/web/app/api/us/eligibility/route.ts` that:
  - Validates input
  - Looks up rule table (`apps/web/app/api/us/eligibility/rules.ts`)
  - HMACs the IP and user agent for logging
  - Returns the decision JSON
  - Issues a signed JWT in the `us_eligibility_v1` HTTP-only cookie
- Implement the result screens (eligible, waitlist, unsupported).
- Add `EligibilityDecision` cookie validation in `middleware.ts` to gate `/us/auth/connect` (eligibility required before SIWE).
- Add `jose` for JWT signing/verification.
- Log decision events via PostHog (see Ticket MIG-P2-08).

**Acceptance:**
- All three result states render correctly.
- Cookie is set with HttpOnly, Secure, SameSite=Lax, Path=/us.
- Middleware redirects to `/us/eligibility` if SIWE entry is attempted without the cookie.
- Decision payload is stored server-side (via backend `/v1/us/eligibility` if available, else logged for later).
- Rule table is data not code; can be edited without touching component code.

### MIG-P1-09 — Env validation + middleware foundation

**Owner:** Full-stack engineer
**Depends on:** MIG-P1-01.

**Tasks:**
- Create `apps/web/src/lib/config/env.ts` with a Zod schema that parses `process.env` at module load and fails fast on missing required variables.
- Variables: `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_SENTRY_DSN`, `SESSION_SECRET`, `IP_HASH_SECRET`, `ELIGIBILITY_JWT_SECRET`, `REFI_ENV`, `REFI_DATA_ADAPTER`.
- Update `apps/web/middleware.ts` to:
  - Generate `x-correlation-id` for every request and propagate it
  - Extract `x-forwarded-for` and pass to route handlers via header (no raw IP storage)
  - Inject CSP nonces for inline scripts
  - Apply security headers: HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
  - Check `us_eligibility_v1` cookie for `/us/auth/connect` and `/us/onboarding/*` (redirect to `/us/eligibility` if missing)
  - Check SIWE session cookie for `/us/app/*` and other protected routes (placeholder for now; real check in Ticket MIG-P2-01)

**Acceptance:**
- App fails to start with a clear error if a required env var is missing.
- CSP is enforced; inline scripts blocked unless nonced.
- Correlation ID flows from request → page → API call → response.
- Security headers visible in browser dev tools.

### MIG-P1-10 — Copy scanner + CI gate

**Owner:** Build engineer
**Depends on:** MIG-P1-01.

**Tasks:**
- Create `packages/config/blocked-terms.ts` exporting the list from the US overlay spec section 2.
- Create `scripts/scan-copy.ts` at repo root that:
  - Walks `apps/web/app/us/**/*.{tsx,mdx,ts}` (the last for `_content/` files)
  - Walks `packages/ui/src/**/*.tsx` for shared component copy
  - Scans for blocked terms (case-insensitive, whole-word match)
  - Allows opt-out via `// allow-blocked-term: "term" reason: "..."` comment on the line above
  - Outputs `file:line:column: blocked term "X"` for each violation
  - Exits non-zero on any violation
- Add CI step in `.github/workflows/ci.yml` that runs `pnpm scan-copy` on every PR.

**Acceptance:**
- CI fails on a PR that introduces "AI trading bot" in any `/us` route.
- CI passes when the term is in an allowed context (disclosure quoting the term back).
- Scanner runs in under 5 seconds on the full codebase.

## Phase 2 tickets

### MIG-P2-01 — SIWE authentication

**Owner:** Full-stack engineer
**Depends on:** MIG-P1-05, MIG-P1-06, MIG-P1-09.

**Reference:** Daniel's V2 PDF, "a. Foundational Identity (SIWE Integration)".

**Tasks:**
- Implement `useSiweAuth` hook in `packages/api-clients/src/hooks/`:
  - Step 1: `GET /siwe/nonce`
  - Step 2: Build EIP-4361 message with domain, URI, chainId, nonce, expiration
  - Step 3: Request wallet signature via wagmi
  - Step 4: `POST /siwe/verify` with signature; receive cookies
  - Step 5: Refetch `/auth/session` to populate auth context
- Implement `AuthContext` provider in `apps/web/app/_providers/auth/AuthProvider.tsx` exposing `{status, account_id, wallet_id, roles[], kyc_status}`.
- Implement `useSession`, `useSignOut` hooks.
- Implement automatic refresh: when session expires within 5 minutes, call `POST /auth/refresh`. Rotate the refresh token.
- Implement device-wide revoke action (`POST /auth/revoke-all`).
- Map all six standardized error codes to user-facing copy:
  - `NONCE_INVALID` → "Connection expired, please try again."
  - `SIGNATURE_INVALID` → "Signature verification failed. Please reconnect your wallet."
  - `POLICY_VIOLATION` → "Wallet not eligible for this product."
  - `CHAIN_DENIED` → "This network is not supported. Please switch to Ethereum mainnet."
  - `ACCOUNT_BLOCKED` → "This account has been suspended. Contact support."
  - `REFRESH_REVOKED` → "Your session has been revoked. Please sign in again."
- Build `/us/auth/connect` page that orchestrates the SIWE flow.
- Update `middleware.ts` to enforce SIWE session presence on `/us/app/*`, `/us/onboarding/*` (except `/us/onboarding/start` which is the post-connect redirect).
- Update `middleware.ts` to enforce RBAC on `/admin/*` and Phase 3+ protected routes.

**Acceptance:**
- End-to-end flow: visit `/us/eligibility` → submit → redirect to `/us/auth/connect` → connect wallet → sign message → land on `/us/onboarding`.
- Cookies are HttpOnly, Secure, SameSite=Lax with CSRF token on writes.
- Refresh rotation works (verified in tests by advancing clock).
- Logout clears cookies and redirects to `/us`.
- All six error codes have user-facing copy and surface correctly.
- Correlation ID is attached to every SIWE request.
- E2E test: nonce success, signature invalid, refresh rotation, logout.

### MIG-P2-02 — KYC onboarding via CCID

**Owner:** Full-stack engineer
**Depends on:** MIG-P2-01.

**Reference:** Daniel's V2 PDF, "b. User Onboarding and Attestation (CCID/KYC Flow)".

**Tasks:**
- Implement `useKycFlow` hook with methods:
  - `start()` → `POST /ccid/start` → returns provider URL/token
  - `pollStatus()` → `GET /ccid/status` with React Query polling at 5s interval until status leaves `{pending, incomplete}`
  - `simulateWebhook()` (dev only) → `POST /ccid/webhook/provider` for testing
- Build `/us/onboarding/kyc` (or integrate into `/us/onboarding` flow):
  - If `kyc_status === 'approved'`: skip and route forward.
  - If `kyc_status === 'pending' | 'incomplete'`: render kickoff CTA → start CCID → handoff to provider (redirect or modal) → return → poll → render status until terminal.
  - Status copy: "Pending" (blue), "Under review" (amber), "Approved" (green), "Denied" (red).
- On `approved`, trigger `POST /compliance/invalidate-cache?account_id=...` to ensure the Compliance Adapter refreshes its cache for this user.
- Update `AuthContext` to reflect new `kyc_status` after approval.
- **Strict rule: no PII rendered or logged in the UI.** Only provider references, status codes, and hashed evidence appear.

**Acceptance:**
- Happy path: pending → start → provider → return → approved → forward route.
- Denied path: explanatory copy, support link, no retry CTA.
- Review path: copy explaining manual review timeline, no action available.
- E2E test simulates webhook with `simulateWebhook()` and verifies UI updates within poll interval.
- Audit: confirm no PII appears in browser network tab beyond provider reference.

### MIG-P2-03 — Live compliance gating

**Owner:** Frontend engineer
**Depends on:** MIG-P2-01, MIG-P2-02, MIG-P1-06.

**Reference:** Daniel's V2 PDF, "c. Live Compliance Gating in UI".

**Tasks:**
- Remove MSW handlers for `/orders/preview` from the dev mock set (still keep for tests). Compliance preview now hits the live backend.
- Wire `useOrders.preview` to render the verdict from the backend:
  - `status: ALLOW` → enable Submit button, render success badge with `source` indicator (cache hit vs fresh).
  - `status: REVIEW` → disable Submit, render amber badge, list reasons, show "Request manual review" CTA.
  - `status: DENY` → disable Submit, render red badge, list reasons.
  - Fetch error or 5xx → treat as `COMPLIANCE_UNAVAILABLE`, disable Submit, show retry CTA.
- Apply this gating to all submit pathways:
  - `/us/app/recommendations/[id]` Accept button
  - Any future inline accept actions
- Telemetry: emit `compliance_preview_returned` event with `status`, `source`, `latency_ms`, `recommendation_id` (correlation ID propagated).
- Add a small dev tool (gated by `REFI_ENV !== 'prod'`) that lets engineers override the verdict for local testing.

**Acceptance:**
- Submit is disabled on every non-ALLOW response.
- Reasons surface verbatim from the backend (mapped to UI copy for known codes).
- Cache-hit vs fresh source is visible in dev (hidden in prod).
- Adapter timeout (simulated via MSW in tests) results in `COMPLIANCE_UNAVAILABLE` UI state.
- E2E test: happy ALLOW path; happy DENY path with reasons; adapter-down path.

### MIG-P2-04 — Onboarding wizard

**Owner:** Frontend engineer
**Depends on:** MIG-P2-01, MIG-P2-02, MIG-P1-06.

**Tasks:**
- Implement `/us/onboarding/profile`, `/us/onboarding/broker`, `/us/onboarding/strategy`, `/us/onboarding/activation` per US overlay spec section "Screen-by-screen requirements".
- Wizard layout shows progress (4 steps), allows navigation back/forward, persists step completion server-side.
- Profile form posts to `POST /v1/profile` (creates `AdvisoryProfile`).
- Broker step calls `GET /v1/brokers/supported` with US filter, renders cards, initiates connect flow per open question 4 (OAuth or API key entry).
- Strategy step calls `GET /v1/strategies/current` (read-only display).
- Activation step renders the checklist; each item polls the relevant endpoint to confirm status.
- Final "Activate" button calls `POST /v1/account/activate`.

**Acceptance:**
- Each step is deep-linkable.
- Browser back/forward preserves state.
- Form validation surfaces field-level errors.
- Server-side step completion means a user can leave at step 2 and return to step 2.
- "Activate" disabled until all items checked.
- E2E test: full onboarding from connect → activate.

### MIG-P2-05 — `/us` route group rounding-out

**Owner:** Frontend engineer
**Depends on:** MIG-P2-01 through MIG-P2-04.

**Tasks:**
- Round out `/us/app/home`, `/us/app/portfolio`, `/us/app/recommendations`, `/us/app/recommendations/[id]`, `/us/app/activity`, `/us/app/documents`, `/us/app/account`, `/us/app/support` per US overlay spec.
- Recommendations and recommendations detail surface the live compliance gating built in MIG-P2-03.
- Account page exposes wallet revoke, KYC status, broker disconnect, fee settings placeholder, security settings.
- Support page implements the blocked-prompt detection (regex match on common advice-seeking patterns) and disables submit when detected. This is a **regulatory requirement** under Internet Adviser Exemption rule 203A-2(e)(3), not only a product feature.
- Documents page renders the Option A disclosure document set: Form CRS, ADV Part 2A, Investment Advisory Agreement, privacy notice, e-delivery consent, fee schedule, managed-execution acknowledgment. Each card renders in "Document in preparation" status (document name is final; content is pending SEC registration). Do not use "Coming soon" — the document names are correct and permanent.
- Managed-execution activation checklist item for "Disclosures acknowledged" remains red until documents are available and acknowledged.

**Acceptance:**
- Every `/us/app/*` route renders without error for an authenticated Maya persona.
- Documents page shows all seven disclosure document cards by name in "Document in preparation" status.
- Activation checklist "Disclosures acknowledged" item is red (not green) in the pending-registration state.
- Support page blocked-prompt detection works; submit disables on advice-seeking patterns.
- Cross-user access (Maya tries to read David's recommendation) returns 404.
- Mobile-responsive at 320px and up.
- All a11y checks pass.

### MIG-P2-06 — Observability wiring

**Owner:** Full-stack engineer
**Depends on:** MIG-P1-09.

**Tasks:**
- Install `@sentry/nextjs`. Configure with DSN from env. Source map upload to Sentry on build.
- Install `posthog-js`. Configure with key from env. Create `PostHogProvider` in `apps/web/app/_providers/posthog/`. Disable in `REFI_ENV === 'dev'` unless `NEXT_PUBLIC_POSTHOG_DEV=true`.
- Define typed event helpers in `apps/web/app/_lib/analytics.ts` so event names are constants and pass the blocked-term scanner.
- Install `@vercel/otel`. Configure with Cloud Trace exporter (stub for dev; real exporter in staging+).
- Verify correlation IDs propagate from `middleware.ts` through API calls.
- Set up Sentry alerts for: 401 churn (more than X 401s per minute), 429 spikes, CSP violations.
- Set up PostHog funnel for `/us/eligibility` → `/us/auth/connect` → `/us/onboarding/*` → activation.
- Add Web Vitals reporting (`useReportWebVitals` from `next/web-vitals`) to PostHog.

**Acceptance:**
- A thrown error in a page surfaces in Sentry within 30s.
- A `us_eligibility_submitted` event reaches PostHog.
- Correlation ID visible in Sentry context, PostHog event properties, and Cloud Trace span attributes.
- Alerts trigger in dev when synthesized.
- Lighthouse CI passes thresholds (a11y ≥ 95, performance ≥ 80) on `/us` and `/us/eligibility`.

### MIG-P2-07 — Security hardening

**Owner:** Full-stack engineer
**Depends on:** MIG-P1-09.

**Tasks:**
- Tighten CSP to production strict mode: `script-src 'self' 'nonce-<value>'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' <API_BASE_URL> https://api.posthog.com https://sentry.io; frame-ancestors 'none';` and similar.
- Verify all third-party scripts (PostHog, RainbowKit, Sentry) work with CSP.
- Add rate limiting on `/api/us/eligibility`, `/api/us/support` via Upstash Redis or Memorystore + a token bucket lib.
- Add CSRF protection on Server Actions (Next.js default Origin check + double-submit cookie pattern for any exposed mutations).
- Verify SIWE refresh cookie rotation invalidates the prior cookie.
- Run OWASP ZAP baseline scan against staging deploy.

**Acceptance:**
- CSP violations report cleanly with no false positives.
- Rate limit returns 429 with `Retry-After` header on burst.
- CSRF attack vector tested and blocked.
- ZAP scan reports no high or critical findings.

### MIG-P2-08 — Terraform scaffold for staging

**Owner:** Cloud engineer
**Depends on:** none functionally; can run in parallel.

**Tasks:**
- Create `infra/terraform/` with `environments/{dev,staging,prod}/` and `modules/`.
- Modules: `project-services`, `artifact-registry`, `cloud-run-service`, `secret-manager`, `cloud-storage-bucket`, `cloud-tasks-queue`, `service-account`, `iam-bindings`, `load-balancer`, `monitoring-alerts`.
- Configure GCS remote state per environment.
- Configure Workload Identity Federation for GitHub Actions.
- **Do not include** Cloud SQL modules (MongoDB is Daniel's responsibility). **Do not include** Pub/Sub modules for the UI (backend concern).
- Cloud Run service config: 1 vCPU, 1GB memory, min instances 0 (dev), 1 (staging), 2 (prod), max instances scaling.
- Document setup commands in `infra/terraform/README.md`.

**Acceptance:**
- `terraform init` works in each environment directory.
- `terraform plan` against an empty project produces a sane plan.
- GitHub Actions workflow can authenticate via WIF and run `terraform plan` on PRs.

### MIG-P2-09 — CI/CD pipeline

**Owner:** Build engineer
**Depends on:** MIG-P1-01, MIG-P2-08.

**Tasks:**
- `.github/workflows/ci.yml`:
  - Trigger: PR and push to main
  - Steps: checkout, setup pnpm, install, lint, typecheck, unit tests (Vitest), build, copy scanner, bundle-size check (size-limit or bundlewatch), Lighthouse CI on preview build, Playwright E2E smoke
- `.github/workflows/deploy-staging.yml`:
  - Trigger: push to `main`
  - Steps: WIF auth, build Docker image, push to Artifact Registry, `terraform apply` for staging, deploy Cloud Run revision, smoke test (curl `/us` and `/api/health`)
- `.github/workflows/deploy-prod.yml`:
  - Trigger: manual dispatch or tag
  - Same as staging plus traffic-splitting (10% canary, hold, ramp to 100%)
- All workflows inject `BUILD_SHA` and `BUILD_TIME` at build.
- Required status checks on `main` branch protection: typecheck, lint, unit tests, copy scanner, bundle size.

**Acceptance:**
- PR triggers full CI in under 10 minutes.
- A successful merge to `main` deploys to staging automatically.
- Manual prod deploy works with canary.
- Failed copy scanner blocks merge.

### MIG-P2-10 — E2E test suite

**Owner:** QA engineer
**Depends on:** MIG-P2-01 through MIG-P2-05.

**Tasks:**
- Set up Playwright in `apps/web/e2e/`.
- Scenarios:
  - Public visitor lands on `/us`, navigates to eligibility, completes form, eligible result, clicks connect.
  - Public visitor lands on `/us`, navigates to eligibility, ineligible state, waitlist result.
  - SIWE happy path: connect MetaMask test wallet → sign → land in onboarding.
  - SIWE error: invalid signature → error copy renders.
  - Onboarding: profile → broker connect (mocked Alpaca) → strategy → activation.
  - Recommendation list renders for Maya, detail page opens, ALLOW state enables Submit.
  - Recommendation DENY state disables Submit and shows reasons.
  - Support boundary detects blocked prompt and disables submit.
- Tests run in CI against MSW-mocked backend.
- Tests run against staging on `main` deploys.

**Acceptance:**
- All scenarios pass in CI on a clean run.
- Flaky test rate under 2%.
- Total runtime under 8 minutes.

## Definition of done for Phase 2 exit

Verbatim from Daniel's V2 PDF Phase 2 exit criteria, plus the US overlay additions:

**Platform criteria (from V2 PDF):**
- Authentication is live with cookies, CSRF, rotate, revoke; protected routes enforce SIWE/RBAC.
- Onboarding/attestation is live and drives adapter refresh; UI stores no PII.
- Compliance gating is live for previews/submissions; fail-closed posture preserved; passive data feed remains simulated.
- Operational checks: alerts on 401 churn / 429 spikes / CSP violations; budgets and accessibility checks applied to new routes.

**US overlay additions:**
- `/us/eligibility` gates SIWE entry by state, age, US-person status.
- All `/us` copy passes the blocked-term scanner.
- US-eligible broker list filters correctly.
- Disclosures screen renders all seven Option A document cards by name in "Document in preparation" status. No fake PDFs. No generic "Coming soon" screen — the document names are final.

**Build hygiene:**
- Typecheck passes.
- Lint passes.
- Unit tests pass.
- E2E smoke tests pass.
- Bundle size within budget.
- Lighthouse a11y ≥ 95, performance ≥ 80 on `/us` and `/us/eligibility`.
- Sentry, PostHog, Cloud Trace receiving events.
- Terraform staging environment provisioned.
- Cloud Run staging deploy succeeds via CI.

## What's explicitly deferred

Phase 3:
- Explorer routes wired to `/v1/resolve`, `/v1/batch`, `/v1/search`, `/v1/verify/inclusion`
- Protected preimage and timeline under SIWE
- L1 anchor "Pending" state surfacing
- ReFIN L2 receipt rendering

Phase 4:
- Admin Asset Routing CRUD + bulk import
- Token Policy Claim UI with EIP-712
- On-Chain Lifecycle chips with txHash + block explorer links
- zk-VaR attestations
- DePIN QoS leaderboard

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| OpenAPI spec from Daniel arrives late | M | H | Hand-write skeleton OpenAPI based on `00-architecture-overview.md` contracts; reconcile when real spec lands |
| Regulatory framing unresolved at Ticket MIG-P2-05 | M | M | Disclosures page renders "Coming soon"; everything else proceeds |
| Alpaca OAuth flow differs from assumed | L | M | Treat broker connect UX as a small, replaceable component; UI is broker-agnostic |
| WalletConnect project ID provisioning delayed | L | L | Use a dev project ID; swap before prod |
| Phase 1 backend Compliance Adapter not ready when Ticket MIG-P2-03 starts | M | H | Keep MSW handlers for `/orders/preview`; wire live as it becomes available; treat as feature flag |
| MongoDB schema drift breaks UI when backend updates | M | M | Strict OpenAPI typing; pin SDK versions; CI runs against checked-in OpenAPI |
| Next.js 16 async `params` breaking change missed in PRs | L | L | Add an ESLint rule or codemod that flags non-async `params` access |

## Estimates

Rough effort assuming one experienced full-stack engineer + occasional pairing:

| Body of work | Estimate |
|---|---|
| Phase 1 catch-up tickets (MIG-P1-01 to MIG-P1-10) | 3 weeks |
| Phase 2 tickets (MIG-P2-01 to MIG-P2-10) | 4 weeks |
| Buffer for open-question delays, integration friction | 1-2 weeks |
| **Total** | **8-9 weeks to Phase 2 exit** |

These are rough estimates. Claude Code accelerates the boilerplate but does not change the integration risk, which is the dominant variable.
