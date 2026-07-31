/**
 * BFF auth context extraction.
 *
 * Reads the `us_session_v1` cookie and resolves an auth context. The session
 * JWT is currently issued by MSW (G-002 bucket A); this module remains the
 * single swap point for real verification.
 *
 * ─── What it swaps to (Daniel 2026-07-28, closes D8) ───────────────────────
 *
 * `identity-ccid` — NOT `auth-siwe`. The swap is:
 *   1. identity-ccid verifies the investor's email (magic link or code) and
 *      issues a short-lived, single-use signed assertion.
 *   2. This module validates that assertion against identity-ccid's PUBLISHED
 *      JWKS — asymmetric, not the HS256 symmetric secret used below — checking
 *      issuer, audience, subject, iat/exp, replay, auth-time, verified-email,
 *      and auth-method claims.
 *   3. The BFF then mints ITS OWN secure, HTTP-only, server-side session. The
 *      browser session stays BFF-owned; the assertion is exchanged, never
 *      forwarded.
 *
 * Email-first onboarding is primary and MUST NOT require a wallet. `auth-siwe`
 * is not the primary login integration — it may later verify a wallet
 * signature to LINK an address to an existing `user_id` where there is a
 * defined authorization purpose. See `apps/web/app/_hooks/useSiweAuth.ts`.
 *
 * ─── Identity is not authorization ─────────────────────────────────────────
 *
 * A verified identity satisfies NO jurisdiction, KYC, advisory-profile,
 * disclosure, consent, broker, or account-state gate. Mutable facts must never
 * be embedded as durable token permissions — every one of them is checked
 * against current backend state on every request. Do not cache a gate verdict
 * into the session.
 *
 * ─── Blocked, deliberately ─────────────────────────────────────────────────
 *
 * The JWKS URL, issuer, audience, and the assertion-exchange endpoint all
 * arrive with Daniel's dev connection package (§8). None of them are guessed
 * here. `GAP-IDENTITY-018` tracks the exchange itself.
 */
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getServerEnv } from "../config/env";
import { getAuthSessionLink } from "../prototype-store/entities/auth-link";

const SESSION_COOKIE = "us_session_v1";

export interface AuthContext {
  /**
   * The BFF session subject. Under identity-ccid this carries the stable,
   * OPAQUE `user_id`. Email addresses, IdP subjects, and wallet addresses are
   * LINKED IDENTIFIERS — never user or account ids — so none of them may be
   * assigned here.
   */
  authId: string;
  /**
   * The account SELECTED for this request. One authenticated user maps to
   * zero, one, or many accounts via `Accounts.user_id`.
   *
   * This is a CLAIM TO BE VERIFIED, never an authorization. Every
   * `/api/v1/investor/*` route must re-authorize the user→account
   * relationship against current backend state; a BFF- or browser-supplied
   * `account_id` is never sufficient on its own.
   *
   * `GAP-MULTIACCT-019`: resolution currently comes from
   * `getAuthSessionLink()`, which lists by `authId` prefix and returns
   * `all[0]` — a silent, non-deterministic pick if a user ever has two
   * accounts. Benign only because every fixture persona has exactly one. This
   * MUST become an explicit account-selection step plus per-request
   * re-authorization before any multi-account fixture is loaded; Daniel's
   * cross-account isolation test user (§8) is what makes that testable.
   */
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
