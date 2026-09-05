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
 * ─── What identity-ccid sends, and what we must do with it ─────────────────
 *
 * Daniel 2026-08-19 confirms the handoff carries `auth_time` (the underlying
 * user authentication time) and a non-empty `amr` array. `acr` may be added
 * later; `amr` is the required v1 method claim. Method values ship with the
 * contract, "initially covering email verification code and email magic link"
 * — not spelled here, because guessing them would produce a set that quietly
 * disagrees with `v1.0.0-dev.1`.
 *
 * The obligation on this module, in his words: preserve `auth_time` and `amr`
 * in the server-side session and copy them into each user assertion; do NOT
 * replace `auth_time` when the session refreshes or a new assertion is minted.
 * Only a new underlying authentication or a step-up updates it.
 *
 * That is why both are read here and never defaulted. A refresh path that
 * re-stamps `auth_time` would defeat step-up while every test still passed —
 * the assertion would look perfectly well-formed.
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
import { DEMO_PERSONA_ACCOUNT_LINK } from "../demo/account-link";

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
  /**
   * BFF session id, carried as `sid` in the investor-api user assertion
   * (D-017). Distinct from `authId`: one user_id may have several concurrent
   * sessions, and investor-api correlates and revokes on the session, not the
   * user.
   */
  sid?: string;
  /**
   * UNIX seconds of the UNDERLYING user authentication, propagated from the
   * identity-ccid assertion — NOT the time this session was minted or last
   * refreshed.
   *
   * This is the input to step-up (D-015): investor-api enforces a maximum
   * auth_time age of 10 minutes and answers STEP_UP_REQUIRED otherwise.
   * Daniel: "Merely minting a new BFF assertion from an old session does not
   * satisfy step-up." So a session refresh must NEVER advance this value; only
   * a fresh identity-ccid authentication may.
   */
  authTime?: number;
  /**
   * Authentication methods from the identity-ccid assertion (`amr`).
   *
   * Non-empty whenever the session came from a real identity-ccid handoff
   * (Daniel 2026-08-19). Optional here only because the MSW-minted session
   * does not carry one yet; minting an assertion without it throws rather
   * than substituting a method we did not observe.
   */
  amr?: string[];
  /**
   * Authentication context class reference. ADDITIVE to `amr`, never a
   * replacement for it — `acr` "may be added later, but `amr` will be the
   * required v1 method claim".
   */
  acr?: string;
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
      // Demo tier only: the persona registry supplies the session → account
      // link the identity exchange would otherwise have written. Keyed by the
      // VERIFIED subject; the browser chose a persona label, never an account.
      // Account-scoped reads still re-authorize against `listAccounts`.
      else if (getServerEnv().REFI_ENV === "demo") {
        const demoAccount = DEMO_PERSONA_ACCOUNT_LINK[sub];
        if (demoAccount) ctx.accountId = demoAccount;
      }
      // Session-identity claims for the investor-api user assertion (D-017).
      //
      // READ, NEVER SYNTHESISED, and never re-stamped. `auth_time` must come
      // from the identity-ccid authentication; a missing value surfaces as a
      // mint-time failure rather than a fabricated "now" that would silently
      // defeat step-up. Daniel 2026-08-19 makes the non-replacement explicit:
      // a session refresh or a fresh assertion must carry the ORIGINAL
      // `auth_time` forward — only a new underlying authentication or a
      // step-up moves it.
      //
      // Absent today because the session is MSW-minted; the identity-ccid
      // exchange (GAP-IDENTITY-018) populates them.
      if (typeof payload["sid"] === "string") ctx.sid = payload["sid"];
      if (typeof payload["auth_time"] === "number") {
        ctx.authTime = payload["auth_time"];
      }
      if (
        Array.isArray(payload["amr"]) &&
        payload["amr"].every((m): m is string => typeof m === "string")
      ) {
        ctx.amr = payload["amr"];
      }
      if (typeof payload["acr"] === "string") ctx.acr = payload["acr"];
      return ctx;
    } catch {
      return null;
    }
  }

  // No session cookie at all: only then may the local dev fallback apply.
  return await devFallback(req);
}
