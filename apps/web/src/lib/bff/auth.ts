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
import { isSessionRevoked } from "../prototype-store/entities/session-revocation";
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
  // Local-dev-only escape hatch: without a real signed session, allow a
  // deterministic dev identity derived from the eligibility cookie. Gated on
  // the SERVER-ONLY validated REFI_ENV (never the client-visible
  // NEXT_PUBLIC_REFI_ENV): only "dev" enables it, so "staging" and "prod"
  // fail closed. (Stricter than the earlier not-prod check: an unknown or
  // missing tier must never silently enable the fallback.)
  if (getServerEnv().REFI_ENV !== "dev") return null;

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
    try {
      // Validated server env, not raw process.env: a missing/short secret
      // fails boot loudly instead of silently rejecting every session.
      const env = getServerEnv();
      const secret = env.SESSION_JWT_SECRET;
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
      // S1 residual: check the revocation list. A jti hit is treated
      // exactly like a verify failure — 401 at the caller. This is
      // the seam that makes "logout means logged out" true even for
      // a token an attacker copied five minutes ago.
      const jti = typeof payload.jti === "string" ? payload.jti : null;
      if (jti && (await isSessionRevoked(jti))) return null;
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
