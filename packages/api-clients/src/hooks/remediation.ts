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

async function bffMutate<TRes>(
  path: string,
  method: "POST" | "PUT",
  body: unknown,
): Promise<TRes> {
  const env = await apiFetch<BffEnvelope<TRes>>(path, { method, body });
  return env.data;
}

// ─── Types (UI-facing shapes; server is source of truth) ────────────────────

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

export interface StaleDisclosureDto {
  docId: string;
  previousVersion: string;
  currentVersion: string;
  kind: string;
  effectiveAt: string | null;
  alreadyAcknowledged: boolean;
}

export interface DisclosureReacknowledgementView {
  activePolicyVersion: number | null;
  requiresReacknowledgement: boolean;
  staleDisclosures: StaleDisclosureDto[];
}

export interface ReacknowledgeDisclosureInput {
  docId: string;
  version: string;
}

export interface ReacknowledgeDisclosureResult {
  ok: boolean;
  created: boolean;
  ack: { docId: string; version: string; ackedAt: string };
  previousVersion: string;
  currentVersion: string;
  activePolicyVersion: number;
  managedExecutionStatusBefore: string | null;
  managedExecutionStatusAfter: string | null;
  reasonCodeCleared: string | null;
}

export type ProfileReactivationBlockerReason =
  "stale_profile_aging" | "stale_profile_changed" | null;

export interface ProfileReactivationView {
  activePolicyVersion: number | null;
  pinnedProfileVersion: number | null;
  latestProfileVersion: number | null;
  lastConfirmedVersion: number | null;
  lastConfirmedAt: string | null;
  staleProfile: boolean;
  materialChange: boolean;
  changedFields: string[];
  blockerReason: ProfileReactivationBlockerReason;
  managedExecutionStatus: string | null;
  managedExecutionReasonCode: string | null;
}

export interface ReconfirmProfileInput {
  profileVersion: number;
  acknowledgeUnchanged: true;
}

export interface ReconfirmProfileResult {
  ok: boolean;
  created: boolean;
  confirmedVersion: number;
  previousConfirmedVersion: number | null;
  activeExecutionPolicyVersion: number;
  managedExecutionStatusBefore: string;
  managedExecutionStatusAfter: string;
  reasonCodeCleared: string | null;
}

export function useProfileReactivation(): UseQueryResult<ProfileReactivationView | null> {
  return useQuery({
    queryKey: ["profile-reactivation"],
    queryFn: () =>
      bffFetch<ProfileReactivationView | null>(
        "/api/v1/investor/profile/reactivation",
      ),
    staleTime: 15_000,
  });
}

export function useReconfirmProfile(): UseMutationResult<
  ReconfirmProfileResult,
  Error,
  ReconfirmProfileInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      bffMutate<ReconfirmProfileResult>(
        "/api/v1/investor/profile/reconfirm",
        "POST",
        input,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["profile-reactivation"] });
      void qc.invalidateQueries({ queryKey: ["managed-execution-state"] });
      void qc.invalidateQueries({ queryKey: ["investor-status"] });
    },
  });
}

export function useDisclosureReacknowledgement(): UseQueryResult<DisclosureReacknowledgementView | null> {
  return useQuery({
    queryKey: ["disclosure-reacknowledgement"],
    queryFn: () =>
      bffFetch<DisclosureReacknowledgementView | null>(
        "/api/v1/investor/disclosures/reacknowledgement",
      ),
    staleTime: 15_000,
  });
}

export function useReacknowledgeDisclosure(): UseMutationResult<
  ReacknowledgeDisclosureResult,
  Error,
  ReacknowledgeDisclosureInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      bffMutate<ReacknowledgeDisclosureResult>(
        "/api/v1/investor/disclosures/reacknowledge",
        "POST",
        input,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["disclosure-reacknowledgement"] });
      void qc.invalidateQueries({ queryKey: ["disclosure-registry"] });
      void qc.invalidateQueries({ queryKey: ["managed-execution-state"] });
    },
  });
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
