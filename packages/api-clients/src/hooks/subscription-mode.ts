import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiFetch } from "../client";
import type {
  SubscriptionMode,
  SubscriptionModeState,
  InvestorRecommendationsResponse,
} from "../compat";

// BFF envelope wrapper. The /api/v1/investor/* routes return
// { data, meta, receipt? }; client code wants just the unwrapped data.
interface BffEnvelope<T> {
  data: T;
  meta: { source: string; correlationId: string; emittedAt: string };
}

async function bffFetch<T>(path: string): Promise<T> {
  const env = await apiFetch<BffEnvelope<T>>(path);
  return env.data;
}

export function useSubscriptionMode(): UseQueryResult<SubscriptionModeState | null> {
  return useQuery({
    queryKey: ["subscription-mode"],
    queryFn: () =>
      bffFetch<SubscriptionModeState | null>(
        "/api/v1/investor/subscription-mode",
      ),
    staleTime: 30_000,
  });
}

export type { SubscriptionMode };

export function useInvestorRecommendations(): UseQueryResult<InvestorRecommendationsResponse> {
  return useQuery({
    queryKey: ["investor-recommendations"],
    queryFn: () =>
      bffFetch<InvestorRecommendationsResponse>(
        "/api/v1/investor/recommendations",
      ),
    staleTime: 30_000,
  });
}
