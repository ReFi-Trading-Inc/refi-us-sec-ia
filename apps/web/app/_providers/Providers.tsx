"use client";

import { ToastProvider } from "@refi/ui/components";

export function Providers({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
