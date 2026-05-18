import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiFetch } from "../client";
import type { KycStatus } from "../generated/api";

export function useKycStatus(): UseQueryResult<KycStatus> {
  return useQuery({
    queryKey: ["ccid", "status"],
    queryFn: () => apiFetch<KycStatus>("/ccid/status"),
    staleTime: 30_000,
  });
}
