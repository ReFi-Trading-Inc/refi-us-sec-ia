import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiFetch } from "../client";
import type { Recommendation } from "../generated/api";

export function useRecommendations(): UseQueryResult<Recommendation[]> {
  return useQuery({
    queryKey: ["recommendations"],
    queryFn: () => apiFetch<Recommendation[]>("/v1/recommendations"),
    staleTime: 30_000,
  });
}

export function useRecommendation(id: string): UseQueryResult<Recommendation> {
  return useQuery({
    queryKey: ["recommendations", id],
    queryFn: () => apiFetch<Recommendation>(`/v1/recommendations/${id}`),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}
