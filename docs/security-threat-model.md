# Security Threat Model — refi-us-sec-ia

Status: living document. Owner: Zeshan (security). Review cadence: each phase gate
and after any change to the auth chain, the BFF request path, or the game handoff.

Scope: the investor-facing shell and its BFF (`apps/web`). The trading engine,
broker integration, and Spanner books-of-record live in `refinity-main` and are
covered by that repo's authoritative contracts; this model covers only the
surfaces this repo owns and the seams where it trusts another system.

Method: STRIDE (Spoofing, Tampering, Repudiation, Information disclosure, Denial
of service, Elevation of privilege) over each trust boundary. Each threat maps to
an existing control or an open issue.

---

## 1. Trust boundaries

| #   | Boundary                                               | Direction         | Trust established by                                                                 |
| --- | ------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------ |
| B1  | Browser → BFF (`/api/v1/investor/*`, `/api/us/*`)      | inbound           | session cookie (`us_session_v1`) verified in `bff/auth.ts`; same-origin on mutations |
| B2  | ReFi Alpha game → BFF (`/api/v1/investor/alpha-claim`) | inbound           | ES256 AlphaHandoffToken, iss/aud/exp pinned, single-use jti                          |
| B3  | BFF → Admin Portal proxy (`refinity-main`)             | outbound          | service-to-service token, pinned base URL (Phase 2.6; not yet on `main`)             |
| B4  | BFF → prototype/durable store                          | internal          | process-local; server-only                                                           |
| B5  | Browser → wallet stack (WalletConnect relay, RPC)      | outbound (client) | user's wallet; SIWE signature                                                        |
| B6  | Middleware (`proxy.ts`) route gating                   | inbound           | cookie presence + security headers                                                   |

---

## 2. STRIDE by surface

### 2.1 Authentication chain (B1) — `bff/auth.ts`, `proxy.ts`

- **Spoofing — forged/absent session token.** Control: `getAuthContext` must verify
  a present `us_session_v1` (HS256 pinned) and reject on failure; the dev fallback
  is gated on the server-only `REFI_ENV` (only `dev`), so staging/prod fail closed.
  _History:_ the pre-hardening code failed open (verify-failure → dev identity, gate
  on client-visible `NEXT_PUBLIC_REFI_ENV`) — fixed in #23/#31. **Residual:** no
  `iss`/`aud`/revocation on the session JWT (#24); the session mint site is upstream
  (MSW today) and must sign with the same `SESSION_JWT_SECRET`.
- **Elevation — eligibility cookie as identity.** The dev fallback derives an id from
  the self-mintable `us_eligibility_v1` cookie. Control: fallback disabled outside
  `REFI_ENV=dev`. Never enable `dev` on an internet-reachable deploy.
- **Tampering — CSRF on mutations.** Control: `bffMutate` enforces same-origin
  (Origin/Referer vs `req.nextUrl.origin`) before auth (#26); edges pinned by
  contract assertions (null/deceptive/mismatched/malformed declarations all
  403). The formerly-planned double-submit token was REMOVED 2026-08-25
  (CS-02) — it was issued but never echoed or validated, and is not part of
  the current architecture; the tripwire pins its identifiers against silent
  reintroduction.
- **DoS — unauthenticated floods.** Control: rate limiting on `/api/us/eligibility`
  and `/api/us/support` only. **Residual:** investor mutation routes are unthrottled;
  the in-memory limiter is per-instance (#26 — needs a distributed store).
- **Repudiation.** Control: every mutation writes an append-only
  `InvestorActionReceipt`; every record read writes a `RecordAccessLog`. **Residual:**
  records live on ephemeral disk (#27); index reads and 404s are not fully logged.

### 2.2 Game handoff (B2) — `alpha-claim/route.ts`

- **Spoofing — forged handoff token.** Control: ES256 signature verified against a
  server-only public JWK; `iss=refi-alpha`, `aud=refi-us-sec-ia`, `exp` enforced.
- **Replay — reused jti.** Control: single-use consumed-jti guard, idempotent binding.
  **Residual:** guard is prototype-grade (filesystem TOCTOU); needs durable
  conditional write before scaled prod (#18); no `exp ≤ 10 min` max-age check (#21).
- **Information disclosure — behavioral data crossing the boundary.** Control: strict
  Zod claim allowlist rejects the ten `DimensionCode` scores and any unknown claim
  (spec §6.6). This is the compliance-critical control and is tested.
- **Tampering — cross-origin POST.** Control: route-local same-origin check.

### 2.3 Outbound proxy (B3) — Phase 2.6, not yet on `main`

- **SSRF.** Control (branch): base URL pinned from server env, no request-derived URL
  segments. **Information disclosure — admin fields leaking to investor.** Control
  (branch): `.strict()` redaction schemas reject unknown upstream fields. Until the
  proxy lands, investor routes read fixtures/prototype store (no live upstream).

### 2.4 State store (B4) — `prototype-store/store.ts`

- **Tampering / DoS — lost or raced writes.** The store is filesystem JSON, single
  process, non-atomic `putIfAbsent`. **Residual:** books-and-records durability +
  atomicity require the durable driver (#27). Raw email is stored unhashed for the
  waitlist entity (#27 note).

### 2.5 Wallet stack (B5)

- **Supply chain / information disclosure.** wagmi/RainbowKit/WalletConnect load on
  the entire `/us/*` subtree and can reach any `https:`/`wss:` origin under the
  current CSP. **Residual:** tighten `connect-src` to an allowlist and code-split the
  wallet to the SIWE flow (#30).

### 2.6 Edge / headers (B6) — `proxy.ts`, `next.config.ts`

- Controls present: nonce CSP, HSTS (2y, preload), `X-Frame-Options: DENY` /
  `frame-ancestors 'none'`, `nosniff`, referrer + permissions policy, `/admin` 404.
- **Residual:** `connect-src 'self' https: wss:` is over-broad (#30); `style-src`
  allows `'unsafe-inline'`.

---

## 3. Assets ranked

1. Investor session integrity (B1) — impersonation enables state changes on a
   regulated account. **Highest.**
2. Books-and-records integrity/durability (B4) — Rule 204-2 obligation.
3. Behavioral-data boundary (B2) — regulatory + privacy (spec §6.6).
4. Handoff token secrecy/replay (B2).
5. Client-side wallet surface (B5).

## 4. Open risk register (maps to issues)

| Risk                                 | Sev      | Issue   | State                              |
| ------------------------------------ | -------- | ------- | ---------------------------------- |
| Auth fail-open                       | Critical | #23     | fix in #31                         |
| Session secret name mismatch         | Critical | #24     | partial in #31                     |
| Hardcoded audit-HMAC fallback        | High     | #25     | fix in #31                         |
| No CSRF/rate-limit on mutations      | High     | #26     | CSRF fixed in #31; rate-limit open |
| Ephemeral books-and-records          | High     | #27     | open                               |
| Missing IR runbook                   | High     | #28     | this PR                            |
| CI security gates absent             | High     | #29     | this PR (partial)                  |
| Handoff jti not durable / no exp-max | Med      | #18/#21 | open                               |
| CSP too broad / wallet not split     | Med      | #30     | open                               |

## 5. Assumptions & non-goals

- The session JWT is minted by a trusted upstream (MSW now, `auth-siwe` later) that
  holds `SESSION_JWT_SECRET`; this repo only verifies.
- Broker/exec/Spanner threats are out of scope (owned by `refinity-main`).
- This model assumes deploys set `REFI_ENV` to `staging`/`prod` on all reachable
  environments; `dev` mode is local/CI only.
