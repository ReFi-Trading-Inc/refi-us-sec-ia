/**
 * Connected BFF session records — durable, shared across Cloud Run instances.
 *
 * A session is created once from a verified identity exchange (Daniel's
 * step 5), keyed by its opaque `sid`. It carries exactly what the per-request
 * Investor assertion needs (`sub` = backend user id, `sid`, genuine
 * `auth_time`, optional `amr`) and nothing that grants authority: no account
 * id, no admission, no compliance verdict. Those are re-read from the backend
 * on every request.
 *
 * Revocation is a durable write, so a revoked session is refused by every
 * instance immediately; the browser cookie alone never proves a session.
 */
import { connectedKvStore, isExpired, nowIso } from "./index";

export const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
export const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 8;

export interface ConnectedSessionRecord {
  sid: string;
  /** Backend user id from the identity result (`sub`), never a provider id. */
  sub: string;
  /** Genuine underlying authentication time (Unix seconds). Never refreshed here. */
  authTime: number;
  amr?: string[];
  /** Which identity-result `jti` created this session (audit linkage). */
  identityResultJti: string;
  issuedAt: string;
  expiresAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
  correlationId: string;
}

function store() {
  return connectedKvStore<ConnectedSessionRecord>("session");
}

export function newSessionId(): string {
  const sid = `sid_${crypto.randomUUID().replace(/-/g, "")}`;
  if (!SESSION_ID_PATTERN.test(sid)) throw new Error("generated sid invalid");
  return sid;
}

export async function createConnectedSession(args: {
  sub: string;
  authTime: number;
  amr?: readonly string[];
  identityResultJti: string;
  ttlSeconds?: number;
  correlationId: string;
}): Promise<ConnectedSessionRecord> {
  if (!SESSION_ID_PATTERN.test(args.sub)) {
    throw new Error("session sub must be an opaque backend user id");
  }
  if (!Number.isFinite(args.authTime) || args.authTime <= 0) {
    throw new Error("session requires the genuine auth_time");
  }
  const issued = new Date();
  const record: ConnectedSessionRecord = {
    sid: newSessionId(),
    sub: args.sub,
    authTime: Math.floor(args.authTime),
    ...(args.amr && args.amr.length > 0 ? { amr: [...args.amr] } : {}),
    identityResultJti: args.identityResultJti,
    issuedAt: issued.toISOString(),
    expiresAt: new Date(
      issued.getTime() +
        (args.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS) * 1000,
    ).toISOString(),
    lastSeenAt: issued.toISOString(),
    revokedAt: null,
    revokedReason: null,
    correlationId: args.correlationId,
  };
  const created = await store().putIfAbsent(record.sid, record);
  if (!created) throw new Error("session id collision");
  return record;
}

/** The session if it exists, is unexpired and unrevoked; otherwise null. */
export async function getActiveConnectedSession(
  sid: string,
  now: Date = new Date(),
): Promise<ConnectedSessionRecord | null> {
  if (!SESSION_ID_PATTERN.test(sid)) return null;
  const record = await store().get(sid);
  if (!record) return null;
  if (record.revokedAt !== null) return null;
  if (isExpired(record.expiresAt, now)) return null;
  return record;
}

/** Durable revocation: every instance refuses the session from now on. */
export async function revokeConnectedSession(
  sid: string,
  reason: string,
): Promise<boolean> {
  const record = await store().get(sid);
  if (!record || record.revokedAt !== null) return false;
  await store().put(sid, {
    ...record,
    revokedAt: nowIso(),
    revokedReason: reason,
  });
  return true;
}

/** Bump last-seen without ever touching `authTime`. */
export async function touchConnectedSession(sid: string): Promise<void> {
  const record = await store().get(sid);
  if (!record || record.revokedAt !== null) return;
  await store().put(sid, { ...record, lastSeenAt: nowIso() });
}
