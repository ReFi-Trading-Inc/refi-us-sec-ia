import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiFetch } from "../client";
import type { AuthSession, Tier } from "../generated/api";

export function useSession(): UseQueryResult<AuthSession> {
  return useQuery({
    queryKey: ["auth", "session"],
    queryFn: () => apiFetch<AuthSession>("/auth/session"),
    staleTime: 60_000,
  });
}

/**
 * Investor tier — drives every tier-aware UI surface (recommendation
 * actions, dashboard NextAction card, header pill, Exception Review queue
 * visibility). Defaults to "signal" while session loads, which is the
 * least-privileged default (no Managed-mode UI accidentally exposes).
 *
 * See `refi-build-docs/spec-current/09-daniel-answers-and-product-reframe.md §3`
 * for the full tier model.
 */
export function useTier(): Tier {
  const { data } = useSession();
  return data?.tier ?? "signal";
}
