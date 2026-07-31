# Phase 2.7 Daniel Direction Resolution

**Date:** 2026-07-28
**Source:** Daniel's written integration-direction message (received 2026-07-28).
**Status:** **Authoritative.** This is the first Daniel direction with verifiable
written provenance since 2026-05-29. Where it conflicts with the decisions
recorded on 2026-05-30, **this document wins.**

**Supersedes:**

- [`phase2-6-signal-to-investor-product-contract-v3.md`](phase2-6-signal-to-investor-product-contract-v3.md) §13.1, §13.2, §13.3, §13.6
- [`phase2-6-admin-portal-api-consumption-map.md`](phase2-6-admin-portal-api-consumption-map.md) (entire integration path)
- [`phase2-6-account-prefs-history-options.md`](phase2-6-account-prefs-history-options.md) §6 Option 3c
- [`phase2-6-next-pr-sequence.md`](phase2-6-next-pr-sequence.md) PR-E
- [`phase2-6-gap-register-v3-against-authoritative.md`](phase2-6-gap-register-v3-against-authoritative.md) ratification block

---

## 0. Process note — the provenance caveat was correct

On 2026-07-24 a caveat was added to the V3 gap register warning that the six
"Daniel ratifications" recorded on 2026-05-30 carried no linked source, and that
Daniel's verifiable 2026-05-29 message expressed only a _preference_ for
Option 3 ("likely best"), not a ratification of the 3c hybrid.

That caveat is now vindicated. Of the six recorded ratifications, Daniel's
written direction **overturns two outright** (§13.2 Admin Portal ACL, §13.6
audit packet), **materially rewrites one** (§13.1 AccountPrefs architecture),
and **changes the membership of a fourth** (§13.3 verb allowlist). Only §13.4
and §13.5 survive substantially intact.

**Durable rule going forward:** a decision enters the contract only with a
linked, quotable source. "Recorded as ratified" is not a ratification.

**Cost containment:** the damage is confined to documents. No Admin Portal
client was ever built — `apps/web/src/lib/admin-portal-proxy/` does not exist,
and the only code references to the Admin Portal are a tripwire denylist entry
(`scripts/tripwire-investor-boundary.ts:36`) and a source comment
(`apps/web/src/lib/sec203a/admin-verbs.ts:6`). PR-E was planned but never
started. Had PR-E shipped on schedule, this letter would have invalidated a
large, security-sensitive module.

---

## 1. Environment and sequencing

### Daniel's direction

`refinity-dev` is the only active deployment, intentionally. Backend and
frontend integration completes in dev and produces a reproducible first dev
release **before** staging and production enter CI/CD.

### What this invalidates

Every prior plan that treated staging as the integration target, and the
production `NEXT_PUBLIC_API_BASE_URL` of `https://api.refi.trading` (which does
not resolve — tracked as D4 in
[`mock-boundary-map.md`](mock-boundary-map.md)).

### Phase 2.7 interpretation

- Integration target is **`refinity-dev`**. Staging is out of scope until the
  dev release is reproducible.
- Promotion sequence is: dev release reproducible → conformance + isolation
  tests pass → promote **the same versioned infrastructure and immutable
  images** to staging → validate release candidate → first production Signal
  cohort → Managed paper trading only after paper execution/control scenarios
  pass.
- `api.dev.refi.trading` is a nice-to-have; the generated Cloud Run URL is
  sufficient to begin.

---

## 2. Identity, sessions, and account mapping (closes D8)

### Daniel's direction

`identity-ccid` is the investor identity and onboarding service. It issues a
stable **opaque `user_id`**. Email addresses, IdP subjects, and wallet addresses
are _linked identifiers_, not user or account IDs.

`Accounts.account_id` (Spanner) remains the investor account ID. **One
authenticated user maps to zero, one, or many accounts** via `Accounts.user_id`.
Every account request is re-authorized against that relationship; a BFF- or
browser-supplied `account_id` is never sufficient on its own.

The **investor BFF owns the browser session**. After email verification,
identity-ccid issues a short-lived, single-use signed assertion (or
authorization-code exchange); the BFF validates it and mints its own secure,
HTTP-only, server-side session. The assertion uses asymmetric signing with a
published JWKS and carries issuer, audience, subject, iat/exp, replay,
auth-time, verified-email, and auth-method claims.

**Mutable facts are not embedded as durable token permissions.** KYC,
eligibility, advisory-profile status, consent, trading authorization, and
account membership are checked against current backend state on every request.

Email-first onboarding (magic link or verification code) is approved and must
not require a wallet. **`auth-siwe` is not the primary login integration**; it
may later verify a wallet signature to link an address to an existing `user_id`
where there is a defined authorization purpose.

identity-ccid owns initial transactional creation/linking of backend user and
account records. The Admin Portal account-population workflow is an internal
provisioning tool and **must not** back any public signup path.

Identity is separate from authorization: verified identity alone does not
satisfy jurisdiction, KYC, advisory-profile, disclosure, consent, broker, or
account-state gates.

### What this invalidates

1. **SIWE as the primary login.** The current funnel puts wallet connect ahead
   of identity (`mock-boundary-map.md` — wallet connect is REAL, SIWE verify is
   the MOCK boundary). Wallet moves off the critical path entirely; email
   verification becomes the identity step.
2. **The single-account assumption.** `AuthContext.accountId?: string`
   (`apps/web/src/lib/bff/auth.ts:19`) models one optional "primary trading
   account."
3. **Session-embedded entitlements**, wherever the BFF caches a gate verdict
   into the session rather than re-checking it.

### Latent defect this promotes to load-bearing

`apps/web/src/lib/prototype-store/entities/auth-link.ts` already keys links as
`${authId}__${accountId}` — the storage layer is multi-account capable. But
`getAuthSessionLink()` lists by `authId` prefix and returns `all[0]`:

```ts
const all = await links.list(`${authId}__`);
const first = all[0];
return first ? first.value : null;
```

Under Daniel's model a user with two accounts gets **whichever link the store
happens to return first** — a silent, non-deterministic account selection. This
is benign today only because every persona has exactly one account. It must
become an explicit account-selection step plus per-request re-authorization
before any multi-account fixture is loaded.

### Phase 2.7 interpretation

- `apps/web/src/lib/bff/auth.ts` remains the single swap point, as designed. It
  now swaps to: validate identity-ccid assertion against published JWKS → mint
  BFF session. Not to `auth-siwe`.
- `AuthContext` grows from `accountId?: string` to a `userId` (opaque) plus an
  explicitly selected `accountId`, with the selection re-authorized backend-side
  on every request.
- Every `/api/v1/investor/*` BFF route must treat `account_id` as a **claim to
  be verified**, never as an authorization.
- Signing moves from HS256 symmetric (current `SESSION_JWT_SECRET`) to
  asymmetric verification of the identity-ccid assertion. The BFF's own session
  cookie remains BFF-owned.
- MSW `/siwe/*` handlers are retired rather than swapped; new mocks are needed
  for the identity-ccid assertion exchange.

---

## 3. Backend projections — Admin Portal is rejected (overturns §13.2)

### Daniel's direction

> "I dont want the investor BFF to use the broad Admin Portal API as an interim
> investor boundary."

The Admin Portal is a privileged operator surface exposing broader data and
commands than an investor may use. Instead, a dedicated **`investor-api`**
service is being built now. It may reuse Admin Portal projection logic, but it
enforces account ownership, field allowlists, redaction, rate limits, and
investor-specific action auditing **at the backend boundary**.

### Initial integration contract

| Concern            | Value                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Environment        | `refinity-dev`                                                                                                                                    |
| API prefix         | `/api/v1/investor`                                                                                                                                |
| Service auth       | Google-issued OIDC tokens; dedicated frontend-BFF service account, investor-api only                                                              |
| Vercel → GCP auth  | Workload Identity Federation + service-account impersonation; **no long-lived JSON key**                                                          |
| User context       | Separate short-lived signed user/session assertion derived by the BFF from its validated session. **A plain user-ID header will not be trusted.** |
| Tracing            | Caller-generated `X-Correlation-ID`                                                                                                               |
| Mutations          | `Idempotency-Key` **required**                                                                                                                    |
| Contract version   | `v1.0.0-dev.1`, exported from the deployed revision with commit + image info                                                                      |
| Read timeout/retry | 10s total; ≤2 jittered retries on transient failure                                                                                               |
| Mutation retry     | **Never** retried blindly                                                                                                                         |
| Async actions      | `202 Accepted` + action receipt or status URL                                                                                                     |

### Streaming

Do **not** use Admin Portal `/api/v1/stream` — it is a global operator event
stream. The investor contract provides:

```
GET /api/v1/investor/accounts/{account_id}/events
```

Backend-filtered before emission, investor-safe event schema, with keepalives,
reconnection, and a durable cursor / `Last-Event-ID`. The BFF may proxy it but
**must not be the only account filter**.

### What this invalidates

- **[`phase2-6-admin-portal-api-consumption-map.md`](phase2-6-admin-portal-api-consumption-map.md) in its entirety** as an integration path. Its
  endpoint inventory retains value as a _projection-shape reference_, but no BFF
  route may target an Admin Portal endpoint.
- **PR-E as specified** (`apps/web/src/lib/admin-portal-proxy/` with per-endpoint
  ACL, TTL cache, SSE bridge, per-route Zod redaction). The BFF-side ACL was
  designed to be the investor security boundary; Daniel has moved that boundary
  into `investor-api`. PR-E shrinks from "build the security boundary" to "build
  a typed client for a backend that already enforces it."
- **Contract V3 §13.2** in full.
- The SSE bridge design against `/api/v1/stream`
  (`phase2-6-next-pr-sequence.md` PR-E, `sse.ts`).

### Phase 2.7 interpretation

- The BFF becomes a **typed client + session boundary**, not the ACL. Defence in
  depth still applies (the BFF should assert ownership too), but it is no longer
  the only thing standing between an investor and operator data. This is a
  materially better security posture and removes `GAP-ACL-005` as a Critical
  frontend-owned risk.
- **Naming collision to manage:** our browser-facing BFF routes are already
  namespaced `/api/v1/investor/*`, and Daniel's service-facing prefix is also
  `/api/v1/investor`. They are different hops. Docs and code must say
  "BFF route" vs "investor-api route" explicitly; a bare path is now ambiguous.
- Path shape differs from our plan: Daniel scopes by account in the path
  (`/accounts/{account_id}/...`) where we planned session-implicit paths
  (`/api/v1/investor/account-prefs`). Adopt Daniel's shape for the outbound
  client; the browser-facing BFF path may stay session-implicit.
- The tripwire should be **extended**: referencing an Admin Portal endpoint from
  an investor code path is now a contract violation, not merely a naming smell.

---

## 4. AccountPrefs writes and preference history (rewrites §13.1)

### Daniel's direction

`AccountPrefsHistory` lives in the **same Spanner database as `AccountPrefs`**.
Backend systems own both current preferences and durable history.

> "the frontend's interim history should not become the long-term system of
> record."

There is **one canonical transactional writer**. It updates `AccountPrefs` and
appends the history record **atomically**. Admin Portal and the investor path
use the same procedure; direct preference writes outside it are prohibited.

**Investor-editable fields — exactly four:**

- `drift_threshold`
- `min_order`
- `excluded_assets`
- `fractional_enabled`

`RiskLimits`, template risk settings, broker state, and operator/system controls
are **read-only**. The frontend **must not** add a capital-allocation percentage
control — it is not a current `AccountPrefs` capability.

**Every** preference write requires authenticated confirmation and an immutable
action receipt. A **fresh acknowledgment** of the current managed-preferences
disclosure is additionally required for changes that _expand_ trading:

- enabling fractional trading
- lowering the drift threshold
- lowering the minimum order
- removing an excluded asset

Restrictive changes get an action receipt but **no** new acknowledgment merely
for reducing activity. **This classification is a versioned backend policy, not
a frontend decision.**

Operator-assisted changes record the authenticated operator and `intervention_id`
separately from any investor authorization. History and referenced
consent/action receipts enter the existing seven-year retention and legal-hold
process. Salted IP and user-agent hashes are kept where available; device
fingerprinting is **not** required for alpha.

### BFF-facing routes

```
GET   /api/v1/investor/accounts/{account_id}/preferences
PATCH /api/v1/investor/accounts/{account_id}/preferences
GET   /api/v1/investor/accounts/{account_id}/preferences/history
```

This backend path is **required before the first dev release uses
investor-editable preferences to generate live account intents.**

### What this invalidates

**Option 3c is superseded.** The recorded 3c hybrid specified an `apps/common`
Python canonical writer _plus a TypeScript port in the BFF for reads and
validation_, held together by parity fixtures, plus a Python sidecar service.
Daniel's direction keeps the canonical transactional writer but says nothing
about a TS port or sidecar — and explicitly warns the frontend's interim history
must not become the system of record.

The simplification is real: the BFF consumes three REST routes. There is no TS
port to write, no parity-fixture harness to maintain, and no cross-language hash
agreement to prove. Everything in
[`phase2-6-account-prefs-history-options.md`](phase2-6-account-prefs-history-options.md)
§6 (Option 3c), §9 (conformance test), and §10 (sidecar deploy strategy) is
dropped.

Also invalidated: the "material change" list is **backend-owned and versioned**.
Any frontend logic classifying a change as material must call the backend or
render backend-supplied classification — it must not reimplement the rule.

### Phase 2.7 interpretation

- `GAP-PREFS-HISTORY-001`, `GAP-PREFS-WRITE-002`, `GAP-PREFS-AUDIT-003` are
  **resolved in architecture** and move to "blocked on `investor-api`
  deployment" — no longer blocked on a contract negotiation.
- Surface 4 (Account Controls Center) scope is now precisely bounded: an editor
  over exactly four fields, a read-only `RiskLimits` viewer, a consent
  acceptance flow, and a history viewer reading backend history.
- The BFF prototype-store `account-prefs-history` entity is explicitly
  **interim** and must carry that framing in code comments so it is never
  mistaken for the record of truth.
- Confirmed clean: a repo-wide grep for `capital_allocation`, `allocation_pct`,
  and `capital_usage` in `.ts`/`.tsx` returns **no matches**. No control needs
  removing; the constraint is forward-looking only.

> ### ⚠️ CORRECTION — 2026-07-30: the "confirmed clean" finding above was wrong
>
> The bullet immediately above is **retained as written** for provenance. It is
> incorrect, and this correction supersedes it.
>
> **What went wrong.** The check searched only snake_case identifiers —
> `capital_allocation`, `allocation_pct`, `capital_usage`. Those are backend
> `AccountPrefs` column spellings. The frontend does not name fields that way;
> it uses camelCase. The grep therefore could not have matched a frontend
> control no matter how many existed, and its "no matches" result carried no
> information about the thing it was asked to check.
>
> **What was actually there.** Seven investor-editable controls were live in the
> Automation Center (`/us/app/settings/automation`), persisted through
> `ExecutionPolicyDraft`, re-validated by the BFF draft route, hashed into the
> signed policy at activation, and covered by E2E specs:
>
> | Control                 | Category           | Daniel's rule                  |
> | ----------------------- | ------------------ | ------------------------------ |
> | `maxPositionSizeBps`    | Capital allocation | Must not exist on the frontend |
> | `minimumCashReserveBps` | Capital allocation | Must not exist on the frontend |
> | `maxSingleOrderUsd`     | Risk limit         | Backend-owned, read-only       |
> | `dailyOrderLimit`       | Risk limit         | Backend-owned, read-only       |
> | `dailyLossPauseBps`     | Risk limit         | Backend-owned, read-only       |
> | `drawdownPauseBps`      | Risk limit         | Backend-owned, read-only       |
> | `maxOpenOrders`         | Risk limit         | Backend-owned, read-only       |
>
> So §4's constraint was **not** forward-looking only. It required removals, and
> the incorrect finding is why they were not made on 2026-07-28.
>
> **Resolution (2026-07-30).** All seven were removed from the investor-editable
> surface and replaced by exactly the four approved `AccountPrefs` fields —
> `drift_threshold`, `min_order`, `excluded_assets`, `fractional_enabled` —
> across the draft entity, the BFF draft and policy routes, the Automation
> Center UI, the activation summary, the typed DTO, and the E2E fixtures. The
> backend-owned categories now render as a read-only panel rather than inputs.
> The activation `riskGuardrailHash` no longer covers backend risk limits, since
> hashing them would misrepresent them as investor-authorized.
>
> **Why it cannot recur.** The canonical field list lives in
> `apps/web/src/lib/sec203a/account-prefs.ts`, and a contract assertion — "No
> investor-editable capital-allocation or risk-limit control (camelCase +
> snake_case)" — now searches, across the storage entity, both BFF write
> routes, the activation route, the typed DTO, and the two rendering pages:
>
> - **snake_case** wire spellings (`max_position_size_bps`, …)
> - **camelCase** frontend field names (`maxPositionSizeBps`, …)
> - **`data-testid` attributes** (`draft-maxPositionSizeBps`, …) and visible
>   **control labels**, because the UI pages are in the scanned set
> - **semantic control names** by category — capital allocation and risk
>   limits — rather than a fixed literal list
>
> It was verified to fail on a reintroduced control rather than passing
> vacuously. The E2E spec carries the matching negative assertions that each
> removed control renders zero elements.
>
> **Durable lesson.** This is the same failure mode as the provenance caveat in
> §0, one layer down: a check was recorded as passing without confirming it
> could fail. A negative grep result is evidence only if the pattern would have
> matched the thing being looked for. Search the vocabulary the code actually
> uses, and prove the check fails before trusting that it passed.

---

## 5. Investor-safe backend actions (changes §13.3 membership)

### Daniel's approved action set

| Action                 | Status       | Constraint                                                                                                                                           |
| ---------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `join_template`        | Allowed      | Eligible account + approved, compatible template                                                                                                     |
| `leave_template`       | Allowed      | Stops future template-driven activity; **does not imply liquidation** of current positions                                                           |
| `update_prefs`         | Allowed      | Four fields only, through the canonical writer                                                                                                       |
| `pause_autopilot`      | Allowed      | Managed **paper** trading; must prevent new or increased exposure                                                                                    |
| `resume_autopilot`     | Allowed      | Only after all authorization/account/broker/control gates pass; **cannot clear a stronger restriction**                                              |
| investor `reduce_only` | **Allowed**  | Managed paper trading; may permit genuine reductions/closeouts, **cannot increase exposure**                                                         |
| `liquidate_all`        | **Deferred** | Until confirmation, position preview, step-up auth, idempotency, partial-fill, unknown-state, and lifecycle-evidence scenarios pass in paper testing |

Pause and reduce-only are recorded as **investor account-control requests**. The
backend computes the **strongest effective control** across investor, risk,
reconciliation, broker, and operator sources. Resume clears only the investor's
own request and never weakens a stronger restriction.

Investor cancellation of `pending_submit` orders **remains deferred** — the
state crosses Exec Gateway, Trade Manager, broker, partial-fill, and
reconciliation ownership boundaries. Pause means _no new or increased exposure_;
it does **not** promise every in-flight broker operation is cancellable.

### Records Center scope

The initial Records Center provides investor-safe **decision receipts** for
recommendations, account intents, risk results, profile/consent/template
versions, and correlation identifiers. **The full Admin Portal audit packet is
not exposed.** A separately allowlisted order/fill/reconciliation packet can
follow in the next alpha after authorization and redaction tests pass.

### Actions endpoint

```
POST /api/v1/investor/accounts/{account_id}/actions
```

Re-authorizes account ownership, applies current eligibility/consent/control
gates, requires step-up authentication where appropriate, enforces idempotency,
and creates an investor action receipt **before** publishing an approved backend
command.

Permanently excluded from the investor product: system-wide halts, direct
operator controls, reconciliation controls, manual rebalancing, force rebuild,
risk-limit changes, order fabrication, and risk-decision overrides. **A backend
risk rejection remains terminal for its intent** (consistent with Q1 of the
Phase 2.6 resolution).

### Code changes — applied 2026-07-28

`liquidate_all` appears in **two distinct vocabularies**. Only one changed —
conflating them would have corrupted the backend enum mirror:

1. **`INVESTOR_ADMIN_VERBS`** (`apps/web/src/lib/sec203a/admin-verbs.ts`) — the
   investor action allowlist. `liquidate_all` **removed**, `reduce_only`
   **added**; the set stays at exactly six. The mirrored literal in
   `scripts/contract-assertions.ts` moved in lockstep.
2. **`ACCOUNT_INTENT_KINDS`** (`apps/web/src/lib/sec203a/account-intents.ts`) —
   a mirror of Daniel's backend `models.py` `IntentKind` enum
   (`rebalance`, `signal_flip`, `liquidate_all`). **Left unchanged.** The
   backend still constructs liquidation intents; the investor simply cannot
   originate one. Its drift canary in `contract-assertions.ts` is untouched.

`liquidate_all` also moved **into** `ForbiddenInvestorAdminVerb`, so the
existing compile-time disjointness proof now enforces the deferral rather than
relying on review. This is a deferral, not a permanent exclusion — it returns
once the paper-testing scenarios pass.

`admin-verbs.ts` was re-anchored from `POST /api/v1/accounts/{id}/admin-actions`
to `POST /api/v1/investor/accounts/{account_id}/actions`, with the Admin Portal
`ACCOUNT_ADMIN_ACTIONS` reference retained only as historical lineage for the
verb spellings.

**Open item:** `reduce_only` is the literal Daniel used in prose. He also
describes pause and reduce-only as _account-control requests_ rather than plain
actions, so the exact wire spelling needs confirming against the exported
`v1.0.0-dev.1` contract in the connection package. `join_template`,
`leave_template`, and `reduce_only` are deliberately unmapped in
`INVESTOR_ACTION_TO_ADMIN_VERB` — no `InvestorActionName` originates them yet
(template join/leave lands with Surface 5, reduce-only with PR-H).

---

## 6. Gap register deltas

| Gap ID                  | Prior status                                           | Phase 2.7 status                                                                                                                            |
| ----------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `GAP-ACL-005`           | Critical — BFF-side ACL via patterns 1+2 (PR-E)        | **Reclassified.** Boundary moves into `investor-api`. BFF retains defence-in-depth ownership assertion. No longer a Critical frontend risk. |
| `GAP-ADMIN-API-004`     | High — Daniel to ratify consumption map route-by-route | **Closed / obsolete.** Admin Portal is not the integration path. Superseded by the investor-api contract.                                   |
| `GAP-PREFS-HISTORY-001` | Critical — architecture ratified, DDL pending          | **Resolved in architecture.** Backend-owned, same Spanner DB, atomic canonical writer. Blocked only on deployment.                          |
| `GAP-PREFS-WRITE-002`   | High — write procedure undefined                       | **Resolved.** Four fields, canonical writer, receipt + conditional re-ack, versioned backend policy.                                        |
| `GAP-PREFS-AUDIT-003`   | High — proof-of-consent + history view missing         | **Resolved.** Immutable action receipts; 7-year retention + legal hold; salted IP/UA hashes; no device fingerprinting for alpha.            |
| `GAP-CONTROL-INIT-011`  | Medium — `reduce_only` mapping pending from Daniel     | **Resolved.** Investor reduce-only approved for Managed paper. Backend computes strongest effective control.                                |
| `GAP-CANCEL-INIT-012`   | Low–Medium — conditional on counsel review             | **Deferred, confirmed.** Rationale is ownership-boundary, not solely counsel. Not in initial release.                                       |
| `GAP-AUDIT-PACKET-013`  | Medium — conditional, needs redaction schema           | **Narrowed.** Full audit packet **not** exposed. Decision receipts only; allowlisted order/fill/recon packet is next-alpha.                 |
| **`GAP-IDENTITY-018`**  | _(new)_                                                | identity-ccid assertion exchange + JWKS validation + BFF session mint. Replaces D8. Blocked on deployment.                                  |
| **`GAP-MULTIACCT-019`** | _(new)_                                                | One user → 0..N accounts. Account selection + per-request re-authorization. `getAuthSessionLink()` returns `all[0]`.                        |
| **`GAP-SVCAUTH-020`**   | _(new)_                                                | Vercel → GCP Workload Identity Federation + SA impersonation; OIDC token minting; no long-lived key.                                        |
| **`GAP-STREAM-021`**    | _(new)_                                                | Account-scoped SSE against `/accounts/{id}/events` with durable cursor / `Last-Event-ID`. Replaces the `/api/v1/stream` bridge.             |
| **`GAP-WIRE-022`**      | _(new)_                                                | `X-Correlation-ID`, `Idempotency-Key` on mutations, 10s/≤2-jittered-retry reads, no mutation retry, 202 + receipt handling.                 |

---

## 7. Revised PR sequence

PR-A through PR-D are unaffected in spirit; PR-D's content simplifies
substantially. PR-E is replaced.

| PR        | Revised scope                                                                                                                                                                                                                    | Blocked on                      |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **PR-C**  | Types realignment (unchanged) **plus** action-allowlist correction from §5 above                                                                                                                                                 | Nothing                         |
| **PR-D**  | AccountPrefs History — now a _consumption_ contract against Daniel's three routes. Drop the TS port, parity fixtures, sidecar, and DDL negotiation.                                                                              | Nothing (architecture resolved) |
| **PR-E′** | **Replaces PR-E.** Typed `investor-api` client: OIDC/WIF service auth, user-assertion derivation, correlation + idempotency headers, timeout/retry policy, 202 handling. No ACL module, no TTL cache, no Admin Portal endpoints. | Dev connection package          |
| **PR-E″** | Identity: identity-ccid assertion validation, JWKS, BFF session mint, multi-account selection + re-auth. Retire MSW `/siwe/*`.                                                                                                   | identity-ccid deployment        |
| **PR-F**  | Account Controls Center — four-field editor, read-only RiskLimits, consent flow, backend history viewer                                                                                                                          | PR-D + PR-E′                    |
| **PR-G**  | Records Center — decision receipts only; no audit packet                                                                                                                                                                         | PR-E′                           |
| **PR-H**  | Exception Review reframe + investor control requests (pause/resume/reduce-only)                                                                                                                                                  | PR-E′                           |

Daniel's stated frontend workstream, which needs no deployment to begin:

> "you can continue preparing the BFF client, session exchange boundary,
> schemas, mock-to-live adapters, and account-isolation tests against the
> contract above, but please do not wire the investor product directly to
> Admin Portal."

**Mock replacement order** (Daniel's sequence): accounts and templates → intents
and risk → records → preferences → streaming.

---

## 8. Still blocked — the dev connection package

Daniel will send these after `investor-api` deploys. Nothing in the outbound
client can be exercised end-to-end until then:

1. Dev API base URL (generated Cloud Run URL) and its **OIDC audience**
2. Workload Identity Federation configuration and identifiers
3. Seeded test IDs
4. Exported contract `v1.0.0-dev.1` with commit + image revision

Plus deterministic dev fixtures covering: a Signal-only account; an eligible
Managed-paper account; stale-profile and missing-consent cases; broker
disconnection; risk denial; reconciliation block; and **a separate user for
cross-account isolation tests** (which is what makes `GAP-MULTIACCT-019`
testable).

---

## 9. Compliance posture

Unchanged and, in two respects, strengthened:

- Risk rejection remains **terminal** for its intent — no investor override.
  Consistent with Phase 2.6 Q1.
- No per-trade accept; no staff/founder/support-mediated individualized advice.
  All existing tripwires hold.
- The first dev release is **Signal-only and exposes no path from investor
  actions to broker submission**. Managed is **paper-only** thereafter.
- The investor security boundary moves from the BFF into `investor-api`, so
  operator data is filtered before it crosses a network hop the frontend
  controls — a stronger 203A-2(e) posture than BFF-side redaction.
- Identity is explicitly separated from advisory authorization: verified
  identity alone satisfies no jurisdiction, KYC, profile, disclosure, consent,
  broker, or account-state gate.

---

## 10. Scope lock

No backend changes. No frontend product behavior changes from this document
alone. No SEC 203A-2(e) boundary weakened. No new investor surface added. Phase
2.6 documents are retained as historical evidence under supersession headers.
