import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { apiFetch } from "../client";
import type {
  KycStartResponse,
  KycStatus,
  KycStatusValue,
  OkResult,
} from "../compat";

const TERMINAL: ReadonlySet<KycStatus["status"]> = new Set([
  "approved",
  "denied",
  "under_review",
]);

export function useKycStatus(options?: {
  poll?: boolean;
  intervalMs?: number;
}): UseQueryResult<KycStatus> {
  const poll = options?.poll ?? false;
  const intervalMs = options?.intervalMs ?? 5_000;
  return useQuery({
    queryKey: ["ccid", "status"],
    queryFn: () => apiFetch<KycStatus>("/ccid/status"),
    staleTime: 30_000,
    refetchInterval: (query) => {
      if (!poll) return false;
      const data = query.state.data;
      if (!data) return intervalMs;
      return TERMINAL.has(data.status) ? false : intervalMs;
    },
  });
}

export function useKycStart(): UseMutationResult<
  KycStartResponse,
  Error,
  void
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<KycStartResponse>("/ccid/start", { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ccid", "status"] });
    },
  });
}

/** Dev-only helper for forcing a webhook callback against the mock backend. */
export function useKycSimulateWebhook(): UseMutationResult<
  OkResult,
  Error,
  { status: KycStatus["status"]; provider_reference?: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      apiFetch<OkResult>("/ccid/webhook/provider", {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ccid", "status"] });
    },
  });
}

export function useComplianceInvalidateCache(): UseMutationResult<
  OkResult,
  Error,
  { account_id: string }
> {
  return useMutation({
    mutationFn: ({ account_id }) =>
      apiFetch<OkResult>(
        `/compliance/invalidate-cache?account_id=${encodeURIComponent(account_id)}`,
        { method: "POST" },
      ),
  });
}

export function isKycTerminal(status: KycStatusValue): boolean {
  return TERMINAL.has(status as KycStatus["status"]);
}
