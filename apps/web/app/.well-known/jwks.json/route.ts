/**
 * GET /.well-known/jwks.json
 *
 * The BFF's published signing keys for the `X-Refinity-User-Assertion` JWT.
 * investor-api fetches and caches this, pins our issuer, and selects the
 * verification key by `kid` (Daniel 2026-08-17 — see
 * docs/phase2-7-daniel-contract-mechanics-resolution.md §2, D-017).
 *
 * PUBLIC BY DESIGN. It contains only public key material; the private half
 * lives in BFF_ASSERTION_PRIVATE_KEY_JWK and is never read here — the public
 * JWK is derived by stripping `d`, so the published key cannot drift from the
 * key that actually signs.
 *
 * Unauthenticated and uncorrelated on purpose: this is a machine-readable
 * discovery document a backend fetches without a session, so it does not go
 * through the BFF handler (no auth context, no envelope, no correlation id).
 *
 * THE PATH IS PART OF THE CONTRACT. investor-api uses only the explicitly
 * configured JWKS URL — it does not derive one from `iss` and will not follow a
 * key URL supplied by an assertion (Daniel 2026-08-19). In dev that URL is
 * `https://bff-dev.refi.trading/.well-known/jwks.json`. So this route must stay
 * at this path across redeploys: moving it is a coordinated config change on
 * his side, not something we can do unilaterally.
 */
import { NextResponse } from "next/server";
import { getPublicJwks } from "@lib/investor-api/user-assertion";

/**
 * Never statically prerendered: the key set is read from server env at
 * request time, and a build-time snapshot would survive a key rotation.
 */
export const dynamic = "force-dynamic";

/**
 * Matches investor-api's own JWKS cache TTL of five minutes (Daniel
 * 2026-08-19), so no intermediary holds a key set longer than he does.
 *
 * This is not what makes rotation safe. The overlap window
 * (BFF_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK, minimum ten minutes) is — this only
 * bounds how long a stale copy can persist in between. Raising it without
 * raising the overlap would silently shorten the effective margin.
 */
const CACHE_MAX_AGE_SECONDS = 300;

export async function GET(): Promise<NextResponse> {
  try {
    const jwks = await getPublicJwks();
    return NextResponse.json(jwks, {
      headers: {
        "Cache-Control": `public, max-age=${String(CACHE_MAX_AGE_SECONDS)}, must-revalidate`,
        "Content-Type": "application/jwk-set+json",
      },
    });
  } catch {
    // A misconfigured or missing signing key must not leak configuration
    // detail to an unauthenticated caller. It fails loudly at mint time
    // instead, where the operator sees the real message.
    return NextResponse.json(
      { error: "jwks_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
