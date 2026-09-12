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
import { collectComplete, CONTRACT_MAX_PAGE_SIZE } from "./pagination";

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
  const items = await listOwnedBrokerageConnections(client, accountId);
  const live =
    items.find(
      (c) =>
        c.connection_status !== "DISCONNECTED" &&
        c.connection_status !== "REVOKED",
    ) ?? items[0];
  return live ? projectBrokerageConnection(live) : null;
}

export async function listOwnedBrokerageConnections(
  client: InvestorApiReadClient,
  accountId: string,
) {
  return collectComplete(async (cursor) => {
    const res = await client.call("listBrokerageConnections", {
      path: { account_id: accountId },
      query: { page_size: CONTRACT_MAX_PAGE_SIZE, cursor },
    });
    return { items: res.data.data.items, page: res.data.data.page };
  });
}

// ─── The canonical connection mutation ──────────────────────────────────────

export interface ConnectBrokerageInput {
  environment: "paper" | "live";
  apiKeyId: string;
  apiSecretKey: string;
}

export type ConnectBrokerageOutcome = {
  kind: "accepted";
  connection: BrokerageConnectionView;
};

/**
 * Connect Alpaca (paper) for the caller's account.
 *
 *   1. `accountId` is the AUTHORITATIVE scope the caller already resolved via
 *      `resolveAccountScope` (ownership re-authorized against `listAccounts`);
 *   2. `createBrokerageConnection`, once.
 *
 * There is deliberately NO `AccountAuthorization.status === AUTHORIZED`
 * precondition here (Daniel 2026-09-09, correcting the 2026-09-05 rebaseline
 * reading of D-LAUNCH-06): an admitted account with no brokerage connection
 * legitimately reports `DENIED` with `BROKER_CONNECTION_MISSING`, so requiring
 * AUTHORIZED before the FIRST connection is circular and prevents connecting
 * at all. The correct order is: admitted/onboarding account → compliance and
 * consent requirements → create brokerage connection → validation/sync →
 * fresh account truth → account authorization → subscription/execution.
 * AccountAuthorization remains mandatory before economic subscription/action
 * execution where the contract requires it; the backend decides it and this
 * module never relabels DENIED as anything else.
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
  const res = await client.call("createBrokerageConnection", {
    path: { account_id: accountId },
    body: {
      broker: "alpaca",
      account_environment: input.environment,
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
