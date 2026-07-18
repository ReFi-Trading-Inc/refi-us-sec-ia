/**
 * POST /api/v1/investor/alpha-claim
 *
 * Consumes a single AlphaHandoffToken minted by the ReFi Alpha game and binds
 * the caller's game progress to the on-domain waitlist application layer.
 *
 * Narrow manual port onto current main. The behavioral contract is commit
 * 6dbeb7c; this route reproduces that behavior WITHOUT the Phase 2.6
 * dependency surface:
 *   - the feature flag is read directly from process.env (no feature-flag
 *     module);
 *   - origin protection is a route-local same-origin check (no @lib/bff/csrf);
 *   - rate limiting (5f903be) and PostHog identity stitching (4ae5674) are
 *     deferred and intentionally absent.
 *
 * Contract (ReFi Alpha spec §2.2/§2.3):
 *   - JWT is ES256; iss/aud pinned via env; exp enforced with 5s tolerance.
 *   - jti is single-use; consumed via a prototype-grade put-if-absent. Replays
 *     of the same jti return the original binding (idempotent), never a
 *     duplicate row. See alpha-handoff-jti.ts for the replay-grade caveat.
 *   - The token IS the credential, so the route is CSRF-exempt by design — but
 *     a same-origin check still rejects browser-issued cross-origin POSTs.
 *   - Unknown/behavioral claims (spec §6.6) are rejected by a strict Zod parse.
 *
 * Imports are relative (not the @lib alias) so the route is loadable both by
 * the Next build and by the repo-root tsx contract-assertion harness, which
 * has no @lib path mapping.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { importJWK, jwtVerify } from "jose";
import { correlationIdFrom } from "../../../../../src/lib/bff/correlation";
import { getServerEnv } from "../../../../../src/lib/config/env";
import { bindHandoff } from "../../../../../src/lib/prototype-store/entities/alpha-application";
import { consumeJtiIfAbsent } from "../../../../../src/lib/prototype-store/entities/alpha-handoff-jti";

const requestSchema = z
  .object({
    token: z.string().min(20),
  })
  .strict();

/**
 * Strict claim schema. Every field allowed on the token appears here; anything
 * else — including the behavioral dimensions permanently excluded by spec §6.6
 * — is a strict-parse rejection and a 401.
 */
const claimSchema = z
  .object({
    iss: z.literal("refi-alpha"),
    aud: z.literal("refi-us-sec-ia"),
    sub: z.string().min(1),
    exp: z.number().int().positive(),
    jti: z.string().min(1),
    iat: z.number().int().positive().optional(),
    nbf: z.number().int().positive().optional(),
    progressSnapshotId: z.string().min(1),
    completedArenas: z.array(z.string()).max(64),
    machineBuilderUnlocked: z.boolean(),
    machineVersionCount: z.number().int().nonnegative(),
    machineBeatRate: z.number().min(0).max(1).nullable(),
    campaignSource: z.string().max(256).optional(),
    intendedDestination: z.enum([
      "ELIGIBILITY",
      "PAPER",
      "SIGNAL_INFO",
      "MANAGED_INFO",
    ]),
  })
  .strict();

function errorResponse(
  correlationId: string,
  code: string,
  message: string,
  status: number,
): NextResponse {
  return NextResponse.json(
    { error: { code, message }, correlationId },
    { status },
  );
}

/**
 * The origin declared by the request: the Origin header when present (and not
 * the literal "null"), otherwise the origin of a valid Referer. Returns null
 * when neither yields a usable origin.
 */
function declaredOrigin(req: NextRequest): string | null {
  const origin = req.headers.get("origin");
  if (origin && origin !== "null") return origin;
  const referer = req.headers.get("referer");
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/**
 * Route-local same-origin guard. The expected origin is the request's own
 * origin (`req.nextUrl.origin`) — derived from the server-resolved URL, not
 * from client-supplied forwarded headers, which are not trusted as the sole
 * authority. A browser-issued mutation without a declared origin, or from a
 * different origin, is the classic CSRF fingerprint and is rejected 403.
 */
function enforceSameOrigin(
  req: NextRequest,
  correlationId: string,
): NextResponse | null {
  const declared = declaredOrigin(req);
  if (!declared) {
    return errorResponse(
      correlationId,
      "origin_missing",
      "origin required",
      403,
    );
  }
  let normalizedDeclared: string;
  try {
    normalizedDeclared = new URL(declared).origin;
  } catch {
    return errorResponse(
      correlationId,
      "origin_untrusted",
      "origin not allowed",
      403,
    );
  }
  if (normalizedDeclared !== req.nextUrl.origin) {
    return errorResponse(
      correlationId,
      "origin_untrusted",
      "origin not allowed",
      403,
    );
  }
  return null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationIdFrom(req);

  // Feature flag, read directly from the environment (no feature-flag module).
  // Any value other than the exact string "on" disables the route with a 404
  // so an unshipped surface is indistinguishable from a nonexistent one.
  if (process.env["FLAG_ALPHA_CLAIM_ROUTE"] !== "on") {
    return errorResponse(
      correlationId,
      "flag_off",
      "alpha claim disabled",
      404,
    );
  }

  const originReject = enforceSameOrigin(req, correlationId);
  if (originReject) return originReject;

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return errorResponse(
      correlationId,
      "invalid_input",
      "body must be JSON",
      400,
    );
  }
  const parsedReq = requestSchema.safeParse(body);
  if (!parsedReq.success) {
    return errorResponse(
      correlationId,
      "invalid_input",
      "token is required",
      400,
    );
  }

  // Verify signature + iss/aud/exp/alg. jose enforces exp automatically and
  // rejects any algorithm outside `algorithms`; pinning ES256 matches §2.2.
  const env = getServerEnv();
  let payload: unknown;
  try {
    const jwk = JSON.parse(env.ALPHA_HANDOFF_PUBLIC_KEY_JWK) as Record<
      string,
      unknown
    >;
    const key = await importJWK(jwk, "ES256");
    const verified = await jwtVerify(parsedReq.data.token, key, {
      algorithms: ["ES256"],
      issuer: env.ALPHA_HANDOFF_ISSUER,
      audience: env.ALPHA_HANDOFF_AUDIENCE,
      clockTolerance: 5,
    });
    payload = verified.payload;
  } catch {
    return errorResponse(
      correlationId,
      "signature_or_claims_invalid",
      "handoff verification failed",
      401,
    );
  }

  // Strict claim parse. Any unknown key — including a smuggled behavioral
  // dimension — fails the request outright.
  const parsedClaims = claimSchema.safeParse(payload);
  if (!parsedClaims.success) {
    return errorResponse(
      correlationId,
      "unrecognized_claim",
      "handoff verification failed",
      401,
    );
  }
  const claims = parsedClaims.data;

  // Bind first so we have an applicationRef to embed in the jti record, then
  // consume. On replay, consumeJtiIfAbsent returns the ORIGINAL stored record,
  // so the response carries the first binding's applicationRef.
  const { application, storageKey } = await bindHandoff({
    alphaPlayerId: claims.sub,
    progressSnapshotId: claims.progressSnapshotId,
    completedArenas: claims.completedArenas,
    machineBuilderUnlocked: claims.machineBuilderUnlocked,
    machineVersionCount: claims.machineVersionCount,
    machineBeatRate: claims.machineBeatRate,
    ...(claims.campaignSource !== undefined
      ? { campaignSource: claims.campaignSource }
      : {}),
  });

  const { record, firstConsumption } = await consumeJtiIfAbsent({
    jti: claims.jti,
    alphaPlayerId: claims.sub,
    applicationRef: storageKey,
    correlationId,
  });

  return NextResponse.json(
    {
      data: {
        alphaPlayerId: record.alphaPlayerId,
        applicationRef: record.applicationRef,
        intendedDestination: claims.intendedDestination,
        score: application.score,
        firstConsumption,
      },
      correlationId,
    },
    { status: firstConsumption ? 201 : 200 },
  );
}
