# GCP BFF migration plan — design only (2026-09-03)

**Status:** design document. **No cloud resource is created, modified, or
planned-for-apply by this document.** It answers Zeshan's 2026-09-03 governing
decision recorded in
[package-reconciliation-2026-09-03.md](package-reconciliation-2026-09-03.md)
§4a: GCP is the target architecture for the ReFi server-side/BFF layer; Vercel
is current, transitional infrastructure, not the target trust boundary.

**Basis:** the repository at `main @ 9f45f05`, Daniel's `v1.1.0-alpha.2`
package (`connection.dev.json` logical values), and the existing
`infra/terraform/` tree. Every claim about our code carries a `file:line`
reference. Anything not verifiable from the repository is marked UNVERIFIED.

**Recommendation in one line:** migrate **BFF-first**, keep the Next.js pages
on Vercel for now, and bridge the two with a same-origin rewrite so no cookie
or CORS semantics change during the transition (§3, §10).

---

## 1. Current Vercel responsibilities (measured)

The Vercel project `refi-us-sec-ia-web` runs one Next.js application that is
simultaneously the investor frontend and the BFF. Nothing in the repository is
Vercel-specific at the code level: there is no `vercel.json` at the root or in
`apps/web`, no `export const runtime = "edge"` declaration anywhere under
`apps/web/app`, and `next.config.ts` already sets `output: "standalone"`
(`apps/web/next.config.ts:5`) with a working multi-stage Dockerfile
(`apps/web/Dockerfile:1-33`) that runs `node apps/web/server.js` on port 3000.
The application is container-ready today.

What Vercel currently does for us:

| Responsibility                    | Where it lives                                                                                  | Count / note                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| BFF route handlers                | `apps/web/app/api/**/route.ts`                                                                  | **22** handlers (1 health, 2 `/api/us/*`, 19 `/api/v1/investor/*`)            |
| Public JWKS route                 | `apps/web/app/.well-known/jwks.json/route.ts`                                                   | 1 handler; returns 503 when no signing key is configured (`:57-60`)           |
| Request gating + security headers | `apps/web/proxy.ts:53-120`                                                                      | correlation id, eligibility/session cookie redirects, CSP, HSTS, `/admin` 404 |
| Session verification              | `apps/web/src/lib/bff/auth.ts:63` (`us_session_v1`), dev fallback `:128-140`                    | HS256 today, MSW-minted; identity-ccid swap point                             |
| Eligibility cookie issuance       | `apps/web/app/api/us/eligibility/route.ts:111-117`                                              | `httpOnly`, `secure`, `sameSite: "lax"`, `path: "/us"`, 24 h                  |
| Durable store credentials         | `apps/web/src/lib/durable-store/store.ts:44-61`                                                 | key JSON on Vercel; ADC on Cloud Run (already dual-path)                      |
| Prototype filesystem store        | `apps/web/src/lib/prototype-store/store.ts:21` (`REFI_PROTOTYPE_STORE_DIR`)                     | ephemeral on serverless; not a migration blocker but not durable either       |
| Environment variables             | `apps/web/.env.example`, validated by `apps/web/src/lib/config/env.ts:97-159`                   | 27 names (below)                                                              |
| Hostnames                         | `refi.trading` (Vercel domain list) and `bff-dev.refi.trading` → `76.76.21.21` (Vercel anycast) | the latter is Daniel's pinned `frontend_bff_jwks_url` host                    |
| Preview deployments               | Vercel Git integration                                                                          | previews share the same env model unless scoped                               |

Environment variable **names** declared in `apps/web/.env.example` (values are
never recorded here):

```
ALPHA_HANDOFF_AUDIENCE  ALPHA_HANDOFF_ISSUER  ALPHA_HANDOFF_PUBLIC_KEY_JWK
BFF_ASSERTION_ALLOW_EPHEMERAL_KEY  BFF_ASSERTION_ISSUER
BFF_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK  BFF_ASSERTION_PRIVATE_KEY_JWK
BFF_DEV_HOSTNAME  ELIGIBILITY_JWT_SECRET  FLAG_ALPHA_CLAIM_ROUTE
GCP_PROJECT_ID  GCP_SERVICE_ACCOUNT_KEY  INVESTOR_API_AUDIENCE  IP_HASH_SECRET
NEXT_PUBLIC_API_BASE_URL  NEXT_PUBLIC_POSTHOG_DEV  NEXT_PUBLIC_POSTHOG_KEY
NEXT_PUBLIC_REFI_ENV  NEXT_PUBLIC_SENTRY_DSN  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
REFI_BACKING__ALPHA_APPLICATION  REFI_BACKING__ALPHA_HANDOFF_JTI
REFI_DATA_ADAPTER  REFI_ENV  REFI_RELEASE_STAGE  SESSION_JWT_SECRET  SESSION_SECRET
```

Two of these exist **only because the host is Vercel**:
`GCP_SERVICE_ACCOUNT_KEY` ("Service-account key JSON for hosts without workload
identity (e.g. Vercel). Leave EMPTY on Cloud Run", `.env.example:69-70`) and
`BFF_ASSERTION_PRIVATE_KEY_JWK` as an env-var private key. Both disappear under
the target.

## 2. Target Cloud Run responsibilities

One Cloud Run v2 service, **`refi-bff`**, per environment tier, running the same
standalone Next.js image the Dockerfile already builds, but reached only via
`/api/*` and `/.well-known/*` paths from the outside world (§3 explains why the
same image is still the right unit in phase 1).

| Responsibility                           | Target implementation                                                                                                |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| BFF route handlers, JWKS route           | Same code, same container; ingress `all` (browser-facing) with `roles/run.invoker` for `allUsers`                    |
| Outbound to identity-ccid / Investor API | ID token from the metadata server, audience = target service URL, signed by the **BFF runtime service account** (§5) |
| User-assertion signing                   | Cloud KMS asymmetric sign, non-exportable P-256 key (§6)                                                             |
| JWKS publication                         | Public JWK read from KMS `getPublicKey`, cached in-process, served at `/.well-known/jwks.json` (§7)                  |
| Secrets                                  | Secret Manager, mounted as env vars via Cloud Run secret references (§8)                                             |
| Durable store                            | Firestore via ADC — the path `store.ts:14-15` already documents                                                      |
| Headers/CSP                              | Unchanged; `proxy.ts` runs inside the container                                                                      |
| Logs                                     | Cloud Logging via stdout JSON; redaction rules §14                                                                   |

The existing `infra/terraform/modules/cloud-run-service` already provisions a v2
service with its own runner service account (`main.tf:73`) and a public invoker
binding (`main.tf:79-85`). That public binding is correct for the browser-facing
BFF and **must not** be reused for anything that fronts Daniel's private
services.

## 3. Does frontend hosting move now or later? (measured, then decided)

**Coupling measurement.**

| Measure                                              | Result                                                                                                                                                          |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page routes (`page.tsx`) under `apps/web/app`        | 23 total, 9 under `/us/app/**`                                                                                                                                  |
| Browser code calling the BFF with a **relative** URL | 3 call sites: `app/us/app/support/page.tsx:37`, `app/us/alpha-claim/_components/AlphaClaimClient.tsx:64`, `app/us/eligibility/page.tsx:96`                      |
| Browser code with an absolute BFF base               | 0. `NEXT_PUBLIC_API_BASE_URL` is consumed only by `packages/api-clients/src/client.ts:28` (legacy browser-direct client) and its MSW handlers                   |
| Cookie `Domain` attribute set anywhere               | None. `us_eligibility_v1` is host-only, `path=/us`, `SameSite=Lax` (`eligibility/route.ts:111-117`); `us_session_v1` is read at `bff/auth.ts:63`, minted by MSW |
| Colocation                                           | API handlers and pages are one Next.js app, one build, one `server.js`; there is no separate BFF package                                                        |
| Server-side data access from pages                   | Pages read the prototype/durable store **in-process** through the `bffRead`/`bffMutate` wrappers (`bff/handler.ts:1-11`); they do not HTTP-call the BFF         |

**Interpretation.** The browser-to-BFF surface is small (3 relative calls) and
the cookies are host-only and `Lax`. That means the **only** thing that binds
pages and BFF to the same origin is the cookie jar: if `us_session_v1` is set by
a BFF on `bff-dev.refi.trading` and pages live on `refi.trading`, the browser
will not send it to the pages' server components, and `proxy.ts:81` will
redirect every `/us/app/*` navigation to `/us/auth/connect`. Separating the
_processes_ is cheap; separating the _origins_ is the expensive part.

**Decision: BFF-first, pages stay, same origin preserved by a rewrite.**

Phase 1 deploys the same image to Cloud Run and lets Vercel keep serving pages,
with a Next.js rewrite on the Vercel deployment that proxies `/api/:path*` and
`/.well-known/:path*` to the Cloud Run URL. The browser keeps talking to one
origin; cookies and `SameSite=Lax` semantics are untouched; the JWKS hostname
`bff-dev.refi.trading` points straight at Cloud Run (§9) because Daniel's
services fetch it server-to-server and carry no cookies. Phase 2 (pages move)
happens only if measurement in phase 1 shows the rewrite hop is a problem
(latency, header fidelity, or double-billing), because moving pages is not
required for any trust-boundary goal. Moving both together in one change would
couple a DNS cutover of the marketing/app origin to the trust-boundary work and
give us no independent rollback.

A separate BFF package (splitting `apps/web/app/api` out of the Next.js app)
is **not** recommended now: the 22 handlers depend on the in-process store,
env loader, and wrapper libraries under `apps/web/src/lib`, and the reward for
splitting (a smaller image) does not offset the refactor while the identity
model is still changing.

## 4. Service account design

Dedicated, per-tier, least-privilege. Names are proposals.

| Identity                                | Purpose                                     | Roles (only these)                                                                                                                                                                                                                                                                                       |
| --------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `refi-bff-dev@<refi-project>`           | Cloud Run **runtime** SA for `refi-bff` dev | `roles/run.invoker` on Daniel's `identity-ccid` and `investor-api` services (granted by Daniel, §5); `roles/cloudkms.signerVerifier` on **one** KMS key; `roles/secretmanager.secretAccessor` on **named** secrets; `roles/datastore.user` (Firestore, already modelled in `infra/terraform/main.tf:38`) |
| `refi-bff-deployer@<refi-project>`      | CI deployer via GitHub WIF                  | `roles/artifactregistry.writer`, `roles/run.developer`, `roles/iam.serviceAccountUser` on the runtime SA only — the shape already in `infra/terraform/modules/workload-identity/main.tf:25-48`                                                                                                           |
| `refi-bff-staging@…`, `refi-bff-prod@…` | Same as dev, one per tier                   | Same role set, separate key, separate secrets; no cross-tier grants                                                                                                                                                                                                                                      |

Rules: no user-managed SA keys anywhere (the existing `create_sa_key` path in
`infra/terraform/main.tf:46` is retired with Vercel); the runtime SA never holds
`roles/run.admin`, `roles/cloudkms.admin`, or project-level `editor`; preview
deployments get **no** SA at all (§15).

Daniel's package names his side of this: the fixed BFF service account is
`refinity-dev-investor-bff-sa@refinity-dev.iam.gserviceaccount.com`
(`connection.dev.json.logical_values.bff_service_account`). Under the external
WIF model our workload _impersonates_ that SA. Under the GCP-native model
(§5) that SA may be unnecessary — our own runtime SA is the caller — which is
exactly the question to put to Daniel.

## 5. Native Cloud Run service-to-service auth

**How it works on GCP.** A Cloud Run service calls another private Cloud Run
service by requesting an identity token from the metadata server
(`http://metadata/computeMetadata/v1/instance/service-accounts/default/identity?audience=<target>`),
where `<target>` is the receiving service's URL (or a custom audience configured
on the receiver). The token is signed by Google, `iss` is
`https://accounts.google.com`, `email` is our runtime SA, and the receiving
service's IAM checks `roles/run.invoker` for that SA. No key material exists in
our process; nothing rotates on our side.

**What the package assumes instead.** `connection.dev.json` expects an
**external** workload: our BFF issues its own OIDC token, Daniel's WIF pool
`refinity-dev-frontend-system` (ACTIVE, 0 providers) trusts our
`wif_oidc_issuer` for `wif_allowed_audiences` and `wif_allowed_subjects`, and
our token is exchanged for impersonation of `refinity-dev-investor-bff-sa`.
That is the right design for a Vercel-hosted BFF. It is one hop more than
necessary for a GCP-hosted one.

**The audience question.** The package fixes two Google OIDC audiences:
`https://identity-ccid.dev.refi.internal` and
`https://investor-api.dev.refi.internal` (`logical_values`). Those are
**custom audiences**, not the Cloud Run service URLs
(`https://identity-ccid-74kl57biwa-uw.a.run.app`, `https://investor-api-…`).
Cloud Run supports custom audiences on the receiving service, so a GCP-native
caller can still mint tokens with exactly those `aud` values from the metadata
server — but only if Daniel has configured them as custom audiences on his
services rather than only accepting them at the WIF/STS layer. This is
UNVERIFIED from our side and is clarification question 2 to Daniel, together
with: _"If our BFF runs on Cloud Run under a dedicated GCP service account, can
`identity-ccid` and `investor-api` grant `roles/run.invoker` to that SA
directly, or does your contract still require the external OIDC → WIF
exchange?"_

Until he answers, this plan carries both paths and implements neither.

| Path                       | Our token source                                      | What Daniel configures                                                   | What we supply                                                                                 |
| -------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| A. GCP-native (preferred)  | Metadata server ID token, `aud` = his custom audience | `run.invoker` for `refi-bff-<tier>@…` on both services; custom audiences | Our runtime SA email(s) per tier                                                               |
| B. External WIF (fallback) | A self-issued OIDC token (issuer TBD)                 | WIF provider on his pool, CEL subject condition, SA impersonation grant  | `wif_oidc_issuer`, `wif_allowed_audiences`, `wif_allowed_subjects`, and a JWKS for that issuer |

## 6. Cloud KMS ES256 assertion signing

**Key.** One `CryptoKey` per tier, purpose `ASYMMETRIC_SIGN`, algorithm
`EC_SIGN_P256_SHA256`, protection level `SOFTWARE` (HSM is optional; the
threat model gain is small for an assertion key whose TTL is 60 s), rotation
disabled at the KMS level (rotation is a deliberate runbook step, §7, because
the verifier caches our JWKS). The private material is **non-exportable** by
construction.

**Signing.** `asymmetricSign` takes a SHA-256 digest and returns a DER-encoded
ECDSA signature; JOSE ES256 requires the raw `r || s` 64-byte form, so the
signer converts DER → raw before base64url-encoding. `kid` is derived
deterministically from the key **version** resource name (for example the
version number, or a short hash of the full resource name) so that a rotation
produces a new `kid` without anyone typing one.

**What changes in code.** `apps/web/src/lib/investor-api/user-assertion.ts`
today resolves a private JWK from env (`getSigningKey`, `:224-278`) and signs
with `jose`'s `SignJWT` after `importJWK` (`:396-411`). The change is confined
to that module:

- `getSigningKey()` returns `{ kid, sign(digest) }` from a KMS-backed signer
  instead of `{ kid, privateJwk }`.
- `mintUserAssertion()` builds the identical protected header
  (`alg: ES256, kid, typ: JWT`) and identical claims (`iss`, `aud`, `sub`,
  `sid`, `iat`, `nbf`, `exp`, `jti`, `auth_time`, optional `amr`) and calls
  the signer instead of `SignJWT.sign`. Nothing about the claim set, TTL
  (`USER_ASSERTION_TTL_SECONDS = 60`, `:62`), or the one-assertion-per-call
  rule moves.
- `getPublicJwks()` (`:290-303`) sources the current public JWK from KMS
  `getPublicKey` (PEM → JWK) instead of stripping `d` from the private JWK.
- The `amr`-required guard (`:373-375`) becomes optional-when-present per the
  package (ATD-041); that is a contract change tracked separately, not a KMS
  change.

**Latency and cold starts.** Each mint is one KMS RPC (single-digit to
low-double-digit milliseconds in-region; UNVERIFIED for `us-west1` from here).
Since the package requires a fresh assertion per Investor API attempt, that RPC
is per outbound call; it is acceptable for a BFF whose own GET budget is ten
seconds. Only the **public** key is cached in-process (bounded, keyed by
version); the private key is never in the process, so there is nothing else to
cache. A `min_instance_count = 1` on the dev service
(`modules/cloud-run-service/main.tf:12` already exposes it) removes the
cold-start penalty from the JWKS route that Daniel's verifier polls.

The `BFF_ASSERTION_ALLOW_EPHEMERAL_KEY=1` local/CI path (`:236-247`) stays for
laptops and CI where no KMS is reachable; it remains forbidden on deployed
tiers exactly as the runbook states.

## 7. JWKS publication and rotation

Publication is unchanged in shape: `GET /.well-known/jwks.json` returns
`{ keys: [current, previous?] }` with `Cache-Control: public, max-age=300`
(`jwks.json/route.ts:42,51`), matching Daniel's five-minute verifier cache.

Rotation runbook (replaces the env-var procedure in
`docs/security/RUNBOOK-bff-assertion-signing-key.md` §2):

1. Create a new KMS key **version**; do not make it primary yet.
2. Deploy/configure the BFF to publish **both** versions' public JWKs. The
   existing `BFF_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK` mechanism
   (`user-assertion.ts:290-303`) becomes "previous KMS version id" and needs
   no env-var JWK.
3. Wait one full verifier cache TTL (5 min) plus margin — the runbook's
   ten-minute overlap window stands.
4. Switch signing to the new version (`kid` changes automatically).
5. After another overlap window, disable the old version in KMS and drop it
   from the JWKS. Disabled versions can be re-enabled; destroyed ones cannot.

Evidence for each rotation: JWKS body before/after (both `kid`s present during
overlap), one successful Investor API call under the new `kid`, and the KMS
version state change, all with UTC timestamps.

## 8. Secret Manager usage

| Env var today                                                                      | Target                                                                                                                  |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`, `SESSION_JWT_SECRET`, `IP_HASH_SECRET`, `ELIGIBILITY_JWT_SECRET` | Secret Manager secrets, one per tier, referenced as Cloud Run secret env vars; `secretAccessor` for the runtime SA only |
| `ALPHA_HANDOFF_PUBLIC_KEY_JWK`, `ALPHA_HANDOFF_ISSUER`, `ALPHA_HANDOFF_AUDIENCE`   | Public values, but keep them in Secret Manager for change control and versioning; not sensitive                         |
| `BFF_ASSERTION_PRIVATE_KEY_JWK`                                                    | **Ceases to exist.** The key lives in KMS; the app holds a key resource name, not material                              |
| `BFF_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK`                                            | Replaced by a KMS previous-version reference                                                                            |
| `GCP_SERVICE_ACCOUNT_KEY`                                                          | **Ceases to exist.** ADC via the runtime SA (`store.ts:14-15`)                                                          |
| `BFF_ASSERTION_ISSUER`, `INVESTOR_API_AUDIENCE`, `REFI_*`, `NEXT_PUBLIC_*`         | Plain env vars on the service (non-secret configuration)                                                                |

The existing `modules/secret-manager` module (`main.tf:1-17`) already models
secret + version + accessor binding and can be reused as-is.

## 9. Domain migration for `bff-dev.refi.trading`

Today the hostname resolves to `76.76.21.21` (Vercel) and serves the whole
Next.js app. Target: the hostname resolves to Cloud Run and serves only the BFF
paths. Two viable shapes:

| Option                                        | Pros                                                                | Cons                                                               |
| --------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Cloud Run **custom domain mapping**           | Simplest; Google-managed certificate; no LB cost                    | Regional availability constraints; no Cloud Armor; no path routing |
| **Global external HTTPS LB** + serverless NEG | Cloud Armor, path rules, one IP for future services, header control | More Terraform; small fixed monthly cost                           |

Recommendation: start with the LB + serverless NEG because path-based routing
is what lets the same hostname later front pages too (phase 2), and because
Cloud Armor rate limiting is the natural home for the EL-03 eligibility
rate-limit control that is in-memory today.

Cutover steps (each reversible by a DNS change):

1. Provision the LB/NEG/certificate for `bff-dev.refi.trading` with a Google-
   managed cert; the cert issues only once DNS points at it, so stage with a
   temporary hostname first (`bff-dev-cr.refi.trading`) and verify JWKS 200
   there.
2. Lower the DNS TTL on `bff-dev.refi.trading` a day ahead.
3. Switch the A/AAAA record from Vercel to the LB IP.
4. Verify `https://bff-dev.refi.trading/.well-known/jwks.json` returns 200 with
   the KMS-published key and `application/jwk-set+json`.
5. Remove the hostname from the Vercel project last.

Daniel's `frontend_bff_jwks_url` value does not change, which is the whole
point of keeping the hostname (`.env.example:92-98` records why the URN issuer
and the hostname move independently).

## 10. Session and cookie implications

Cookies in play: `us_eligibility_v1` (`httpOnly`, `secure`, `SameSite=Lax`,
`path=/us`, 24 h, set at `eligibility/route.ts:111-117`) and `us_session_v1`
(read at `bff/auth.ts:63`; today minted by MSW, tomorrow by the BFF after the
identity exchange). Neither sets `Domain`, so both are **host-only**.

The BFF-first risk is exactly this: if the browser reaches pages at
`refi.trading` and the BFF at `bff-dev.refi.trading`, host-only cookies set by
one are invisible to the other, and `proxy.ts:71,81` redirects would fire on
every navigation. Two patterns avoid it:

- **Preferred — same origin via rewrite.** Vercel's Next.js config gains
  `rewrites()` for `/api/:path*` and `/.well-known/:path*` to the Cloud Run
  URL. The browser still sees one origin; the cookie is set on and sent to
  `refi.trading`; `SameSite=Lax` keeps protecting cross-site POSTs; the
  same-origin CSRF check in `bffMutate` (`src/lib/bff/origin.ts`) keeps
  working because `Origin`/`Host` are the page origin. The rewrite must forward
  `x-forwarded-for` and `x-correlation-id` unchanged so `proxy.ts:61-66` and
  the EL-03 rate limiter see the real client.
- **Fallback — shared registrable domain.** Set `Domain=refi.trading` on both
  cookies and serve pages and BFF from sibling hosts. This widens the cookie
  scope to every `*.refi.trading` host (including marketing) and is therefore
  the weaker option; it is listed only so the trade-off is on record.

`SameSite=None` is **not** an option: it would require the cookie to be sent
cross-site and would undo the CS-02 posture.

One more cookie fact matters for phase 2: `us_eligibility_v1` is scoped to
`path=/us`. If pages ever move to a host where the app is not under `/us`, the
path scoping must move with it.

## 11. CORS and origin implications

With the rewrite pattern there is **no CORS** at all: every browser request is
same-origin. This is deliberate; the BFF should never grow an
`Access-Control-Allow-Origin` header, because the package forbids browser-
direct access to private services and a permissive CORS policy on the BFF is
the first step toward exactly that. The same-origin mutation guard in
`bffMutate` stays the CSRF control. If the fallback (sibling hosts) is ever
used, CORS must be an exact-origin allowlist with credentials, and the guard
must be taught the sibling origin explicitly.

## 12. Deployment and rollback strategy

- **Build once, deploy by digest.** CI builds the image from
  `apps/web/Dockerfile`, pushes to Artifact Registry
  (`modules/artifact-registry`), and records the `sha256:` digest. Deployments
  reference the digest, never a mutable tag — the same rule Daniel applies in
  his §13 ("manually approved deployments of immutable digests").
- **Manual approval to promote.** The GitHub deploy job for dev may be
  automatic on `main`; staging/prod require an environment approval. The
  deployer SA has `run.developer`, not `run.admin`.
- **Revisions and traffic.** Each deploy creates a Cloud Run revision with 0 %
  traffic; a smoke check (JWKS 200, `/api/health` 200, one authenticated read
  against the simulator or dev backend) runs against the revision URL; then
  traffic is shifted 100 %. Rollback is `gcloud run services update-traffic`
  back to the previous revision — seconds, no rebuild.
- **Rollback rehearsal** is part of the evidence in §17.
- **Vercel stays the rollback for pages** throughout phase 1; the rewrite
  target can be flipped back to local handling by removing the rewrite and
  redeploying on Vercel, which is why the rewrite is the bridge rather than
  DNS.

## 13. Terraform ownership

Facts: this repository already carries `infra/terraform/` with a Firestore
root module, `environments/{dev,staging,prod}`, and reusable modules for Cloud
Run, Secret Manager, Artifact Registry, and GitHub WIF. Daniel's repository
carries `infra/envs/dev/{frontend_federation,apps,invocation,iam}.tf` for
`refinity-dev` (per ATD §4).

Proposal: the ReFi BFF infrastructure lives in **a separate ReFi-owned GCP
project** (working name `refi-bff-dev`, then `-staging`, `-prod`), owned by this
repository's `infra/terraform/`, with its own state backend. Daniel's project
`refinity-dev` keeps owning the receiving side: the `run.invoker` grants to our
runtime SA (path A) or the WIF provider (path B) are resources in **his**
Terraform, fed by values we publish. The boundary is then a single IAM
statement per service, which is auditable.

The alternative — a bounded folder inside `refinity-dev` — reduces cross-
project egress and simplifies custom audiences, at the cost of shared IAM
blast radius and shared billing. **This is a decision for Zeshan and Daniel**,
and it is the third clarification question.

Whichever project wins: no `terraform apply` happens until the plan is reviewed
in a PR, and nothing in this document is an apply.

## 14. Logging and monitoring

- **Cloud Logging** ingests stdout JSON. The package's never-log list (Google
  tokens, identity assertions, identity results, user assertions, Alpaca keys,
  nonces, challenges, invitation tokens) becomes a log-level redaction: the
  BFF logger scrubs `Authorization`, `X-Refinity-User-Assertion`, `Cookie`,
  `Set-Cookie`, and any field named `*_secret|*_token|api_key|api_secret`
  before emit; a Cloud Logging exclusion filter is the belt to that suspenders.
  Existing structured events like `us_eligibility_decision`
  (`eligibility/route.ts:100-107`) already avoid PII.
- **Cloud Monitoring** uptime check on `https://bff-dev.refi.trading/.well-known/jwks.json`
  expecting 200 and a JSON body containing `"keys"`; alert on two consecutive
  failures. A second check on `/api/health`.
- **Sentry continuity.** `@sentry/nextjs` stays; the DSN moves to a Cloud Run
  env var. Release tagging uses the image digest so Sentry events map to the
  exact deployed artifact.
- **Correlation.** `x-correlation-id` (`proxy.ts:56-59`) is logged on every
  line and echoed on every response; the LB adds `X-Cloud-Trace-Context` which
  Cloud Logging groups automatically.

## 15. Preview and dev separation

Vercel previews are useful for UI review and must keep working, but a preview
must **never** be able to reach Daniel's services or sign an assertion his
verifier trusts.

| Tier                   | Host                   | Runtime SA       | Backend reach                                   | Assertion signing                                    |
| ---------------------- | ---------------------- | ---------------- | ----------------------------------------------- | ---------------------------------------------------- |
| Vercel preview         | `*.vercel.app`         | none             | MSW / simulator only (`REFI_DATA_ADAPTER=mock`) | ephemeral key, never published anywhere Daniel reads |
| Cloud Run dev          | `bff-dev.refi.trading` | `refi-bff-dev@…` | Daniel's `refinity-dev` (once bound)            | KMS dev key                                          |
| Cloud Run staging/prod | `bff-staging…`, `bff…` | per-tier SA      | per-tier backend (none exist yet)               | per-tier KMS key                                     |

The runbook rule "never a Vercel preview URL as issuer" (`RUNBOOK §2`) is
preserved by construction: previews have no KMS role and no invoker grant, so
even a misconfigured preview cannot mint a trusted assertion or call a private
service.

## 16. What disappears from Daniel's WIF requirements when the BFF is GCP-native

If Daniel confirms path A (§5), the following `connection.dev.json` bindings
become unnecessary because there is no external identity to federate:

- `wif_oidc_issuer` — we have no external issuer; Google is the issuer.
- `wif_allowed_audiences` — replaced by his custom audiences (or service URLs)
  that we request from the metadata server.
- `wif_allowed_subjects` — replaced by `roles/run.invoker` grants to named
  runtime SAs.
- `wif_provider_name` (his deliverable) — no provider is created.
- The WIF pool `refinity-dev-frontend-system` and the impersonation target
  `refinity-dev-investor-bff-sa` may become unused for this integration.

What **stays** regardless of path:

- `frontend_bff_jwks_url` — the user-assertion JWKS is an application-layer
  credential, unrelated to service auth. It is served from Cloud Run at the
  same hostname (§7, §9).
- `frontend_upstream_identity_provider_id`, `_issuer`, `_audience`,
  `_jwks_url`, `frontend_identity_redirect_uris` — the upstream identity
  provider question is untouched by where the BFF runs, and remains Zeshan's
  decision.
- `support.*` contacts.

## 17. Exact evidence required before Vercel can be removed

Vercel is removed (for the BFF in phase 1; for pages only after a separate
phase-2 decision) when **all** of the following are on file with UTC
timestamps and, where applicable, the image digest:

1. `https://bff-dev.refi.trading/.well-known/jwks.json` returns 200 from Cloud
   Run with a KMS-published ES256 key, and one full rotation (§7) has been
   performed with both `kid`s observed during overlap and verification
   succeeding under the new `kid`.
2. Two-credential requests to Daniel's `identity-ccid` and `investor-api`:
   a **positive** case accepted (Google token from our runtime SA + fresh user
   assertion) and **negative** cases rejected (missing user assertion; wrong
   audience; a preview-tier identity), each with `correlation_id` and his
   service's response.
3. Production-mode Playwright run (the `E2E (production artifact)` job in
   `.github/workflows/ci.yml:89`) executed against the Cloud Run BFF through
   the rewrite, covering eligibility → session → one authenticated
   `/api/v1/investor/*` read and one mutation with the same-origin guard.
4. A rollback rehearsal: traffic shifted to a previous revision and back, with
   the JWKS and health checks green throughout.
5. Monitoring alerts proven to fire (deliberately break the JWKS route on a
   0 %-traffic revision, or use a synthetic failure) and route to the agreed
   channel.
6. `terraform plan` clean for the ReFi project (no drift), and Daniel's side
   confirming the invoker/WIF resources match the published values.
7. `git grep` of `apps/web/src` and `apps/web/app` shows no remaining
   reference to `GCP_SERVICE_ACCOUNT_KEY` or `BFF_ASSERTION_PRIVATE_KEY_JWK`
   as a runtime input; `.env.example` updated; the runbook rewritten for KMS.
8. The Vercel hostname `bff-dev.refi.trading` removed only after items 1–7,
   and the Vercel-side rewrite retained until pages move (phase 2) or is
   removed together with the pages decision.

Until every item is present, Vercel remains the deployed state and this
document remains a plan.
