/**
 * Brokerage connection maintenance through the FROZEN v1.1.0-alpha.2 client:
 * credential rotation and sync requests for an EXISTING connection.
 *
 * Neither verb is economic (no subscription or allocation changes), so
 * neither reads AccountAuthorization here; the backend still decides. What
 * IS enforced here is ACCOUNT SCOPE on the connection: the `connection_id`
 * a browser names must belong to the caller's resolved account
 * (`listBrokerageConnections` under the user assertion) before any
 * mutation path is built. A connection id from another account, a retired
 * connection, or a malformed id is refused without an upstream call.
 *
 * Rotation is the second credential-bearing request in the app (after
 * connect): the paper key pair passes through as arguments into the one
 * upstream call and is never retained, hashed, logged or echoed. The
 * Idempotency-Key is derived from the key ID only, never the secret.
 */
import { createHash } from "node:crypto";
import type { OperationResponse } from "@refi/api-clients/investor-api";
import type { InvestorApiReadClient } from "./demo-client";
import {
  projectBrokerageConnection,
  type BrokerageConnectionView,
} from "./brokerage-connection";

export type BrokerageSyncReceipt =
  OperationResponse<"syncBrokerageConnection">["data"];
export const CONNECTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

export type ConnectionScopeOutcome =
  { kind: "owned" } | { kind: "not_owned" | "terminal" | "malformed" };

/** The named connection must be one of THIS account's non-terminal connections. */
export async function assertConnectionInScope(
  client: InvestorApiReadClient,
  accountId: string,
  connectionId: string,
): Promise<ConnectionScopeOutcome> {
  if (!CONNECTION_ID_PATTERN.test(connectionId)) return { kind: "malformed" };
  const res = await client.call("listBrokerageConnections", {
    path: { account_id: accountId },
    query: { page_size: 20 },
  });
  const match = res.data.data.items.find(
    (c) => c.connection_id === connectionId,
  );
  if (!match) return { kind: "not_owned" };
  if (
    match.connection_status === "DISCONNECTED" ||
    match.connection_status === "REVOKED"
  ) {
    return { kind: "terminal" };
  }
  return { kind: "owned" };
}

function key(parts: readonly string[]): string {
  return createHash("sha256")
    .update(parts.join("|"))
    .digest("hex")
    .slice(0, 64);
}

export interface RotateCredentialsInput {
  apiKeyId: string;
  apiSecretKey: string;
}

export function rotationIdempotencyKey(
  accountId: string,
  connectionId: string,
  apiKeyId: string,
): string {
  return key(["rotate", accountId, connectionId, apiKeyId]);
}

export type MaintenanceOutcome<T> =
  | { kind: "accepted"; result: T; upstreamStatus: number }
  | {
      kind: "connection_out_of_scope";
      reason: "not_owned" | "terminal" | "malformed";
    };

export async function rotateBrokerageCredentials(
  client: InvestorApiReadClient,
  accountId: string,
  connectionId: string,
  input: RotateCredentialsInput,
): Promise<MaintenanceOutcome<BrokerageConnectionView>> {
  const scope = await assertConnectionInScope(client, accountId, connectionId);
  if (scope.kind !== "owned") {
    return { kind: "connection_out_of_scope", reason: scope.kind };
  }
  const res = await client.call("rotateBrokerageCredentials", {
    path: { account_id: accountId, connection_id: connectionId },
    idempotencyKey: rotationIdempotencyKey(
      accountId,
      connectionId,
      input.apiKeyId,
    ),
    body: {
      credentials: { api_key: input.apiKeyId, api_secret: input.apiSecretKey },
    },
  });
  return {
    kind: "accepted",
    result: projectBrokerageConnection(res.data.data),
    upstreamStatus: res.status,
  };
}

/**
 * Sync requests have no body; the key is bucketed to the minute so a burst
 * of retries replays upstream while a later request is a new run.
 */
export function syncIdempotencyKey(
  accountId: string,
  connectionId: string,
  now: () => number = Date.now,
): string {
  return key([
    "sync",
    accountId,
    connectionId,
    String(Math.floor(now() / 60_000)),
  ]);
}

export async function syncBrokerageConnection(
  client: InvestorApiReadClient,
  accountId: string,
  connectionId: string,
  now: () => number = Date.now,
): Promise<MaintenanceOutcome<BrokerageSyncReceipt>> {
  const scope = await assertConnectionInScope(client, accountId, connectionId);
  if (scope.kind !== "owned") {
    return { kind: "connection_out_of_scope", reason: scope.kind };
  }
  const res = await client.call("syncBrokerageConnection", {
    path: { account_id: accountId, connection_id: connectionId },
    idempotencyKey: syncIdempotencyKey(accountId, connectionId, now),
  });
  return {
    kind: "accepted",
    result: res.data.data,
    upstreamStatus: res.status,
  };
}
