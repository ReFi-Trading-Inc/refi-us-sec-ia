/**
 * Exception Review hooks (Phase 2 Surface 7).
 *
 * UI-facing resolution names ("resolve_exception", "dismiss_exception") map
 * to the backend's legacy `ExceptionResolution` set
 * (`approve_exception`, `reject_exception`, ...). The UI layer never exposes
 * the legacy names; the mapping lives here and in the BFF route signature.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { apiFetch } from "../client";

interface BffEnvelope<T> {
  data: T;
  meta: { source: string; correlationId: string; emittedAt: string };
  receipt?: { receiptId: string; action: string };
}

async function bffFetch<T>(path: string): Promise<T> {
  const env = await apiFetch<BffEnvelope<T>>(path);
  return env.data;
}

async function bffMutate<TReq, TRes>(
  path: string,
  method: "POST" | "PUT",
  body: TReq,
): Promise<TRes> {
  const env = await apiFetch<BffEnvelope<TRes>>(path, { method, body });
  return env.data;
}

export type ExceptionKind =
  | "stale_broker_data"
  | "insufficient_buying_power"
  | "expired_disclosure"
  | "changed_preference"
  | "stale_profile"
  | "out_of_policy_intent";

export type ExceptionStatus = "open" | "resolved" | "expired";

/**
 * The UI-facing resolution vocabulary. We deliberately do not expose the
 * backend's legacy `approve_exception` / `reject_exception` names to the UI
 * layer — they read as per-trade approvals and that's exactly the boundary
 * Phase 2 enforces. Mapping happens in `mapResolutionToBackend` below.
 */
export type UiResolution =
  | "resolve_exception"
  | "dismiss_exception"
  | "update_profile"
  | "reconnect_broker"
  | "acknowledge_disclosure"
  | "pause_managed";

export type BackendResolution =
  | "approve_exception"
  | "reject_exception"
  | "update_profile"
  | "reconnect_broker"
  | "acknowledge_disclosure"
  | "pause_managed";

export function mapResolutionToBackend(ui: UiResolution): BackendResolution {
  if (ui === "resolve_exception") return "approve_exception"; // allow-investor-boundary: "approve_exception" reason: "internal alias only; never user-facing"
  if (ui === "dismiss_exception") return "reject_exception"; // allow-investor-boundary: "reject_exception" reason: "internal alias only; never user-facing"
  return ui;
}

/** UI-facing label for a recorded backend resolution. Lives in the hook
 *  layer so consumer pages never need to spell the legacy backend names. */
export function describeBackendResolution(r: BackendResolution | null): string {
  if (!r) return "";
  if (r === "approve_exception") return "Resolved"; // allow-investor-boundary: "approve_exception" reason: "translating internal alias to user-facing label"
  if (r === "reject_exception") return "Dismissed"; // allow-investor-boundary: "reject_exception" reason: "translating internal alias to user-facing label"
  if (r === "update_profile") return "Resolved by profile update";
  if (r === "reconnect_broker") return "Resolved by broker reconnect";
  if (r === "acknowledge_disclosure") return "Resolved by disclosure review";
  if (r === "pause_managed") return "Resolved by pausing Managed";
  return "Resolved";
}

/** True when a recorded resolution corresponds to the UI's "Dismiss exception"
 *  affordance. Hides the legacy backend identifier from consumer pages. */
export function isDismissResolution(r: BackendResolution | null): boolean {
  return r === "reject_exception"; // allow-investor-boundary: "reject_exception" reason: "internal alias only; never user-facing"
}

export interface InvestorExceptionItem {
  accountId: string;
  exceptionId: string;
  kind: ExceptionKind;
  status: ExceptionStatus;
  intentRef?: string;
  summary: string;
  openedAt: string;
  expiresAt?: string;
  lastResolution: BackendResolution | null;
  lastResolvedAt: string | null;
}

export interface InvestorExceptionsView {
  items: InvestorExceptionItem[];
  notice?: string;
}

export interface ResolveExceptionInput {
  exceptionId: string;
  resolution: UiResolution;
  reasonCode?: string;
}

export interface ResolveExceptionResult {
  ok: boolean;
  exceptionId: string;
  resolution: BackendResolution;
}

export function useInvestorExceptions(): UseQueryResult<InvestorExceptionsView | null> {
  return useQuery({
    queryKey: ["investor-exceptions"],
    queryFn: () =>
      bffFetch<InvestorExceptionsView | null>("/api/v1/investor/exceptions"),
    staleTime: 15_000,
  });
}

export function useResolveException(): UseMutationResult<
  ResolveExceptionResult,
  Error,
  ResolveExceptionInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ exceptionId, resolution, reasonCode }) =>
      bffMutate<
        {
          resolution: BackendResolution;
          reasonCode?: string;
          clientAttestation: true;
        },
        ResolveExceptionResult
      >(
        `/api/v1/investor/exceptions/${encodeURIComponent(exceptionId)}/resolve`,
        "POST",
        {
          resolution: mapResolutionToBackend(resolution),
          ...(reasonCode ? { reasonCode } : {}),
          clientAttestation: true,
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["investor-exceptions"] });
      qc.invalidateQueries({ queryKey: ["managed-execution-state"] });
    },
  });
}
