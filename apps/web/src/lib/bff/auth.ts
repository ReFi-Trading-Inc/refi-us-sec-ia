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
import { getServerEnv } from "../config/env";
import { getAuthSessionLink } from "../prototype-store/entities/auth-link";

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
  // the SERVER-ONLY REFI_ENV (never the client-visible NEXT_PUBLIC_REFI_ENV):
  // only "dev" enables it, so "staging" and "prod" fail closed. This keeps the
  // BFF testable end-to-end locally without a live SIWE backend.
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

  // A PRESENT session cookie must verify. A present-but-invalid token is a hard
  // rejection (null → 401 upstream) — never a silent downgrade to the dev
  // fallback. Algorithm is pinned; the secret is the validated server env, so a
  // missing secret fails boot in prod rather than disabling verification here.
  if (token) {
    try {
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(getServerEnv().SESSION_JWT_SECRET),
        { algorithms: ["HS256"] },
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

  // No session cookie at all: only then may the local dev fallback apply.
  return await devFallback(req);
}
