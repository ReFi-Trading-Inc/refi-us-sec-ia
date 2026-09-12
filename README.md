# Refi Trading frontend

The public-facing Refi Trading application: investor screens, onboarding and its
server-side backend-for-frontend (BFF). Repository name: `refi-us-sec-ia`.

**Refi Trading** is the public brand. **Refinity / ReFinity** is the internal
trading-platform name. This repository is separate from the
[Refinity trading backend](https://gitlab.com/refinity_dev/refinity-main);
both systems will share the corresponding `refinity-dev/stg/prod` Google Cloud
environment and company-managed billing setup. Only Dev is in scope now.

[![CI](https://github.com/ReFi-Trading-Inc/refi-us-sec-ia/actions/workflows/ci.yml/badge.svg)](https://github.com/ReFi-Trading-Inc/refi-us-sec-ia/actions/workflows/ci.yml)

**Start with the [shared integration working agreement](docs/integration-collaboration.md).**
It defines both teams' ownership, frequent two-way merges, the
`integration/refinity-dev` branch and deployment isolation. Zeshan continues
UI/KYC work and his current Vercel workflow while Daniel implements server
integration and the connected GCP environment.

## Contents

- [Product and architecture](#product-and-architecture)
- [Current implementation and remaining work](#current-implementation-and-remaining-work)
- [Work split and delivery plan](#work-split-and-delivery-plan)
- [Deployment environments](#deployment-environments)
- [Branch, commit and merge workflow](#branch-commit-and-merge-workflow)
- [Local development](#local-development)
- [Testing and CI](#testing-and-ci)
- [Repository layout](#repository-layout)
- [Contracts and documentation](#contracts-and-documentation)
- [Security and support](#security-and-support)

## Product and architecture

Alpha is a closed, invite-only **automated, long-only SP500-following portfolio**
using existing Alpaca accounts and user-supplied Trading API credentials.
It is not a recommendation-only product awaiting a future trading engine.

Users can complete Refi Trading signup/sign-in and admission before connecting
Alpaca. Trading additionally requires a ready broker connection, current
authorization and an explicit portfolio subscription with percentage allocation.
Paper/live selects the broker environment; Paper does not mean a reduced
trading lifecycle. Backend-created Alpaca accounts through Broker API are deferred.

The application and BFF ship together as one Next.js application:

```text
Investor browser
  -> Next.js screens and same-origin BFF routes (this repository)
       -> identity-ccid: verified identity exchange / opaque backend identity
       -> Investor API: owned accounts, consents, brokerage, portfolio and activity
            -> Refinity automated trading and reconciliation services
```

Stytch authenticates frontend users. Socure and the frontend's questionnaire/
compliance logic produce trusted decisions. The trading backend stores the
attestations and owns canonical admission, account authorization, brokerage
truth, portfolio automation and trade/audit evidence. Its new independent
membership/admission projections are still implementation work, not a claim
that the current onboarding projection already supplies them.

KYC evidence, admission, brokerage readiness, commercial entitlement and trading
authorization are distinct. No browser flag or JWT claim grants account/trading
authority. The browser does not access Spanner, the Admin Portal or Alpaca
directly for managed trading; the authenticated BFF uses the supplied contracts.

Invitation redemption expiry is separate from accepted membership. The agreed
trial duration is configurable with a three-month default for Paper and live;
trial start and billing rules still need finalization before enrollment.
Nonpayment stops ordinary automated trading, not sign-in/history, and does not
imply liquidation. These admission/entitlement changes belong to the current
integration work, not the completed frontend baseline.

## Current implementation and remaining work

Source reviewed at `2051e80` on September 11, 2026. The table describes code in
that checkout and its existing test coverage, not verification of every deployed
flow or a fresh CI run.

### Frontend work already implemented

Zeshan's merged work provides substantial foundations to reuse:

| Area                                   | Existing implementation                                                                                                                                                                                                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Investor application                   | Onboarding/profile/KYC/broker screens, account/home/portfolio/recommendation/activity/records-related views, disclosures, preferences, support and demo personas under [`apps/web/app/us`](apps/web/app/us). These are implemented surfaces, not a claim of final UX or live-data acceptance. |
| Authentication and sessions            | Stytch magic-link/OTP adapter, opaque subject mapping, separate identity-bridge assertion, backend identity-result verification, recoverable exchange and durable connected-session/replay storage in [auth](apps/web/src/lib/auth) and [connected-store](apps/web/src/lib/connected-store).  |
| Service authentication                 | Native Cloud Run Google token providers for separate Identity/Investor audiences, ES256 user assertions, KMS/JWK signing support and JWKS routes. Real runtime bindings still need verification.                                                                                              |
| Contract-consuming BFF                 | Strict generated Investor API client, account-scope resolution, brokerage connect/sync/rotation/disconnect handlers, consent/acknowledgment handling, portfolio actions, account projections, Records and SSE in [investor-api](apps/web/src/lib/investor-api).                               |
| KYC and attestation                    | Socure device intelligence/evaluation, DocV and authenticated webhook handling, trusted evidence construction, and durable attestation submission/recovery. [Socure checkpoint](SOCURE_ACTIVATION_READY.md) records merged implementation and pending live acceptance.                        |
| Verification and deployment foundation | Vitest/client conformance, Playwright production-artifact lanes, boundary/route/copy checks, a standalone Next.js container and the existing Cloud Run demo deployment.                                                                                                                       |

The Socure checkpoint records missing sandbox/account activation and webhook
configuration at its capture. Provider code exists; genuine provider acceptance
is not implied. Its older “await Daniel's cohort/project decision” rows have
since been superseded by the working agreement and decisions summarized here.

### Still to complete

- **Contract adoption:** this checkout actually imports/generates
  `v1.1.0-alpha.3`; the backend's currently issued package is alpha.4, with
  funding assessments and corrected recommendation responses. Daniel will
  integrate the verified current/successor package and its client adapters.
  The new membership/admission/error corrections are not already delivered.
- **Backend-owned membership/admission:** replace legacy onboarding/cohort
  ambiguity with independent canonical reads. The existing setup gate also
  needs frontend-owned adaptation for “connect Alpaca later.”
- **Broker and command reliability:** complete backend disconnect/credential
  retirement and BFF error/retry handling. The current BFF broker input is
  paper-only; explicit paper/live server support and the frontend selector
  must align without enabling unauthorized live trading.
- **Preview and account-data correctness:** distinguish fresh preview requests
  from retries of saved previews, update recommendation mappings, remove the
  silent five-page/500-position retrieval limit, and complete funding-notice
  and activity delivery.
- **Connected runtime:** provision/configure the separate GCP frontend service,
  exact service identity, signing/trust, durable non-KYC integration state and
  real authenticated HTTP/SSE acceptance.
- **Joint acceptance:** finish basic real KYC and the integrated user experience,
  then the agreed two-positive/one-negative campaign and final combined release.
  Positive trading tests require real separate Alpaca Paper accounts and
  explicit bounded execution authority.

Existing unit/simulator/demo success does not certify a live connected Alpha.
Do not repeat completed frontend modules or prior backend trade proofs merely
because their integration acceptance remains open.

## Work split and delivery plan

| Workstream                                                                                       | Owner                                          |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| UI/UX, screens, copy, navigation and onboarding journeys                                         | Zeshan/frontend team                           |
| KYC/Socure/provider flows, questionnaire evaluation and compliance decisions                     | Zeshan/frontend team                           |
| Backend contracts, generated client adoption and non-KYC BFF/server adapters                     | Daniel/Refinity team                           |
| Identity-to-account integration, brokerage commands, allocation/retries, account data and events | Daniel/Refinity team                           |
| Connected GCP runtime and cross-system integration verification                                  | Daniel/Refinity team                           |
| Shared-file conflicts, interface changes and final combined acceptance                           | Both teams, with each reviewing its owned area |

Daniel's detailed queue is `FI-001..FI-010` in the backend repository's
`docs/planning/frontend_contract_delivery_alignment_checklist.md`. It prioritizes
contract/BFF integration and the connected Dev boundary, followed by entitlement
and remaining Alpha release gates. This README is an overview, not another queue.

Follow [the full working agreement](docs/integration-collaboration.md) for exact
scope and milestones. Refinity will not redesign screens, modify KYC decisions,
rescore questionnaires or take over provider flows. Shared auth/configuration,
route policies, lockfiles and browser-facing response changes are coordinated.

## Deployment environments

**Vercel remains available to Zeshan during GCP integration.** He does not need
to move hosting before continuing frontend/KYC development.

| Environment                                       | Current state / plan                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Existing Vercel frontend deployments and previews | Continue the frontend team's current workflow. September 11 live checks showed `demo.refi.trading` and `bff-dev.refi.trading` serving from Vercel; the BFF JWKS endpoints returned 503 at that check. These are dated observations, not continuous monitoring.                                                           |
| Existing Cloud Run demo                           | `refi-game-prod/us-central1`, service `demo-web`. The inspected runtime uses demo data; it is not the connected trading BFF. Leave the game/demo targets and data unchanged.                                                                                                                                             |
| Connected Dev                                     | The separate `refi-frontend-integration` Next.js/BFF service is hosted in `refinity-dev/us-west1`. See [deployment status and commands](infra/cloudrun/CONNECTED_DEV.md) for the isolated URL and verified image. Provider login and backend trust binding are still pending; hosting is not connected Alpha acceptance. |
| Future staging/production                         | Frontend and backend share `refinity-stg` and `refinity-prod` respectively. No separate frontend project family, provisioning or billing change is authorized now.                                                                                                                                                       |

Use separate connected build/deploy configuration, runtime identity, secrets and
isolated durable state. Do not repurpose
[`infra/cloudrun/deploy-demo.sh`](infra/cloudrun/deploy-demo.sh): it explicitly
targets `refi-game-prod/demo-web`. The generic Terraform tree and historical
deployment guides are implementation inputs, not proof of connected readiness.

Test initially on an isolated address with explicit auth/redirect bindings.
The selected final Investor assertion JWKS remains
`https://bff-dev.refi.trading/.well-known/jwks.json`; do not silently change
that decision or repoint existing domains during setup. Final domain cutover,
rollback and any eventual Vercel retirement are coordinated after acceptance.

See [deployment isolation and promotion rules](docs/integration-collaboration.md#isolated-connected-deployment)
and the [demo-only deployment guide](infra/cloudrun/README.md).

## Branch, commit and merge workflow

- `main` is the shared reviewed codebase, not a permanently split product.
- Daniel uses `integration/refinity-dev`, based on current shared `main`.
  This is the documented plan; no separate branch announcement/approval is
  required. The branch is now active, created from `b3e7a1a`; deployment uses
  the separate [connected Dev path](infra/cloudrun/CONNECTED_DEV.md). Only this
  branch is excluded from Vercel auto-deployments; other branches are unchanged.
- Zeshan keeps his existing feature branches and Vercel flow.
- Both teams commit/push coherent slices frequently, normally by the end of an
  active workday, and incorporate each other's completed work regularly.
  Prefer reviewed slices into `main`, then merge `main` into working branches.
- Resolve shared-file conflicts with their owners, run focused checks and retain
  required protected-branch checks. No forced rewriting of shared history.
- Code merge is not permission to change hosting. Inspect existing automatic
  deployment triggers; isolate GCP-only settings so shared changes do not force
  Vercel into an unconfigured native-Google runtime.
- Use Conventional Commits. Current hooks run `lint-staged` at pre-commit and
  `commitlint` at commit-msg; this checkout does not contain a pre-push hook.
  Mark incomplete work/draft PRs honestly and respect any explicit commit/push pause.

Full procedure: [frequent integration in both directions](docs/integration-collaboration.md#frequent-integration-in-both-directions).
Test the final combined revision before jointly promoting the Google-hosted
release; neither team waits until launch to reconcile its changes.

## Local development

### Toolchain

Use Node.js **22** to match CI and `pnpm 11.1.2` from `packageManager`.
The stack is Next.js 16, React 19, TypeScript 6 and Tailwind 3, with Turborepo/
pnpm workspaces. Stytch is the connected authentication provider; installed
wallet dependencies do not make SIWE the primary login architecture.

From this repository's root:

```bash
corepack enable
corepack prepare pnpm@11.1.2 --activate
pnpm install --frozen-lockfile
pnpm --filter @refi/api-clients build
pnpm dev
```

The app normally serves at `http://localhost:3000`. Client generation runs before
typechecking/builds because generated files are not the contract source.

For local configuration, use [`apps/web/.env.example`](apps/web/.env.example)
as a reference for an ignored `apps/web/.env.local`; do not overwrite existing
local settings. Set `NEXT_PUBLIC_API_BASE_URL=http://localhost:3000` for local
same-origin work rather than retaining the example's historical staging URL.
Review the actual [environment schema](apps/web/src/lib/config/env.ts);
some example comments still describe older contract releases.

Local scaffolding can boot without a real trading connection. Unconfigured
upstream responses are expected until a simulator or approved real environment
is deliberately configured. Use only synthetic data with local simulators;
never pass real Alpaca credentials to one. The Playwright harness supplies its
own isolated fixtures and loopback simulator.

`NEXT_PUBLIC_*` values are browser-visible and baked into the build. Provider
credentials, signing private keys and session secrets are server-only. Deployed
connected mode requires persistent signing and durable state, with no mock
identity/KYC or demo-data fallback. Copying a local example is not deployment
configuration; do not solve missing live configuration by relaxing those checks.

## Testing and CI

Run the smallest relevant tests while developing. These scripts exist in the
current manifests:

| Command                                         | Purpose                                                                                   |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm --filter @refi/api-clients build`         | Generate clients from the currently pinned contracts.                                     |
| `pnpm --filter @refi/api-clients test`          | Vitest client/boundary/domain suites.                                                     |
| `pnpm --filter @refi/api-clients test:contract` | Packaged conformance tests; Python 3.11+ is needed for the contract tools.                |
| `pnpm typecheck` / `pnpm lint`                  | Workspace TypeScript/ESLint checks.                                                       |
| `pnpm contract-test` / `pnpm tripwire`          | Invariants and investor/admin boundary checks.                                            |
| `pnpm route-manifest` / `pnpm scan-copy`        | Route inventory and copy checks.                                                          |
| `pnpm test`                                     | Contract assertions, tripwire and API-client unit suites.                                 |
| `pnpm build`                                    | Workspace production build.                                                               |
| `pnpm e2e`                                      | Playwright against a production build/start and isolated fixture backend, not `next dev`. |
| `pnpm e2e:signal` / `pnpm e2e:demo`             | Existing stage-specific regression lanes; their names do not redefine the Alpha product.  |

Install Chromium before the first E2E run:

```bash
pnpm --filter @refi/web exec playwright install chromium
```

Use the CI equivalent `--with-deps` where OS dependencies are needed. Keep local
servers from occupying the test ports. Review
[`playwright.config.ts`](apps/web/playwright.config.ts) before changing fixture
or build settings. Focused tests do not waive the required checks on a merge.

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs typecheck/lint,
generation, boundary/route/copy checks, unit/conformance tests, secret/dependency
scans, production-artifact E2E lanes and a build. It is not a configured connected
GCP deployment pipeline. The separate [Cloud Build integration-branch pipeline](infra/cloudrun/CONNECTED_DEV.md#automatic-branch-deployment)
builds, checks and deploys only `integration/refinity-dev` to the isolated Dev
service; it does not change main checks or Vercel. Do not infer a passing current run from old test counts,
this README or simulator results. The deployment guide records the dated live
verification; GitHub/Cloud Build checks show results for subsequent commits.

## Repository layout

```text
apps/web/
  app/us/                 investor screens and onboarding
  app/api/                same-origin BFF routes
  src/lib/auth/           Stytch and identity/session integration
  src/lib/connected-store/ durable connected security state
  src/lib/investor-api/   contract-consuming server adapters
  src/lib/kyc/            frontend-owned KYC/Socure implementation
  src/lib/compliance/     frontend-owned decision mapping/submission
  e2e/                    Playwright coverage
  Dockerfile              standalone Next.js container
packages/
  api-clients/            vendored contracts, generated types, strict client/tests
  ui/                     shared UI components
  config/                 shared tooling configuration
infra/                    existing demo and infrastructure configuration
scripts/                  contract, route and boundary checks
docs/                     working agreement, integration and dated history
compliance/               control/evidence documents, not certification claims
```

Prototype/demo stores and legacy modules remain in the tree. Their existence
does not make them authorities for real connected account or trade state.

## Contracts and documentation

Start with these sources, in order:

1. [Shared integration working agreement](docs/integration-collaboration.md):
   team scope, branches, merges, environments and milestones.
2. [Vendored contract pointer](packages/api-clients/contracts/investor-api/CURRENT.json)
   and [package provenance](packages/api-clients/contracts/investor-api/PACKAGE.md):
   what this checkout has actually received. Active imports are in
   [`package.ts`](packages/api-clients/src/investor-api/package.ts) and the
   [generation command](packages/api-clients/package.json). Verify the referenced
   files exist; a copied pointer is not proof an operational addendum was supplied.
3. The trading backend's `contracts/frontend/README.md` and `CURRENT.json`:
   source of the latest issued handoff. Daniel owns updating the vendor/client
   together, preserving historical package bytes and documenting migrations.
4. [Socure integration guide](docs/integrations/socure/IntegrationGuide.md),
   [activation runbook](docs/runbooks/socure-sandbox-activation.md) and
   [acceptance matrix](docs/security/socure-review/socure-acceptance-matrix.md):
   frontend-owned provider implementation and its real acceptance procedure.
5. [Connected-operation coverage](docs/releases/2026-09-signal/connected-dev/appendix-c-coverage.md)
   and [activation checkpoint](SOCURE_ACTIVATION_READY.md): dated implementation
   evidence. Earlier ownership/project/cohort questions are superseded by the
   current agreement, not instructions to redo completed code.

Backend execution/audit specifications live in its `docs/authoritative`;
the executable delivery queue is its `docs/planning/frontend_contract_delivery_alignment_checklist.md`.
No private email or raw broker credentials are required to use the contract package.

Older Phase 2.x, Signal-only, ML/inference, Admin Portal proxy and “Managed later”
plans are historical context, not current implementation authority. Do not use
their old commit pins, route suggestions, admission assumptions or legal wording
to override the current contracts and owner-approved plan. Update implementation
status when code or connected evidence changes; do not silently change a frozen
package to match an undocumented behavior.

## Security and support

- Never commit env files, private keys, session tokens, Alpaca credentials or
  raw KYC evidence. Use approved secret storage; public issue/PR reports are redacted.
- Keep account ownership, freshness, replay protection, consent binding and
  independent operational holds enforced. Neither a stored attestation nor an
  accepted async command is proof of trading authorization or completion.
- Investor routes cannot expose operator/admin commands, risk overrides or
  direct order controls. KYC evaluation and compliance decisions remain with
  their owners; software/test status is not licensing or compliance certification.
- Report integration issues with the source revision, affected operation, safe
  correlation ID and sanitized reproduction. Coordinate with Daniel for backend/
  contract/runtime issues and Zeshan for UI/onboarding/KYC. Security-sensitive
  material goes through the team's private channel, never a public issue.
- Avoid repo-wide formatting during scoped integration; `pnpm format` touches
  multiple file types throughout the repository.

## License

UNLICENSED — proprietary to ReFi Trading Inc.
