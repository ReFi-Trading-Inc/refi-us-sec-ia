// BFF preview hooks (P2.5R-04). Targeted at the three new endpoints under
// `/api/v1/*` (per `10-bff-architecture-decision.md`). Consumers land in:
//   - `useDashboard()` → P2.5R-07 (11-card dashboard rewrite)
//   - `useOrderLineage(id)` → P2.5R-05 (lineage panel on rec detail)
//   - `useRiskSnapshot(id)` → P2.5R-05 (verdict envelope display)

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiFetch } from "../client";
import type {
  DashboardComposite,
  OrderLineage,
  RiskSnapshot,
} from "../generated/api";

export function useDashboard(): UseQueryResult<DashboardComposite> {
  return useQuery({
    queryKey: ["bff", "dashboard"],
    queryFn: () => apiFetch<DashboardComposite>("/api/v1/dashboard"),
    staleTime: 60_000,
  });
}

export function useOrderLineage(
  clientOrderId: string,
): UseQueryResult<OrderLineage> {
  return useQuery({
    queryKey: ["bff", "orders", clientOrderId, "lineage"],
    queryFn: () =>
      apiFetch<OrderLineage>(
        `/api/v1/orders/${encodeURIComponent(clientOrderId)}/lineage`,
      ),
    enabled: Boolean(clientOrderId),
    staleTime: 30_000,
    retry: false,
  });
}

export function useRiskSnapshot(
  accountIntentId: string,
): UseQueryResult<RiskSnapshot> {
  return useQuery({
    queryKey: ["bff", "risk-snapshots", accountIntentId],
    queryFn: () =>
      apiFetch<RiskSnapshot>(
        `/api/v1/risk-snapshots/${encodeURIComponent(accountIntentId)}`,
      ),
    enabled: Boolean(accountIntentId),
    staleTime: 30_000,
    retry: false,
  });
}
