/**
 * Session revocation list (S1 residual, alpha-gate item).
 *
 * A KV of revoked session identifiers keyed by `jti`. `auth.ts` checks
 * every verified token's jti against this list; a hit is treated as
 * a verify failure (401), so a stolen valid token stops working the
 * moment it's revoked — not when its `exp` finally arrives.
 *
 * Storage is BFF-owned and durable so a revocation survives redeploys
 * (a session revoked at 09:00 must stay revoked through the 09:15
 * deploy or the whole exercise is theatre). TTL is set to the token's
 * `exp` so an entry expires naturally shortly after the underlying
 * token would have expired anyway — the list never grows without bound.
 *
 * `jti` is required on every session token per Sprint 1 hardening.
 * Older tokens without a jti pre-date the revocation feature; they
 * were already rejected by the S1 `requiredClaims` gate.
 */
import { resolveKvStore } from "../../store";

export interface SessionRevocationEntry {
  jti: string;
  authId: string;
  revokedAt: string;
  reason: "logout" | "compromise" | "operator";
  expiresAt: string; // ISO — natural cleanup marker
}

const store = resolveKvStore<SessionRevocationEntry>(
  "session-revocation",
  "session-revocation",
);

export async function isSessionRevoked(jti: string): Promise<boolean> {
  const row = await store.get(jti);
  if (!row) return false;
  // Cleanup: entries past their expiresAt are dead weight; drop them
  // so the list stays hot. A slow reader that races with cleanup and
  // sees the entry gone before the token itself expires is fine — the
  // token's `exp` is the last-resort ceiling.
  if (row.expiresAt && Date.parse(row.expiresAt) < Date.now()) {
    await store.delete(jti);
    return false;
  }
  return true;
}

export async function revokeSession(args: {
  jti: string;
  authId: string;
  reason: SessionRevocationEntry["reason"];
  /** Token's exp in seconds since epoch (jose returns this as `exp`). */
  tokenExp: number;
}): Promise<SessionRevocationEntry> {
  const entry: SessionRevocationEntry = {
    jti: args.jti,
    authId: args.authId,
    revokedAt: new Date().toISOString(),
    reason: args.reason,
    expiresAt: new Date(args.tokenExp * 1000).toISOString(),
  };
  await store.put(args.jti, entry);
  return entry;
}
