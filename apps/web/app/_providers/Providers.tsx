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
  const [mswReady, setMswReady] = useState(
    process.env["NEXT_PUBLIC_REFI_ENV"] === "prod",
  );

  useEffect(() => {
    if (process.env["NEXT_PUBLIC_REFI_ENV"] === "prod") return;
    let cancelled = false;
    void initMsw().finally(() => {
      if (!cancelled) setMswReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!mswReady) {
    return (
      <PostHogProvider>
        <ToastProvider>
          <MockModeBanner />
          <DemoTierIndicator />
          {children}
        </ToastProvider>
      </PostHogProvider>
    );
  }

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
