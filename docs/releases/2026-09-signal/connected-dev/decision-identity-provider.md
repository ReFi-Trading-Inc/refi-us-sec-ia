# Identity provider for email-first login — founder direction received

**Status (2026-09-09):** Founder direction received: **"best in class magic
link auth."** Provider recommendation below (Stytch). **FOUNDER DECISION
REQUIRED** on the named provider before any provider-specific code is
written (Daniel's step 2; Zeshan's directive: no silent selection in code).
Does not block steps 0, 1, 3. **No demo authentication mechanism may become
the connected IdP.**

## Fixed by Daniel (not negotiable here)

identity-ccid is not a mailbox or login service; the frontend owns email-first
login; wallet/SIWE is not login; the backend verifies a closed ES256 upstream
assertion — header exactly `alg=ES256, typ=JWT, kid`; claims exactly `iss,
aud, sub, email, email_verified=true, iat, nbf, exp, jti, sid, auth_time`,
optional `amr`; no other claims; ≤300 s; 30 s skew; `sub`/`jti`/`sid` match
`^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$`; `sub` opaque and stable (never email,
name or backend user id); genuine `auth_time` preserved.

**Holds for every option:** no hosted provider emits that exact profile, so a
**frontend-owned ES256 bridge** is required regardless. It validates the
provider's real authentication result, maps the provider subject to a durable
opaque id, then mints the closed assertion under a key **distinct** from the
per-request BFF Investor assertion key and publishes its own JWKS. The
provider choice therefore turns on magic-link quality, server-side control,
auditability, cost and lock-in — not on the security profile, which the
bridge fixes.

## Candidates, scored against "best-in-class magic link"

| Criterion                           | **Stytch**                                                                                                     | WorkOS AuthKit                                 | Auth0 Passwordless                               | Firebase Auth (Identity Platform)                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| Magic link as a first-class product | Yes — API-first magic links + email OTP, per-link expiry, single-use, custom sender domain, device fingerprint | Yes — magic auth (code/link) in hosted AuthKit | Yes, but bolted onto a password-centric platform | Email-link sign-in exists; least polished; client-SDK centric |
| Server-side (headless) integration  | Full backend API: send → authenticate → session; no vendor UI required                                         | Hosted UI first; API available                 | API + Universal Login                            | Client SDK first; Admin SDK verifies                          |
| Stable opaque subject               | `user_id` (`user-…`, opaque, stable)                                                                           | `user_…`                                       | `sub` (`auth0\|…`)                               | `uid`                                                         |
| Result verification                 | Session JWT (RS256) against project JWKS; `authenticate` API returns factors + `last_authenticated_at`         | Session JWT against JWKS                       | ID token against tenant JWKS                     | ID token against Google JWKS (Admin SDK)                      |
| Genuine `auth_time`                 | Yes — `authentication_factors[].last_authenticated_at`, `session.started_at`                                   | Session `iat`; event API                       | `auth_time` claim                                | `auth_time` claim                                             |
| MFA / passkeys                      | Native (passkeys/WebAuthn, TOTP, SMS/WhatsApp), step-up APIs                                                   | Native MFA; passkeys                           | Native                                           | MFA in Identity Platform; passkeys via custom flow            |
| Enterprise federation later         | B2B product (SAML/OIDC, orgs)                                                                                  | Strongest SSO story                            | Strong                                           | SAML/OIDC in Identity Platform                                |
| Auditability                        | Event logs + webhooks; SOC 2 / ISO 27001                                                                       | Event logs + webhooks; SOC 2                   | Log streaming; SOC 2                             | Cloud Audit Logs in our own project                           |
| Fintech/consumer fit                | Consumer-scale passwordless is its core; used by fintechs                                                      | B2B-oriented                                   | General                                          | General                                                       |
| Cost at Alpha scale                 | Free tier (thousands of MAU); then per-MAU                                                                     | Free to 1M MAU for AuthKit; SSO paid           | Free tier; MFA/enterprise paid                   | Free tier; per-MAU above                                      |
| Lock-in                             | Moderate (users exportable; sessions ours after the bridge)                                                    | Moderate                                       | Moderate                                         | Low-moderate (GCP-native)                                     |
| ES256 bridge required               | Yes                                                                                                            | Yes                                            | Yes                                              | Yes                                                           |

## Recommendation

**Stytch, headless (backend API) integration, email magic link + email OTP
fallback, passkeys/TOTP step-up for the Alpha cohort**, bridged by the
frontend ES256 signer. It is the option whose core product _is_ the magic
link, gives the BFF full server-side control of send/authenticate/session
with no vendor UI in the regulated flow, exposes the genuine authentication
time and an opaque stable subject, and has native passkeys and step-up for
later. WorkOS AuthKit is the fallback if enterprise SSO becomes the dominant
requirement; Firebase stays the "keep it inside GCP" alternative.

**If confirmed, Sprint B builds (provider-agnostic where possible):**

1. `POST /api/v1/investor/login/start` — Stytch send (email link + OTP), pending
   login bound server-side to random `state`/`challenge`/`nonce` and a stable
   `network_context`; exact allowed redirect URI.
2. `GET /us/auth/callback` — Stytch authenticate (token → session, factors);
   opaque-subject mapping (Stytch `user_id` → durable `sub`); bridge mints the
   closed ES256 assertion (≤300 s, genuine `auth_time`).
3. `exchangeIdentity` (Daniel's step 5) with that assertion.
4. Bridge JWKS at a bridge-specific path, distinct key from the BFF assertion key.

**Appendix A rows this fills after Sprint B:** provider id (`refi-email`),
bridge issuer (HTTPS, ours), audience (one string ≤256), bridge JWKS URL,
current `kid`, exact redirect URIs.
