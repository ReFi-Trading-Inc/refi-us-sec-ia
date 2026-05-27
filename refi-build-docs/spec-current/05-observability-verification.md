# Observability Verification

**Owner of this doc:** UI / DX. **Updated by:** whoever lands a telemetry change.
**Last reviewed:** 2026-05-19

This is the operational source-of-truth for the frontend observability stack: what's wired, where, how to verify it's actually firing, and where to look during an incident. Daniel's `Observability Spec and Alerts-as-Code.pdf` covers the backend service mesh (Prometheus, OTel server spans, PagerDuty); this doc covers everything that runs in the browser or in `apps/web/`.

---

## 1. Stack at a glance

| Tool                | Purpose                                                              | Initialized when                                                    | Source files                                                            |
| ------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Sentry**          | Error reporting + session replay                                     | `NEXT_PUBLIC_REFI_ENV === "prod"` AND `NEXT_PUBLIC_SENTRY_DSN` set  | `sentry.{client,server,edge}.config.ts`                                 |
| **PostHog**         | Product analytics (typed events only — no PII, no full-message text) | `NEXT_PUBLIC_REFI_ENV === "prod"` AND `NEXT_PUBLIC_POSTHOG_KEY` set | `app/_providers/analytics/PostHogProvider.tsx`, `app/_lib/analytics.ts` |
| **OpenTelemetry**   | Server-side trace export to OTLP collector                           | Node runtime only (Edge runtime skips)                              | `instrumentation.ts`                                                    |
| **Structured logs** | Route-handler JSON logs (eligibility, support)                       | Always-on; `console.info(JSON.stringify(...))`                      | `app/api/us/*/route.ts`                                                 |

All four are no-ops in dev/staging unless the corresponding env vars are set. Dev never accidentally writes to production Sentry/PostHog.

---

## 2. Per-tool wiring

### 2.1 Sentry

**Initialization:**

- `apps/web/sentry.client.config.ts` — browser; loads `@sentry/nextjs` only when `NEXT_PUBLIC_REFI_ENV === "prod"`.
- `apps/web/sentry.server.config.ts` — Node runtime (route handlers).
- `apps/web/sentry.edge.config.ts` — Edge runtime (middleware).

**Sample rates:**

- `tracesSampleRate: 0.1` (10% of transactions sampled for performance)
- `replaysOnErrorSampleRate: 1.0` (100% of sessions where an error occurs)
- `replaysSessionSampleRate: 0.01` (1% of all sessions, regardless of errors)

**CSP allowlist:** `apps/web/proxy.ts:10-32` adds the Sentry ingest host to `connect-src` in prod only. Without this, beacons would be blocked.

**Required env vars:** `NEXT_PUBLIC_SENTRY_DSN` (zod-validated as URL in `src/lib/config/env.ts`).

**What gets sent:**

- Unhandled errors (browser + server)
- Caught errors via `Sentry.captureException` (no current call sites — opportunity to add at boundary catches)
- Session replays (1% baseline, 100% on error)

**What does NOT get sent:**

- IP addresses (Sentry's default IP scrubbing is on)
- Document acknowledgment localStorage values
- KYC document content (never touches UI)
- Wallet private keys (UI only ever signs SIWE messages via wagmi)

### 2.2 PostHog

**Initialization:** `apps/web/app/_providers/analytics/PostHogProvider.tsx` calls `posthog.init()` inside a `useEffect` gated by `isProd && posthogKey`. Returns the unwrapped children when disabled, so dev/staging never load posthog-js code.

**Config:**

- `capture_pageview: false` — UI controls pageview events explicitly; PostHog autocapture is off to keep the event surface small and reviewable.
- `capture_pageleave: true` — needed for session-duration calculations.
- `persistence: "localStorage"` — survives across browser tabs.

**Event taxonomy:** all events declared in `apps/web/app/_lib/analytics.ts`:

| Event name                    | Where fired                                                                                                                       | Properties                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `eligibility_submitted`       | `apps/web/app/api/us/eligibility/route.ts` (server-emitted via console for now; wire to backend PostHog server SDK in production) | `{result, state, rule_id, rule_version}` — no IP, no DOB                      |
| `siwe_completed`              | `app/_hooks/useSiweAuth.ts`                                                                                                       | `{wallet_id}` — wallet address hash recommended (not yet wired)               |
| `onboarding_broker_connected` | `app/us/onboarding/broker/page.tsx`                                                                                               | `{broker_id, environment}`                                                    |
| `onboarding_risk_completed`   | `app/us/onboarding/profile/page.tsx`                                                                                              | `{goal, time_horizon, risk_tolerance}`                                        |
| `compliance_preview_returned` | `app/us/app/_components/CompliancePreview.tsx` (onVerdict prop)                                                                   | `{status, source, latency_ms}` — extend with `policy_version` per MIG-P2.5-19 |
| `order_submitted`             | `app/us/app/recommendations/[id]/page.tsx`                                                                                        | `{symbol, side, qty, client_order_id}`                                        |
| `support_ticket_submitted`    | `app/us/app/support/page.tsx` (currently a comment — see MIG-P2.5-23 follow-up)                                                   | `{category, blocked, boundary_rule_id}` — **never message text**              |

**Hook:** `useAnalytics()` returns `{ track(event, props) }`. The track function reads `window.posthog?.capture` — safe-by-default when posthog is unloaded (e.g. dev).

**Required env vars:** `NEXT_PUBLIC_POSTHOG_KEY` (required in prod), `NEXT_PUBLIC_POSTHOG_HOST` (defaults to `https://app.posthog.com`).

**CSP allowlist:** `proxy.ts:28` adds posthog host to `connect-src` in prod only.

### 2.3 OpenTelemetry

**Wiring:** `apps/web/instrumentation.ts` — Next.js auto-loads this on server boot. Only the Node runtime path is wired; Edge runtime is skipped because the OTel Node SDK isn't Edge-compatible.

**Exporter:** OTLP HTTP, defaults to `http://localhost:4318/v1/traces`. Override with `OTEL_EXPORTER_OTLP_ENDPOINT`.

**Auto-instrumentations:** `@opentelemetry/auto-instrumentations-node` covers `http`, `fetch`, `pg`, `redis`, and most common Node modules. Custom UI spans are not yet defined — opportunity to add per-screen render spans in a future ticket.

**Correlation:** `apps/web/proxy.ts:50-54` extracts/generates `x-correlation-id` per request. MSW handlers echo it back (`_shared.ts:corrIdFrom()`). When OTel collects traces it should inject the trace-id but does not currently thread the UI's `x-correlation-id` into span attributes — outstanding gap, flagged in `07-daniel-blueprint-alignment.md §10`.

**Required env vars:** `OTEL_EXPORTER_OTLP_ENDPOINT` (optional; defaults shown above).

### 2.4 Structured logs

Two server route handlers emit JSON-line logs that are PII-scrubbed by construction:

**`/api/us/eligibility`** (`route.ts:100-108`)

```
{event, ts, result, state, rule_id, rule_version, ip_hash, ua_hash}
```

- Raw IP / UA are HMAC-SHA256 hashed with `IP_HASH_SECRET` before any log line is written.
- DOB is parsed for age and never logged.

**`/api/us/support`** (`route.ts:80-90` post-MIG-P2.5-23)

```
{event, ticket_id, category, boundary_rule_id, correlation_id}
```

- Message text NEVER logged. Server-side support-boundary classifier re-validates and 422s on `blocked: true`.
- Per `04-brand-voice.md` and SEC Rule 203A-2(e)(3).

---

## 3. Verification checklist

Run after every staging deploy and before any production cutover. Each item should be checkable in <5 minutes.

### 3.1 Sentry

- [ ] Trigger a synthetic browser error: open browser console on staging and run `throw new Error("sentry-staging-smoke")`. Confirm event appears in Sentry dashboard within 2 minutes.
- [ ] Confirm IP addresses are stripped on the Sentry event detail (Sentry default IP scrubbing).
- [ ] Confirm `release` tag matches the deployed commit SHA. (Set via `SENTRY_RELEASE` env var in CI build step — opportunity to wire.)
- [ ] Verify session replay shows masked PII (Sentry's `maskAllText: true` is the default for `replayIntegration()`).

### 3.2 PostHog

- [ ] Open staging in incognito; complete eligibility form. Confirm `eligibility_submitted` event in PostHog Live Events with no IP / no DOB / no email.
- [ ] Confirm `support_ticket_submitted` carries `{category, blocked, boundary_rule_id}` only — no `message`, no `subject` content.
- [ ] Confirm pageviews are NOT captured (we use `capture_pageview: false`).
- [ ] Confirm `pageleave` events do fire (needed for session duration).
- [ ] Verify the event-property allowlist matches §2.2 table.

### 3.3 OpenTelemetry

- [ ] Start a local Jaeger/Otel-collector via `docker run -p 4318:4318 jaegertracing/all-in-one`; hit `/api/us/eligibility`; confirm a trace appears with a span for the route handler.
- [ ] In staging, confirm OTel collector is reachable from the Next.js Node runtime (`OTEL_EXPORTER_OTLP_ENDPOINT` resolves).
- [ ] Verify trace IDs propagate from middleware → route handler → outbound `fetch` to Daniel's backend (once staging endpoints are reachable).

### 3.4 Structured logs

- [ ] Submit a successful eligibility form; tail server logs; confirm exactly one `eligibility_submitted` JSON line with HMAC-hashed IP/UA.
- [ ] Submit a blocked support prompt ("Should I buy NVDA?"); confirm server returns 422 BLOCKED_BY_POLICY and writes NO log line containing the word "NVDA" or the full message body.
- [ ] Run `grep` over recent log output for `IP_HASH_SECRET` / `ELIGIBILITY_JWT_SECRET` — must return zero matches (secret never logged).

### 3.5 CSP

- [ ] On a staging page with browser console open, confirm zero CSP violations.
- [ ] Verify `Content-Security-Policy` header in network tab includes `https://*.ingest.sentry.io` and `https://app.posthog.com` (or your configured hosts) in `connect-src`.

### 3.6 Privacy controls

- [ ] No raw IP in any browser-side request body, Sentry event, or PostHog property. (HMAC-hashed at server when needed.)
- [ ] No KYC document data anywhere; UI only sees `{provider, provider_reference, status}`.
- [ ] No wallet private key anywhere; UI signs SIWE messages through wagmi only.
- [ ] No support-message text in PostHog or analytics logs.
- [ ] No document hash + user-id combinations that could re-identify acknowledgments (acks are localStorage-only until the Document Registry ships).

---

## 4. Dashboards

Real URLs go here when staging/prod tooling is provisioned. Placeholder pattern below; replace `<env>` with `staging` or `prod`.

| Tool             | Purpose                                             | URL (to fill in)                                                              |
| ---------------- | --------------------------------------------------- | ----------------------------------------------------------------------------- |
| Sentry           | Error rate, p95 transaction duration, replay browse | `https://sentry.io/organizations/refi/issues/?project=<id>&environment=<env>` |
| PostHog          | Funnels, event counts, session recordings           | `https://app.posthog.com/project/<id>/events`                                 |
| Jaeger / OTel UI | Trace exploration                                   | `https://traces.<env>.refi.trading` (TBD)                                     |
| Vercel / Netlify | Build + deploy logs                                 | `https://app.vercel.com/refi-trading-inc/<repo>`                              |

---

## 5. Required environment variables

These are validated by zod at process boot (`apps/web/src/lib/config/env.ts`) — boot fails fast in prod if any are missing.

| Var                           | Scope           | Required when                                           |
| ----------------------------- | --------------- | ------------------------------------------------------- | ------- | ----- |
| `NEXT_PUBLIC_REFI_ENV`        | client + server | always; one of `dev                                     | staging | prod` |
| `NEXT_PUBLIC_SENTRY_DSN`      | client          | prod (validated as URL)                                 |
| `NEXT_PUBLIC_POSTHOG_KEY`     | client          | prod                                                    |
| `NEXT_PUBLIC_POSTHOG_HOST`    | client          | optional; defaults to `https://app.posthog.com`         |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | server          | optional; defaults to `http://localhost:4318/v1/traces` |
| `SESSION_SECRET`              | server          | always; min 32 chars                                    |
| `IP_HASH_SECRET`              | server          | always; min 32 chars; rotates IP-hash domain            |
| `ELIGIBILITY_JWT_SECRET`      | server          | always; min 32 chars; signs eligibility JWT             |

---

## 6. Incident response — where to look first

| Symptom                                        | First look                                                                             | Then                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Sudden spike in browser errors                 | Sentry → Issues → most-recent-error trail                                              | Check Sentry replay for one affected session                      |
| Compliance preview returning DENY for everyone | Sentry server errors + structured logs for `compliance_preview_returned status:"DENY"` | Verify `/orders/preview` connectivity from staging                |
| Support tickets failing to submit              | Server logs for `support_ticket_created` count drop                                    | Check rate-limiter state (`rateLimit` module)                     |
| Onboarding drop-off jumps                      | PostHog funnel: eligibility → SIWE → KYC → broker → activation                         | Look for the specific step where users abandon                    |
| CSP violations in console                      | Browser DevTools network panel → response headers → `Content-Security-Policy`          | Check `apps/web/proxy.ts:14-44` allowlist                         |
| OTel traces missing for a Node deploy          | Container logs for OTel SDK init errors                                                | Verify `OTEL_EXPORTER_OTLP_ENDPOINT` reachable from the container |

---

## 7. Known gaps + planned work

| Gap                                                                                          | Owner   | Ticket                                                |
| -------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------- |
| `policy_version` not threaded into `compliance_preview_returned` PostHog event               | UI      | MIG-P2.5-19 follow-up                                 |
| `support_ticket_submitted` not yet emitting (only a comment in support page)                 | UI      | MIG-P2.5-23 follow-up                                 |
| OTel doesn't thread `x-correlation-id` from UI middleware into server span attributes        | UI / DX | MIG-P2.5-18-bis (this file)                           |
| No `Sentry.captureException` boundary catches in route handlers                              | UI      | follow-up                                             |
| No `SENTRY_RELEASE` injected at build time                                                   | DX      | follow-up                                             |
| Daniel's backend events (`audit.evt`, `orders.evt`) not yet visible from frontend dashboards | Daniel  | depends on `07-daniel-blueprint-alignment.md` cutover |

---

## 8. Change log

- 2026-05-19 — Initial publication (MIG-P2.5-18). Documents the wiring shipped through Wave 3 of MIG-P2.5.
