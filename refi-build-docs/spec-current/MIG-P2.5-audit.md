# MIG-P2.5 Audit Report

**Repo:** `refi-us-sec-ia`
**Date:** 2026-05-19
**Auditor mode:** read-only

---

## 0. Spec constraints to anchor against

From `refi-build-docs/spec-current/`:

- **`00-architecture-overview.md:11`** — fail-closed posture is canonical: "anything non-ALLOW blocks submission with a reason."
- **`00-architecture-overview.md:159`** — "There is no codepath where Submit is enabled without a fresh `ALLOW`."
- **`01-us-overlay.md:413`** — Accept / Submit buttons consult `useOrders.preview` and only enable on `ALLOW`.
- **`01-us-overlay.md:223`** — Copy scanner CI gate over `apps/web/app/us/**/*.{tsx,mdx}` and `_content/**/*.ts` (blocked-terms list at `packages/config/blocked-terms.ts`). **Blocked-terms file is missing — see Area 8.**
- **`01-us-overlay.md:478`** — Landing headlines ship with bracket placeholders by design until counsel sign-off.
- **`03-claude-code-master-prompt.md:172, 223-224`** — Compliance gating must be live for previews/submissions; fail-closed is platform rule.
- **`02-phase-2-build-plan.md`** ticket list ends at **MIG-P2-09**. MIG-P2.5 is your new wedge.

The repo has finished P1-01 through P2-09 substantively. What MIG-P2.5 needs to add is the polish around mock realism, document state, broker-stale telemetry surfacing, persona variety, and removing dev placeholders that remain on `/admin`, `/auth/connect`, `/explorer`, `/landing`.

---

## 1. MSW handlers — full enumeration

All handlers live in **one file**: `packages/api-clients/src/mocks/handlers.ts` (233 LOC). Persona is hardcoded to Maya via fixture imports. The handler URL builder honors `NEXT_PUBLIC_API_BASE_URL` (lines 25–33).

| #   | Method | Route                        | File:line      | Returns typed payload                                                    | CSRF / x-corr | Failure states                                                                                       | Status                                                                                                      |
| --- | ------ | ---------------------------- | -------------- | ------------------------------------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | GET    | /auth/session                | handlers.ts:41 | `AuthSession` (Maya)                                                     | no echo       | none                                                                                                 | OK, needs persona switching                                                                                 |
| 2   | GET    | /siwe/nonce                  | :42            | `{nonce}` literal                                                        | no echo       | none                                                                                                 | minimal                                                                                                     |
| 3   | POST   | /siwe/nonce                  | :45            | `{nonce}` literal                                                        | no echo       | none                                                                                                 | minimal                                                                                                     |
| 4   | POST   | /siwe/verify                 | :48            | `{ok}` + sets `us_session_v1` cookie                                     | no echo       | no NONCE_INVALID / SIGNATURE_INVALID / POLICY_VIOLATION variants                                     | Needs failure flavors                                                                                       |
| 5   | POST   | /auth/refresh                | :54            | `{ok}` + cookie                                                          | no echo       | no REFRESH_REVOKED variant                                                                           | Needs 401 flavor                                                                                            |
| 6   | POST   | /auth/revoke-all             | :60            | `{ok}` + clear cookie                                                    | no echo       | none                                                                                                 | OK                                                                                                          |
| 7   | GET    | /ccid/status                 | :67            | `KycStatus` (Maya = approved)                                            | no echo       | only one status                                                                                      | Needs `pending` / `under_review` / `denied`                                                                 |
| 8   | POST   | /ccid/start                  | :68            | `{provider_url, provider_reference}`                                     | no echo       | none                                                                                                 | OK                                                                                                          |
| 9   | POST   | /ccid/webhook/provider       | :74            | `{ok}`                                                                   | no echo       | doesn't actually mutate fixture                                                                      | **Dev simulate hook calls this but state never flips**                                                      |
| 10  | POST   | /compliance/invalidate-cache | :77            | `{ok}`                                                                   | no echo       | none                                                                                                 | OK                                                                                                          |
| 11  | GET    | /v1/brokers/supported        | :81            | `BrokerInfo[]` (alpaca + ibkr)                                           | no echo       | none                                                                                                 | OK (but coming-soon Tradier in copy not present in fixture)                                                 |
| 12  | GET    | /v1/brokers/connection       | :84            | `BrokerConnection` (Maya = connected)                                    | no echo       | no null / pending / stale variants                                                                   | Needs "disconnected/stale" variants                                                                         |
| 13  | POST   | /v1/brokers/connect/start    | :87            | `{oauth_url}`                                                            | no echo       | none                                                                                                 | OK                                                                                                          |
| 14  | POST   | /v1/brokers/connect/keys     | :90            | `{ok, connection}`                                                       | no echo       | **no 401/403/422 path despite UI mapping them** (broker page lines 132–143)                          | **Add invalid-key / insufficient-permission / network branches**                                            |
| 15  | POST   | /v1/brokers/disconnect       | :93            | `{ok}`                                                                   | no echo       | none                                                                                                 | OK                                                                                                          |
| 16  | GET    | /v1/brokers/account          | :96            | `BrokerAccount`                                                          | no echo       | none                                                                                                 | OK                                                                                                          |
| 17  | GET    | /v1/brokers/positions        | :99            | `Position[]` (3 positions)                                               | no echo       | no stale, no degraded                                                                                | **Below 8–12 target**                                                                                       |
| 18  | GET    | /v1/brokers/orders           | :102           | `Order[]` (2 orders)                                                     | no echo       | no rejected/partial/canceled flavors                                                                 | Below depth target                                                                                          |
| 19  | POST   | /orders/preview              | :104           | `OrderPreviewResult`; qty>1000 → DENY w/ POSITION_SIZE_LIMIT, else ALLOW | no echo       | only DENY-on-qty + ALLOW; no REVIEW; no UNAVAILABLE (500); no fresh-vs-cache toggle wired to fixture | **No REVIEW path, no broker-stale path**                                                                    |
| 20  | GET    | /orders                      | :129           | `Order[]`                                                                | no echo       | none                                                                                                 | OK                                                                                                          |
| 21  | POST   | /orders                      | :130           | echoes body as `Order{status:'accepted'}`                                | no echo       | always succeeds                                                                                      | **No rejected/insufficient_buying_power variant**                                                           |
| 22  | DELETE | /orders/:id                  | :146           | `{ok}`                                                                   | no echo       | always succeeds                                                                                      | OK                                                                                                          |
| 23  | GET    | /v1/recommendations          | :148           | `Recommendation[]` (1 rec)                                               | no echo       | only 1                                                                                               | **Way below the 6-rec target**                                                                              |
| 24  | GET    | /v1/recommendations/:id      | :151           | `Recommendation` or 404                                                  | no echo       | 404 only                                                                                             | OK                                                                                                          |
| 25  | GET    | /v1/activity                 | :159           | `ActivityEvent[]` (4 events)                                             | no echo       | none                                                                                                 | thin                                                                                                        |
| 26  | POST   | /v1/documents/acknowledge    | :161           | `{ok}`                                                                   | no echo       | none                                                                                                 | OK                                                                                                          |
| 27  | POST   | /v1/support/ticket           | :164           | `{ok, ticket_id}`                                                        | no echo       | always succeeds                                                                                      | No blocked / 429 variant                                                                                    |
| 28  | POST   | /v1/us/eligibility           | :168           | `EligibilityDecision` (always eligible CA)                               | no echo       | none                                                                                                 | Shadowed by Next route at `/api/us/eligibility` so this handler is essentially dead; the UI does NOT hit it |
| 29  | GET    | /v1/profile                  | :178           | profile object                                                           | no echo       | none                                                                                                 | OK                                                                                                          |
| 30  | POST   | /v1/profile                  | :191           | echoes body                                                              | no echo       | none                                                                                                 | OK                                                                                                          |
| 31  | GET    | /v1/strategies/current       | :202           | `StrategyDescriptor`                                                     | no echo       | none                                                                                                 | OK                                                                                                          |
| 32  | GET    | /v1/account/activation       | :219           | `AccountActivationStatus` (all true except disclosures)                  | no echo       | none                                                                                                 | **Hardcoded `disclosures: false` permanently blocks activation in dev — by design but undocumented in UI**  |
| 33  | POST   | /v1/account/activate         | :229           | `{ok, activated_at}`                                                     | no echo       | no PRECONDITION_FAILED branch                                                                        | OK                                                                                                          |

**Cross-cutting MSW gaps:**

- **No x-correlation-id echo** anywhere (client sets it at `packages/api-clients/src/client.ts:57` but no handler echoes it back, so the rotation path is untested in dev).
- **No CSRF token validation** in handlers — the middleware at `apps/web/proxy.ts:115-126` issues `csrf_v1` cookies but no MSW handler enforces them; in dev the fail-closed contract is not exercised.
- **No persona switching.** Both Maya and David fixtures exist (`fixtures/maya.ts`, `fixtures/david.ts`) but `handlers.ts` only references Maya. David is dead code.
- **No latency / network-error simulation.** `OrderPreviewResult.latency_ms` is wired through to the UI telemetry (`CompliancePreview.tsx:95`) but the handler never sets it.
- **No `source: "cache"` path** — every preview returns `source: "fresh"` (line 117, 124). UI has copy for `sourceCache` (`app-copy.ts:187`) that is unreachable.
- **No stale-broker-data event.** `BrokerConnection.status` enum supports `pending` and `disconnected`, but neither is returned. The `appCopy` has no banner copy for "broker data is stale" either.

---

## 2. Fixtures

Two persona files, both in `packages/api-clients/src/mocks/fixtures/`:

**`maya.ts` (146 LOC) — California, eligible, approved KYC, Alpaca connected.**

| Surface                            | Coverage                                                                | Depth vs target                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Session                            | authenticated, kyc=approved                                             | OK                                                                                                        |
| KYC                                | approved, ComplyCube                                                    | single status only                                                                                        |
| Brokers list                       | Alpaca + IBKR (both `supported: true`)                                  | OK                                                                                                        |
| BrokerConnection                   | connected                                                               | only connected — no stale/pending                                                                         |
| BrokerAccount                      | equity/buying_power/cash                                                | OK                                                                                                        |
| **Positions**                      | **3** (AAPL, MSFT, VOO)                                                 | **Target 8–12 — short by 5–9**                                                                            |
| **Orders**                         | **2** (1 filled, 1 accepted)                                            | **No rejected / partially_filled / canceled / pending**                                                   |
| **Recommendations**                | **1** (QQQ buy, pending)                                                | **Target 6 with all status variants — short by 5; missing accepted/rejected/expired/review/partial-fill** |
| Activity                           | 4 events (recommendation, order, compliance, eligibility)               | OK genres; no decision_record column populated; UI shows "—" (`activity/page.tsx:73-74`)                  |
| Profile (in handler, not fixture)  | full set                                                                | OK                                                                                                        |
| Strategy (in handler, not fixture) | full descriptor                                                         | OK                                                                                                        |
| Disclosure-blocked state           | yes — activation fixture forces `disclosures: false` (handler line 226) | OK                                                                                                        |
| Support boundary                   | n/a — only patterns                                                     | OK                                                                                                        |
| Eligibility                        | always eligible CA                                                      | OK                                                                                                        |
| Compliance ALLOW/REVIEW/DENY       | only ALLOW + DENY-on-qty                                                | **REVIEW path entirely absent**                                                                           |

Fixtures are **NOT schema-validated** against `packages/api-clients/openapi/refi-api.yaml` at build or test time. The types match by hand (`generated/api.ts` is hand-written per its comment at line 1-3). There is no `openapi-typescript` codegen running.

**`david.ts` (40 LOC) — New York (waitlist), KYC incomplete, no broker, no positions/orders/recs, one eligibility event.**

David is correctly modeled as the "blank slate / blocked" persona but is **never imported by handlers.ts**. There is no fixture switching mechanism (env var, cookie, query param). David is unreachable in the running app.

**Missing fixtures entirely (vs the production-grade target):**

- "Sofia" / third persona for the REVIEW / partial-fill / rejected-order timeline.
- A persona with broker connection in `pending` or `disconnected` state to drive the broker-stale banner.
- A persona with `kyc_status: under_review` to exercise the polling UI.
- A persona representing a disclosure-blocked-at-activation user (currently every Maya hits this because the handler hardcodes `disclosures: false`).

---

## 3. Simulation consumers

`useSimulation` is defined at **`apps/web/app/_hooks/useSimulation.ts:171`** and consumed in exactly two places:

| File:line                                       | What it drives                                                                                                                        | Random / deterministic                                                                         | `isSimulated` visible                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/us/app/home/page.tsx:14, 31`      | Portfolio value KPI, today's change KPI, unrealized P&L KPI, open-positions count, sparkline, recent-activity "positions slice" cards | **Random** — `Math.random()` walk every 5s, `PRICE_WALK = 0.005` (useSimulation.ts:109, 13–15) | Visible via `SimulatedDataBadge` in `/us/app` shell layout (`app/layout.tsx:18-20`). Single global badge, not per-card. |
| `apps/web/app/us/app/portfolio/page.tsx:22, 39` | Total/Day/Total P&L cards, sparkline, positions table                                                                                 | Same random walk                                                                               | Same single global badge.                                                                                               |

**Important truthing notes:**

- Despite the comment at `useSimulation.ts:5`, the seed portfolio (5 positions, ~$58k) does **not match** the `mayaPositions` fixture (3 positions, ~$34.5k). They are independent sources of truth and a user comparing `/us/app/home` (simulation) to `/us/app/portfolio` (also simulation) sees totals that don't match `/us/app/account` (which reads `mayaBrokerAccount` from MSW = $51,847.22 equity). All three numbers disagree.
- `isSimulated: true` is returned from the hook (line 198) but **never consumed** anywhere except by the type — no card-level badging, no warning banner, no annotation on the chart that prices are synthetic.
- Random walk means screenshots are non-deterministic — bad for Playwright snapshot tests, demos, and any "show this to counsel" moment.
- `useActivity()` on `/us/app/activity` reads from MSW fixtures (not simulation); timestamps are fixed strings — they will look stale (May 14–17) once the demo runs in late May+.

---

## 4. Placeholder / stub / empty routes

**One-line placeholders (3 LOC, dev-debug copy reaches users):**

| File                                 | Lines | Content                                                                                                                                                                                                        |
| ------------------------------------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/admin/page.tsx`        | 3     | `<p>/admin — placeholder</p>`                                                                                                                                                                                  |
| `apps/web/app/auth/connect/page.tsx` | 3     | `<p>/auth/connect — placeholder</p>` (this is doubly bad — `/auth` redirects to `/us/auth/connect` at `apps/web/app/auth/page.tsx:4` so this subroute is unreachable but if anyone types it they see dev text) |
| `apps/web/app/explorer/page.tsx`     | 3     | `<p>/explorer — placeholder</p>`                                                                                                                                                                               |
| `apps/web/app/landing/page.tsx`      | 3     | `<p>/landing — placeholder</p>`                                                                                                                                                                                |

All four render literal `"<route> — placeholder"` text with `font-mono`. These are user-reachable URLs (no middleware redirect for `/admin`, `/explorer`, `/landing`; `/admin` is _session-gated_ by `proxy.ts:88` so an authenticated user can reach the dev placeholder).

**Pages with proper content but areas of placeholder copy inside:**

- `apps/web/app/us/page.tsx:96` and `apps/web/app/us/disclosures/page.tsx:24` render `{usBrand.legalEntityPlaceholder}` = `'[Legal entity — counsel to confirm]'` (from `brand.ts:5`). Visible to every visitor. Spec-sanctioned but should be tightened or wrapped in "Pending counsel" badge.
- `apps/web/app/us/_content/landing.ts:4-5` — `hero.headline` and `hero.subheadline` are literally `'[Headline — counsel review in progress]'`. This is documented as intentional in `01-us-overlay.md:478` but the landing page is the first impression.
- `apps/web/app/us/_content/onboarding.ts:88-96` — `brokers` array (with `tradier: coming_soon`) is **not actually consumed**; broker page uses the live `useBrokerSupported()` MSW response instead, which doesn't include Tradier. Dead copy.

**Empty states that exist (proper UX, not placeholders):**

- `recommendations/page.tsx:37-40` — `recommendations.emptyState`
- `activity/page.tsx:57-64` — `activity.emptyState`
- `account/page.tsx:217, 257` — sensible empty copy
- `strategy/page.tsx:30-38` — skeleton-ish loading state

---

## 5. Daniel-backend dependencies

Every hook in `packages/api-clients/src/hooks/*` is a thin TanStack-Query wrapper over `apiFetch` (`client.ts`). The shape they depend on is the OpenAPI in `packages/api-clients/openapi/refi-api.yaml` — which the file itself acknowledges is a **hand-written skeleton** to be replaced by Daniel's published spec (`refi-api.yaml:5-7`, `generated/api.ts:1-3`).

| Screen / hook                                       | File:line                                     | Current data source                              | Real endpoint expected                                                                                 | Schema gap                                                                                                                                      |
| --------------------------------------------------- | --------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard home KPIs + chart                         | `us/app/home/page.tsx:31`                     | **`useSimulation` (synthetic)**                  | Should aggregate `/v1/brokers/positions` + a `/v1/portfolio/timeseries` endpoint Daniel hasn't shipped | Spec has **no `/v1/portfolio/timeseries`** schema; no `dayPl/dayPlPct/totalPl/totalPlPct` envelope                                              |
| Portfolio page                                      | `us/app/portfolio/page.tsx:39`                | `useSimulation`                                  | `/v1/brokers/positions` exists in OpenAPI line 167 — already in spec                                   | Hook `useBrokerPositions` (`broker.ts:42`) **defined but not used by any page**                                                                 |
| Activity feed status/decisionRecord columns         | `us/app/activity/page.tsx:73-74`              | "—" hardcoded                                    | Needs decision_record_id and audit-anchor field in `ActivityEvent`                                     | OpenAPI `ActivityEvent` schema (yaml:448) has no `status`, no `decision_record`, no `merkle_leaf_hash`                                          |
| Recommendations accept                              | `us/app/recommendations/[id]/page.tsx:120`    | MSW preview gate                                 | Real `/orders/preview` + `/orders`                                                                     | Spec OK for happy path; missing `latency_ms` in preview response shape on yaml side (only in TS type `generated/api.ts:127`)                    |
| Strategy review                                     | `us/onboarding/strategy/page.tsx:11`          | `useStrategy` → MSW fixture                      | `/v1/strategies/current` exists in handler only                                                        | **Endpoint NOT in `refi-api.yaml`** — needs to be added                                                                                         |
| Advisory profile                                    | `us/onboarding/profile/page.tsx:49`           | `useAdvisoryProfile` → MSW                       | `/v1/profile` exists in handler only                                                                   | **NOT in `refi-api.yaml`**                                                                                                                      |
| Activation checklist                                | `us/onboarding/activation/page.tsx:25`        | `useActivationStatus`                            | `/v1/account/activation` and `/v1/account/activate` exist in handler                                   | **NOT in `refi-api.yaml`**                                                                                                                      |
| Document acknowledge                                | `us/app/documents/page.tsx:21-27`             | direct `apiFetch` to `/v1/documents/acknowledge` | needs versioned doc hashes + per-doc ack                                                               | OpenAPI has **no Documents resource at all** — no schema for document list, version, hash, ack record                                           |
| Broker API key submit                               | `us/onboarding/broker/page.tsx:157`           | `useBrokerConnectApiKey` → MSW                   | `/v1/brokers/connect/keys`                                                                             | **NOT in `refi-api.yaml`** — the YAML only specifies the OAuth-start path                                                                       |
| KYC simulate webhook                                | `us/onboarding/kyc/page.tsx:34`               | `useKycSimulateWebhook`                          | `/ccid/webhook/provider`                                                                               | Dev-only; OK                                                                                                                                    |
| Compliance cache invalidate                         | `us/onboarding/kyc/page.tsx:35, 52`           | `useComplianceInvalidateCache`                   | `/compliance/invalidate-cache`                                                                         | **NOT in `refi-api.yaml`**                                                                                                                      |
| Recommendation accept/reject/request-review actions | `recommendations/[id]/page.tsx:118-122`       | submits order, no rec-status update              | Needs `PATCH /v1/recommendations/:id` with `status` change + rationale                                 | **NOT in `refi-api.yaml`** at all — the rec lifecycle is one-way today                                                                          |
| Support ticket                                      | `us/app/support/page.tsx:36`                  | direct `apiFetch` to `/v1/support/ticket`        | needs categorized intake                                                                               | **NOT in `refi-api.yaml`**                                                                                                                      |
| Sign-in-with-Ethereum nonce + verify                | `_hooks/useSiweAuth.ts` (via `auth.ts` hooks) | MSW                                              | `/siwe/nonce`, `/siwe/verify` (in yaml :20, :33)                                                       | Yaml does NOT specify the SIWE error code envelope; UI maps from `siweCopy.siweErrors` (`app-copy.ts:108-118`) but the wire format isn't pinned |

**Summary of schemas missing from `refi-api.yaml`** that the UI already depends on:

- `/v1/profile` GET+POST (AdvisoryProfile / AdvisoryProfileResponse)
- `/v1/strategies/current` GET (StrategyDescriptor)
- `/v1/account/activation` GET, `/v1/account/activate` POST
- `/v1/brokers/connect/keys` POST (BrokerApiKeyConnectRequest / BrokerConnectKeyResponse)
- `/v1/documents` GET, `/v1/documents/acknowledge` POST (entire Documents resource)
- `/v1/support/ticket` POST
- `/compliance/invalidate-cache` POST
- `/ccid/webhook/provider` POST (intentional? It's a webhook from the provider, not a UI call — but the UI dev-simulate fires it)
- `PATCH /v1/recommendations/:id` (status transitions)
- SIWE error envelope refinement
- `BrokerConnection` enum should add `stale` (UI has no copy for it but spec implies a stale-data state in `03-claude-code-master-prompt.md:54`)

---

## 6. SEC legal-blocked document states

**Source of document list:** `apps/web/app/us/_content/disclosures.ts` (58 LOC).

| #   | id                               | name                             | status  | required                | version placeholder                  | hash pending | unlock condition | required-for-activation       | "why disabled" copy                    |
| --- | -------------------------------- | -------------------------------- | ------- | ----------------------- | ------------------------------------ | ------------ | ---------------- | ----------------------------- | -------------------------------------- |
| 1   | form-crs                         | Form CRS                         | pending | true                    | none — single "Pending registration" | no field     | none             | not tied to activation status | tooltip "Available after registration" |
| 2   | adv-part-2a                      | ADV Part 2A                      | pending | true                    | none                                 | no field     | none             | not tied to activation status | tooltip "Available after registration" |
| 3   | advisory-agreement               | Investment Advisory Agreement    | pending | true                    | none                                 | no field     | none             | not tied to activation status | tooltip "Available after registration" |
| 4   | privacy-notice                   | Privacy Notice                   | pending | **false** (Recommended) | none                                 | no field     | none             | n/a                           | tooltip                                |
| 5   | e-delivery-consent               | E-Delivery Consent               | pending | true                    | none                                 | no field     | none             | n/a                           | tooltip                                |
| 6   | fee-schedule                     | Fee Schedule                     | pending | **false** (Recommended) | none                                 | no field     | none             | n/a                           | tooltip                                |
| 7   | managed-execution-acknowledgment | Managed Execution Acknowledgment | pending | true                    | none                                 | no field     | none             | n/a                           | tooltip                                |

**Two surfaces render this list:**

- **`/us/disclosures`** (`apps/web/app/us/disclosures/page.tsx`) — public, View+Download buttons disabled with title="Available after registration"; StatusBanner at line 27-30 reads "Documents are in preparation pending SEC registration and counsel sign-off. Document names are final."
- **`/us/app/documents`** (`apps/web/app/us/app/documents/page.tsx`) — authenticated, same disabled buttons; adds a single bulk-acknowledge checkbox (line 120-131) that calls `/v1/documents/acknowledge` with no per-doc granularity. There is no per-document version, no per-document checkbox, no hash display, no effective-date — only the string `"Pending registration"` (line 76).

**Activation blocked state:** `apps/web/app/us/onboarding/activation/page.tsx`

- Reads `useActivationStatus()` which in the MSW handler is hardcoded `disclosures: false` (`handlers.ts:226`). So in dev, the Activate button is **always** disabled.
- The disabled-reason copy is `activation.pendingLabel = "Complete all items above to activate"` (`onboarding.ts:209`) — generic, doesn't say _which_ item is blocked or that disclosures are pending SEC registration. The warning banner at line 79 does say "Managed execution activation requires Form CRS, ADV Part 2A, and Investment Advisory Agreement acknowledgment. These documents are currently in preparation." — but that's three docs of the seven, and inconsistent with the documents page which marks four as required.
- No deep link from the activation checklist row "Disclosure package acknowledged" to `/us/app/documents`.

**Gaps:**

- No `version`, `effective_date`, `hash`, or `unlock_after` field on the disclosure data model.
- No mapping from required-doc list to activation gate (each doc just declares `required: boolean` for itself).
- No state in handler for "documents acknowledged at version X" — the POST is fire-and-forget and the activation status doesn't flip.
- "Document in preparation" / "Pending registration" copy is consistent (good) but never explains _what the user can do now_ or _when to check back_.

---

## 7. Submit / Accept fail-closed paths

| Submit action                                   | File:line                                                                                                     | Gate logic                                                                                                                                                                                          | Truly disabled without ALLOW?                                                                                                                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recommendation accept ("Approve for execution") | `recommendations/[id]/page.tsx:118-124`                                                                       | `<CompliancePreview renderSubmit={(canSubmit) => <Button disabled={!canSubmit \|\| submitOrder.isPending} />}` — `canSubmit` only true when `verdict.kind === "ALLOW"` (`CompliancePreview.tsx:99`) | **YES — fail-closed verified.** UNAVAILABLE, LOADING, REVIEW, DENY all yield `canSubmit=false`.                                                                                                                                   |
| Order submit (direct)                           | none — there is no general order-submit form. Submission only happens through the recommendation accept path. | n/a                                                                                                                                                                                                 | n/a — acceptable but worth confirming intentional                                                                                                                                                                                 |
| Onboarding activation                           | `onboarding/activation/page.tsx:87-93`                                                                        | `disabled={!allDone \|\| activate.isPending \|\| isLoading}`; `allDone = Object.values(status).every(Boolean)`                                                                                      | **YES** — but the gate is a client-computed AND, not a server-validated precondition. Server's `/v1/account/activate` always returns ok. If a user crafts the request directly, it would activate. Backend must enforce the same. |
| Broker connect (Alpaca keys)                    | `onboarding/broker/page.tsx:373-380`                                                                          | `disabled={isSubmitting \|\| connectKey.isPending}` — gated only on form validity (Zod schema lines 37-70). **No compliance preview.**                                                              | n/a — broker connect itself isn't compliance-gated, but submission of keys to backend is unconditional once the form is valid. OK by design.                                                                                      |
| KYC start                                       | `onboarding/kyc/page.tsx:103-106`                                                                             | `disabled={start.isPending}` — no gate beyond network state.                                                                                                                                        | n/a                                                                                                                                                                                                                               |
| Profile save                                    | `onboarding/profile/page.tsx:110-116`                                                                         | `disabled={!valid \|\| save.isPending}`                                                                                                                                                             | n/a                                                                                                                                                                                                                               |
| Document acknowledge                            | `documents/page.tsx:139-145`                                                                                  | `disabled={!checked \|\| acknowledge.isPending}`                                                                                                                                                    | n/a                                                                                                                                                                                                                               |
| Support submit                                  | `support/page.tsx:63-65`                                                                                      | `canSubmit = category!=="" && message.trim()!=="" && !blocked && !submit.isPending` — blocked-prompt patterns force disable                                                                         | OK fail-closed for blocked prompts                                                                                                                                                                                                |
| Sign-in (SIWE verify)                           | `us/auth/connect/page.tsx:77-90`                                                                              | `disabled={signing \|\| state.phase === "success"}`                                                                                                                                                 | OK                                                                                                                                                                                                                                |

**Fail-closed posture is correct on the one path that matters** (recommendation accept → order). The architecture concern is that the only consumer of `CompliancePreview` is the recommendation detail page. Any future Submit-style action (rebalance, manual order entry, bulk accept) will need to wrap `CompliancePreview` to keep the contract.

The DevOverridePanel inside `CompliancePreview.tsx:178-205` is gated by `NEXT_PUBLIC_REFI_ENV !== "prod"` (line 17-19) — verify CI build sets the env var so it doesn't ship to prod.

---

## 8. Developer-looking copy and architecture violations in JSX

**Hardcoded English in JSX (should be in `_content/*`):**

- `apps/web/app/us/disclosures/page.tsx:20` `"Regulatory disclosures"`
- `:23` `"Required disclosures for clients of"`
- `:28-30` StatusBanner copy "Documents are in preparation pending SEC registration and counsel sign-off. Document names are final."
- `:50` `"Effective date: Pending registration"`
- `:75-78` legalese footer paragraph
- `apps/web/app/us/app/documents/page.tsx:39-41` StatusBanner copy
- `:104-110` "Document acknowledgment" headline + body
- `:115-117` Success banner body
- `:127-130` checkbox label
- `:135` "Could not record acknowledgment. Please try again."
- `apps/web/app/us/page.tsx:113-117` footer paragraph
- `apps/web/app/us/app/account/page.tsx:104` `"Ethereum mainnet · SIWE session"`
- `:124` `"Identity Verification"` card title
- `:142-145` "Start verification" / "Resume verification"
- `:168-169` "Equity: … Buying power: …"
- `:181-183` confirm-disconnect copy
- `:192-200` Confirm/Cancel/Disconnect button labels
- `:217` `"No broker connected."`
- `:219` `"Connect broker"`
- `:236-241` profile labels ("Goal", "Time horizon", etc.) — duplicates `onboardingCopy.profile.fields`
- `:258` `"Profile available after onboarding."`
- `:261` `"Complete profile"`
- `:274-277` security explanation
- `:282` `"Sign out all devices"`
- `apps/web/app/us/onboarding/strategy/page.tsx:24-26` `"Could not load strategy. Please try again."`
- `apps/web/app/us/onboarding/activation/page.tsx:64` literal `"✓"` / `"○"` glyphs (cosmetic, not copy, but worth replacing with proper icons)
- `apps/web/app/us/onboarding/broker/page.tsx:226-228` `"Coming soon"` Badge (note: also in `broker.comingSoonLabel` — duplicated)
- `:242` `"Connected"` literal
- `:289` `"Live trading"` StatusBanner title
- `apps/web/app/us/onboarding/kyc/page.tsx:131-156` entire dev override panel literals — acceptable as dev-only but visible if `NEXT_PUBLIC_REFI_ENV` is misconfigured
- `apps/web/app/us/app/support/page.tsx:80-83` success banner copy
- `:87-89` error banner copy
- `apps/web/app/us/auth/connect/page.tsx:42-101` no headings hardcoded (uses `siweCopy`) ✓ — clean
- `apps/web/app/us/app/recommendations/page.tsx:36` `"Loading…"`
- `apps/web/app/us/app/activity/page.tsx:51, 60` `"Loading…"`
- `apps/web/app/us/app/recommendations/[id]/page.tsx:28` `"Loading…"`
- `:32` `"Recommendation not available."` — error banner
- `:60` literal `"← Recommendations"` (back link)
- `:94` `"Quantity"` field label
- `:110-112` field hint copy
- `:138` `"P&L"` and similar in `home/page.tsx:42, 49` come through `appCopy` ✓

**Dev/debug labels reachable in prod:**

- All four `/admin`, `/auth/connect`, `/explorer`, `/landing` "— placeholder" strings.
- `CompliancePreview.tsx:187` `"Dev: override verdict"` and "Clear" button — env-gated, OK.
- `onboarding/kyc/page.tsx:133` `"Dev only — simulate provider webhook"` — env-gated.
- `apps/web/app/api/us/eligibility/route.ts:99` `// PostHog telemetry placeholder.` and the raw `console.info` JSON log (lines 100-108) — server-side, but ships PostHog event name in a console line, which is fine until real PostHog wired.
- `apps/web/app/api/us/support/route.ts:36-46` — same pattern, synthetic `tkt_${Date.now()}` ID with `console.info` shipped.

**No TODOs / FIXMEs found in source.** Code is clean of `TODO` markers (good). The only `"coming soon"` strings outside copy files are the `/admin`, `/explorer` etc placeholders.

**Missing per spec:** `packages/config/blocked-terms.ts` referenced in `01-us-overlay.md:223` and `02-phase-2-build-plan.md:279` does **not exist**. The CI copy-scanner gate (MIG-P1-10) is therefore not actually wired. Confirm `.github/workflows/` — no copy-scan job in the directory listing.

---

## 9. Unlabeled simulated data

**The one global "Simulated Data" pill** is in the `/us/app` shell at `app/layout.tsx:18-20`, rendered top-right on every authenticated page (`SimulatedDataBadge.tsx`). It is:

- a single amber pill, not per-card
- not present on `/us/disclosures` (where data is also "not real")
- not present on `/us/onboarding/*` (Strategy uses MSW fixture; Profile reads server-hydrated mock; Activation reads mocked checklist)
- not present on `/us/eligibility` (real route handler, but the rule set is hardcoded)
- not present on the `/us/auth/connect` SIWE page (where the nonce, verify, and session are MSW-mocked)

**Specific UI elements rendering simulated/mock data without per-element labeling:**

| Element                             | Page                        | Data source                                                                                                    | Has badge?                                                                                                                                                                                                           |
| ----------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Portfolio value KPI                 | home, portfolio             | `useSimulation` random walk                                                                                    | only global badge                                                                                                                                                                                                    |
| Today's change KPI                  | home, portfolio             | `useSimulation`                                                                                                | only global                                                                                                                                                                                                          |
| Unrealized P&L KPI                  | home, portfolio             | `useSimulation`                                                                                                | only global                                                                                                                                                                                                          |
| Sparkline                           | home, portfolio             | `useSimulation` history                                                                                        | only global; the chart visually implies live market data                                                                                                                                                             |
| Positions table                     | portfolio                   | `useSimulation` (drifts every 5s)                                                                              | only global; "current_price" column would normally be a real quote                                                                                                                                                   |
| Recent activity card list           | home                        | derived from `useSimulation.positions.slice(0,5)` — **mislabeled as "recent activity" but actually positions** | only global                                                                                                                                                                                                          |
| Account → Equity / Buying power     | account                     | MSW `BrokerAccount` fixture                                                                                    | **NO badge at all** — account page is not under the `/us/app` layout? Actually it is — layout at `apps/web/app/us/app/layout.tsx` wraps it. So global pill shows. But the _number_ `$51,847.22` looks authoritative. |
| Recommendations list                | recommendations             | MSW fixture                                                                                                    | only global                                                                                                                                                                                                          |
| Activity timestamps (`evt_001` etc) | activity                    | MSW fixture (hardcoded May 14–17 2026)                                                                         | only global; timestamps will look "stale"                                                                                                                                                                            |
| Strategy descriptor                 | onboarding/strategy         | MSW fixture                                                                                                    | **NO badge** (onboarding has no global pill)                                                                                                                                                                         |
| Advisory profile                    | onboarding/profile, account | MSW fixture (Maya hardcoded)                                                                                   | **NO badge on onboarding**                                                                                                                                                                                           |
| Activation checklist                | onboarding/activation       | MSW fixture                                                                                                    | **NO badge**                                                                                                                                                                                                         |
| Disclosure documents list           | disclosures, app/documents  | hardcoded `disclosureDocuments` array                                                                          | doc list has "Document in preparation" badge per doc ✓                                                                                                                                                               |
| Eligibility decision                | eligibility                 | real Next route handler + real rule engine                                                                     | this is not simulated — correctly unlabeled                                                                                                                                                                          |
| KYC status                          | onboarding/kyc, account     | MSW fixture (always approved)                                                                                  | **NO badge**                                                                                                                                                                                                         |
| Broker connection status            | onboarding/broker, account  | MSW fixture (always connected for Maya)                                                                        | **NO badge**                                                                                                                                                                                                         |

**The recommendation:** every screen that uses MSW fixtures or `useSimulation` while real backend is pending should carry the `SimulatedDataBadge` (or a variant) — most critically the onboarding pages, since a user proves out the whole flow with mock data and may think they really completed KYC.

Also: the home page calls a section "Recent activity" but renders `positions.slice(0,5)`. The label is wrong (`home/page.tsx:127-163` — heading is `home.recentActivity` "Recent activity" but the cards are positions).

---

## Brief notes

### Already at top-0.1% bar (don't re-do)

- **`CompliancePreview.tsx`** — clean render-prop API, fail-closed verdict logic, dev override panel, telemetry hook, source-cache-vs-fresh display, REVIEW/DENY/UNAVAILABLE/LOADING all distinct, reasons rendered with code badges. This is the model for any future gated action.
- **Broker API key flow** — Zod schema discriminating paper vs live by key prefix (`broker/page.tsx:37-70`), defensive form-reset on unmount (line 111-115), explicit `autoComplete="off"`, secret-show/hide, environment warning banner, error-code mapping (lines 131-144), security comment explaining the lifecycle of the secret in memory (lines 149-156).
- **Eligibility route handler** — `apps/web/app/api/us/eligibility/route.ts` does IP/UA hashing with HMAC-SHA256, signed JWT cookie, rate limiting, no PII in logs. This is production-grade.
- **Security middleware** (`proxy.ts`) — CSP with nonce + strict-dynamic, HSTS, X-Frame-Options, Permissions-Policy, CSRF cookie issuance, eligibility/session gating. Excellent.
- **Env validation** (`apps/web/src/lib/config/env.ts`) — zod-validated, fail-fast, server-only secrets isolated.
- **API client** — correlation-id injection + rotation, 401 global event, typed `ApiError`. Good.
- **Onboarding wizard layout** — proper step indicator with `aria-current="step"`, semantic heading levels.
- **Support boundary patterns** — regex-based blocked-prompt detection (`support-boundary.ts:21-29`) is the right way to ship the 203A-2(e) requirement.
- **KYC polling with terminal-state stop** (`hooks/kyc.ts:27-33`) — correct fetcher discipline.
- **SimulatedDataBadge** itself is well-built — `role="status"`, `motion-safe:animate-pulse`, semantic colors.

### Missing entirely (not even stubbed)

- `packages/config/blocked-terms.ts` (CI copy scanner data file) — spec calls for it; absent.
- Copy-scan CI job in `.github/workflows/` (likely — confirm).
- Per-document version / hash / unlock fields on `disclosureDocuments`.
- `PATCH /v1/recommendations/:id` (accept/reject/request-review without going through `/orders`).
- `/v1/portfolio/timeseries` (real history for the chart).
- Persona switcher (Maya / David / others) — fixtures exist for David but no switching mechanism.
- A "broker data stale" UI banner and corresponding `useBrokerConnection` status branch.
- `/admin`, `/explorer`, `/landing` real content (or proper "Coming soon" pages with brand chrome).
- Logo component / SVG mark — no logo file in `apps/web/public` other than `mockServiceWorker.js`; brand uses text "ReFi.Trading USA" everywhere.
- Brand voice & copy guidelines doc.
- OpenTelemetry trace propagation from client correlation-id (declared in stack baseline but not wired in `apiFetch`).
- E2E tests for compliance fail-closed paths — there are spec files at `apps/web/e2e/{auth,eligibility,onboarding,recommendations,support}.spec.ts`; verify they assert "Submit disabled when verdict ≠ ALLOW".
- Real PostHog client (`useAnalytics` reads `window.posthog` if present; PostHog provider at `apps/web/app/_providers/analytics/PostHogProvider.tsx` exists — verify wired).

### Architecture violations

- **No direct broker/DB/Chainlink calls from UI** — verified clean. All hooks go through `apiFetch`.
- **Wallet writes are off-chain only** (SIWE signature). No raw RPC calls from the app.
- **PII discipline** — eligibility handler hashes IP+UA (good). DOB is parsed for age and not persisted in the JWT (good — only `result, state, rule_id, ip_hash, ua_hash, rule_version`). However, `apps/web/app/api/us/support/route.ts` does NOT hash IP (line 14-17, IP is read but only used for the rate-limiter key, never logged). Acceptable.
- **`console.info` JSON logs** in route handlers (eligibility:101, support:40) — fine for now but bypass any structured logger; flag for OTel migration.
- **The `/admin` route is session-gated** but renders dev placeholder text — minor leak of dev language to authenticated users.
- **JSX hardcoded copy** as enumerated above — violates the `_content/*` separation rule. Disclosures, Documents, Account, Recommendations-detail are the worst offenders.
- **No fixture-vs-schema validation** — fixtures could drift from the OpenAPI yaml silently.
- **`/v1/us/eligibility` MSW handler** (`handlers.ts:168-175`) is shadowed by the real Next route handler; dead handler.

### Brand readiness

- **Tailwind theme:** Yes — `packages/config/tailwind/index.ts` exports `brandTokens` (charcoal scale, mint scale, status colors). `apps/web/tailwind.config.ts` and `packages/ui` both extend it. Theme is real and consistent.
- **Design tokens file:** Yes — `packages/ui/src/tokens/index.ts` re-exports `brandTokens`. Single source of truth.
- **Logo component:** No — the product surface name "ReFi.Trading USA" is rendered as text in `usBrand.productSurface` (`brand.ts:3`) wherever a logo would go (landing header, onboarding header, app shell sidebar at `NavSidebar.tsx:20-22`). No SVG mark, no favicon beyond Next defaults, no `public/logo.*`.
- **Brand voice / copy guidelines:** No standalone doc. Voice is implicit in the `_content/*` files — generally restrained, "software-generated," "platform," no superlatives. But there is no editorial style guide.
- **Where brand integration lands:** ① a new `packages/ui/src/components/Logo.tsx` consumed by `NavSidebar`, landing header, onboarding header, disclosures header. ② SVG favicon set in `apps/web/public/`. ③ a `refi-build-docs/spec-current/04-brand-voice.md`. ④ open-graph image generation in `apps/web/app/opengraph-image.tsx`.

---

## 10. MIG-P2.5 ticket plan

Sized S (≤0.5 day) / M (0.5–2 days) / L (2–5 days). Files-touched columns list the exact paths in this repo.

### MIG-P2.5-01 — Kill dev-placeholder routes (per-route prescription)

**Title:** Apply route-specific handling — not a blanket "Coming soon."

- `/admin` → return 404 (`notFound()` from `next/navigation`); session-gated nature preserved by middleware.
- `/explorer` → render a finished Phase 3 placeholder card ("Audit trail explorer — available in Phase 3 with on-chain Merkle anchoring") using brand chrome, no empty state.
- `/landing` → server redirect to `/us`.
- `/auth/connect` → server redirect to `/us/auth/connect`.

**Files touched:**

- `apps/web/app/admin/page.tsx` (replace with `notFound()`)
- `apps/web/app/auth/connect/page.tsx` (replace with `redirect('/us/auth/connect')`)
- `apps/web/app/explorer/page.tsx` (render `<FuturePhaseCard phase="3" feature="audit-explorer" />`)
- `apps/web/app/landing/page.tsx` (replace with `redirect('/us')`)
- `apps/web/app/us/_content/future-phases.ts` (new — copy for Phase 3 explorer card)
- new: `apps/web/app/_components/FuturePhaseCard.tsx`

**Acceptance:** no JSX literal containing `"— placeholder"` remains; `/admin` returns HTTP 404; `/landing` and `/auth/connect` issue 308 redirects; `/explorer` renders branded Phase 3 card with no empty state.
**Owner:** UI
**Blockers:** none
**Complexity:** S

### MIG-P2.5-02 — Persona fixtures: Maya Thompson / David Kim / Sarah Patel under `fixtures/personas/`

**Title:** Move to per-persona files in a `personas/` subfolder; expand Maya to full production depth; add David (waitlist / no broker) and Sarah (KYC under review + compliance REVIEW timeline).
**Files touched:**

- new: `packages/api-clients/src/mocks/fixtures/personas/maya-thompson.ts`
- new: `packages/api-clients/src/mocks/fixtures/personas/david-kim.ts`
- new: `packages/api-clients/src/mocks/fixtures/personas/sarah-patel.ts`
- delete: `packages/api-clients/src/mocks/fixtures/maya.ts`, `david.ts`
- new: `packages/api-clients/src/mocks/fixtures/index.ts` (persona registry + active-persona resolver)
- `packages/api-clients/src/mocks/handlers.ts` (read persona from cookie `refi_persona_v1`, default Maya)

**Maya minimum content (must all be present and reachable from UI):**

- 8–12 positions across asset classes
- 6 recommendations: 3 accepted, 1 denied, 1 in review, 1 expired
- 1 partial-fill order, 1 broker-rejected order
- 1 stale-broker-data event in activity feed
- 1 disclosure-blocked activation event
- 1 support-boundary blocked-prompt event
- 1 KYC approved event
- 1 eligibility decision event
- ≥1 compliance verdict each: ALLOW, REVIEW, DENY
- account, wallet, eligibility decision, kyc status, advisory profile, broker connection, broker account, broker permissions, holdings, cash, orders, recommendations, recommendation detail records, automation eligibility checks, execution policy, compliance verdicts, activity events, document statuses, support tickets, exceptions, audit references, simulation metadata

**David:** eligible (waitlist state), KYC incomplete, no broker, no positions/orders, one eligibility event.
**Sarah:** KYC under review (polling state visible), broker connected, 4 positions, 2 recommendations of which 1 sits in compliance REVIEW (tax-impact code).

**Acceptance:** every `OrderStatus`, every `Recommendation.status`, every `BrokerConnection.status`, and every compliance verdict code is reachable by switching persona alone (no code change); MSW handlers route by `refi_persona_v1` cookie; switching personas in dev does not require restart.
**Owner:** UI / mocks
**Blockers:** none
**Complexity:** L (uprated from M — content depth + restructure)

### MIG-P2.5-03 — Compliance verdict scenario matrix + MSW failure paths

**Title:** Build the 7-verdict scenario matrix as named fixtures and route them deterministically by query param. Also wire failure paths to other handlers.

**Named compliance verdict fixtures (required):**

- `ALLOW` — fresh, low-latency, all guardrails pass
- `REVIEW_CONCENTRATION` — single-position concentration > policy threshold
- `REVIEW_TAX_IMPACT` — short-term gain triggers tax-impact review
- `DENY_POSITION_SIZE` — qty \* price > position size limit
- `DENY_DISCLOSURE_REQUIRED` — user has not acknowledged a required disclosure version
- `DENY_STALE_BROKER_DATA` — broker positions older than freshness window
- `DENY_COMPLIANCE_UNAVAILABLE` — adapter unreachable / 5xx; UI treats as DENY per fail-closed rule

**Other failure paths to add:**

- `/v1/brokers/connect/keys`: 401 invalid keys, 403 insufficient permissions, 422 unsupported environment
- `POST /orders`: `rejected`, `insufficient_buying_power`, `broker_unavailable`
- `/v1/support/ticket`: 429 rate-limited, 422 blocked-by-policy
- `/orders/preview`: `source: "cache"` rotation (50% of calls in scenario mode); `latency_ms` populated with realistic 80–450ms band

**Files touched:**

- new: `packages/api-clients/src/mocks/fixtures/compliance/verdicts.ts` (the 7 named verdicts as exported constants)
- new: `packages/api-clients/src/mocks/scenarios.ts` (scenario resolver reading `?scenario=` or `refi_scenario_v1` cookie; dev/staging only)
- `packages/api-clients/src/mocks/handlers.ts` (or whatever per-domain handler files exist after MIG-P2.5-22)

**Acceptance:** every error-mapping branch in `apps/web/app/us/onboarding/broker/page.tsx:131-144` is reachable; every named verdict above renders the correct UI verdict pill, reasons, and Submit-button state; CompliancePreview source=cache and latency display are both reachable; scenario controls do not render when `NEXT_PUBLIC_REFI_ENV=prod`.
**Owner:** UI / mocks
**Blockers:** MIG-P2.5-02, MIG-P2.5-19 (RecommendationDetail schema)
**Complexity:** M

### MIG-P2.5-04 — Schema-validated fixtures + missing OpenAPI paths

**Title:** Add missing endpoints to `refi-api.yaml`; add a build-time check that every fixture parses through its schema.
**Files touched:**

- `packages/api-clients/openapi/refi-api.yaml` (add `/v1/profile`, `/v1/strategies/current`, `/v1/account/activation`, `/v1/account/activate`, `/v1/brokers/connect/keys`, `/v1/documents`, `/v1/documents/acknowledge`, `/v1/support/ticket`, `/compliance/invalidate-cache`, `PATCH /v1/recommendations/{id}`)
- `packages/api-clients/src/generated/api.ts` (regenerate or keep hand-written but mirror)
- new: `packages/api-clients/scripts/validate-fixtures.ts`
- `packages/api-clients/package.json` (add `validate:fixtures` script)
- `.github/workflows/ci.yml` (add validate job)

**Acceptance:** `pnpm -F @refi/api-clients validate:fixtures` exits 0; CI gate fails when a fixture drifts.
**Owner:** Daniel + UI
**Blockers:** Daniel sign-off on the new endpoints' shapes
**Complexity:** L

### MIG-P2.5-05 — Per-screen "Simulated" labeling

**Title:** Add per-card or per-section simulated-data badges on every onboarding screen, account page broker numbers, strategy page, KYC status, and the sparkline chart caption.
**Files touched:**

- `apps/web/app/us/app/_components/SimulatedDataBadge.tsx` (variants: `inline`, `card`, `chart`)
- `apps/web/app/us/onboarding/layout.tsx` (add global "Simulated Onboarding" pill)
- `apps/web/app/us/app/account/page.tsx` (badge equity/buying-power numbers)
- `apps/web/app/us/app/home/page.tsx` (badge sparkline + KPIs)
- `apps/web/app/us/app/portfolio/page.tsx` (badge price column)
- `apps/web/app/us/onboarding/kyc/page.tsx` (badge approved state)
- `apps/web/app/us/onboarding/broker/page.tsx` (badge connection)
- `apps/web/app/us/onboarding/strategy/page.tsx` (badge strategy)

**Acceptance:** every numeric value that comes from MSW or `useSimulation` is within `<SimulatedDataBadge>` distance; visual regression snapshot confirms.
**Owner:** UI
**Blockers:** none
**Complexity:** M

### MIG-P2.5-06 — Disclosure document data model upgrade

**Title:** Add `version`, `effectiveDate`, `hash`, `unlockCondition`, `requiredForActivation` fields to disclosure model; tie activation checklist to per-doc acknowledgment.
**Files touched:**

- `apps/web/app/us/_content/disclosures.ts` (schema + values; all version=null, hash=null, unlockCondition="sec-registration")
- `apps/web/app/us/disclosures/page.tsx` (render version/hash/unlock when present)
- `apps/web/app/us/app/documents/page.tsx` (per-doc checkboxes; "X of N required acknowledged")
- `apps/web/app/us/onboarding/activation/page.tsx` (deep-link disclosure row to `/us/app/documents`; show "Pending SEC registration" sub-label when blocked by docs)
- `apps/web/app/us/_content/onboarding.ts` (update `activation.warningDisclosure` to reference all 5 required docs accurately)
- `packages/api-clients/src/mocks/handlers.ts` (return per-doc ack state)

**Calm customer copy template (per-doc):** `"This document is required before Managed Execution Activation. It will become available after registration and counsel approval."`

**Hidden internal note:** each doc carries an `internalNote` field (e.g., `"Counsel review with Cooley LLP — target effective date pending"`) rendered only when `NEXT_PUBLIC_REFI_ENV !== "prod"` AND user role includes `admin`. Never shipped to customer.

**Acceptance:** the documents page lists 7 docs with explicit `Required for activation: yes/no` flags consistent across `/disclosures`, `/app/documents`, and the activation gate; required count matches activation gate count; calm copy template appears on every blocked doc; internal counsel note never renders for end users.
**Owner:** UI + legal review on copy
**Blockers:** counsel sign-off on which docs are required for activation
**Complexity:** M

### MIG-P2.5-07 — Move all JSX literals into `_content/*`

**Title:** Sweep `/us/app/account`, `/us/app/documents`, `/us/disclosures`, `/us/app/recommendations`, `/us/app/recommendations/[id]`, `/us/onboarding/strategy`, `/us/app/activity`, `/us/app/support` for hardcoded strings; move to `app-copy.ts` or per-page content files.
**Files touched:** all files listed in Area 8 above (enumerated).
**Acceptance:** copy scanner (see MIG-P2.5-08) runs and reports zero non-allowlisted strings in `apps/web/app/us/**/*.tsx` outside `_content/`.
**Owner:** UI
**Blockers:** MIG-P2.5-08 for the scanner
**Complexity:** M

### MIG-P2.5-08 — Ship the blocked-terms scanner + CI gate (overdue from MIG-P1-10)

**Title:** Create `packages/config/blocked-terms.ts`, write the scanner script, wire to CI as a required check.
**Files touched:**

- new: `packages/config/blocked-terms.ts`
- new: `scripts/scan-copy.ts`
- `package.json` root (`scripts.scan:copy`)
- `.github/workflows/ci.yml`

**Acceptance:** matches `01-us-overlay.md:223` spec; PR breaks when a blocked term lands without `// allow-blocked-term: "term" reason: "..."` comment; baseline of current repo passes.
**Owner:** UI / DX
**Blockers:** the canonical blocked-terms list (zeshan + counsel)
**Complexity:** M

### MIG-P2.5-09 — Home dashboard redesign for US digital-adviser positioning

**Title:** Replace the "fake trading P&L" dashboard with a status-oriented home screen that answers the five user questions: account state, what needs attention, managed-execution state, next recommendation/exception, what records exist, and what data is simulated.

**Card layout (8 cards minimum):**

1. **Account State** — `Eligible → Onboarded → Active`; current status with sub-label
2. **Managed Execution Status** — `Active / Blocked: pending disclosures / Paused by user`; deep link to activation
3. **Disclosure Status** — `N of M required disclosures acknowledged`; deep link to `/us/app/documents`
4. **Broker Connection Status** — connected/disconnected/stale with last-sync timestamp
5. **Compliance Status** — current verdict-engine availability + last preview verdict
6. **Next Action** — single CTA: top-priority recommendation, blocked activation, or "no action needed"
7. **Open Exceptions Count** — links to exception detail (Phase 3 if needed)
8. **Data Freshness Timestamp** — bottom-of-screen "Updated 23s ago — sources: broker, compliance, signals"

Each card includes a one-sentence **"What this means"** plain-language gloss for non-expert investors.

**Also fix in this ticket:**

- Mislabeled "Recent activity" → split into proper `home.topHoldings` and `home.recentActivity` (from `useActivity()`).
- Reconcile portfolio totals: `useSimulation` seeds from `mayaPositions` + `mayaBrokerAccount` so Home/Portfolio/Account all show the same equity.

**Files touched:**

- `apps/web/app/us/app/home/page.tsx` (rewrite)
- new: `apps/web/app/us/app/_components/dashboard/{AccountStateCard,ManagedExecutionCard,DisclosureStatusCard,BrokerStatusCard,ComplianceStatusCard,NextActionCard,OpenExceptionsCard,DataFreshnessFooter}.tsx`
- `apps/web/app/_hooks/useSimulation.ts` (seed from fixtures; keep `isSimulated: true`)
- `apps/web/app/us/_content/app-copy.ts` (add `home.cards.*` copy with "What this means" lines)

**Acceptance:** dashboard does not present P&L as the primary content; all 8 cards render; every numeric value is consistent with the underlying fixture; "What this means" text is reviewed for plain-language clarity (Flesch-Kincaid grade ≤ 10).
**Owner:** UI + product
**Blockers:** MIG-P2.5-02, MIG-P2.5-05, MIG-P2.5-20
**Complexity:** L (uprated from S — full redesign)

### MIG-P2.5-10 — Persona switcher (dev / staging only)

**Title:** Add a dev-only persona switcher (header pill, cookie-backed) that the MSW handler reads to pick fixtures.
**Files touched:**

- new: `apps/web/app/us/app/_components/PersonaSwitcher.tsx`
- `apps/web/app/us/app/layout.tsx`
- `packages/api-clients/src/mocks/handlers.ts`

**Acceptance:** in dev, the switcher offers Maya / David / Sofia; in prod (`NEXT_PUBLIC_REFI_ENV=prod`) it does not render.
**Owner:** UI
**Blockers:** MIG-P2.5-02
**Complexity:** S

### MIG-P2.5-11 — Broker-stale state UI + MSW event

**Title:** Render a warning banner on portfolio/home when `BrokerConnection.status !== "connected"` or when a `data_stale` flag is set; copy lives in `_content`.
**Files touched:**

- `apps/web/app/us/app/home/page.tsx`
- `apps/web/app/us/app/portfolio/page.tsx`
- `apps/web/app/us/_content/app-copy.ts`
- `packages/api-clients/src/generated/api.ts` (add `data_stale?: boolean` to `BrokerConnection`)
- `packages/api-clients/openapi/refi-api.yaml`
- `packages/api-clients/src/mocks/handlers.ts`
- `packages/api-clients/src/mocks/fixtures/sofia.ts`

**Acceptance:** Sofia persona renders a stale-data warning; Maya does not.
**Owner:** UI + Daniel for the schema
**Blockers:** MIG-P2.5-04 schema work
**Complexity:** M

### MIG-P2.5-12 — Recommendation lifecycle endpoints (accept / reject / request-review)

**Title:** Add `PATCH /v1/recommendations/:id` with status transitions; surface "Reject" and "Request manual review" buttons on the detail page alongside "Approve".
**Files touched:**

- `packages/api-clients/openapi/refi-api.yaml`
- `packages/api-clients/src/generated/api.ts`
- new: `packages/api-clients/src/hooks/recommendations.ts` (extend with mutations)
- `packages/api-clients/src/mocks/handlers.ts`
- `apps/web/app/us/app/recommendations/[id]/page.tsx`
- `apps/web/app/us/_content/app-copy.ts`

**Acceptance:** every rec status reachable from UI; activity feed reflects the action; compliance gate still binds Approve.
**Owner:** UI + Daniel
**Blockers:** MIG-P2.5-04
**Complexity:** M

### MIG-P2.5-13 — Logo + brand chrome

**Title:** Ship SVG logo component, favicon set, OG image, brand voice doc.
**Files touched:**

- new: `packages/ui/src/components/Logo.tsx`
- new: `apps/web/public/logo.svg`, `apple-touch-icon.png`, `favicon.ico`, `og.png`
- new: `apps/web/app/opengraph-image.tsx`
- `apps/web/app/us/page.tsx` (header), `apps/web/app/us/disclosures/page.tsx` (header), `apps/web/app/us/onboarding/layout.tsx` (header), `apps/web/app/us/app/_components/NavSidebar.tsx`
- new: `refi-build-docs/spec-current/04-brand-voice.md`

**Acceptance:** every header that currently renders text-only `usBrand.productSurface` renders `<Logo />`.
**Owner:** Design + UI
**Blockers:** logo asset from design
**Complexity:** M

### MIG-P2.5-14 — Onboarding "Simulated Onboarding" banner + post-mock reality check

**Title:** Add a top-of-onboarding banner clarifying that in the current build KYC, broker, and strategy are using sandbox/simulated providers; do not allow accidental "real activation" while disclosures are pending.
**Files touched:**

- `apps/web/app/us/onboarding/layout.tsx`
- `apps/web/app/us/_content/onboarding.ts`

**Acceptance:** copy reviewed; banner appears on every `/us/onboarding/*` route; activation page already disabled by `disclosures: false` — no behavior change, only clarity.
**Owner:** UI + compliance
**Blockers:** counsel-approved copy
**Complexity:** S

### MIG-P2.5-15 — E2E coverage for fail-closed and persona scenarios

**Title:** Verify Playwright specs assert: Submit disabled on REVIEW/DENY/UNAVAILABLE; activation disabled when disclosures pending; broker-stale banner appears for Sofia; copy scanner CI green.
**Files touched:**

- `apps/web/e2e/recommendations.spec.ts` (extend)
- `apps/web/e2e/onboarding.spec.ts` (extend)
- new: `apps/web/e2e/compliance-fail-closed.spec.ts`
- new: `apps/web/e2e/persona-switch.spec.ts`

**Acceptance:** CI green; coverage report names every fail-closed branch.
**Owner:** UI
**Blockers:** MIG-P2.5-02, MIG-P2.5-03, MIG-P2.5-10
**Complexity:** M

### MIG-P2.5-16 — MSW handlers: x-correlation-id echo + CSRF check

**Title:** Make every MSW handler echo `x-correlation-id` and (for state-changing methods) require `x-csrf-token` matching the cookie, mirroring production middleware contracts.
**Files touched:**

- `packages/api-clients/src/mocks/handlers.ts`

**Acceptance:** the client-side correlation-id rotation path is exercised in tests; missing CSRF returns 403 in dev.
**Owner:** UI
**Blockers:** none
**Complexity:** S

### MIG-P2.5-17 — Replace hardcoded `Maya May 2026` timestamps in activity fixture

**Title:** Compute activity timestamps relative to "now" so the activity page never looks stale.
**Files touched:**

- `packages/api-clients/src/mocks/fixtures/maya.ts`, `sofia.ts`
- `packages/api-clients/src/mocks/handlers.ts` (transform on the fly: e.g., now-2h, now-1d)

**Acceptance:** timestamps render as "2 hours ago", "yesterday" rather than "May 14".
**Owner:** UI
**Blockers:** MIG-P2.5-02
**Complexity:** S

### MIG-P2.5-18 — Document a sentry/posthog/OTel verification checklist

**Title:** Confirm Sentry DSN, PostHog key, OTel exporter are firing in staging; document the dashboard URLs in `refi-build-docs/`.
**Files touched:**

- new: `refi-build-docs/spec-current/05-observability-verification.md`
- (no code change unless gaps found)
  **Owner:** DX
  **Blockers:** staging env access
  **Complexity:** S

### MIG-P2.5-19 — RecommendationDetail deep contract

**Title:** Replace shallow `Recommendation` (symbol/action/confidence) with full `RecommendationDetail` schema enabling investor-grade explanations and audit linkage.

**Schema (handwritten extension in `refi-api.yaml` until Daniel publishes):**

```ts
type RecommendationDetail = {
  id: string;
  account_id: string;
  title: string;
  recommendation_type:
    | "buy"
    | "sell"
    | "rebalance"
    | "hold"
    | "risk_reduction"
    | "cash_deployment";
  status:
    | "new"
    | "delivered"
    | "eligible"
    | "executed"
    | "review"
    | "denied"
    | "expired"
    | "dismissed";
  generated_at: string;
  expires_at: string;
  advisory_context: {
    profile_version: string;
    strategy_version: string;
    model_version: string;
    disclosure_version_set: string;
    execution_policy_version: string;
  };
  recommendation: {
    symbol?: string;
    name?: string;
    side?: "buy" | "sell" | "hold";
    quantity?: number;
    notional_usd?: number;
    order_type?: "market" | "limit";
    limit_price?: number;
    time_in_force?: "day" | "gtc";
  };
  explanation: {
    summary: string;
    why_now: string;
    why_this_fits_profile: string;
    portfolio_impact: string;
    risk_notes: string[];
    cost_notes: string[];
    tax_notes: string[];
  };
  model_factors: Array<{
    name: string;
    direction: "positive" | "negative" | "neutral";
    weight: number;
    explanation: string;
  }>;
  guardrails: Array<{
    code: string;
    label: string;
    status: "pass" | "warn" | "fail";
    current_value?: number;
    limit_value?: number;
    message: string;
  }>;
  automation_eligibility: {
    status: "ALLOW" | "REVIEW" | "DENY";
    source: "cache" | "fresh" | "simulated" | "mock";
    reasons: Array<{ code: string; message: string }>;
    checked_at: string;
    expires_at: string;
  };
  record: {
    record_id: string;
    audit_hash: string;
    explorer_status: "pending_phase_3" | "available";
  };
};
```

**Files touched:**

- `packages/api-clients/openapi/refi-api.yaml` (add `RecommendationDetail`, `AutomationEligibilityCheck`, `GuardrailCheck`, `ModelFactor`, `DecisionRecordPreview` schemas)
- `packages/api-clients/src/generated/api.ts` (mirror types)
- `packages/api-clients/src/hooks/recommendations.ts` (`useRecommendationDetail` returns `RecommendationDetail`)
- `apps/web/app/us/app/recommendations/[id]/page.tsx` (render explanation block, model factors table, guardrails strip, advisory_context footer with version hashes, record-id with "Phase 3" tag on audit_hash)
- Maya/Sarah persona files (provide 2+ full RecommendationDetail records each)
- `apps/web/app/us/_content/app-copy.ts` (section labels)

**Acceptance:** recommendation detail page no longer depends on `symbol/action/confidence`; renders `why_now`, `why_this_fits_profile`, `portfolio_impact`, all three notes lists, model factors with weights, guardrails with pass/warn/fail; advisory_context version footer present; audit_hash shown with explorer-pending state.
**Owner:** UI + Daniel
**Blockers:** none (handwritten yaml until Daniel ships)
**Complexity:** L

### MIG-P2.5-20 — Deterministic scenario simulation engine

**Title:** Replace `useSimulation`'s `Math.random()` price-walk with a deterministic scenario engine driven by a typed timeline. Production never exposes scenario controls.

**Layout:**

```
apps/web/app/_simulation/
  scenario-engine.ts
  scenario-engine.test.ts
  scenarios/
    balanced-growth-normal.ts
    broker-stale-data.ts
    compliance-review.ts
    drawdown-warning.ts
    partial-fill.ts
    rejected-order.ts
    disclosure-blocked.ts
```

**Type:**

```ts
type SimulationScenario = {
  id: string;
  label: string;
  description: string;
  simulated: true;
  backendReplacement: {
    owner: "Daniel backend";
    endpointGroup: string;
    expectedPhase: "Phase 2" | "Phase 3";
    notes: string;
  };
  timeline: Array<{ atMs: number; eventType: string; payload: unknown }>;
};
```

**Files touched:**

- `apps/web/app/_hooks/useSimulation.ts` (rewrite — consume scenario from `?scenario=` or cookie; default `balanced-growth-normal`)
- new: scenario engine + 7 scenario files above
- new: `apps/web/app/us/app/_components/ScenarioSwitcher.tsx` (dev/staging only, `NEXT_PUBLIC_REFI_ENV !== 'prod'`)
- `apps/web/app/us/app/layout.tsx` (mount switcher conditionally)

**Acceptance:** identical inputs produce identical outputs across runs; Playwright snapshots stable; switcher does not render in prod build; each scenario advances the same lifecycle every time; `isSimulated: true` still surfaced.
**Owner:** UI
**Blockers:** MIG-P2.5-02
**Complexity:** L

### MIG-P2.5-21 — Backend contract map + inline `BACKEND_DEPENDENCY` annotations

**Title:** Persist the Daniel-backend dependency inventory as a maintained doc + add inline JSDoc above every temporary MSW handler so the replacement path is obvious in code.

**Doc format (`docs/backend-contract-map.md`):** one section per dependency with: screen, component, hook, current source, mock source, real endpoint, Daniel owner area, replacement condition, failure state, fail-closed rule.

**Inline annotation pattern (above every temp handler):**

```ts
/**
 * BACKEND_DEPENDENCY:
 * Owner: Daniel backend
 * Real endpoint: POST /orders/preview
 * Required before: live managed execution
 * Current behavior: MSW fixture returns ALLOW for in-range qty and DENY above 1000
 * Replacement: remove this handler from browser dev once Compliance Adapter staging endpoint is live
 * Fail-closed rule: no Submit button without fresh ALLOW
 */
```

**Files touched:**

- new: `docs/backend-contract-map.md` (or `refi-build-docs/spec-current/06-backend-contract-map.md`)
- new: `docs/daniel-backend-dependencies.md` (Daniel-facing handoff doc enumerating expected endpoints + payload shapes)
- every handler in `packages/api-clients/src/mocks/handlers.*` gets a `BACKEND_DEPENDENCY` JSDoc

**Acceptance:** every backend-blocked feature listed in Area 5 has an entry in `backend-contract-map.md`; every MSW handler that is a temp stub carries the JSDoc block; doc has a "last reviewed" date.
**Owner:** UI + Daniel for accuracy
**Blockers:** none
**Complexity:** M

### MIG-P2.5-22 — Split MSW handlers per-domain + contract tests

**Title:** Break `handlers.ts` (233 LOC, all surfaces) into per-domain files with a single composing index; add contract tests that validate every fixture against OpenAPI types and assert handler invariants.

**Layout:**

```
packages/api-clients/src/mocks/
  handlers.ts                 # composes all domain handler arrays
  handlers.auth.ts            # /auth/*, /siwe/*
  handlers.ccid.ts            # /ccid/*, /compliance/invalidate-cache
  handlers.brokers.ts         # /v1/brokers/*
  handlers.orders.ts          # /orders/*, /orders/preview
  handlers.recommendations.ts # /v1/recommendations/*
  handlers.activity.ts        # /v1/activity
  handlers.documents.ts       # /v1/documents/*
  handlers.support.ts         # /v1/support/*
  handlers.eligibility.ts     # legacy MSW handler (kept for parity but deprecated)
  handlers.account.ts         # /v1/profile, /v1/strategies/current, /v1/account/*
  handlers.admin.ts           # future admin surfaces
  fixtures/
    personas/   (from -02)
    compliance/ (from -03)
    brokers/
    documents/
    activity/
    records/
  __tests__/
    handlers.contract.test.ts      # x-correlation-id echo, CSRF on writes, typed responses
    fixtures.schema.test.ts        # every fixture parses through its OpenAPI type
    compliance-preview.test.ts     # all 7 named verdicts produce expected UI state
```

**Acceptance:**

- every handler returns `x-correlation-id` echoed from request (or generated)
- every state-changing handler validates `x-csrf-token` matches cookie (mirrors `proxy.ts:115-126`)
- no handler returns a generic `{ ok: true }` unless the OpenAPI declares an `OkResult` shape
- every fixture validates against OpenAPI types in `fixtures.schema.test.ts`
- `pnpm -F @refi/api-clients test` exits 0
- no MIG-P1-10 regressions

**Owner:** UI / mocks
**Blockers:** MIG-P2.5-02 (persona layout), MIG-P2.5-04 (schema), MIG-P2.5-16 (corr-id/CSRF)
**Complexity:** L

### MIG-P2.5-23 — Support boundary classifier (regex → categorized rule engine)

**Title:** Replace `support-boundary.ts` regex list with a typed classifier producing a `category` + `boundary_rule_id`; include both in submit payload; scrub blocked prompt content from analytics.

**Layout:**

```
apps/web/app/us/_lib/support-boundary/
  classifier.ts
  blocked-patterns.ts
  categories.ts
  support-boundary.test.ts
```

**Categories (11):**

- `allowed_technical`
- `allowed_broker_connection`
- `allowed_document_explanation`
- `allowed_billing`
- `allowed_general_platform`
- `blocked_buy_sell_advice`
- `blocked_recommendation_approval`
- `blocked_portfolio_change`
- `blocked_custom_strategy`
- `blocked_model_override`
- `complaint`

**Submit payload contract:**

```ts
{
  category: SupportCategory
  message: string
  classification: { confidence: number; matched_patterns: string[] }
  blocked: boolean
  boundary_rule_id: string | null
  correlation_id: string
}
```

**Analytics rule:** PostHog event `support_ticket_submitted` carries only `{ category, blocked, boundary_rule_id }` — **never** the message text. Same for `support_ticket_blocked`.

**Files touched:**

- new: 4 files in `apps/web/app/us/_lib/support-boundary/`
- `apps/web/app/us/app/support/page.tsx` (consume classifier instead of inline regex)
- `apps/web/app/api/us/support/route.ts` (accept and forward `category` + `boundary_rule_id`)
- `packages/api-clients/openapi/refi-api.yaml` (`SupportTicketCreate` schema with category + boundary_rule_id)
- `packages/api-clients/src/mocks/handlers.support.ts` (return 422 for blocked categories)

**Regulatory framing:** this implements the Rule 203A-2(e)(3) advisory-personnel-boundary requirement, not a product preference. Reference in code comment.

**Acceptance:** every blocked-advice prompt returns `blocked: true` with a non-null `boundary_rule_id`; complaint category submits successfully; analytics never receives prompt text; unit tests cover all 11 categories with 3+ example prompts each.
**Owner:** UI + compliance review on categories
**Blockers:** none
**Complexity:** M

---

### Suggested merge / dropping of likely-already-suggested tickets

- **GPT-suggested "implement copy-scanner"** → merged into **MIG-P2.5-08** (it was specced but never built).
- **GPT-suggested "wire real Alpaca OAuth"** → out of scope for P2.5; backend dependency, deferred until Daniel ships.
- **GPT-suggested "build admin dashboard"** → drop; `/admin` is Phase 4. P2.5-01 returns 404 for now.
- **GPT-suggested "explorer (Merkle viewer)"** → in P2.5-01 as Phase 3 placeholder card only; full build deferred to Phase 3 per `02-phase-2-build-plan.md:20`.

---

**End of audit.** Total: **23 tickets** — 7 L, 11 M, 5 S. Roughly **6–8 engineer-weeks sequential**, ~4–5 weeks with two engineers in parallel on UI vs schema tracks.

**Suggested execution waves:**

- **Wave 1 (foundation, ~1 week):** -01 placeholder routes, -13 brand chrome, -16 corr-id/CSRF, -17 relative timestamps, -21 backend contract map
- **Wave 2 (data depth, ~1.5 weeks):** -02 personas, -19 RecommendationDetail, -03 verdict matrix, -22 split handlers + tests, -04 schema validation
- **Wave 3 (product polish, ~1.5 weeks):** -20 scenario engine, -09 dashboard redesign, -05 simulated badges, -06 disclosure model, -14 onboarding banner, -11 broker-stale UI
- **Wave 4 (cleanup, ~1 week):** -07 copy migration, -08 blocked-terms scanner, -10 persona switcher, -12 rec lifecycle, -23 support classifier, -15 E2E, -18 observability doc
