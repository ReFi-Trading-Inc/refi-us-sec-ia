/**
 * POST /api/v1/investor/alpha-claim  —  G-track sync point 1 (Sprint 3).
 *
 * Consumes a single AlphaHandoffToken from the ReFi Alpha game and binds
 * the caller's game progress to the waitlist application layer.
 *
 * Contract (ReFi Alpha spec §2.2/§2.3, folded into Sprint Plan v3 Sprint 3):
 *   - JWT is ES256, iss=`refi-alpha`, aud=`refi-us-sec-ia`, exp ≤ 10 min.
 *   - Signature verified with the game's public key (server env, never
 *     NEXT_PUBLIC).
 *   - jti is single-use; consumed via a durable atomic put-if-absent.
 *     Second and later attempts against the same jti return the existing
 *     binding (idempotent), never a duplicate row.
 *   - Behavioural dimensions (§6.6) MUST NOT appear on the token; strict
 *     Zod parse rejects any private claim outside the allowlist.
 *   - CSRF-exempt because the token *is* the credential — but origin is
 *     checked so a browser-issued cross-origin POST still fails.
 *   - Rate limiting arrives with Sprint 6's global limits.
 *
 * Response shape is uniform across first-consumption and idempotent
 * replays so the game and future funnel screens can call the same code
 * path on refresh/reload without observing different states.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { importJWK, jwtVerify } from "jose";
import { correlationIdFrom } from "@lib/bff/correlation";
import { enforceCsrfOrigin } from "@lib/bff/csrf";
import { isEnabled } from "@lib/feature-flags";
import { getServerEnv } from "@lib/config/env";
import { bindHandoff } from "@lib/prototype-store/entities/alpha-application";
import { consumeJtiIfAbsent } from "@lib/prototype-store/entities/alpha-handoff-jti";

const requestSchema = z
  .object({
    token: z.string().min(20),
  })
  .strict();

/**
 * Strict claim schema. Every field allowed on the token appears here.
 * Anything else — including the behavioural dimensions listed as
 * permanently excluded in spec §6.6 — is a strict-parse rejection and a
 * 401 response.
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

function forbidden(correlationId: string, code: string): NextResponse {
  return NextResponse.json(
    { error: { code, message: "handoff verification failed" }, correlationId },
    { status: 401 },
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationIdFrom(req);
  if (!isEnabled("FLAG_ALPHA_CLAIM_ROUTE")) {
    return NextResponse.json(
      {
        error: { code: "flag_off", message: "alpha claim disabled" },
        correlationId,
      },
      { status: 404 },
    );
  }
  const csrf = enforceCsrfOrigin(req, correlationId);
  if (csrf) return csrf;

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        error: { code: "invalid_input", message: "body must be JSON" },
        correlationId,
      },
      { status: 400 },
    );
  }
  const parsedReq = requestSchema.safeParse(body);
  if (!parsedReq.success) {
    return NextResponse.json(
      {
        error: { code: "invalid_input", message: "token is required" },
        correlationId,
      },
      { status: 400 },
    );
  }

  // Verify signature + iss/aud/exp/alg. jose enforces exp automatically
  // and rejects any algorithm outside `algorithms`. Pinning to ES256
  // matches spec §2.2 exactly.
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
    return forbidden(correlationId, "signature_or_claims_invalid");
  }

  // Strict claim parse. Any unknown key here — including a smuggled
  // DimensionCode field — fails the request outright.
  const parsedClaims = claimSchema.safeParse(payload);
  if (!parsedClaims.success) {
    return forbidden(correlationId, "unrecognized_claim");
  }
  const claims = parsedClaims.data;

  // Bind first so we have an applicationRef to embed in the jti record,
  // then consume. `consumeJtiIfAbsent` is atomic; if a concurrent claim
  // arrives, the second caller reads the existing record and returns
  // the same binding rather than double-writing.
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
