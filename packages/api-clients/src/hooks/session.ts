import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiFetch } from "../client";
import type { AuthSession } from "../generated/api";

export function useSession(): UseQueryResult<AuthSession> {
  return useQuery({
    queryKey: ["auth", "session"],
    queryFn: () => apiFetch<AuthSession>("/auth/session"),
    staleTime: 60_000,
  });
}
