import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { apiFetch } from "../client";
import type {
  AccountActivationResponse,
  AccountActivationStatus,
  AdvisoryProfile,
  AdvisoryProfileResponse,
  BrokerConnectStartResponse,
  StrategyDescriptor,
} from "../generated/api";

export function useAdvisoryProfile(): UseQueryResult<AdvisoryProfileResponse | null> {
  return useQuery({
    queryKey: ["profile"],
    queryFn: () => apiFetch<AdvisoryProfileResponse | null>("/v1/profile"),
    staleTime: 60_000,
  });
}

export function useSaveAdvisoryProfile(): UseMutationResult<
  AdvisoryProfileResponse,
  Error,
  AdvisoryProfile
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      apiFetch<AdvisoryProfileResponse>("/v1/profile", {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["profile"] });
      void qc.invalidateQueries({ queryKey: ["account", "activation"] });
    },
  });
}

export function useStrategy(): UseQueryResult<StrategyDescriptor> {
  return useQuery({
    queryKey: ["strategy", "current"],
    queryFn: () => apiFetch<StrategyDescriptor>("/v1/strategies/current"),
    staleTime: 5 * 60_000,
  });
}

export function useBrokerConnectStart(): UseMutationResult<
  BrokerConnectStartResponse,
  Error,
  { broker_id: string }
> {
  return useMutation({
    mutationFn: (body) =>
      apiFetch<BrokerConnectStartResponse>("/v1/brokers/connect/start", {
        method: "POST",
        body,
      }),
  });
}

export function useActivationStatus(): UseQueryResult<AccountActivationStatus> {
  return useQuery({
    queryKey: ["account", "activation"],
    queryFn: () => apiFetch<AccountActivationStatus>("/v1/account/activation"),
    staleTime: 10_000,
    refetchInterval: 10_000,
  });
}

export function useActivateAccount(): UseMutationResult<
  AccountActivationResponse,
  Error,
  void
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<AccountActivationResponse>("/v1/account/activate", {
        method: "POST",
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["account"] });
      void qc.invalidateQueries({ queryKey: ["auth", "session"] });
    },
  });
}
