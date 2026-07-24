/**
 * POST /api/v1/investor/session/revoke  —  logout / session kill.
 *
 * Decodes the current session cookie, adds its jti to the durable
 * revocation list (S1 residual), and clears the cookie on the response.
 * Every subsequent request bearing the same token will fail auth
 * verify at `auth.ts` because the jti check runs after JWT verify.
 *
 * A revoked-but-not-yet-expired token replayed by an attacker who
 * copied it before revocation → 401. That is the guarantee this route
 * provides on top of the Sprint 1 hardening.
 *
 * CSRF-protected by origin check. Rate-limited by the mutate class so
 * a token-mash cannot swamp the revocation list.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { correlationIdFrom } from "@lib/bff/correlation";
import { enforceCsrfOrigin } from "@lib/bff/csrf";
import { enforceRateLimit, sessionKey } from "@lib/bff/rate-limit";
import { revokeSession } from "@lib/prototype-store/entities/session-revocation";
import { getServerEnv } from "@lib/config/env";

const SESSION_COOKIE = "us_session_v1";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationIdFrom(req);
  const csrf = enforceCsrfOrigin(req, correlationId);
  if (csrf) return csrf;
  const rate = enforceRateLimit(req, "mutate", sessionKey(req));
  if (rate) return rate;

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const clear = (status: number, body: unknown): NextResponse => {
    const res = NextResponse.json(
      { ...(body as object), correlationId },
      {
        status,
      },
    );
    // Whether or not the token was valid, clearing the cookie is safe
    // and makes the "logout" contract observable to the client.
    res.cookies.set(SESSION_COOKIE, "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
    });
    return res;
  };

  if (!token) {
    // No session to revoke. Still clear the cookie so the client
    // observes a clean logout state.
    return clear(200, { data: { revoked: false, reason: "no_session" } });
  }

  const secret = process.env["SESSION_JWT_SECRET"];
  if (!secret) {
    return clear(500, {
      error: { code: "server_misconfigured" },
    });
  }

  try {
    const env = getServerEnv();
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      {
        algorithms: ["HS256"],
        issuer: env.SESSION_JWT_ISSUER,
        audience: env.SESSION_JWT_AUDIENCE,
        clockTolerance: 5,
        requiredClaims: ["exp", "iat", "sub", "jti"],
      },
    );
    const jti = typeof payload.jti === "string" ? payload.jti : null;
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    const exp = typeof payload.exp === "number" ? payload.exp : null;
    if (!jti || !sub || !exp) {
      return clear(200, {
        data: { revoked: false, reason: "unrevokable_token" },
      });
    }
    await revokeSession({
      jti,
      authId: sub,
      reason: "logout",
      tokenExp: exp,
    });
    return clear(200, { data: { revoked: true } });
  } catch {
    // Verify failed — the token was already invalid, so there's nothing
    // to add to the revocation list. Clear the cookie anyway.
    return clear(200, {
      data: { revoked: false, reason: "verify_failed" },
    });
  }
}
