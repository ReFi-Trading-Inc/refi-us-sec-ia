/**
 * Auth ↔ trading account link (G-007).
 *
 * The storage layer is already multi-account capable: links are keyed
 * `${authId}__${accountId}`, matching Daniel's model where one authenticated
 * user maps to zero, one, or many accounts via `Accounts.user_id`.
 *
 * The READ path is not. See `getAuthSessionLink` below — `GAP-MULTIACCT-019`.
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

/**
 * Resolve the account linked to an auth id.
 *
 * `GAP-MULTIACCT-019` — this returns a single link, but the key space allows
 * many. Rather than silently returning `all[0]` (a non-deterministic account
 * selection that would be invisible in production), an ambiguous result now
 * FAILS CLOSED: callers get `null` and the request 401s upstream.
 *
 * That is the correct posture until an explicit account-selection step exists.
 * Serving a user someone else's account — or an arbitrary one of their own —
 * is a worse failure than making them re-authenticate. Every fixture persona
 * has exactly one account today, so nothing regresses; the guard exists to
 * make the multi-account case loud the moment Daniel's cross-account isolation
 * fixture (§8) lands.
 */
export async function getAuthSessionLink(
  authId: string,
): Promise<AuthSessionLink | null> {
  const all = await links.list(`${authId}__`);
  if (all.length > 1) {
    console.error(
      `[GAP-MULTIACCT-019] ${String(all.length)} account links for one auth id. ` +
        `Refusing to guess which account the request meant. An explicit ` +
        `account-selection step plus per-request re-authorization is required ` +
        `before multi-account support is enabled.`,
    );
    return null;
  }
  const only = all[0];
  return only ? only.value : null;
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
