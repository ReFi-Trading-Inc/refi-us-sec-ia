"use client";

import { useEffect, useState } from "react";
import { ToastProvider } from "@refi/ui/components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initMsw } from "../_msw/init";
import { MockModeBanner } from "../_components/MockModeBanner";
import { DemoTierIndicator } from "../_components/DemoTierIndicator";
import { PostHogProvider } from "./analytics/PostHogProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  );
  useEffect(() => {
    // Mock mode only: start the MSW browser worker. Production builds never do.
    if (process.env["NEXT_PUBLIC_REFI_ENV"] === "prod") return;
    void initMsw();
  }, []);

  // The QueryClientProvider is ALWAYS mounted. Until 2026-09-05 the /us tree
  // borrowed the wallet provider's own QueryClient during the pre-MSW render;
  // with the wallet stack gated to mock mode that crutch is gone, and a
  // non-prod production build (CI builds with NEXT_PUBLIC_REFI_ENV=staging)
  // must still prerender pages that use react-query. MSW start-up is a
  // side effect only; it never removes the provider.
  return (
    <PostHogProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MockModeBanner />
          <DemoTierIndicator />
          {children}
        </ToastProvider>
      </QueryClientProvider>
    </PostHogProvider>
  );
}
