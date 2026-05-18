import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiFetch } from "../client";
import type {
  BrokerAccount,
  BrokerConnection,
  BrokerInfo,
  Order,
  Position,
} from "../generated/api";

export function useBrokerSupported(): UseQueryResult<BrokerInfo[]> {
  return useQuery({
    queryKey: ["brokers", "supported"],
    queryFn: () => apiFetch<BrokerInfo[]>("/v1/brokers/supported"),
    staleTime: 5 * 60_000,
  });
}

export function useBrokerConnection(): UseQueryResult<BrokerConnection | null> {
  return useQuery({
    queryKey: ["brokers", "connection"],
    queryFn: () => apiFetch<BrokerConnection | null>("/v1/brokers/connection"),
    staleTime: 30_000,
  });
}

export function useBrokerAccount(): UseQueryResult<BrokerAccount> {
  return useQuery({
    queryKey: ["brokers", "account"],
    queryFn: () => apiFetch<BrokerAccount>("/v1/brokers/account"),
    staleTime: 15_000,
  });
}

export function useBrokerPositions(): UseQueryResult<Position[]> {
  return useQuery({
    queryKey: ["brokers", "positions"],
    queryFn: () => apiFetch<Position[]>("/v1/brokers/positions"),
    staleTime: 15_000,
  });
}

export function useBrokerOrders(): UseQueryResult<Order[]> {
  return useQuery({
    queryKey: ["brokers", "orders"],
    queryFn: () => apiFetch<Order[]>("/v1/brokers/orders"),
    staleTime: 15_000,
  });
}
