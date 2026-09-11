# Shared integration working agreement

Status: owner-approved plan, September 11, 2026. For both frontend and ReFinity
teams. This records responsibilities and workflow, not completed code, a created
branch or a deployed connected environment.

## Names and environments

**Refi Trading is the public-facing company/product name**, including what users
see on the frontend. **Refinity** (also written ReFinity internally) names the
backend trading platform; it is not a replacement public brand. This agreement
does not request UI branding changes or repository renaming.

The Google Cloud project family remains `refinity-dev`, `refinity-stg` and
`refinity-prod`. Frontend application/BFF and backend trading services will share
the corresponding environment project and its company-managed billing setup;
there is no separate `refi-frontend-*` project family to create. Service identities,
secrets and data ownership still remain separate inside each environment.
**Only `refinity-dev` is in scope now.** Staging/production are future promotion
targets, not permission to provision resources or alter billing links today.

## One codebase, two workstreams

Keep one shared frontend repository, not a permanently diverging fork.
Daniel/ReFinity uses `integration/refinity-dev`, based on current shared `main`;
Zeshan continues his existing frontend/KYC branches.
Ultimately merge both teams' work and deploy the combined application on Google
Cloud. The Alpha target includes automated SP500-following trading through
existing Alpaca accounts/API keys, with broker connection optional until trading
activation. Signup and admission must allow connecting Alpaca later.

### Branch plan

| Branch | Purpose / owner | Deployment relationship |
| --- | --- | --- |
| `main` | Shared reviewed codebase for both teams | Retain existing approved frontend deployment behavior; a merge must not silently retarget anything to GCP. |
| Zeshan's existing working/feature branches | Frontend, UX, onboarding and KYC work | Continue the current Vercel development/preview flow. No forced rename or migration now. |
| `integration/refinity-dev` — planned, not yet created | Daniel's ongoing server integration/GCP preparation branch | Separate connected Dev deployment configuration, targeting only `refinity-dev`. |
| Small task branches/PRs, where useful | Bounded work by either team | No new deployment target merely because a branch exists. |

This document communicates the branch plan to both teams. Daniel owns creation
and management of the integration branch; no separate announcement, permission
or acknowledgment is required before starting it. Record its base commit and
branch/PR links as work proceeds. Coordinate overlapping edits, shared merges
and deployment impacts through the normal PR process.

The frontend branch lives in this shared GitHub repository. Backend changes
remain in the existing ReFinity/GitLab repository; their commits/contract changes
are linked in frontend PRs rather than importing backend source into this repo.

| Area | Implementation owner |
| --- | --- |
| UI/UX, screens, components, styling, copy, navigation and onboarding journeys | Zeshan/frontend team, including connect-later UX, environment selection and presentation of backend states/notices. |
| Socure/KYC, provider calls/webhooks/DocV, questionnaire evaluation and compliance decisions | Zeshan/frontend team. ReFinity does not alter these flows or mappings. |
| Contract packages, generated clients, strict validation and server response adapters | Daniel/ReFinity, updating the backend and consuming BFF integration together. |
| BFF-to-backend authentication, identity exchange/account mapping, signing/JWKS and runtime bindings | Daniel/ReFinity, reusing existing modules. Frontend retains its authentication-provider flow and supplies approved provider/redirect inputs. |
| Brokerage commands, allocation/subscriptions, retries, account data, Records and events | Daniel/ReFinity through the backend contracts, not browser broker calls or BFF-created trading authority. |
| Connected GCP deployment, non-KYC integration/session persistence and integration testing | Daniel/ReFinity; no game/demo resource changes or KYC evidence-store redesign. |
| Shared files and browser-facing data-shape changes | Coordinate before editing; each domain owner reviews their part. Frontend owns resulting screen changes. |

Typical ReFinity paths: `packages/api-clients`, non-KYC server modules in
`apps/web/src/lib/investor-api`, relevant BFF API handlers, identity integration,
connected runtime configuration and focused tests. Shared auth/configuration,
route policy, manifests and lockfiles require coordination. Directory access
does not authorize UI or KYC edits. Avoid broad formatting/refactoring across
the other team's work; never fabricate compatibility values for a stale UI.

## Frequent integration in both directions

1. Start each active workday with a clean or safely saved working tree, fetch
   remote updates and review changes affecting your area. Start new work from the
   recorded base; never discard the other team's edits to obtain a clean checkout.
2. **Both teams commit and push frequently:** after each coherent tested slice
   and normally at the end of an active workday. Push to your own working branch,
   not directly to protected `main`. Clearly label incomplete work/draft PRs;
   pushing it is visibility/backup, not acceptance or deployment approval. An
   explicit owner pause on commits/pushes still overrides this normal cadence.
3. Daniel regularly incorporates Zeshan's work. **Zeshan also regularly
   incorporates Daniel's completed integration work.** Check for updates each
   active workday and synchronize after relevant completed slices; do not wait
   for the final Google-hosted release.
4. Prefer reviewed, tested slices merged into shared `main`, then both branches
   merge current `main`. If a slice is not ready for `main`, coordinate an explicit
   branch merge for testing. Prefer merges between shared branches over repeated
   cherry-picks; unfinished branch work is not a released contract.
5. Resolve conflicts with the affected owners, preserving both teams' changes.
   Do not force-push another team's branch or rewrite shared history.
6. Run focused boundary tests after each slice/conflict resolution. Required
   protected-branch checks still apply; optional broad campaigns belong at
   meaningful package/integration/release checkpoints, not every local commit.
7. Each PR/handoff briefly states changes, affected contracts/configuration,
   tests, required adaptations and deployment impact. Coordinate breaking changes
   before merge; no separate report per field is needed.

**Code merge is not deployment approval.** Before the first shared integration
merge, inspect GitHub, Vercel and Cloud Build triggers. If merging `main` would
unexpectedly change the existing game/demo or public site, agree safe
branch-specific deployment controls first. Zeshan's normal approved Vercel
deployments can continue; this is not a freeze on his work. Keep GCP-only runtime
settings scoped to the connected deployment so merging reusable code does not
force Vercel to use native Google credentials or unconfigured connected services.
Verify Vercel compatibility for shared changes. An isolated Cloud Run service alone
does not prevent an existing Vercel auto-deploy. Do not attach new GCP promotion
triggers to `main` or Zeshan's branches without telling him and agreeing the change.

If a deployment-specific slice is not yet safe for shared `main`, keep it on the
integration branch and expose reusable pieces through smaller PRs. Neither team
needs to absorb unrelated unfinished work to stay current. Regularly test a
combined head so final convergence is not postponed until launch.

## Isolated connected deployment

**Zeshan can keep using Vercel and his current workflow throughout this phase.**
Daniel's team builds and configures the future GCP services alongside it; the
frontend team is not being asked to migrate hosting before continuing UI/KYC.

| Deployment | What happens during integration |
| --- | --- |
| Existing frontend Vercel projects, previews and domains | Continue under the frontend team's current flow. Our work does not retarget or retire them. |
| Existing game/demo in `refi-game-prod` | Leave services, data, credentials and deployment scripts unchanged. |
| Connected frontend/BFF plus trading backend in `refinity-dev/us-west1` | Daniel prepares the separate frontend service and necessary supporting resources; existing trading services remain their owners. Test the real connection here. |
| `refinity-stg` / `refinity-prod` | Later shared frontend/backend environments, promoted only by a separate agreed release decision. |

- **Target: `refinity-dev`, `us-west1`.** Deploy the existing Next.js application
  and its BFF together as a new, separately named Cloud Run service. Keep the UI
  unchanged and preserve the same-origin cookie/request model. No new project.
- Leave `refi-game-prod` game/demo services, data/configuration, current Vercel
  deployment targets and existing domain routing untouched by our work.
  `infra/cloudrun/deploy-demo.sh` explicitly targets `refi-game-prod/demo-web`;
  do not repurpose or invoke it for the connected environment.
- Use separate connected build/deploy configuration, explicit project/service
  targets, immutable images, a dedicated runtime identity, separate signing keys/
  secrets and isolated durable session/integration state. No demo-data or local
  filesystem fallback in connected mode. Give the connected deployer no game/demo
  deployment rights, and the BFF no trading-worker or user broker-secret access.
- Start on an isolated testing address with correctly bound authentication and
  redirects. Preserve the selected final Investor JWKS address
  `https://bff-dev.refi.trading/.well-known/jwks.json`; temporary bindings must be
  explicit. Jointly schedule any hostname/DNS cutover after verification, not now.
- Add jobs/services only for identified requirements; reuse existing trading
  lifecycle/scheduling rather than duplicate it in the BFF. Hosting work must not
  change KYC/provider behavior.

## Milestones and final merge

Daniel's detailed engineering queue is `FI-001..FI-010` in ReFinity's
`docs/planning/frontend_contract_delivery_alignment_checklist.md`. This shared
agreement is not a competing checklist; a backend checkout is not required to
understand the ownership and merge rules here.

Deliver tested contract/client integration and the real connected Dev boundary
first. Distinguish local tests, real authenticated HTTP/SSE checks and authorized
broker-affecting tests. The full two-positive/one-negative campaign follows basic
frontend integration and real KYC, but is not waived for final Alpha. Positive
trading cases use separate real Alpaca Paper accounts with bounded authority.

For final promotion, merge both teams' completed work and test that exact combined
revision. Frontend owners verify UI/KYC; ReFinity verifies backend integration.
Then jointly approve the Google-hosted deployment/domain cutover and rollback
plan. Code merges do not authorize broad admission, live-money testing,
game/demo teardown or Vercel deletion.

The cutover notice identifies the combined commit, target service/environment,
affected domains, required frontend configuration, verified checks and rollback
owner. Existing Vercel can remain available until both teams agree it is no longer
needed. Creating the GCP environment does not itself trigger that retirement.

Update this guide when responsibilities or merge/deployment rules change. It
supersedes older all-frontend BFF assignments and undecided connected-project
wording, without claiming the old implementation gaps are fixed.
