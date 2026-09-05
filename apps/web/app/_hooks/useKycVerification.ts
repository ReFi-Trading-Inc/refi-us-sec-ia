"use client";

/**
 * Browser hooks for the frontend-owned identity-verification lifecycle.
 *
 * Same-origin ReFi BFF only (`/api/v1/investor/kyc/verification[...]`). The
 * browser never calls a KYC vendor, the Investor API, or identity-ccid for
 * this. The legacy browser-direct `/ccid/*` and `/compliance/*` calls are gone.
 *
 * These hooks expose the provider-neutral lifecycle (domain A). Daniel's
 * backend KYC policy projection (domain B, `getKycStatus`) is a different
 * thing and is not read here.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const KYC_LIFECYCLE_STATES = [
  "not_started",
  "in_progress",
  "additional_info_required",
  "under_review",
  "passed",
  "failed",
] as const;
export type KycLifecycleState = (typeof KYC_LIFECYCLE_STATES)[number];

export interface KycVerificationSession {
  referenceId: string;
  state: KycLifecycleState;
  startedAt: string | null;
  updatedAt: string;
}

export interface KycVerificationView {
  available: boolean;
  adapter: "mock" | null;
  session: KycVerificationSession | null;
  reason?: "provider_unconfigured";
}

const QUERY_KEY = ["investor", "kyc", "verification"] as const;
const BASE = "/api/v1/investor/kyc/verification";

async function readVerification(): Promise<KycVerificationView> {
  const res = await fetch(BASE, { credentials: "include" });
  if (!res.ok)
    throw new Error(`verification read failed: ${String(res.status)}`);
  const body = (await res.json()) as { data: KycVerificationView };
  return body.data;
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as { data?: T; error?: { message?: string } };
  if (!res.ok || body.data === undefined) {
    throw new Error(body.error?.message ?? `HTTP ${String(res.status)}`);
  }
  return body.data;
}

export function isTerminalKycState(state: KycLifecycleState): boolean {
  return state === "passed" || state === "failed";
}

export function useKycVerification(options?: {
  poll?: boolean;
  intervalMs?: number;
}) {
  const poll = options?.poll ?? false;
  const intervalMs = options?.intervalMs ?? 5_000;
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: readVerification,
    staleTime: 0,
    // Keep polling even when the tab is not focused: a user often completes
    // verification in another window and returns here.
    refetchIntervalInBackground: true,
    refetchInterval: (query) => {
      if (!poll) return false;
      const state = query.state.data?.session?.state;
      if (state === undefined) return intervalMs;
      return isTerminalKycState(state) ? false : intervalMs;
    },
  });
}

export function useStartKycVerification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      postJson<{
        ok: boolean;
        session: KycVerificationSession;
        continuePath: string | null;
      }>(`${BASE}/start`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

/** Development-only control for the MOCK adapter; the BFF answers 404 unless explicitly enabled. */
export function useAdvanceMockKycVerification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (to: KycLifecycleState) =>
      postJson<{ ok: boolean; session: KycVerificationSession }>(
        `${BASE}/mock`,
        { to },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
