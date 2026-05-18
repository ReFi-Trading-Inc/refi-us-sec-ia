"use client";

import { useEffect, useState } from "react";
import { ToastProvider } from "@refi/ui/components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initMsw } from "../_msw/init";

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

  // Render children immediately; gating only blocks query execution until MSW
  // is ready in dev/mock mode by deferring mount of the QueryClientProvider.
  if (!mswReady) {
    return <ToastProvider>{children}</ToastProvider>;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
