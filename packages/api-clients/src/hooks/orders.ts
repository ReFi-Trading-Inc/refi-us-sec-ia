import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiFetch } from "../client";
import type { Order, OrderPreviewResult, OrderRequest } from "../compat";

export function useOrders(): UseQueryResult<Order[]> {
  return useQuery({
    queryKey: ["orders"],
    queryFn: () => apiFetch<Order[]>("/orders"),
    staleTime: 10_000,
  });
}

export function useOrderPreview(
  params: OrderRequest | null,
): UseQueryResult<OrderPreviewResult> {
  return useQuery({
    queryKey: ["orders", "preview", params],
    queryFn: () =>
      apiFetch<OrderPreviewResult>("/orders/preview", {
        method: "POST",
        body: params,
      }),
    enabled: params !== null,
    staleTime: 5_000,
  });
}

/*
 * Deliberately absent: `useSubmitOrder` and `useCancelOrder`.
 *
 * Removed 2026-07-30. Both were exported and reachable from the investor app
 * but consumed by nothing, so they were a live path waiting to be wired.
 *
 * `useSubmitOrder` POSTed to `/orders`. The first dev release is Signal-only
 * and "exposes no path from investor actions to broker submission"
 * (docs/phase2-7-daniel-direction-resolution.md §9). Order submission is
 * backend-owned: the investor originates an account intent, the backend risk
 * gate and Exec Gateway decide, and the investor product only ever READS the
 * resulting order lifecycle. Managed paper execution stays gated behind the
 * control and lifecycle validation scenarios in §5.
 *
 * `useCancelOrder` DELETEd `/orders/{id}`. Investor cancellation of
 * `pending_submit` orders is deferred: the state crosses Exec Gateway, Trade
 * Manager, broker, partial-fill, and reconciliation ownership boundaries
 * (`GAP-CANCEL-INIT-012`). It is also a forbidden identifier in
 * scripts/tripwire-investor-boundary.ts — which scans apps/web but not
 * packages/, which is how this one survived.
 *
 * Neither returns without a backend contract that defines it. The read model
 * (`useOrders`) and the binary preview gate (`useOrderPreview`) stay.
 */
