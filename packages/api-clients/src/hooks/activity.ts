import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiFetch } from "../client";
import type { ActivityEvent } from "../compat";

export function useActivity(): UseQueryResult<ActivityEvent[]> {
  return useQuery({
    queryKey: ["activity"],
    queryFn: () => apiFetch<ActivityEvent[]>("/v1/activity"),
    staleTime: 30_000,
  });
}
