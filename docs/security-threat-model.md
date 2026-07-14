# Security Threat Model (S7)

**Version:** v1 (2026-07-13), Sprint 4 doc deliverable per Sprint Plan v3.
**Scope:** the four highest-value surfaces in `refi-us-sec-ia`:

1. Auth chain (session cookie → JWT verify → AuthSessionLink → account scope)
2. Admin-portal proxy (BFF ↔ Daniel's Admin Portal at `ADMIN_PORTAL_BASE_URL`)
3. SSE bridge (`/api/v1/investor/stream`)
4. Signup funnel store (`alpha-application` + `alpha-handoff-jti`)

**Method:** STRIDE per surface. Each threat is mapped to an **existing
control** (linked to file:line where it lives) or an **open ticket**
tracked in the Gap Register V3.

**Non-goals of this doc:** exhaustive review of Next.js internals,
Cloud Run infra threats (owned by Daniel + platform), and TLS
correctness (managed by Cloud Run's terminator).

---

## 1. Auth chain

**Boundary:** the user's browser presents a `us_session_v1` cookie; the
BFF verifies it and resolves an `AuthContext` with `authId` +
optional `accountId` from `AuthSessionLink`.

**Code:** `apps/web/src/lib/bff/auth.ts`.

### Threats

| #   | STRIDE                 | Threat                                                                       | Control                                                                                                                                                                                                                                                               |
| --- | ---------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Spoofing               | Forged session token accepted as valid identity                              | `auth.ts` calls `jwtVerify` with pinned alg + iss + aud (S1). A forge with a wrong secret → 401. Covered by `e2e/auth.spec.ts` "forged token is rejected".                                                                                                            |
| A2  | Spoofing               | Expired session token silently degraded to dev fallback                      | `auth.ts:36-63` — if a token is present, it MUST verify; the dev fallback fires only when no token is presented AND `REFI_ENV != prod`. The server-only `REFI_ENV` is used, not the public `NEXT_PUBLIC_REFI_ENV`.                                                    |
| A3  | Tampering              | Session-cookie tampering via `Set-Cookie` injection through response headers | Cookies are set only via `next.cookies.set()` from `/api/v1/auth/*` routes (Contract V3 §12). No header write path derives values from user input.                                                                                                                    |
| A4  | Repudiation            | User denies performing a mutating action                                     | Every mutation appends an `InvestorActionReceipt` (`receipt.ts`), which the durable driver retains per S3.                                                                                                                                                            |
| A5  | Info disclosure        | Session secret leaked via error message or log                               | `auth.ts` never logs the token; `getServerEnv()` returns the secret only to code that needs it. Sentry scrubbing config strips `SESSION_JWT_SECRET`.                                                                                                                  |
| A6  | Denial of service      | JWT verify chain forced expensive on every request                           | jose is O(1) HS256 verify; no DB round-trip per verify. AuthSessionLink lookup hits the durable KV (Firestore) which caps per-request cost. Rate limiting per session lands Sprint 6 (**open**: task #16).                                                            |
| A7  | Elevation of privilege | Session bound to account A used to access account B                          | Two layers: (a) `getAuthContext()` resolves `accountId` from `AuthSessionLink` — the caller cannot supply it. (b) `admin-portal-proxy/acl.ts:enforceAccountScope()` rejects mismatches with a structured audit line. Fuzz-tested in `admin-portal-proxy-acl.spec.ts`. |
| A8  | Elevation              | JWT audience confusion — token for another service replayed here             | `auth.ts` pins `iss` + `aud` at verify; a token minted for another audience is 401.                                                                                                                                                                                   |

### Residual risk

- **Session revocation** — the S1 register mentions a revocation list
  keyed by session id. Not yet implemented; a stolen valid token is
  usable until `exp`. **Open** (Sprint 6 hardening).

---

## 2. Admin-portal proxy

**Boundary:** every investor call that reads or mutates Admin Portal state
transits `apps/web/src/lib/admin-portal-proxy/` (`client.ts` for
transport, `acl.ts` for account scoping, `endpoints/*.ts` for
per-route strict projections).

### Threats

| #   | STRIDE            | Threat                                                                          | Control                                                                                                                                                                                                                                                                                                                    |
| --- | ----------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Spoofing          | Caller-supplied `x-investor-account-id` header used to escalate scope           | `client.ts:180-190` — the header is set from `req.accountId`, which comes from the auth-derived `AuthContext`. Caller headers on the inbound request are dropped by `bffRead`/`bffMutate` before they reach the proxy. `admin-portal-proxy.spec.ts` "spoofed x-investor-account-id header cannot escalate scope" verifies. |
| P2  | Tampering         | Path traversal from a caller-supplied path segment routes to a foreign upstream | `client.ts:127-146` — `buildUrl()` resolves `path` against the pinned `ADMIN_PORTAL_BASE_URL` via the URL constructor and asserts `origin === pinned origin`. A path like `//evil.com/x` collapses to the pinned origin. SSRF closed by construction (S4d).                                                                |
| P3  | Repudiation       | Upstream call has no trace                                                      | Every call generates a W3C `traceparent` (`client.ts:105`), returns it in `ProxyResponse.traceparent`, and forwards `x-correlation-id`.                                                                                                                                                                                    |
| P4  | Info disclosure   | Admin-only fields on upstream response leak to investor UI                      | Every endpoint module uses `.strict()` schemas that name admin fields explicitly (`WIRE_ADMIN_FIELDS`) so the projection drops them (S4a). Property-based fuzz `scripts/proxy-redaction-fuzz.ts` injects sentinels into every endpoint's `WIRE_ADMIN_FIELDS` and asserts none survive.                                     |
| P5  | Info disclosure   | Unknown upstream field silently passed through                                  | Same `.strict()` schemas reject any unrecognized field. If the upstream ships a new field, the parse fails closed and the endpoint returns 500 until the schema is updated + reviewed (S4a).                                                                                                                               |
| P6  | Info disclosure   | Cross-account read via a legitimate query pattern (e.g. `account_id=other`)     | `acl.ts:enforceAccountScope()` runs before every proxy call; a mismatch throws `AclViolationError` → 403 + structured audit log.                                                                                                                                                                                           |
| P7  | Denial of service | Slow upstream backpressures the BFF into thread starvation                      | `client.ts:180-186` — `AbortSignal.timeout(10s)` on every request; circuit breaker opens after 5 consecutive failures per (path, method) for a 30-s cooldown.                                                                                                                                                              |
| P8  | Denial of service | Retry storm on a persistent 5xx                                                 | Jittered exponential backoff (100/200/400 ms base ± 50%), max 3 attempts, 4xx never retries.                                                                                                                                                                                                                               |
| P9  | Elevation         | Route file added to `apps/web/app/api/*` without allowlisting                   | `scripts/route-manifest-check.ts` fails CI when a route file exists that isn't in `route-manifest.json` (S4b).                                                                                                                                                                                                             |
| P10 | Elevation         | New admin-portal endpoint module added without a JSON Schema export             | `scripts/export-contract-schemas.ts` compares the endpoint module count to the SPEC list and fails loud if they diverge. Regenerates the `manifest.json` sha256 set that Daniel's D7 job validates against.                                                                                                                |

### Residual risk

- **Upstream trust.** The proxy assumes the upstream reports the right
  `account_id` on each row. Cross-account leakage from _upstream_ is not
  detectable by the projection layer; the belt-and-braces ACL is the
  BFF's defense. **Mitigated** by D7 (Daniel's schema validation
  bidirectional enforcement, Sprint 5 activation).
- **Cache poisoning.** The per-account LRU cache in `cache.ts` keys on
  `(accountId, path, method, query)`. A poisoned response for account A
  cannot serve account B; poisoning A itself requires a compromised
  upstream, in which case P2/P6 already apply.

---

## 3. SSE bridge

**Boundary:** `apps/web/app/api/v1/investor/stream/route.ts` establishes a
`text/event-stream` response by fetching Admin Portal `/api/v1/stream`,
parses each `data:` frame with the strict envelope from
`endpoints/stream.ts`, and forwards only events whose `account_id`
matches the caller's authoritative `accountId`.

### Threats

| #   | STRIDE            | Threat                                                     | Control                                                                                                                                                                                                                                                           |
| --- | ----------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Info disclosure   | Cross-account event forwarded to browser                   | `endpoints/stream.ts:parseSseDataLine()` drops any event whose `account_id !== accountId`. The filter runs in the BFF; the browser never observes cross-account frames. Contract-tested in `contract-assertions.ts` "SSE bridge drops events for other accounts". |
| S2  | Info disclosure   | Upstream emits a new field the redaction layer hasn't seen | Strict envelope: `wireStreamEventSchema.parse()` throws on unknown fields; the route closes with `strict_envelope_violation:<message>`. Fail-closed.                                                                                                              |
| S3  | Spoofing          | Attacker with stale session keeps stream open indefinitely | Route arms a 15-s auth re-verify interval; any failure closes with `event: auth_expired`. Session revocation (residual A9) tightens this once landed.                                                                                                             |
| S4  | Repudiation       | Which events reached the client is unrecoverable           | Every emitted event carries `correlationId` from the BFF request; upstream `x-correlation-id` is threaded end-to-end. Cloud Run captures the enqueue log lines.                                                                                                   |
| S5  | Denial of service | Long-lived stream leaks a Cloud Run instance thread        | Route uses `ReadableStream` (Node runtime) with cancel + upstreamAbort. Cloud Run request timeout terminates zombie streams; a broken pipe from the client cancels the outer ReadableStream, which aborts upstream.                                               |
| S6  | Denial of service | Malformed SSE frame from upstream stalls the parser        | Line-by-line parsing on `\n`; strict-parse throws close the stream rather than block.                                                                                                                                                                             |

### Residual risk

- **Reconnection stampede** — a mass client-side reconnect after a
  deploy overwhelms the upstream. **Open**: Sprint 6 adds rate limiting
  tuned tighter on stream routes (task #16).

---

## 4. Signup funnel store

**Boundary:** the F-track two-step signup writes to `alpha-application`
(KV keyed by canonicalized email) and, for game-first entrants, to
`alpha-handoff-jti` (single-use jti consumed set). Routes:

- `POST /api/v1/investor/alpha-application` (step 1: email + UTM)
- `PATCH /api/v1/investor/alpha-application` (step 2: qualification)
- `POST /api/v1/investor/alpha-claim` (game handoff, Sprint 3 sync 1)

### Threats

| #   | STRIDE            | Threat                                                                              | Control                                                                                                                                                                                                                                    |
| --- | ----------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | Spoofing          | Forged AlphaHandoffToken → foreign game player attached to a real waitlist row      | `/alpha-claim` verifies ES256 signature against `ALPHA_HANDOFF_PUBLIC_KEY_JWK` (server env, not NEXT_PUBLIC); iss/aud/exp pinned; alg pinned; 5s clock tolerance. Failure → 401 alerted.                                                   |
| F2  | Tampering         | Replay of a valid token to bind the same `alphaPlayerId` twice                      | `alpha-handoff-jti` entity uses atomic `putIfAbsent` on the durable driver; second claim with the same jti returns the existing binding rather than allocating a duplicate (idempotent per §2.3).                                          |
| F3  | Tampering         | Behavioural dimensions smuggled through the claim                                   | Strict Zod claim schema on the decoded JWT. Extra keys reject with 401. Also enforced upstream at mint (game side, §2.2).                                                                                                                  |
| F4  | Repudiation       | Alpha-claim applied but no evidence retained                                        | Every accepted claim writes to `alpha-application` (`handoffClaimedAt`, `alphaPlayerId`, snapshot ref, arena summary). PostHog `handoff.claimed` fires.                                                                                    |
| F5  | Info disclosure   | Waitlist enumeration via email probe (POST returns 200 whether email exists or not) | Step 1 is idempotent-on-email: an existing row is silently updated; a new row is created. The response shape is identical either way. No user-visible signal that an email is or isn't in the store.                                       |
| F6  | Info disclosure   | Scoring rubric or admin view served to investor                                     | The route returns `score` on the response envelope but not the absolute rank or breakdown weights. Admin-only view (position-in-line, referral count) lives in a separate operator surface out of this repo, per Sprint Plan v3 §Sprint 3. |
| F7  | Denial of service | Mass sign-up spam inflates the store and skews scoring                              | No captcha at launch per Sprint Plan v3 §Sprint 1 F-track. Rate limits arrive Sprint 6 (task #16). The waitlist scoring rubric down-weights unqualified rows so spam is noise, not signal.                                                 |
| F8  | Elevation         | Cross-origin POST from a hostile site drains addresses                              | Origin/Referer allowlist via `enforceCsrfOrigin` — a cross-origin browser fetch is 403.                                                                                                                                                    |

### Residual risk

- **Disposable emails.** Permitted per §2.5 abuse note. Quality
  filtering is the scoring rubric's job, not the intake gate.
- **Email confusion between game/waitlist/product.** Handled at intake
  by `emailKey()` normalisation (subaddress collapse, case fold);
  the KYC identity becomes canonical downstream.

---

## 5. Cross-cutting

Threats that span all four surfaces.

| #   | STRIDE                      | Threat                                                             | Control                                                                                                                                                                                                                        |
| --- | --------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| X1  | Info disclosure via headers | Missing CSP / HSTS lets wallet-lib supply-chain surface exfiltrate | `next.config.ts` sets strict CSP (nonced scripts, connect-src allowlist for WalletConnect + PostHog + Sentry + Admin Portal origin, `frame-ancestors 'none'`), HSTS `max-age=63072000; includeSubDomains; preload`, COOP/CORP. |
| X2  | Supply chain                | Malicious dependency shipped via a compromised package             | `pnpm audit --prod` + `gitleaks` gates in CI; all GitHub Actions pinned by commit SHA (S6). Renovate opens PRs; a security-relevant bump triggers the same review path as any other PR.                                        |
| X3  | Info disclosure via logs    | Cloud Run logs leak secret material                                | Centralised secret list scrubbed by Sentry; the audit line schemas in `acl.ts`, `alpha-claim/route.ts`, etc. name their fields explicitly rather than dumping request bodies.                                                  |
| X4  | Repudiation                 | An examiner cannot reconstruct a session's events end-to-end       | Every request has `x-correlation-id`; every mutation writes an `InvestorActionReceipt`; every read of records/documents writes a `RecordAccessLog` entry (S4c completeness); the durable driver retains both.                  |

---

## 6. Coverage matrix

Every threat above is covered by one of:

- a strict schema / property-based fuzz test (P4, P5, S1, S2, F3)
- a contract assertion in `scripts/contract-assertions.ts`
- an E2E spec in `apps/web/e2e/`
- an env / build-time gate (P9, P10, X2)
- explicit residual risk called out with an owner (**open** tickets)

Any threat that lands here without a control gets a Gap Register entry
before this doc merges. The doc is the audit anchor, not a wishlist.
