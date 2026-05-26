import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { apiFetch } from "../client";

// BFF envelope wrapper. Mirrors the inline helper in subscription-mode.ts —
// keep semantics aligned; if a third surface needs this, promote to client.ts.
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

export interface ActivateExecutionPolicyInput {
  acknowledgedDisclosures: { docId: string; version: string }[];
  advisoryAgreementVersion: string;
  clientAttestation: true;
  deviceFingerprint: string;
}

export interface ActivateExecutionPolicyResult {
  policy: {
    policyId: string;
    policyVersion: number;
    accountId: string;
    strategyId: string;
    signedAt: string;
  };
  managedExecutionState: {
    status: string;
    executionPolicyVersion: number | null;
  };
  subscriptionModeFlipped: boolean;
}

// ─── Types (UI-facing shapes; server is source of truth) ────────────────────

export type StaleBrokerDataDuration =
  | "PT5M"
  | "PT15M"
  | "PT30M"
  | "PT1H"
  | "PT4H";

export type StaleProfileDuration = "P30D" | "P60D" | "P90D" | "P180D" | "P365D";

export interface ExecutionPolicySummary {
  accountId: string;
  policyId: string;
  policyVersion: number;
  strategyId: string;
  accountScope: string;
  assetUniverse: string[];
  driftThreshold?: string;
  rebalanceFrequency?: string;
  maxOrderSize?: string;
  maxTurnover?: string;
  pauseRules: string[];
  notificationPreferences: string[];
  signedAt: string;
}

export interface ExecutionPolicyDraftDto {
  accountId: string;
  strategyId: string;
  accountScope: string;
  assetUniverse: string[];
  restrictedSectors: string[];
  maxSingleOrderUsd: string;
  maxPositionSizeBps: number;
  minimumCashReserveBps: number;
  dailyOrderLimit: number;
  dailyLossPauseBps: number;
  drawdownPauseBps: number;
  maxOpenOrders: number;
  staleBrokerDataPauseAfter: StaleBrokerDataDuration;
  staleProfilePauseAfter: StaleProfileDuration;
  pauseOnDisclosureSuperseded: boolean;
  pauseOnProfileSuperseded: boolean;
  updatedAt: string;
}

export type SaveExecutionPolicyDraftInput = Omit<
  ExecutionPolicyDraftDto,
  "accountId" | "updatedAt"
>;

export type ManagedExecutionStatus =
  | "inactive"
  | "setup_incomplete"
  | "active"
  | "paused_by_user"
  | "paused_by_system"
  | "review_required";

export interface ManagedExecutionStateDto {
  accountId: string;
  executionPolicyVersion: number | null;
  status: ManagedExecutionStatus;
  reasonCode?: string;
  lastChangedAt: string;
  lastChangedBy: "user" | "system";
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

export function useExecutionPolicy(): UseQueryResult<ExecutionPolicySummary | null> {
  return useQuery({
    queryKey: ["execution-policy"],
    queryFn: () =>
      bffFetch<ExecutionPolicySummary | null>(
        "/api/v1/investor/execution-policy",
      ),
    staleTime: 30_000,
  });
}

export function useExecutionPolicyDraft(): UseQueryResult<ExecutionPolicyDraftDto | null> {
  return useQuery({
    queryKey: ["execution-policy-draft"],
    queryFn: () =>
      bffFetch<ExecutionPolicyDraftDto | null>(
        "/api/v1/investor/execution-policy/draft",
      ),
    staleTime: 0,
  });
}

export function useSaveExecutionPolicyDraft(): UseMutationResult<
  ExecutionPolicyDraftDto,
  Error,
  SaveExecutionPolicyDraftInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      bffMutate<SaveExecutionPolicyDraftInput, ExecutionPolicyDraftDto>(
        "/api/v1/investor/execution-policy/draft",
        "PUT",
        input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["execution-policy-draft"] });
    },
  });
}

export function useManagedExecutionState(): UseQueryResult<ManagedExecutionStateDto | null> {
  return useQuery({
    queryKey: ["managed-execution-state"],
    queryFn: () =>
      bffFetch<ManagedExecutionStateDto | null>(
        "/api/v1/investor/managed/state",
      ),
    staleTime: 30_000,
  });
}

export function usePauseManaged(): UseMutationResult<
  ManagedExecutionStateDto,
  Error,
  { reason?: string } | void
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      bffMutate<{ reason?: string }, ManagedExecutionStateDto>(
        "/api/v1/investor/managed/pause",
        "POST",
        input ?? {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["managed-execution-state"] });
    },
  });
}

export function useActivateExecutionPolicy(): UseMutationResult<
  ActivateExecutionPolicyResult,
  Error,
  ActivateExecutionPolicyInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      bffMutate<ActivateExecutionPolicyInput, ActivateExecutionPolicyResult>(
        "/api/v1/investor/execution-policy/activate",
        "POST",
        input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["execution-policy"] });
      qc.invalidateQueries({ queryKey: ["managed-execution-state"] });
      qc.invalidateQueries({ queryKey: ["subscription-mode"] });
    },
  });
}

export interface DisclosureRegistryDto {
  documents: Array<{
    docId: string;
    version: string;
    kind: string;
    displayStatus: string;
    effectiveAt: string | null;
  }>;
  userAcks: Array<{
    docId: string;
    version: string;
    ackedAt: string;
  }>;
}

export function useDisclosureRegistry(): UseQueryResult<DisclosureRegistryDto | null> {
  return useQuery({
    queryKey: ["disclosure-registry"],
    queryFn: () =>
      bffFetch<DisclosureRegistryDto | null>("/api/v1/investor/disclosures"),
    staleTime: 30_000,
  });
}

export interface InvestorStatusDto {
  authId: string;
  accountId: string | null;
  subscriptionMode: { mode: string } | null;
  managedExecutionState: { status: string } | null;
  executionPolicyVersion: number | null;
  latestProfileVersion: number | null;
  brokerageStatus: string | null;
}

export function useInvestorStatus(): UseQueryResult<InvestorStatusDto | null> {
  return useQuery({
    queryKey: ["investor-status"],
    queryFn: () =>
      bffFetch<InvestorStatusDto | null>("/api/v1/investor/status"),
    staleTime: 15_000,
  });
}

export function useResumeManaged(): UseMutationResult<
  ManagedExecutionStateDto,
  Error,
  void
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      bffMutate<Record<string, never>, ManagedExecutionStateDto>(
        "/api/v1/investor/managed/resume",
        "POST",
        {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["managed-execution-state"] });
    },
  });
}
