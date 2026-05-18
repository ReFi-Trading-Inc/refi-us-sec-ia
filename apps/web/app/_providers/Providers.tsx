"use client";

import { WalletProvider } from "./wallet/WalletProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}
