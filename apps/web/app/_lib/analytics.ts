"use client";

import { useCallback } from "react";

export const AnalyticsEvent = {
  ELIGIBILITY_SUBMITTED: "eligibility_submitted",
  SIWE_COMPLETED: "siwe_completed",
  ONBOARDING_BROKER_CONNECTED: "onboarding_broker_connected",
  ONBOARDING_RISK_COMPLETED: "onboarding_risk_completed",
  COMPLIANCE_PREVIEW_RETURNED: "compliance_preview_returned",
  ORDER_SUBMITTED: "order_submitted",
  SUPPORT_TICKET_SUBMITTED: "support_ticket_submitted",
} as const;

export type AnalyticsEventName =
  (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];

type EventProps = Record<string, string | number | boolean>;

declare global {
  interface Window {
    posthog?: {
      capture: (event: string, props?: EventProps) => void;
    };
  }
}

export function useAnalytics() {
  const track = useCallback((event: AnalyticsEventName, props?: EventProps) => {
    if (typeof window === "undefined") return;
    window.posthog?.capture(event, props);
  }, []);

  return { track };
}
