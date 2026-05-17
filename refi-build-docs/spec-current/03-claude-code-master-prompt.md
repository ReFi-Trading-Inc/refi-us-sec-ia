# 03 — Claude Code Master Prompt

**Audience:** Claude Code operator
**Purpose:** the verbatim prompt to begin work
**Status:** ready

---

## How to use this document

Paste the prompt below into Claude Code as the first message. Claude Code will execute the audit step first and surface open questions. Do not proceed past Step 1 without Zeshan's confirmation of the open-question answers.

---

## The prompt

```
You are migrating the ReFi USA Vite React TypeScript app at
github.com/Z333Q/refi-usa into a new monorepo and bringing it to
UI Phase 2 readiness for the product surface mounted at /us on
refi.trading.

SOURCE REPO (read-only, migration reference):
  github.com/Z333Q/refi-usa

TARGET REPO (new repo, scaffold here):
  github.com/ReFi-Trading-Inc/refi-us-sec-ia
  GitHub org: ReFi-Trading-Inc

AUTHORITATIVE SOURCES (in priority order):

1. docs/spec-current/00-architecture-overview.md
   The system topology and contracts. Read first. Single source of
   truth for stack choices, monorepo layout, auth model, compliance
   model, broker abstraction, real-time data approach.

2. docs/spec-current/01-us-overlay.md
   What the US surface adds on top of the platform. Eligibility gate,
   SEC-sensitive language rules, US broker filtering, regulatory
   disclosures (pending counsel), state-by-state availability.

3. docs/spec-current/02-phase-2-build-plan.md
   The ticket-by-ticket execution plan. Tickets MIG-P1-01 through
   MIG-P1-10 (Phase 1 catch-up), then MIG-P2-01 through MIG-P2-10
   (Phase 2 delivery). Follow the dependency order.

4. Dev-PhasesV2.pdf (Daniel's integrated UI architecture, 108 pp)
   The platform-wide UI spec. Phase checkpoints, SIWE contract,
   CCID flow, Compliance Adapter verdict contract, named data
   contracts. The /us overlay rides on top of this.

5. ReFi-Product-Dev-Phases-V1.pdf (Daniel's backend architecture, 16 pp)
   Phase 1-4 backend services. Note: the SnapTrade references in V1
   diagrams are stale. The current truth is per-broker drivers
   (Alpaca built, IBKR and Tradier next). The UI never sees individual
   broker drivers; it consumes a unified broker API.

6. decisions/open-questions.md
   The five decisions Zeshan and Daniel owe before code starts.

DO NOT READ the archived ChatGPT spec at
docs/spec-history/ReFi_US_Next_GCP_Terraform_Master_Build_Spec_v2.md
as a source of truth. It contains substantial conflicts with Daniel's
architecture (Cloud SQL vs MongoDB, custom auth vs SIWE, SnapTrade
vs per-broker drivers, single-app vs monorepo, repository pattern vs
OpenAPI SDKs, fabricated US legal entity, etc.). It is preserved
only for screen inventory cross-reference.

STACK BASELINE (non-negotiable):

- Next.js 16.x App Router (params and searchParams are Promises; always
  await them in dynamic routes)
- React 19.x
- TypeScript strict
- Tailwind CSS with brand tokens from packages/ui
- react-hook-form + zod for forms
- TanStack Query for client-side data
- wagmi + RainbowKit + viem for wallet
- MSW for development mocks
- Vitest + Playwright + vitest-axe for testing
- @sentry/nextjs, posthog-js, @vercel/otel for observability
- pnpm workspaces + Turborepo (pending Zeshan confirmation in
  open-questions.md item 3)

DO NOT USE (wrong choices that came from the archived spec):

- Cloud SQL, Postgres, Drizzle, pg — backend is MongoDB Atlas
- Custom email/password auth, Identity Platform — we use SIWE only
- React Router or react-router-dom — App Router only
- @supabase/supabase-js — removed
- SnapTrade SDKs — replaced by backend-side per-broker drivers
- Custom "repository interfaces" — use OpenAPI-generated SDKs in
  packages/api-clients

OPEN QUESTIONS to surface before writing code:

1. ~~Regulatory framing for /us~~ — RESOLVED 2026-05-17.
   Option A (digital adviser path, Internet Adviser Exemption rule
   203A-2(e)). Form CRS, ADV Part 2A, and Investment Advisory
   Agreement are correct terminology. Render in "Document in
   preparation" status until SEC registration is granted. Advisory
   language is now approved, not blocked. See decisions/open-questions.md.

2. ~~OpenAPI publication path~~ — RESOLVED 2026-05-17.
   Proceed with hand-written skeleton specs against the named contracts
   in 00-architecture-overview.md. Hand-write OpenAPI YAML for each
   endpoint group, generate TS clients via openapi-typescript, build
   MSW handlers against those types. When Daniel's real specs land,
   replace the YAML and rerun the generator. TypeScript compile errors
   surface every schema drift. MIG-P1-06 is unblocked.

3. ~~Monorepo tooling~~ — RESOLVED 2026-05-17. pnpm + Turborepo confirmed.
   MIG-P1-01 is unblocked.

4. Broker connect UX — Alpaca OAuth flow vs API-key entry on the
   onboarding broker connect screen.

5. WalletConnect project ID — provisioning and storage location.

EXECUTION ORDER (do not skip ahead):

Step 1: AUDIT. Inspect github.com/Z333Q/refi-usa and produce:
  a) Current file inventory with line counts
  b) Mapping table: every existing file → target location per
     architecture overview section "Monorepo layout"
  c) List of every Supabase reference to be removed
  d) List of every React Router reference to be replaced
  e) List of every copy string to be updated per SEC-sensitive
     language replacement table in 01-us-overlay.md section 2
  f) Reusable components vs rewrite-required, with rationale
  g) The five open questions above, each annotated with what
     specifically Claude Code needs to know

  Do NOT write any code in Step 1. Output the audit and stop.

Step 2: WAIT. Zeshan answers the five open questions and confirms
  the audit. Do not proceed without explicit confirmation.

Step 3 onwards: Execute tickets in the order specified in
  02-phase-2-build-plan.md:
    MIG-P1-01 Monorepo bootstrap
    MIG-P1-02 Next.js app shell
    MIG-P1-03 Design system migration into packages/ui
    MIG-P1-04 Migrate Bolt routes into apps/web/app/us/
    MIG-P1-05 Wallet provider scaffolding
    MIG-P1-06 API client package with MSW
    MIG-P1-07 Dashboard scaffolding with useSimulation
    MIG-P1-08 Eligibility flow
    MIG-P1-09 Env validation + middleware foundation
    MIG-P1-10 Copy scanner + CI gate
    MIG-P2-01 SIWE authentication
    MIG-P2-02 KYC onboarding via CCID
    MIG-P2-03 Live compliance gating
    MIG-P2-04 Onboarding wizard
    MIG-P2-05 /us route group rounding-out
    MIG-P2-06 Observability wiring
    MIG-P2-07 Security hardening
    MIG-P2-08 Terraform scaffold for staging
    MIG-P2-09 CI/CD pipeline
    MIG-P2-10 E2E test suite

  Confirm completion of each ticket with the acceptance criteria
  from 02-phase-2-build-plan.md before moving to the next.

DEFINITION OF DONE (Phase 2 exit):

Platform criteria from Daniel's V2 PDF:
- Authentication is live with cookies, CSRF, rotate, revoke;
  protected routes enforce SIWE/RBAC.
- Onboarding/attestation is live and drives adapter refresh;
  UI stores no PII.
- Compliance gating is live for previews/submissions; fail-closed
  posture preserved; passive data feed remains simulated.
- Operational checks: alerts on 401 churn / 429 spikes /
  CSP violations; budgets and accessibility checks applied to
  new routes.

US overlay additions:
- /us/eligibility gates SIWE entry by state, age, US-person status.
- All /us copy passes the blocked-term scanner.
- US-eligible broker list filters correctly.
- Disclosures rendered per regulatory framing decision (or
  "Coming soon" state if undecided).

Build hygiene:
- Typecheck passes
- Lint passes
- Unit tests pass
- E2E smoke tests pass
- Bundle size within budget
- Lighthouse a11y >= 95, performance >= 80 on /us and /us/eligibility
- Sentry, PostHog, Cloud Trace receiving events
- Terraform staging environment provisioned
- Cloud Run staging deploy succeeds via CI

CRITICAL RULES throughout:

1. Never introduce direct database calls in UI code. Talk to the
   backend via packages/api-clients. The backend owns MongoDB.

2. Never introduce broker-specific UI code. The UI is broker-agnostic;
   the backend's per-broker drivers handle translation.

3. Never write content directly in JSX components. All /us copy lives
   in apps/web/app/us/_content/*.ts files and passes the blocked-term
   scanner.

4. Q1 is resolved (digital adviser path, Internet Adviser Exemption).
   "Form CRS", "ADV Part 2A", "Investment Advisory Agreement" are
   correct and final terminology — use them. Render document cards in
   "Document in preparation" status until SEC registration is granted
   and counsel delivers final documents. Do not substitute generic
   "Coming soon" copy for the document names.

5. Never hardcode a specific US legal entity name until counsel
   confirms it. Use `usBrand.legalEntityPlaceholder` from
   01-us-overlay.md section 4. "ReFi.Trading Advisors LLC" is
   a fabricated name and must not appear.

6. Never store raw IP addresses, raw user agents, or any PII anywhere
   in MongoDB or UI state. Use HMAC-hashed values only.

7. Never enable a Submit button without a fresh ALLOW verdict from the
   Compliance Adapter. Fail-closed is the platform rule.

8. Every API call must carry an x-correlation-id header generated in
   middleware.ts.

9. Every Next.js 16 dynamic route page must declare params and
   searchParams as Promises and await them.

10. Every commit must follow Conventional Commits format
    (feat:, fix:, chore:, etc.) — enforced by Commitlint.

Begin with Step 1 (audit only) now.
```

---

## Notes for the operator

**On checkpoints.** After Step 1 (audit), share Claude Code's output with Zeshan and Daniel before answering the open questions. The audit may surface things the spec doesn't cover (existing partial work, file structures that don't map cleanly, dependencies that have shifted since V2 PDF was written).

**On scope creep.** Claude Code will sometimes try to combine tickets or jump ahead. Hold the line on ticket-by-ticket completion with acceptance criteria. Tickets MIG-P1-06 (API clients) and MIG-P2-01 (SIWE) in particular benefit from being signed off cleanly before downstream work proceeds.

**On the archived spec.** If Claude Code references content from the archived ChatGPT spec, redirect it to the current spec documents. The archived doc is in the repo for screen inventory cross-reference only.

**On Daniel.** Daniel owns the backend services Claude Code's UI work integrates with. Sync points where Daniel's review is valuable:
- After Step 1 audit (confirm the migration map)
- After MIG-P1-06 (api-clients package — confirm the OpenAPI specs match what backend exposes)
- After MIG-P2-01 (SIWE auth — confirm cookie shape, error codes, refresh rotation match backend)
- After MIG-P2-03 (compliance gating — confirm verdict contract matches Compliance Adapter response)

**On Zeshan.** Decisions Zeshan owns:
- Regulatory framing (open question 1)
- Counsel-approved copy for landing headlines and disclosures
- Pricing model and fee schedule content
- Brand assets (logo SVG, OG image, favicon — currently placeholders)

Everything else can be delegated to engineering once those decisions are in.
