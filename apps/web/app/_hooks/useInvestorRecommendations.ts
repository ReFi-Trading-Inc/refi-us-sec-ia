"use client";

/**
 * Browser reads of Signal recommendations through the same-origin BFF
 * (`/api/v1/investor/recommendations[...]`). The browser never calls the
 * Investor API and never supplies an account id. Types are imported from the
 * server-side projection modules as TYPES ONLY (no runtime import of the
 * server-only client).
 */
import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  RecommendationDetailView,
  RecommendationLegsPageView,
  RecommendationSummaryView,
} from "@lib/investor-api/recommendations";
import type { UpstreamState } from "@lib/investor-api/upstream-state";

export interface RecommendationsListView {
  items: RecommendationSummaryView[];
  truncated: boolean;
  upstream: UpstreamState;
}
export interface RecommendationDetailResponse {
  detail: RecommendationDetailView | null;
  upstream: UpstreamState;
}
export interface RecommendationLegsResponse {
  legs: RecommendationLegsPageView | null;
  upstream: UpstreamState;
}

const BASE = "/api/v1/investor/recommendations";

async function readJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) throw new Error(`read failed: ${String(res.status)}`);
  const body = (await res.json()) as { data: T };
  return body.data;
}

export function useInvestorRecommendations() {
  return useQuery({
    queryKey: ["investor", "recommendations"] as const,
    queryFn: () => readJson<RecommendationsListView>(BASE),
    staleTime: 30_000,
  });
}

export function useInvestorRecommendationDetail(id: string) {
  return useQuery({
    queryKey: ["investor", "recommendations", id] as const,
    queryFn: () =>
      readJson<RecommendationDetailResponse>(
        `${BASE}/${encodeURIComponent(id)}`,
      ),
    enabled: id.length > 0,
    staleTime: 30_000,
  });
}

export interface LegsPagingState {
  /** Pages fetched AFTER the first page that came with the detail. */
  pages: RecommendationLegsPageView[];
  isFetching: boolean;
  isError: boolean;
  /** Load the next page from an opaque cursor the previous page returned. */
  loadMore: (cursor: string) => Promise<void>;
}

/**
 * Further leg pages by the contract's opaque cursor. The first page arrives
 * with the detail; this only runs when the investor asks for more. Plain
 * state (no infinite-query generics) so the emitted declaration is portable.
 */
export function useInvestorRecommendationLegs(id: string): LegsPagingState {
  const [pages, setPages] = useState<RecommendationLegsPageView[]>([]);
  const [isFetching, setFetching] = useState(false);
  const [isError, setError] = useState(false);
  const loadMore = useCallback(
    async (cursor: string): Promise<void> => {
      setFetching(true);
      setError(false);
      try {
        const res = await readJson<RecommendationLegsResponse>(
          `${BASE}/${encodeURIComponent(id)}/legs?cursor=${encodeURIComponent(cursor)}`,
        );
        if (res.legs === null) throw new Error(res.upstream.state);
        const legs = res.legs;
        setPages((prev) => [...prev, legs]);
      } catch {
        setError(true);
      } finally {
        setFetching(false);
      }
    },
    [id],
  );
  return { pages, isFetching, isError, loadMore };
}
