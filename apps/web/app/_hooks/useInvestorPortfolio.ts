"use client";

/**
 * Browser reads/writes for account truth through the same-origin BFF.
 * `/api/v1/investor/portfolio` (read) and `/api/v1/investor/preferences`
 * (the one preference write). Types are imported from the server projection
 * as TYPES ONLY.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PortfolioView } from "@lib/investor-api/portfolio";
import type { UpstreamState } from "@lib/investor-api/upstream-state";

export interface PortfolioResponse {
  portfolio: PortfolioView | null;
  upstream: UpstreamState;
}

export const PORTFOLIO_QUERY_KEY = ["investor", "portfolio"] as const;

export function useInvestorPortfolio(options?: { enabled?: boolean }) {
  return useQuery({
    enabled: options?.enabled ?? true,
    queryKey: PORTFOLIO_QUERY_KEY,
    queryFn: async (): Promise<PortfolioResponse> => {
      const res = await fetch("/api/v1/investor/portfolio", {
        credentials: "include",
      });
      if (!res.ok)
        throw new Error(`portfolio read failed: ${String(res.status)}`);
      const body = (await res.json()) as { data: PortfolioResponse };
      return body.data;
    },
    staleTime: 3_000,
  });
}

export interface PreferencePatchInput {
  expectedVersion: number;
  driftThreshold?: string;
  minOrder?: string;
  excludedAssets?: string[];
  fractionalEnabled?: boolean;
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PreferencePatchInput) => {
      const res = await fetch("/api/v1/investor/preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      const body = (await res.json()) as {
        data?: { ok: boolean; code?: string };
        error?: { message?: string };
      };
      if (!res.ok || !body.data?.ok) {
        throw new Error(
          body.data?.code ??
            body.error?.message ??
            `HTTP ${String(res.status)}`,
        );
      }
      return body.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: ["investor", "recommendations"] });
      void qc.invalidateQueries({ queryKey: ["investor", "activity"] });
    },
  });
}
