# 10 — BFF Architecture Decision Record (P2.5R-00)

> **⚠️ 2026-05-20 — superseded in part by `12-daniel-2026-05-20-guidance.md`.**
> The host decision (Next.js Route Handlers at `apps/web/app/api/v1/*` in Cloud Run on `refinity-dev-sp`) stands. But the BFF surface design must now mirror **admin-portal patterns** (Daniel's reference impl) and the **auth-account vs trading-account distinction** (new auth tables documented in `14-auth-account-design.md`). The proposed Pub/Sub topic names in §5 are wrong per audit C1 — see `11-integration-audit-post-p2.5r-04.md §5` for the corrected `dev-*`-prefix convention. Every BFF route handler must carry the `BFF_DEPENDENCY` header per `12 §2.2 rule 11`.

**Date:** 2026-05-19
**Status:** Accepted — Wave 0 of MIG-P2.5R
**Author:** UI architect
**Supersedes:** N/A
**Inputs:**

- `08-daniel-rescope-plan.md §7` (BFF route proposal — 25+ paths)
- `09-daniel-answers-and-product-reframe.md §1` (Daniel answers to Q1/Q2/Q3/Q5)
- Daniel's `apps/admin-portal/`, `apps/exec-gateway/`, `apps/trade-manager/` source patterns

---

## 1. Context

Daniel's backend has 26 services. Of those, **10 are skeletons including `routing-api`** — which was supposed to be the investor-facing BFF. Daniel has confirmed (Q3 in `09`) that the frontend team owns the BFF. Every endpoint our `refi-api.yaml` calls today has zero Daniel equivalent and must be served by a BFF layer that translates investor intent into one of:

- a Spanner SELECT (read projections)
- a Pub/Sub publish (write actions, including the 5-command client/system model from `09 §1 Q5`)
- an external API call (SnapTrade today, more later)
- a UI-owned shim (SIWE, CCID, support boundary, document acks — until Daniel ships these)

This ADR locks down **where the BFF runs, what language it's written in, how it authenticates to Daniel's resources, and what the staging cutover path looks like.**

## 2. Decision

**The BFF lives inside the Next.js app at `apps/web/app/api/v1/*` (Next.js Route Handlers).**

It is the same Node.js process that renders the investor UI. There is no separate BFF service.

Deployment target: **Cloud Run**, in the same Google Cloud project that hosts Daniel's `refinity-dev-sp` Spanner (initially) and the equivalent prod project (later). Region: `us-west1` to match `trade-manager` and `exec-gateway`.

Source storage: **GitLab** primary; GitHub mirror optional during transition.

Domain: TBD between `refi.trading/us` and `refitrading.com` — both owned. ADR is host-decision-agnostic.

## 3. Why Next.js Route Handlers (and not a separate Cloud Run service)

| Criterion                   | Next.js Route Handlers (chosen)                                                                                          | Separate Cloud Run BFF (rejected)                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| **Code colocation**         | Routes live next to the UI components that call them; type-shared via the same `tsconfig.json`                           | Separate repo or workspace; types shared via package contract   |
| **Deploy units**            | 1 Cloud Run service (the Next.js app)                                                                                    | 2 services (UI + BFF), 2 deploys, 2 IAM policies                |
| **Auth from UI**            | Same-origin requests; no CORS; session cookie scoped to the host domain                                                  | Cross-origin or same-domain-via-proxy; CORS adds attack surface |
| **Type safety**             | Shared `packages/api-clients` types end-to-end                                                                           | Same, but with two deploy timelines                             |
| **Cold-start**              | Single warm pool                                                                                                         | Two warm pools (or 2x cost to keep both warm)                   |
| **Spanner auth**            | Workload Identity → service account → Spanner read                                                                       | Same                                                            |
| **Pub/Sub publish**         | Workload Identity → service account → topic publisher                                                                    | Same                                                            |
| **Existing patterns**       | Already in repo (`/api/us/eligibility`, `/api/us/support`)                                                               | Would require new repo/workspace                                |
| **Daniel's deploy pattern** | Cloud Run + Workload Identity matches `admin-portal`, `exec-gateway`, `trade-manager`                                    | Same — no advantage either way                                  |
| **Future split**            | If BFF outgrows Next.js process (unlikely under expected load), can extract to separate service later with no UI changes | Already split (premature)                                       |

**The deciding factor is type-sharing + zero CORS surface.** The investor UI is the only client; co-locating the BFF eliminates a class of bugs (type drift, CORS leaks, auth cookie scoping) at the cost of nothing — Next.js Route Handlers scale linearly with the same Cloud Run pool.

We can extract the BFF to a dedicated service later if needed; nothing in this decision locks us in.

## 4. Spanner read auth

**Mechanism:** Workload Identity (GKE/Cloud Run) → Google Service Account → Spanner read role.

**Service account name:** `bff-spanner-reader@refinity-dev-sp.iam.gserviceaccount.com` (proposed; Daniel to provision).

**IAM role:** `roles/spanner.databaseReader` on `projects/refinity-dev-sp/instances/<TBD>/databases/<TBD>`. Daniel will confirm instance + database names.

**Spanner client:** `@google-cloud/spanner` Node.js library. ADC (Application Default Credentials) handles the Workload Identity flow automatically.

**Connection pooling:** one Spanner client instance per Next.js process (singleton in `apps/web/src/lib/spanner.ts`); session pool sized to expected concurrent requests (start: 25 sessions; tune from metrics).

**Read-only enforcement:** BFF must never write to Spanner directly. All writes go via Pub/Sub publish. The service account has NO write permissions on Spanner — an attempt to write is a build-time IAM denial, not a runtime check.

**Local dev:** developers run against MSW handlers (status quo). To run against real Spanner locally, devs use `gcloud auth application-default login` with a personal account that has read access to a dev Spanner instance. No service account keys are ever distributed.

## 5. Pub/Sub publish auth

**Mechanism:** same Workload Identity flow; separate service account for clarity.

**Service account name:** `bff-pubsub-publisher@refinity-dev-sp.iam.gserviceaccount.com` (proposed).

**IAM role:** `roles/pubsub.publisher` on the specific topics the BFF publishes to. Initial topic list (proposed names per `09 §7`; Daniel to ratify):

- `client.execution_policy.activate`
- `client.execution_policy.pause`
- `client.execution_policy.update`
- `client.exception.approve`
- `client.exception.reject`
- `dev-orders.cmd` (only for `cancel` actions, mirroring `admin-portal` pattern at `docs/as-built/v2/admin-portal_AS_BUILT.md:325-327`)
- `support.event` (BFF-owned for now)

**Publish wrapper:** `apps/web/src/lib/pubsub.ts` exposes `publish(topic, message, attributes?)` with mandatory `correlation_id` attribute. All BFF route handlers use this — never the raw client.

**Idempotency:** every published message carries `client_request_id` (the investor's `Idempotency-Key` header, when present) as a message attribute so Daniel's subscribers can dedup.

## 6. Auth (investor session) layer

Daniel's `auth-siwe` and `identity-ccid` are skeletons (Q4 in `08 §11`, awaiting Daniel timeline confirmation).

**Interim approach (P2.5R wave A onward):**

- BFF-owned SIWE: use `viem` + a server-side nonce store (Spanner table or Redis — TBD) to validate signatures.
- BFF-owned session: JWT signed with `SESSION_SECRET` (env var); cookie `us_session_v1`; HttpOnly, Secure, SameSite=Lax, scoped to `/`.
- BFF-owned CCID stub: returns mock state per persona; flips when Daniel publishes the real service.

**Cutover plan:** when `auth-siwe` and `identity-ccid` ship, the BFF route handlers swap their internal implementation to call Daniel's services. The investor-facing endpoint surface (`/api/v1/auth/siwe/*`, `/api/v1/ccid/*`) does not change.

## 7. Correlation ID + structured logging

**Per investor action, the BFF generates a `correlation_id`** matching Daniel's spec (`trade_lifecycle_contract.md:43-61`) — a UUID v4 — and propagates it to:

- Spanner reads (as a query tag where the client supports it)
- Pub/Sub publishes (as a message attribute)
- External API calls (as `x-correlation-id` header)
- Structured logs (top-level field on every emitted log line)
- Response headers (echoed back to the UI so client-side observability links)

A request without an inbound `x-correlation-id` gets a fresh one. A request with one (e.g. retry from the UI) reuses it.

**Log shape:** existing pattern from `/api/us/eligibility` and `/api/us/support` (JSON-line `console.info`), extended with `correlation_id`, `account_id`, `intent_id?`, `plan_id?`, `client_order_id?` per `Observability Spec` (Daniel's `docs/architecture/` if it exists; mirror `05-observability-verification.md`).

## 8. Rate limiting

Per `apps/web/src/lib/rateLimit.ts` (already in repo). Existing per-IP limiter (5/15min for eligibility, 3/hour for support) generalizes; per-route policy lives next to each route handler.

For investor write actions that publish to Daniel's Pub/Sub, additional **per-account** limit (separate from per-IP) to prevent runaway publishing.

## 9. Error envelope

Mirrors Daniel's standard error shape (`API and Event Contracts.pdf:p9`, now in our `refi-api.yaml`):

```json
{
  "code": "string (UPPER_SNAKE)",
  "message": "string (plain English, customer-safe)",
  "retryable": "boolean",
  "correlationId": "string",
  "details": { "...": "..." }
}
```

BFF must never leak Spanner error text, broker error text, or stack traces to the client. Internal errors map to `code: "INTERNAL"` with a generic message and the full detail logged to Sentry server-side.

## 10. CSP / security

Existing `apps/web/proxy.ts` middleware applies to all BFF routes too. No additional surface; CSP allow-list already covers `connect-src 'self'` (BFF is same-origin), plus Sentry + PostHog hosts.

CSRF: existing double-submit pattern (cookie `csrf_v1` + header `x-csrf-token`) applies to BFF write routes. Already implemented in MSW handlers via `csrfGuard()` helper at `packages/api-clients/src/mocks/_shared.ts`.

## 11. Staging cutover path

**Step 1 (now):** all BFF routes are MSW-mocked in the browser. Network never leaves the Next.js process during dev/staging. This is the current state.

**Step 2 (when Daniel confirms staging URL + Spanner access):** swap MSW handlers per-route for real BFF route handlers. Done incrementally — one domain at a time (auth → ccid → recommendations → orders → ...) — with a feature flag per domain (`BFF_LIVE_DOMAINS=auth,ccid`) that controls whether the Route Handler calls real Spanner/PubSub or returns MSW fixture.

**Step 3 (production):** all domains live; MSW handlers retained only for `e2e` test mode and for dev fallback when Spanner is unreachable. Dev/staging continue to default to MSW unless `BFF_LIVE_DOMAINS=all`.

**Per-domain cutover checklist** (template, expanded in `P2.5R-15` cutover guide):

- [ ] Daniel publishes the canonical shape (or ratifies ours).
- [ ] Spanner table(s) the BFF will read are populated with at least one fixture row.
- [ ] BFF route handler implementation replaces the MSW stub.
- [ ] Feature flag toggled on for staging.
- [ ] Smoke test: 1 read + 1 write per route.
- [ ] Compliance review: error envelope contains no PII, no Spanner internals.
- [ ] Observability check: correlation_id propagation visible end-to-end.
- [ ] E2E test (`apps/web/e2e/`) extends to cover live path.

## 12. Out-of-scope (deferred)

- **Separate BFF service** — punted until proven necessary by load characteristics we don't have today.
- **GraphQL** — explicit no. Investor UI calls a small, fixed set of routes; REST + correlation_id is sufficient.
- **WebSocket / SSE** — defer. Daniel's `admin-portal` uses SSE for operator dashboards; investor dashboard polling at 30s is fine for v1. Add SSE only if a specific surface (Exception Review badge, broker freshness) requires sub-30s push.
- **Mobile native** — out of scope. Web app only.
- **Multi-region** — single-region (`us-west1`) for v1.

## 13. Risks and mitigations

| Risk                                                                                   | Likelihood     | Mitigation                                                                                                                                  |
| -------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Spanner cold-start latency from a fresh Cloud Run instance hurts p95                   | Medium         | Keep min instances ≥ 1 in prod; session pool warmup on container start                                                                      |
| Next.js process becomes a noisy-neighbor for BFF workload (UI render starves DB calls) | Low            | Cloud Run scales per request; revisit if observed                                                                                           |
| Auth-siwe Daniel timeline slips, BFF-owned SIWE becomes permanent                      | Medium         | BFF-owned SIWE is production-grade (signed JWT, viem signature verify, replay protection via nonce store); not a tech-debt risk if it stays |
| Spanner schema changes by Daniel break BFF reads                                       | High over time | Contract test: each BFF route has a vitest test that asserts the Spanner row shape it depends on; fails fast on column rename               |
| Daniel renames Pub/Sub topics                                                          | Medium         | Topic names are env vars; runbook for swap                                                                                                  |
| BFF code grows unwieldy in the Next.js app                                             | Low/Medium     | Per-domain handlers in `apps/web/app/api/v1/<domain>/route.ts`; shared helpers in `apps/web/src/lib/bff/`                                   |

## 14. What changes in the repo for P2.5R-00 to be "done"

- This ADR (✅ this file).
- New folder convention documented: `apps/web/app/api/v1/<domain>/route.ts` (route handlers); `apps/web/src/lib/bff/{spanner,pubsub,session,errors,correlation}.ts` (shared helpers).
- Service-account names + IAM roles documented in `09 §7` forwarding-to-Daniel block, plus added to a new section in `06-backend-contract-map.md` during P2.5R-01.

**No code yet.** The route handler implementations land in P2.5R-02 (OpenAPI rewrite) and P2.5R-04 (MSW → BFF stub swap), per the dependency graph in `09 §6`.

## 15. Document history

- 2026-05-19 — Initial publication. Locks BFF host = Next.js Route Handlers in Cloud Run; Spanner project = `refinity-dev-sp`; auth = Workload Identity; SIWE/CCID stubs while Daniel's services are skeletons.
