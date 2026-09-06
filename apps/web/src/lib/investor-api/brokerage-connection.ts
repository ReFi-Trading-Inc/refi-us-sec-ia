/**
 * Brokerage connection — BFF projection of the contract's
 * `listBrokerageConnections` / `createBrokerageConnection` for the investor UI.
 *
 * Credential rule (C1b-2 row 13, D-LAUNCH-06 = YES): the browser collects a
 * paper key pair and transmits it ONCE to the same-origin BFF; the BFF
 * validates the shape and forwards it ONCE to the Investor API. Neither
 * persists, logs, caches, returns, reuses, or calls Alpaca. The projection
 * below carries status and metadata only — never a credential field.
 */
import type { OperationResponse } from "@refi/api-clients/investor-api";
import type { InvestorApiReadClient } from "./demo-client";

export type ContractBrokerageConnection =
  OperationResponse<"getBrokerageConnection">["data"];

export interface BrokerageConnectionView {
  connectionId: string;
  broker: "alpaca";
  environment: "paper" | "live";
  connectionStatus: ContractBrokerageConnection["connection_status"];
  credentialStatus: ContractBrokerageConnection["credential_status"];
  stateVersion: number;
  createdAt: string;
  updatedAt: string;
  validatedAt: string | null;
  lastSyncedAt: string | null;
  staleAt: string | null;
  brokerAccountId: string | null;
}

export function projectBrokerageConnection(
  c: ContractBrokerageConnection,
): BrokerageConnectionView {
  return {
    connectionId: c.connection_id,
    broker: c.broker,
    environment: c.account_environment,
    connectionStatus: c.connection_status,
    credentialStatus: c.credential_status,
    stateVersion: c.state_version,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    validatedAt: c.validated_at ?? null,
    lastSyncedAt: c.last_synced_at ?? null,
    staleAt: c.stale_at ?? null,
    brokerAccountId: c.broker_account_id ?? null,
  };
}

/** The account's current connection (first non-terminal one), or null. */
export async function getBrokerageConnection(
  client: InvestorApiReadClient,
  accountId: string,
): Promise<BrokerageConnectionView | null> {
  const res = await client.call("listBrokerageConnections", {
    path: { account_id: accountId },
    query: { page_size: 20 },
  });
  const items = res.data.data.items;
  const live =
    items.find(
      (c) =>
        c.connection_status !== "DISCONNECTED" &&
        c.connection_status !== "REVOKED",
    ) ?? items[0];
  return live ? projectBrokerageConnection(live) : null;
}

// ─── The canonical connection mutation, with its precondition ───────────────

export interface ConnectBrokerageInput {
  apiKeyId: string;
  apiSecretKey: string;
}

export type ConnectBrokerageOutcome =
  | { kind: "accepted"; connection: BrokerageConnectionView }
  | {
      /** Account authorization is not AUTHORIZED: nothing was forwarded upstream. */
      kind: "not_authorized";
      authorization: string;
    };

/**
 * Connect Alpaca (paper) for the caller's account.
 *
 * Order is the point (D-LAUNCH-06 rebaseline: `AccountAuthorization.status`
 * is READ AND ENFORCED before every canonical mutation):
 *   1. `accountId` is the AUTHORITATIVE scope the caller already resolved via
 *      `resolveAccountScope` (ownership re-authorized against `listAccounts`);
 *   2. `getAccountAuthorization(account_id)` must be exactly `AUTHORIZED`;
 *      PENDING / DENIED / SUSPENDED fail closed here — the credential payload
 *      is never built, never forwarded, never logged;
 *   3. only then `createBrokerageConnection`, once.
 *
 * The credentials pass through this function as arguments and into the one
 * upstream call; nothing here retains, hashes, or echoes them.
 */
export async function connectBrokerage(
  client: InvestorApiReadClient,
  accountId: string,
  input: ConnectBrokerageInput,
  idempotencyKey: string,
): Promise<ConnectBrokerageOutcome> {
  const authz = await client.call("getAccountAuthorization", {
    path: { account_id: accountId },
  });
  const status = authz.data.data.status;
  if (status !== "AUTHORIZED") {
    return { kind: "not_authorized", authorization: status };
  }
  const res = await client.call("createBrokerageConnection", {
    path: { account_id: accountId },
    body: {
      broker: "alpaca",
      account_environment: "paper",
      credentials: {
        api_key: input.apiKeyId,
        api_secret: input.apiSecretKey,
      },
    },
    idempotencyKey,
  });
  return {
    kind: "accepted",
    connection: projectBrokerageConnection(res.data.data),
  };
}
