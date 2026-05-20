/**
 * Session projection — investor-readable view of the current auth session
 * + the linked trading account context.
 *
 * Authoritative SIWE session lives elsewhere (today: MSW; tomorrow:
 * Daniel's auth-siwe service). This entity is a lightweight projection so
 * the dashboard can answer "who am I, what account am I acting on, when
 * does my session expire" without re-deriving from cookies on every screen.
 */
import { kvStore, makePrototypeMeta, type PrototypeMeta } from "../store";

export interface SessionProjection {
  authId: string;
  accountId?: string;
  issuedAt: string;
  expiresAt: string;
  source: "prototype-bff" | "backend";
  meta: PrototypeMeta;
}

const sessions = kvStore<SessionProjection>("sessions");

export async function getSession(
  authId: string,
): Promise<SessionProjection | null> {
  return sessions.get(authId);
}

export async function putSession(args: {
  authId: string;
  accountId?: string;
  ttlSeconds?: number;
  correlationId: string;
}): Promise<SessionProjection> {
  const issuedAt = new Date();
  const expiresAt = new Date(
    issuedAt.getTime() + (args.ttlSeconds ?? 60 * 60 * 8) * 1000,
  );
  const proj: SessionProjection = {
    authId: args.authId,
    ...(args.accountId ? { accountId: args.accountId } : {}),
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    source: "prototype-bff",
    meta: makePrototypeMeta(args.correlationId),
  };
  await sessions.put(args.authId, proj);
  return proj;
}

export async function clearSession(authId: string): Promise<void> {
  await sessions.delete(authId);
}
