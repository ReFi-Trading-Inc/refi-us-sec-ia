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
  BrokerApiKeyConnectRequest,
  BrokerConnectKeyResponse,
  BrokerConnectStartResponse,
  StrategyDescriptor,
} from "../compat";

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

/**
 * Submits Alpaca API credentials to ReFi's backend for broker connection.
 *
 * Security:
 * - Keys are POSTed once over HTTPS to ReFi's `/v1/brokers/connect/keys` endpoint.
 * - This hook never logs, persists, or echoes the request body.
 * - Callers MUST clear the secret from their component state after the mutation
 *   settles (success or error). The mutation itself does not retain the body.
 * - The UI never talks to Alpaca directly; the backend handles Alpaca auth.
 *
 * PAPER ONLY, and the limit of that guarantee matters. The request type
 * narrows `environment` to the literal "paper", so this client cannot express
 * a live credential. But the call is browser-direct to the external
 * /v1/brokers/connect/keys — a modified client or a plain HTTP request reaches
 * it without passing through anything in this repository. Whether the backend
 * refuses `environment: "live"` is unproven here (D-SIGNAL-01, EXTERNAL PROOF
 * REQUIRED), and Gate A needs that evidence, or evidence that this raw-key
 * endpoint is no longer part of the Signal architecture.
 *
 * Live accounts are not meant to arrive through this path at all. The settled
 * requirement is read access WITHOUT broker-write authority; which mechanism
 * provides it is the backend's broker-connection contract to define.
 */
export function useBrokerConnectApiKey(): UseMutationResult<
  BrokerConnectKeyResponse,
  Error,
  BrokerApiKeyConnectRequest
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      apiFetch<BrokerConnectKeyResponse>("/v1/brokers/connect/keys", {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["broker"] });
      void qc.invalidateQueries({ queryKey: ["account", "activation"] });
    },
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
