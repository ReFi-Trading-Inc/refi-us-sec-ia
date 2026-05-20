/**
 * Auth ↔ trading account link (G-007).
 */
import { kvStore, makePrototypeMeta, type PrototypeMeta } from "../store";

export interface AuthSessionLink {
  authId: string;
  accountId: string;
  linkedAt: string;
  source: "onboarding" | "recovery";
  meta: PrototypeMeta;
}

const links = kvStore<AuthSessionLink>("auth-session-links");

function linkKey(authId: string, accountId: string): string {
  return `${authId}__${accountId}`;
}

export async function getAuthSessionLink(
  authId: string,
): Promise<AuthSessionLink | null> {
  const all = await links.list(`${authId}__`);
  return all.length > 0 ? all[0]!.value : null;
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
