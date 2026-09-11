/**
 * Opaque subject mapping: identity-provider user id → ReFi `sub`.
 *
 * Daniel's upstream assertion `sub` must be opaque, stable and durable —
 * never an email, a hash of an email, a display name, a wallet address or
 * the backend user id. The provider's user id (Stytch `user_id`) is stable
 * but is the provider's vocabulary, not ours, so it is mapped once to a
 * ReFi-owned opaque id that satisfies `^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$`
 * and persisted. An email change at the provider changes nothing here.
 *
 * The forward map is created with an atomic `putIfAbsent`, so two instances
 * racing on a user's first login converge on one subject; the reverse map
 * exists for support/audit lookups and is written only after the forward
 * map won.
 */
import { randomBytes } from "node:crypto";
import { connectedKvStore, nowIso } from "./index";

export const SUBJECT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
export const SUBJECT_PROVIDERS = ["stytch"] as const;
export type SubjectProvider = (typeof SUBJECT_PROVIDERS)[number];

export interface SubjectMapRecord {
  provider: SubjectProvider;
  /** The provider's stable user id (e.g. Stytch `user-…`). Not email. */
  providerUserId: string;
  /** ReFi opaque subject used as the upstream assertion `sub`. */
  sub: string;
  createdAt: string;
  correlationId: string;
}

function forwardKey(provider: SubjectProvider, providerUserId: string): string {
  return `${provider}~${providerUserId}`;
}

export function newOpaqueSubject(): string {
  // "usr_" + 32 hex chars = 36 chars; matches Daniel's pattern.
  const sub = `usr_${randomBytes(16).toString("hex")}`;
  if (!SUBJECT_PATTERN.test(sub)) throw new Error("generated sub invalid");
  return sub;
}

/**
 * Return the existing mapping or create one atomically. Never derived from
 * anything the caller passes besides the provider user id key.
 */
export async function getOrCreateOpaqueSubject(args: {
  provider: SubjectProvider;
  providerUserId: string;
  correlationId: string;
}): Promise<{ record: SubjectMapRecord; created: boolean }> {
  if (args.providerUserId.includes("@")) {
    throw new Error("providerUserId must not be an email address");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{3,200}$/.test(args.providerUserId)) {
    throw new Error("providerUserId must be the provider's opaque id");
  }
  const forward = connectedKvStore<SubjectMapRecord>("subject-map");
  const reverse = connectedKvStore<SubjectMapRecord>("subject-map-reverse");
  const key = forwardKey(args.provider, args.providerUserId);
  const existing = await forward.get(key);
  if (existing) return { record: existing, created: false };
  const candidate: SubjectMapRecord = {
    provider: args.provider,
    providerUserId: args.providerUserId,
    sub: newOpaqueSubject(),
    createdAt: nowIso(),
    correlationId: args.correlationId,
  };
  const won = await forward.putIfAbsent(key, candidate);
  if (!won) {
    const winner = await forward.get(key);
    if (!winner) throw new Error("subject map read-after-create failed");
    return { record: winner, created: false };
  }
  await reverse.put(candidate.sub, candidate);
  return { record: candidate, created: true };
}

export async function lookupSubject(
  sub: string,
): Promise<SubjectMapRecord | null> {
  if (!SUBJECT_PATTERN.test(sub)) return null;
  return connectedKvStore<SubjectMapRecord>("subject-map-reverse").get(sub);
}
