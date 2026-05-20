/**
 * Brokerage connection — projection of the broker link state for the
 * investor UI. Credentials live in Daniel's AccountSettings and never reach
 * this projection.
 *
 * Status enum reflects what the investor must see to decide whether
 * managed execution is safe: `active` allows execution; `degraded` and
 * `stale` block it; `disconnected` blocks it and requires reconnection.
 */
import { kvStore, makePrototypeMeta, type PrototypeMeta } from "../store";

export type BrokerageConnectionStatus =
  | "active"
  | "degraded"
  | "stale"
  | "disconnected";

export interface BrokerageConnection {
  accountId: string;
  brokerName: string;
  connectionId: string;
  status: BrokerageConnectionStatus;
  lastValidatedAt: string;
  lastErrorReason?: string;
  meta: PrototypeMeta;
}

const conns = kvStore<BrokerageConnection>("brokerage-connections");

export async function getBrokerageConnection(
  accountId: string,
): Promise<BrokerageConnection | null> {
  return conns.get(accountId);
}

export async function putBrokerageConnection(args: {
  accountId: string;
  brokerName: string;
  connectionId: string;
  status: BrokerageConnectionStatus;
  lastValidatedAt?: string;
  lastErrorReason?: string;
  correlationId: string;
}): Promise<BrokerageConnection> {
  const conn: BrokerageConnection = {
    accountId: args.accountId,
    brokerName: args.brokerName,
    connectionId: args.connectionId,
    status: args.status,
    lastValidatedAt: args.lastValidatedAt ?? new Date().toISOString(),
    ...(args.lastErrorReason ? { lastErrorReason: args.lastErrorReason } : {}),
    meta: makePrototypeMeta(args.correlationId),
  };
  await conns.put(args.accountId, conn);
  return conn;
}

export function isExecutionReady(conn: BrokerageConnection | null): boolean {
  return !!conn && conn.status === "active";
}
