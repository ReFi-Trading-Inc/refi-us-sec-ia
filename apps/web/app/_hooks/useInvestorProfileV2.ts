"use client";

/**
 * Browser read of the canonical Investor Profile v2 through the same-origin
 * BFF (`GET /api/v1/investor/profile/v2`). Returns the latest immutable
 * answers version and its server-side assessment, or null when the investor
 * has not completed the questionnaire.
 *
 * The browser never reads prototype storage directly and never calls Daniel's
 * Investor API for this; the frontend v2 assessment is the canonical public
 * profile state. Daniel's `getCurrentAdvisoryProfile` is a backend projection
 * of an accepted compliance attestation — a later integration point, not this.
 */
import { useQuery } from "@tanstack/react-query";
import type {
  InvestorProfileAnswers,
  InvestorProfileAssessment,
} from "@lib/sec203a/investor-profile";

export interface InvestorProfileV2View {
  answers: {
    accountId: string;
    profileVersion: number;
    answers: InvestorProfileAnswers;
    answerSnapshotHash: string;
  };
  /** null when the stored assessment predates the current policy version. */
  assessment: {
    profileVersion: number;
    assessment: InvestorProfileAssessment;
  } | null;
}

export const INVESTOR_PROFILE_V2_QUERY_KEY = [
  "investor",
  "profile",
  "v2",
] as const;

async function readInvestorProfileV2(): Promise<InvestorProfileV2View | null> {
  const res = await fetch("/api/v1/investor/profile/v2", {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`profile read failed: ${String(res.status)}`);
  const body = (await res.json()) as { data: InvestorProfileV2View | null };
  return body.data;
}

export function useInvestorProfileV2() {
  return useQuery({
    queryKey: INVESTOR_PROFILE_V2_QUERY_KEY,
    queryFn: readInvestorProfileV2,
    staleTime: 30_000,
  });
}
