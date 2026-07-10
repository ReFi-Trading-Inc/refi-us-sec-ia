/**
 * BFF auth context extraction.
 *
 * Reads the `us_session_v1` cookie and resolves an auth context (auth_id +
 * primary account_id if linked). The session JWT is currently issued by MSW
 * (G-002 bucket A) — when Daniel's `auth-siwe` service lands, this module is
 * the single place that needs to swap to backend verification.
 */
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getAuthSessionLink } from "../prototype-store/entities/auth-link";
import { getServerEnv } from "../config/env";

const SESSION_COOKIE = "us_session_v1";

export interface AuthContext {
  authId: string;
  /** Optional primary trading account; resolved from AuthSessionLink. */
  accountId?: string;
  /** Bucket A or backend; informs the response envelope. */
  source: "prototype-bff" | "backend";
}

async function devFallback(req: NextRequest): Promise<AuthContext | null> {
  // In non-production environments without a real signed session, allow a
  // deterministic dev identity derived from the eligibility cookie if present.
  // This keeps the BFF testable end-to-end without a live SIWE backend.
  //
  // Gate is REFI_ENV (server-only), NOT NEXT_PUBLIC_REFI_ENV. A public
  // build-time variable must never gate a security decision — the two
  // must be able to disagree so operators can force fail-closed in
  // preview/staging without a marketing-visible env flip.
  const env = process.env["REFI_ENV"];
  if (env === "prod" || env === "production") return null;

  const eligibility = req.cookies.get("us_eligibility_v1")?.value;
  if (!eligibility) return null;
  // Hash the eligibility token to a stable id; safe because it never leaves
  // the BFF process and is never claimed as evidence.
  const authId = `dev-${hash(eligibility).slice(0, 16)}`;
  const link = await getAuthSessionLink(authId);
  const ctx: AuthContext = { authId, source: "prototype-bff" };
  if (link?.accountId) ctx.accountId = link.accountId;
  return ctx;
}

function hash(input: string): string {
  // Cheap deterministic hash (FNV-1a) — adequate for a dev id.
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export async function getAuthContext(
  req: NextRequest,
): Promise<AuthContext | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;

  // Fail closed: if a session token is presented, it MUST verify. A
  // forged, expired, or otherwise invalid token returns null (401 at
  // the caller). It never falls through to the dev identity — that
  // would let any attacker degrade to devFallback by presenting
  // garbage. The dev fallback is only reachable when no session
  // token is presented at all AND REFI_ENV permits.
  if (token) {
    const secret = process.env["SESSION_JWT_SECRET"];
    if (!secret) return null;
    try {
      const env = getServerEnv();
      // jose enforces exp automatically; iss/aud are pinned so a token
      // minted for another audience (e.g., a sibling service that shares
      // the secret in a future misconfiguration) cannot pass this verify.
      // A clock skew tolerance of 5 seconds is enough for NTP drift
      // between the mint site and the BFF.
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(secret),
        {
          algorithms: ["HS256"],
          issuer: env.SESSION_JWT_ISSUER,
          audience: env.SESSION_JWT_AUDIENCE,
          clockTolerance: 5,
          requiredClaims: ["exp", "iat", "sub"],
        },
      );
      const sub = typeof payload.sub === "string" ? payload.sub : null;
      if (!sub) return null;
      const link = await getAuthSessionLink(sub);
      const ctx: AuthContext = { authId: sub, source: "prototype-bff" };
      if (link?.accountId) ctx.accountId = link.accountId;
      return ctx;
    } catch {
      return null;
    }
  }

  return await devFallback(req);
}
