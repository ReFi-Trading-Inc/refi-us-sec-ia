/**
 * Authoritative account scope for Investor API reads.
 *
 * The BFF session's `accountId` is a CLAIM (see `AuthContext`). Every
 * `/api/v1/investor/*` read that names an `{account_id}` must re-authorize the
 * user→account relationship against current backend state. The user assertion
 * already binds the call to the session user; `listAccounts` returns only the
 * accounts that user owns. Resolution:
 *
 *   - the claimed account is among the backend's accounts → use it;
 *   - no claim (or a stale one) and exactly one backend account → use it;
 *   - zero accounts, or several without a matching claim → fail closed.
 *
 * The browser never supplies an account id; nothing here reads the request.
 */
import type { InvestorApiClient } from "@refi/api-clients/investor-api";
import type { AuthContext } from "../bff/auth";
import { collectPages, CONTRACT_MAX_PAGE_SIZE } from "./pagination";

export class AccountScopeError extends Error {
  constructor(readonly reason: "no_account" | "ambiguous_account") {
    super(`account scope unresolved: ${reason}`);
    this.name = "AccountScopeError";
  }
}

const MAX_ACCOUNT_PAGES = 2;

export async function resolveAccountScope(
  client: InvestorApiClient,
  auth: Pick<AuthContext, "accountId">,
): Promise<string> {
  const { items } = await collectPages(
    async (cursor) => {
      const res = await client.call("listAccounts", {
        query: { page_size: CONTRACT_MAX_PAGE_SIZE, cursor },
      });
      return { items: res.data.data.items, page: res.data.data.page };
    },
    { maxPages: MAX_ACCOUNT_PAGES },
  );
  const ids = [...new Set(items.map((a) => a.account_id))];
  if (auth.accountId !== undefined && ids.includes(auth.accountId)) {
    return auth.accountId;
  }
  if (ids.length === 1) return ids[0] as string;
  throw new AccountScopeError(
    ids.length === 0 ? "no_account" : "ambiguous_account",
  );
}
