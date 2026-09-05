"use client";

/**
 * Browser read of investor-visible account records through the same-origin
 * BFF (`/api/v1/investor/activity`). Structured records only — the BFF has
 * already excluded the execution-chain variants parked behind D-LAUNCH-06.
 */
import { useQuery } from "@tanstack/react-query";
import type { ActivityRecordView } from "@lib/investor-api/account-records";
import type { UpstreamState } from "@lib/investor-api/upstream-state";

export interface ActivityListView {
  items: ActivityRecordView[];
  excludedCount: number;
  truncated: boolean;
  upstream: UpstreamState;
}

export function useInvestorActivity() {
  return useQuery({
    queryKey: ["investor", "activity"] as const,
    queryFn: async () => {
      const res = await fetch("/api/v1/investor/activity", {
        credentials: "include",
      });
      if (!res.ok)
        throw new Error(`activity read failed: ${String(res.status)}`);
      const body = (await res.json()) as { data: ActivityListView };
      return body.data;
    },
    staleTime: 30_000,
  });
}
