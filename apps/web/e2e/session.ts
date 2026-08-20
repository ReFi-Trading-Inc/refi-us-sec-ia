/**
 * E2E session-token helper. TEST-ONLY — never imported by application code.
 *
 * ─── Why this exists ───────────────────────────────────────────────────────
 *
 * Specs used to seed the literal string `"e2e-placeholder-session-token"` as
 * `us_session_v1`. That predates the auth hardening in #39/#40, which made a
 * PRESENT-but-invalid session token a hard rejection rather than a silent
 * downgrade to the dev fallback (see `getAuthContext` in
 * `apps/web/src/lib/bff/auth.ts`, and the contract assertion "auth:
 * present-but-invalid session token fails closed (no dev downgrade)").
 *
 * Since that hardening, every spec seeding the placeholder got a null auth
 * context: account-scoped BFF routes returned 401 and pages rendered with
 * `data-mode="unset"`. That is why the Managed surfaces failed while static
 * form pages still passed.
 *
 * Deleting the cookie instead does NOT work — the app shell requires a
 * session, and the dev fallback only applies when no cookie is present at all.
 * The correct fixture is a properly signed token, which is what this mints.
 *
 * ─── What this deliberately does NOT do ────────────────────────────────────
 *
 * It does not weaken fail-closed authentication and does not reintroduce any
 * fallback for an invalid present token. Production behaviour is untouched:
 * this only produces a token the existing verifier legitimately accepts.
 *
 * ─── Claims ────────────────────────────────────────────────────────────────
 *
 * `getAuthContext` verifies the HS256 signature and requires a string `sub`.
 * `jose` additionally enforces `exp`/`nbf` when present. It does NOT check
 * `iss` or `aud`, so none is set here — inventing an issuer or audience the
 * verifier never reads would imply a contract that does not exist. When
 * identity-ccid lands (`GAP-IDENTITY-018`) the real assertion is asymmetric
 * and JWKS-verified with issuer/audience/replay/auth-time claims; this helper
 * mints the BFF's OWN session cookie, which is a different token entirely.
 */
import { SignJWT } from "jose";
import { authIdFor } from "./global-setup";

/**
 * Dedicated E2E signing secret.
 *
 * Declared explicitly and injected into the Playwright `webServer` env so the
 * token helper and the application server provably share one value. It is
 * deliberately NOT the application's non-prod `PROTOTYPE_DEFAULTS` fallback:
 * depending on that implicitly would silently break the moment the default
 * changed, and would couple test fixtures to an application-internal constant.
 *
 * Length satisfies the `z.string().min(32)` server-env schema.
 */
export const E2E_SESSION_JWT_SECRET =
  "e2e-only-session-jwt-secret-not-a-real-secret-32+";

/**
 * Mint a `us_session_v1` value for the user seeded under `eligibilityValue`.
 *
 * The subject is the same FNV-1a-derived dev auth id the seeder uses, so the
 * token resolves to that user's seeded `AuthSessionLink` and its account.
 * A fresh token is generated per call, so each test context gets its own.
 */
export async function e2eSessionToken(
  eligibilityValue: string,
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(authIdFor(eligibilityValue))
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(new TextEncoder().encode(E2E_SESSION_JWT_SECRET));
}

/**
 * The full cookie pair every authenticated spec needs: the eligibility cookie
 * the seeder keys users by, plus a session token the BFF will accept.
 */
export async function e2eAuthCookies(
  eligibilityValue: string,
): Promise<{ name: string; value: string; domain: string; path: string }[]> {
  return [
    {
      name: "us_eligibility_v1",
      value: eligibilityValue,
      domain: "localhost",
      path: "/",
    },
    {
      name: "us_session_v1",
      value: await e2eSessionToken(eligibilityValue),
      domain: "localhost",
      path: "/",
    },
  ];
}
