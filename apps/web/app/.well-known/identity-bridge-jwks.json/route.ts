/**
 * GET /.well-known/identity-bridge-jwks.json
 *
 * The frontend IDENTITY BRIDGE's published signing keys — the keys
 * identity-ccid uses to verify the upstream identity assertion at Daniel's
 * identity exchange (step 2 / step 4). This is NOT the Investor API
 * assertion JWKS (/.well-known/jwks.json): the bridge signs with a
 * logically and structurally separate key (mandate §15), so it publishes a
 * separate key set at a separate path. Daniel configures this URL
 * explicitly in step 4; nothing derives it from `iss`.
 *
 * PUBLIC BY DESIGN: public key material only. The private half is
 * BRIDGE_ASSERTION_PRIVATE_KEY_JWK or a non-exportable KMS key version, and
 * the published key is derived from the signer that actually signs, so the
 * two cannot drift. Unauthenticated, uncorrelated, no envelope.
 */
import { NextResponse } from "next/server";
import { getBridgePublicJwks } from "../../../src/lib/auth/identity-bridge";

export const dynamic = "force-dynamic";

/** Same TTL as the Investor API JWKS: bounded by the rotation overlap window. */
const CACHE_MAX_AGE_SECONDS = 300;

export async function GET(): Promise<NextResponse> {
  try {
    const jwks = await getBridgePublicJwks();
    return NextResponse.json(jwks, {
      headers: {
        "Cache-Control": `public, max-age=${String(CACHE_MAX_AGE_SECONDS)}, must-revalidate`,
        "Content-Type": "application/jwk-set+json",
      },
    });
  } catch {
    // Configuration detail never reaches an unauthenticated caller.
    return NextResponse.json(
      { error: "jwks_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
