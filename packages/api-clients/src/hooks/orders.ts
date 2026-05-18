import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { apiFetch } from "../client";
import type {
  Order,
  OrderPreviewResult,
  OrderRequest,
  OkResult,
} from "../generated/api";

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

export function useSubmitOrder(): UseMutationResult<
  Order,
  Error,
  OrderRequest
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: OrderRequest) =>
      apiFetch<Order>("/orders", { method: "POST", body: req }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["orders"] });
      void qc.invalidateQueries({ queryKey: ["brokers", "orders"] });
    },
  });
}

export function useCancelOrder(): UseMutationResult<OkResult, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<OkResult>(`/orders/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}
