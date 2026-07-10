/**
 * Auth ↔ trading account link (G-007).
 */
import { makePrototypeMeta, type PrototypeMeta } from "../store";
import { resolveKvStore } from "../../store";

export interface AuthSessionLink {
  authId: string;
  accountId: string;
  linkedAt: string;
  source: "onboarding" | "recovery";
  meta: PrototypeMeta;
}

// Routed through the storage factory (S3). Collection name unchanged.
const links = resolveKvStore<AuthSessionLink>(
  "auth-session-link",
  "auth-session-links",
);

function linkKey(authId: string, accountId: string): string {
  return `${authId}__${accountId}`;
}

export async function getAuthSessionLink(
  authId: string,
): Promise<AuthSessionLink | null> {
  const all = await links.list(`${authId}__`);
  const first = all[0];
  return first ? first.value : null;
}

export async function linkAuthToAccount(args: {
  authId: string;
  accountId: string;
  source: "onboarding" | "recovery";
  correlationId: string;
}): Promise<AuthSessionLink> {
  const link: AuthSessionLink = {
    authId: args.authId,
    accountId: args.accountId,
    linkedAt: new Date().toISOString(),
    source: args.source,
    meta: makePrototypeMeta(args.correlationId),
  };
  await links.put(linkKey(args.authId, args.accountId), link);
  return link;
}
