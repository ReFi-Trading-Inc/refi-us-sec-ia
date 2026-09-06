"use client";

/**
 * Setup summary for the onboarding pages, same-origin BFF only
 * (`/api/v1/investor/onboarding`). Every field is a projection the browser
 * displays; none is an authority the browser asserts.
 */
import { useQuery } from "@tanstack/react-query";
import type { BrokerageConnectionView } from "@lib/investor-api/brokerage-connection";
import type { KycLifecycleState } from "./useKycVerification";

export interface OnboardingSummary {
  onboarding: {
    state: string;
    requiredSteps: string[];
    policyVersion: string;
  };
  accountId: string | null;
  authorization: { status: string; policyVersion: string } | null;
  identity: { state: KycLifecycleState | null };
  profile: {
    version: number;
    assessment: {
      permittedRiskBand: 1 | 2 | 3 | 4 | 5 | null;
      riskCapacityBand: 1 | 2 | 3 | 4 | 5 | null;
      riskWillingnessBand: 1 | 2 | 3 | 4 | 5 | null;
      productFitStatus: string;
      bindingConstraint: string | null;
      assessedAt: string;
    } | null;
  } | null;
  connection: BrokerageConnectionView | null;
  template: {
    templateId: string;
    name: string;
    benchmark: string;
    constituentCount: number;
    freshnessStatus: string;
  } | null;
  upstream: { state: string };
}

export const ONBOARDING_SUMMARY_QUERY_KEY = ["investor", "onboarding"] as const;

export function useOnboardingSummary() {
  return useQuery({
    queryKey: ONBOARDING_SUMMARY_QUERY_KEY,
    queryFn: async (): Promise<OnboardingSummary | null> => {
      const res = await fetch("/api/v1/investor/onboarding", {
        credentials: "include",
      });
      if (!res.ok)
        throw new Error(`onboarding read failed: ${String(res.status)}`);
      const body = (await res.json()) as { data: OnboardingSummary | null };
      return body.data;
    },
    staleTime: 3_000,
  });
}
