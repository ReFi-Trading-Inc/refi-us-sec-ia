"use client";

/**
 * Browser hooks for the brokerage connection, same-origin BFF only
 * (`/api/v1/investor/broker/connection`). The connect mutation sends the paper
 * key pair ONCE and keeps nothing: no credential is cached in query state,
 * local storage, or the URL. The legacy browser-direct `/v1/brokers/*` hooks
 * are gone (C1b-2 rows 10–16).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BrokerageConnectionView } from "@lib/investor-api/brokerage-connection";

export type { BrokerageConnectionView };

export interface BrokerConnectionRead {
  connection: BrokerageConnectionView | null;
  upstream: { state: string };
}

export const BROKER_CONNECTION_QUERY_KEY = [
  "investor",
  "broker",
  "connection",
] as const;
const BASE = "/api/v1/investor/broker/connection";

async function readConnection(): Promise<BrokerConnectionRead> {
  const res = await fetch(BASE, { credentials: "include" });
  if (!res.ok)
    throw new Error(`broker connection read failed: ${String(res.status)}`);
  const body = (await res.json()) as { data: BrokerConnectionRead };
  return body.data;
}

export function useBrokerConnection(options?: {
  poll?: boolean;
  intervalMs?: number;
}) {
  const poll = options?.poll ?? false;
  const intervalMs = options?.intervalMs ?? 2_000;
  return useQuery({
    queryKey: BROKER_CONNECTION_QUERY_KEY,
    queryFn: readConnection,
    staleTime: 0,
    refetchInterval: (q) => {
      if (!poll) return false;
      const c = q.state.data?.connection;
      // Keep polling until the first sync has landed.
      return c && c.connectionStatus === "CONNECTED" && c.lastSyncedAt
        ? false
        : intervalMs;
    },
  });
}

export interface ConnectBrokerInput {
  environment: "paper";
  apiKeyId: string;
  apiSecretKey: string;
}

export class ConnectBrokerError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
  ) {
    super(`connect broker failed: ${String(status)}`);
    this.name = "ConnectBrokerError";
  }
}

export function useConnectBroker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ConnectBrokerInput) => {
      const res = await fetch(BASE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      const body = (await res.json()) as {
        data?: {
          ok: boolean;
          connection?: BrokerageConnectionView;
          code?: string;
        };
      };
      if (!res.ok || !body.data?.ok || !body.data.connection) {
        throw new ConnectBrokerError(res.status, body.data?.code ?? null);
      }
      return body.data.connection;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: BROKER_CONNECTION_QUERY_KEY });
    },
  });
}
