import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { apiFetch } from "../client";
import type {
  Recommendation,
  RecommendationDetail,
  RecommendationPatchRequest,
} from "../generated/api";

export function useRecommendations(): UseQueryResult<Recommendation[]> {
  return useQuery({
    queryKey: ["recommendations"],
    queryFn: () => apiFetch<Recommendation[]>("/v1/recommendations"),
    staleTime: 30_000,
  });
}

/** Shallow recommendation lookup (list-page shape). */
export function useRecommendation(id: string): UseQueryResult<Recommendation> {
  return useQuery({
    queryKey: ["recommendations", id],
    queryFn: () => apiFetch<Recommendation>(`/v1/recommendations/${id}`),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

/**
 * Deep recommendation detail. Returns the full RecommendationDetail with
 * advisory_context, explanation, model_factors, guardrails,
 * automation_eligibility, and decision_record. Returns 404 when no detail
 * has been published (in which case the UI falls back to the shallow
 * useRecommendation shape).
 */
export function useRecommendationDetail(
  id: string,
): UseQueryResult<RecommendationDetail> {
  return useQuery({
    queryKey: ["recommendations", id, "detail"],
    queryFn: () =>
      apiFetch<RecommendationDetail>(`/v1/recommendations/${id}/detail`),
    enabled: Boolean(id),
    staleTime: 30_000,
    retry: false,
  });
}

/**
 * Lifecycle PATCH (MIG-P2.5-12). Used for Reject and Request manual review.
 * Accept still flows through the order-submission path so the
 * fail-closed compliance gate binds before any execution.
 */
export function usePatchRecommendation(
  id: string,
): UseMutationResult<Recommendation, Error, RecommendationPatchRequest> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RecommendationPatchRequest) =>
      apiFetch<Recommendation>(`/v1/recommendations/${id}`, {
        method: "PATCH",
        body,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["recommendations"] });
      void qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}
