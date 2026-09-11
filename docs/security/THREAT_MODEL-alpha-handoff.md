# Threat Model — Cross-Repo "Alpha Handoff" Trust Boundary

Scope: the trust boundary crossed when a player in the ReFi Alpha game is
handed off to the US investor platform via a signed JWT ("AlphaHandoffToken").
Read-only analysis of both repos. Every code claim carries a `file:line`
citation or is explicitly marked `UNVERIFIED` / `not yet implemented`.

Repos analyzed:

- **Game (token issuer)** — `ReFi/game/refi-man-vs-machine`
- **Platform (token consumer)** — `ReFi/Website/refi-us-sec-ia` (`apps/web`)

## 0. Which implementation is live (important)

There are **two** game-side signer implementations. They are mutually
exclusive; only one is wired to the platform verifier.

1. **CURRENT / authoritative — Cloud Run "mint-handoff" service.** On
   `origin/main` (commit `783a869`, 2026-07-25). Files: `services/handoff/src/*`,
   client `src/lib/handoff.ts`, `src/components/ClaimHandoffButton.tsx`.
   Progress claims are **server-derived from Postgres**. This is the version
   the platform's verifier is byte-compatible with (see
   `services/handoff/src/contract.ts:1` header, which names the platform
   `claimSchema` as its counterpart).
2. **SUPERSEDED — Supabase ES256 Edge Function.** On branch
   `feat/alpha-handoff-signer` (commit `1847484`, 2026-07-17), file
   `supabase/functions/alpha-handoff/index.ts`. **Older** (dated 8 days before
   #1) and **not** referenced by the shipped client: `src/lib/handoff.ts` on
   `origin/main` POSTs to a Cloud Run URL (`VITE_HANDOFF_URL`/`/mint-handoff`),
   not to a Supabase function. Treated here as design-stage/dead but analyzed
   because the task named an "ES256 Edge Function" and its weaknesses differ.
3. **IN FLIGHT — Firebase identity upgrade.** Uncommitted working-tree changes
   on branch `feat/verified-identity` add
   `services/handoff/src/firebase-auth.ts` (RS256 verify against Google JWKS)
   and a `requireVerifiedIdentity` gate to the mint handler. This is the
   partial fix for the `sub`-spoofing threat below; it is **not yet committed
   or enabled** (defaults to session-id fallback —
   `services/handoff/src/handler.ts` diff, `verifyIdentity?`/
   `requireVerifiedIdentity?` optional, `sub = req.sessionId` fallback).

Unless stated otherwise, "issuer" below means implementation #1.

---

## 1. System description (as implemented)

Numbered flow, issuer → transport → consumer → entitlement. Citations are the
CURRENT implementation.

1. **Player identity is generated client-side, unauthenticated.** The game
   creates a random `refi_session_id` in `localStorage` on first use.
   `ReFi/game/refi-man-vs-machine` `src/lib/supabase.ts:8-15`
   (`getSessionId()`). There is no server-side authentication of this id in
   the current path.
2. **Player clicks "CLAIM YOUR PROGRESS ON REFI".**
   `src/components/ClaimHandoffButton.tsx:34-40` calls `claimHandoff()`.
3. **Client POSTs to the mint service** with the client-held `sessionId` and a
   chosen `intendedDestination`.
   `src/lib/handoff.ts:29-41` (`fetch(HANDOFF_URL + "/mint-handoff", … body:
{ sessionId: getSessionId(), intendedDestination })`).
4. **Mint service accepts any string `sessionId`** — no auth, only a type
   check. `services/handoff/src/server.ts` (POST `/mint-handoff` handler:
   `if (typeof body.sessionId !== "string") throw new HttpError(400, …)`; CORS
   default `ALLOWED_ORIGIN = "https://play.refi.trading"`; per-IP in-memory
   rate limit `RATE_LIMIT_MAX` default 10/min).
5. **Progress is server-derived from Postgres, keyed by that `sessionId`.**
   `services/handoff/src/progress.ts:47-125` (`loadProgress` runs SQL against
   `arena_runs`, `player_profiles`, `module_unlocks`,
   `player_machine_versions`; each read `failSoft`s to zero). A tampered
   client cannot inflate _progress_ — but it fully controls _which_
   `sessionId`'s progress is read (see Threats).
6. **Claims are assembled and the token subject is set to the raw
   `sessionId`.** `services/handoff/src/handler.ts` (`mintHandoff`: `sub =
sessionId` via `loadProgress` → `input.sub = sessionId` in
   `progress.ts:113`; `progressSnapshotId = "snap_" + uuid`; `jti = newId()`;
   `buildHandoffClaims` in `contract.ts:80-140` clamps TTL to
   `HANDOFF_MAX_TTL_SECONDS = 600` and pins `iss="refi-alpha"`,
   `aud="refi-us-sec-ia"`).
7. **Token is ES256-signed** with the private JWK held only in the mint
   service's secret env. `services/handoff/src/sign.ts:1-43`
   (`loadPrivateJwk` validates EC P-256 + `d`; `signHandoff` sets
   `{alg:"ES256", kid?}`).
8. **Transport: the token is placed in the redirect URL query string.**
   `services/handoff/src/handler.ts` (`redirectUrl =
${base}/us/alpha-claim?token=${encodeURIComponent(token)}`). The client
   navigates there: `src/lib/handoff.ts:42-46`
   (`window.location.assign(data.redirectUrl)`).
9. **Consumer page loads** at `/us/alpha-claim`, force-dynamic, public (no
   session/eligibility gate — `proxy.ts:68-86` gates only `/us/auth/connect`,
   `/us/onboarding/*`, `/us/app/*`, not `/us/alpha-claim`).
   `apps/web/app/us/alpha-claim/page.tsx:11,19-54`.
10. **Client reads `?token=` and POSTs it once** to the claim API.
    `apps/web/app/us/alpha-claim/_components/AlphaClaimClient.tsx:49-68`
    (token from `useSearchParams`, `fetch("/api/v1/investor/alpha-claim",
{method:"POST", body: {token}})`; `ran` ref guards strict-mode double-run).
11. **Claim API: feature flag → same-origin → rate limit → verify → strict
    claims → max-age → bind → single-use jti.**
    `apps/web/app/api/v1/investor/alpha-claim/route.ts`:
    - flag `FLAG_ALPHA_CLAIM_ROUTE === "on"` else 404 (`:170-177`);
    - same-origin guard (`:129-162`, `:179-180`);
    - per-IP in-memory rate limit 30/10min (`:42`, `:182-189`);
    - `jwtVerify` pinned `algorithms:["ES256"]`, `issuer`/`audience` from env,
      `clockTolerance:5`, key from `ALPHA_HANDOFF_PUBLIC_KEY_JWK` via
      `importJWK(jwk,"ES256")` (`:214-236`);
    - strict Zod `claimSchema` (`:69-91`, `:240-248`) — rejects unknown claims,
      pins `iss`/`aud` literals, requires `exp`/`jti`, allows optional
      `iat`/`nbf`;
    - max-age check ≤ 600s + 5s (`:46-47`, `:251-262`);
    - `bindHandoff` writes the waitlist row (`:267-277`);
    - `consumeJtiIfAbsent` single-use jti (`:279-284`); replay returns the
      original binding and logs `alpha_claim_jti_replay` (`:290-299`).
12. **Entitlement granted = a waitlist AlphaApplication row only.**
    `apps/web/src/lib/prototype-store/entities/alpha-application.ts:135-197`
    (`bindHandoff` upserts a `player:<alphaPlayerId>` or email-keyed row with
    game progress + a waitlist `score`). **No investor session
    (`us_session_v1`), no eligibility cookie (`us_eligibility_v1`), and no
    wallet linkage are issued by this route** — verified: the route returns
    JSON only (`route.ts:301-313`) and sets no cookie.
13. **Redirect into the funnel entry.** On success the client waits 1.4s then
    `router.push("/us/eligibility")` — the _start_ of the funnel, not past it.
    `AlphaClaimClient.tsx:34,78-88`.

**Steps I could NOT confirm in code:** the actual production redirect origin
(`SHELL_BASE_URL` default `https://refi-us-sec-ia-web.vercel.app` in
`server.ts`, but the real deployed value is env-supplied — UNVERIFIED); how/if
`campaignSource` is set by the game UI (the client never sends it —
`handoff.ts:35-40` sends only `sessionId`+`intendedDestination`); and whether
production sets `REFI_BACKING__ALPHA_HANDOFF_JTI=durable` (defaults to
`prototype` — `apps/web/src/lib/config/backing.ts:33`).

---

## 2. Assets

| Asset                                  | Where it lives                                                                                                                   | What an attacker gains by compromise                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Alpha access / "claimed progress"      | Waitlist `AlphaApplication` row + `score` (`alpha-application.ts:80-104`)                                                        | Inflated/forged waitlist standing; a bound row under an arbitrary `alphaPlayerId`                                  |
| Investor session (`us_session_v1`)     | Issued by `identity-ccid`/MSW, verified in `bff/auth.ts:106-135`                                                                 | **NOT reachable via this route** — the claim route issues no session (see §1.12). This is the primary containment. |
| Eligibility gate (`us_eligibility_v1`) | Set only by `app/api/us/eligibility/route.ts:112`                                                                                | **NOT set by the claim route** — handoff cannot skip the eligibility funnel (§1.13).                               |
| Wallet linkage                         | `useSiweAuth` / auth-link, separated per commit `dc38fae`                                                                        | **NOT touched by this route** — no wallet code path from handoff.                                                  |
| PII                                    | Game token carries **none** by design (`contract.ts:1-12`, §6.6 behavioral scores excluded; strict `claimSchema` rejects extras) | Minimal: `sub` is an opaque id; `campaignSource` optional string; no email/name on the token                       |
| ES256 signing key                      | Private JWK in mint-service secret env (`sign.ts:11-19`); public JWK in platform env (`env.ts:46-53`)                            | Full token forgery if the private key leaks                                                                        |

Net: the blast radius is **waitlist-application integrity + PII-light game
progress**, not investor session/wallet/PII. The handoff is a _funnel-entry
credential_, not an authorization — matching the platform's stated model
(`bff/auth.ts:26-33` "identity is not authorization").

---

## 3. Trust boundaries

- **B1 — Game client ↔ mint service.** Browser SPA to Cloud Run. The client
  supplies `sessionId` and `intendedDestination`; the service trusts neither
  for integrity but currently trusts `sessionId` as _identity_
  (`server.ts`, `handler.ts` `sub = sessionId`). CORS default is the game
  origin, not `*` (`server.ts` `ALLOWED_ORIGIN`).
- **B2 — Mint service ↔ platform (offline, via signature).** The only shared
  secret is the asymmetric ES256 keypair; the boundary is enforced purely by
  signature + `iss`/`aud`/`exp` pinning (`route.ts:214-262`). No network trust,
  no shared session.
- **B3 — Token transport (URL / redirect / browser).** Token rides in a URL
  query param through a 302 redirect, browser address bar, history, and any
  page-load telemetry. `handler.ts` redirectUrl; `AlphaClaimClient.tsx:49-50`.
- **B4 — Platform session issuance.** The claim route deliberately does **not**
  cross into session issuance (`route.ts:301-313`). Session minting is a
  separate boundary (`bff/auth.ts`).

---

## 4. Threats (STRIDE per boundary)

### B1 — Game client ↔ mint service

**T1.1 (Spoofing) — Arbitrary `sub` / player-identity spoofing. CRITICAL-of-boundary; effective HIGH.**
The mint service authenticates nothing: any client can POST any `sessionId`
and receive a validly signed token whose `sub` is that string
(`server.ts` sessionId type-check only; `progress.ts:113` `sub = sessionId`).
Because the platform uses `claims.sub` as the durable `alphaPlayerId` join key
(`route.ts:269,281`; `alpha-application.ts:76,144`), an attacker can mint a
token binding a waitlist row under _any_ player id — pre-claiming, squatting,
or polluting another player's future email merge. Progress can't be inflated
(server-derived, `progress.ts`), but identity can be chosen freely.
Exploitability: trivial — a single unauthenticated `curl` to `/mint-handoff`.
Mitigation: **NONE in the shipped path.** Partial fix in flight but disabled:
`firebase-auth.ts` + `requireVerifiedIdentity` (uncommitted
`feat/verified-identity`, defaults to session-id fallback).
Severity: **HIGH** (contained to waitlist integrity; no session/PII).

**T1.2 (DoS / resource abuse) — Unauthenticated mint spam. MEDIUM.**
Public endpoint; only defense is per-instance in-memory rate limit
(`server.ts` `RATE_LIMIT_MAX` default 10/min/IP) — resets per instance and is
IP-based (trivially rotated). Mitigation: partial (rate limit + 16KB body cap
in `server.ts` `MAX_BODY_BYTES`). Cloud Armor/distributed limiter noted as
follow-on in the same file's comments. Severity: **MEDIUM.**

**T1.3 (Tampering) — Progress inflation on the token. LOW (mitigated).**
Claims are server-derived from Postgres, not client-asserted
(`progress.ts:31-46` docstring + queries). Client cannot raise
`completedArenas`/`machineBeatRate`. Mitigation present. Severity: **LOW.**
(Contrast: the SUPERSEDED edge function reads progress **directly from the
request body** — `supabase/functions/alpha-handoff/index.ts` `completedArenas
= body.completedArenas … Boolean(body.machineBuilderUnlocked)` — so _that_
implementation is CRITICAL for inflation and identity spoofing, and uses
`Access-Control-Allow-Origin: "*"`. Dead path, but must never be revived.)

### B2 — Mint service ↔ platform (signature boundary)

**T2.1 (Spoofing) — JWT `alg` confusion (alg:none / HS256-with-public-key). LOW (mitigated).**
Platform pins `algorithms:["ES256"]` and imports the key as an EC public key
(`route.ts:221-227`); `alg:none` and HS256-substitution are rejected by jose.
Mitigation present. Severity: **LOW.**

**T2.2 (Spoofing) — Key confusion via `kid`/`jku`/`x5u` header injection. LOW (mitigated).**
The platform ignores any token-supplied header key hints and verifies against a
single configured public JWK (`route.ts:217-221`). No JWKS URL is fetched. No
attacker-controlled key selection. Severity: **LOW.**

**T2.3 (Spoofing/Tampering) — Missing `aud`/`iss`/`exp`/`nbf` validation. LOW (mitigated).**
`jwtVerify` enforces `issuer`/`audience`/`exp`/`nbf` (`route.ts:222-227`), and
`claimSchema` re-pins `iss`/`aud` literals and requires `exp`/`jti`
(`route.ts:69-91`). Belt-and-suspenders. Severity: **LOW.**

**T2.4 (Elevation) — Over-long-lived token. LOW (mitigated).**
Max-age ≤ 600s+5s enforced beyond `exp` (`route.ts:46-47,251-262`); issuer
clamps TTL to 600s (`contract.ts:16,120-124`). Severity: **LOW.**

**T2.5 (Info disclosure / Repudiation) — Signing-key storage & rotation. MEDIUM.**
Private key is a single env-injected JWK on the mint service (`sign.ts:11-19`);
public key is a single env JWK on the platform (`env.ts:46-53,97`). The signer
supports a `kid` for rotation (`sign.ts:36-40`), but the **verifier consumes
one static JWK with no JWKS/multi-key/`kid` selection** (`route.ts:217-221`) —
so rotation is a manual, coordinated env swap with an unavoidable break window,
and there is no key-compromise revocation path short of redeploying both sides.
No automated rotation found. Mitigation: **partial.** Severity: **MEDIUM.**

**T2.6 (Elevation) — Prototype placeholder key accepted in non-prod. LOW/INFO.**
Non-prod substitutes a placeholder P-256 public JWK
(`env.ts:46-51`), documented as not a valid curve point so real tokens fail.
In prod every var is required (`env.ts:18,70`). Risk only if a non-prod deploy
is treated as trusted. Severity: **LOW.**

### B3 — Token transport (URL / redirect / browser)

**T3.1 (Info disclosure) — Token leakage via URL. MEDIUM.**
The bearer token lives in `?token=` (`handler.ts` redirectUrl;
`AlphaClaimClient.tsx:50`). It is therefore exposed to: browser history, the
address bar (shoulder-surf / screenshot / URL-share), server/CDN/proxy access
logs on both origins, and any client-side analytics that capture the current
URL. PostHog is initialized app-wide; `AlphaClaimClient.tsx:40-45,81-84`
captures events on this page — **UNVERIFIED** whether PostHog autocapture/
`$pageview` records the full querystring (no autocapture config was located).
Partial mitigations: token is single-use + ≤10 min (`route.ts:251-262`,
`alpha-handoff-jti.ts`), and `Referrer-Policy: strict-origin-when-cross-origin`
(`proxy.ts:102`, `next.config.ts:19`) strips the query from cross-origin
`Referer`. **No mitigation** for history/logs/analytics capture, and the token
is not scrubbed from the URL after claim (no `history.replaceState` in
`AlphaClaimClient.tsx`). Severity: **MEDIUM** (window-limited, single-use).

**T3.2 (Tampering) — Open redirect on the claim page. LOW (mitigated).**
The page never redirects to a URL derived from the token or query; it hardcodes
`CONTINUE_ROUTE = "/us/eligibility"` and only reads the closed enum
`intendedDestination` for analytics (`AlphaClaimClient.tsx:28-34,78-88`). The
failure link `GAME_URL` is a constant (`:38`). No open-redirect sink found.
Severity: **LOW.**

### B4 — Platform claim endpoint & session issuance

**T4.1 (Spoofing/CSRF) — Cross-site forced claim. LOW (mitigated).**
The route is CSRF-exempt by design (the token _is_ the credential) but still
enforces a route-local same-origin check derived from the server-resolved URL,
not client-forwarded headers, and rejects a missing/mismatched Origin/Referer
with 403 (`route.ts:105-162,179-180`). A forged cross-origin POST is blocked;
worst case an attacker who already holds a valid token can only claim it (which
they could do directly anyway). Severity: **LOW.**

**T4.2 (Elevation) — Handoff bypasses the US eligibility funnel. LOW (mitigated).**
The claim grants only a waitlist row and redirects to `/us/eligibility`
(§1.12-13). It sets neither `us_eligibility_v1` nor `us_session_v1`, and
`proxy.ts:68-86` still forces eligibility/session for gated routes. No bypass
found. Severity: **LOW.**

**T4.3 (Tampering/Repudiation) — Replay / duplicate claims (race). MEDIUM.**
Single-use is enforced by `consumeJtiIfAbsent` (`route.ts:279-284`;
`alpha-handoff-jti.ts:58-80`). But the default backing is the **prototype
filesystem** store (`backing.ts:33` `DEFAULT_MODE = "prototype"`), whose
`putIfAbsent` is an access-then-write with a **documented TOCTOU race across
concurrent processes** (`alpha-handoff-jti.ts:8-18`). Two same-`jti` requests
hitting two workers simultaneously can both bind. Durable Firestore mode makes
it an atomic `create()` (distributed-safe) but must be opted into via
`REFI_BACKING__ALPHA_HANDOFF_JTI=durable` — **UNVERIFIED** whether production
sets it. Impact is contained because `bindHandoff` is itself idempotent by
`alphaPlayerId` (`alpha-application.ts:135-171`), so a race yields at most a
duplicated side-effect/log, not a duplicate application row. Mitigation:
partial. Severity: **MEDIUM** (would be HIGH if the claim granted a session).

**T4.4 (DoS) — Claim endpoint rate limit is per-instance in-memory. LOW/MEDIUM.**
`createRateLimiter` 30/10min is per-process (`route.ts:42`); noted as a first
layer with a distributed limiter as follow-on. Severity: **LOW.**

**T4.5 (Info disclosure) — Error/telemetry leakage. LOW.**
Verification failures collapse to a generic 401 (`route.ts:229-236,240-248`)
and jti replays are logged with `jti`+`alphaPlayerId` server-side only
(`route.ts:290-299`). No token is logged. Severity: **LOW.**

---

## 5. Gap list (ranked) with recommended fix + proposed test

**G1 — Unauthenticated `sub` (identity spoofing at mint). Severity HIGH.**
Fix: land and enable the in-flight Firebase RS256 verification; set
`requireVerifiedIdentity = true` in `services/handoff/src/server.ts` so `sub`
is always a verified `uid`, never a raw `localStorage` session id. Until then,
document that `alphaPlayerId` is attacker-choosable and MUST NOT be treated as
authenticated anywhere downstream.
Test: `services/handoff/test/identity.test.ts` (already started on
`feat/verified-identity`) — assert (a) a request with no bearer is rejected
when `requireVerifiedIdentity`, (b) a forged/invalid Firebase token → 401,
(c) `sub` equals the verified uid and never the request `sessionId`.

**G2 — jti single-use not distributed-atomic by default. Severity MEDIUM.**
Fix: require `REFI_BACKING__ALPHA_HANDOFF_JTI=durable` (Firestore atomic
create) in every multi-instance environment, or add a unique DB constraint on
`jti`; fail boot if prod resolves this entity to `prototype`.
Test: `apps/web/e2e/alpha-claim-replay.spec.ts` — fire N concurrent POSTs with
the same valid token, assert exactly one 201 and the rest 200-replay, and that
exactly one binding side-effect occurred.

**G3 — No automated coverage of the claim route at all. Severity MEDIUM.**
There is no test on the platform referencing `alpha-claim`/`consumeJtiIfAbsent`
(searched; none found). Every mitigation above (alg pinning, iss/aud/exp,
max-age, same-origin, strict claims) is untested against regression.
Fix: add a claim-route contract test.
Test: `apps/web/e2e/alpha-claim.spec.ts` (+ a unit
`apps/web/app/api/v1/investor/alpha-claim/route.test.ts`) — cover: valid token
→ 201 + redirect to `/us/eligibility`; `alg:none`/HS256-substituted token →
401; wrong `aud`/`iss` → 401; expired / >10min → 401; unknown extra claim →
401; cross-origin POST → 403; flag off → 404.

**G4 — Token leakage via URL / history / analytics. Severity MEDIUM.**
Fix: after a successful (or failed) claim, scrub the token from the URL with
`history.replaceState` in `AlphaClaimClient.tsx`; confirm PostHog does not
autocapture the querystring on this route (mask `$current_url` or disable
autocapture for `/us/alpha-claim`); prefer a short-lived one-time code
exchanged for the token over carrying the JWT in the URL if feasible.
Test: `apps/web/e2e/alpha-claim-token-hygiene.spec.ts` — assert the URL no
longer contains `token=` after claim, and that no analytics network call body
contains the token.

**G5 — Signing-key rotation has no JWKS / multi-key path. Severity MEDIUM.**
Fix: make the platform verifier accept a small set of public JWKs (by `kid`)
so old+new keys are both valid during rotation, eliminating the break window
and enabling fast revocation.
Test: `apps/web/app/api/v1/investor/alpha-claim/route.test.ts` (rotation case)
— tokens signed by either of two configured `kid`s verify; a third `kid` does
not.

**G6 — Mint endpoint abuse resistance is per-instance only. Severity LOW-MEDIUM.**
Fix: front `/mint-handoff` with Cloud Armor / a distributed limiter and, once
G1 lands, require auth so anonymous minting is impossible.
Test: `services/handoff/test/ratelimit.test.ts` — asserts limiter behavior;
CDN/WAF layer verified in infra tests.

**G7 — Ensure the SUPERSEDED edge function cannot be revived. Severity LOW (latent HIGH).**
`supabase/functions/alpha-handoff/index.ts` trusts client-asserted progress and
`alphaPlayerId` and uses CORS `*`. Fix: delete the branch/function or add a
guard/README marking it dead; never deploy it.
Test: n/a (removal); or a repo lint asserting the file is absent from
deployable paths.

---

## 6. Verification status

**CONFIRMED against code:** T1.1/G1 (mint trusts client `sessionId` as `sub`),
T1.3 (server-derived progress, current impl), the SUPERSEDED edge function's
client-asserted progress + `*` CORS, T2.1–T2.4 (alg pin, kid ignored, iss/aud/
exp/nbf, max-age), T2.5/G5 (single static public JWK, no JWKS), T3.1 partial
(token in URL; Referrer-Policy set; no post-claim URL scrub), T3.2 (no
open-redirect sink), T4.1 (same-origin CSRF guard), T4.2 (no session/eligibility
cookie issued; funnel not bypassed), T4.3/G2 (jti TOCTOU in default prototype
backing; idempotent bind limits impact), T4.5 (generic errors, no token
logging), G3 (no platform tests reference the route).
**PLAUSIBLE-UNVERIFIED:** whether PostHog autocapture records the token-bearing
URL (T3.1); the real production `SHELL_BASE_URL` and whether prod sets
`REFI_BACKING__ALPHA_HANDOFF_JTI=durable` (T4.3); and the not-yet-committed,
not-yet-enabled state of the Firebase identity upgrade (G1) — present in the
`feat/verified-identity` working tree only.
