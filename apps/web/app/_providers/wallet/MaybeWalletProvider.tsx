"use client";

/**
 * Mounts the wallet stack (wagmi / RainbowKit / WalletConnect) ONLY where the
 * wallet-linking signature can be verified: local mock mode. On the demo and
 * production tiers no identity service exists to verify a linking signature,
 * so the wallet stack is not loaded at all — no WalletConnect relay calls, no
 * modal, no dead-end "Link wallet" step. Wallets are optional linked
 * identifiers, never the login (Daniel 2026-07-28).
 */
import { lazy, Suspense } from "react";

export const WALLET_LINKING_AVAILABLE =
  process.env["NEXT_PUBLIC_REFI_ENV"] !== "prod" &&
  (process.env["NEXT_PUBLIC_REFI_DATA_ADAPTER"] ?? "mock") === "mock";

const WalletProvider = lazy(() =>
  import("./WalletProvider").then((m) => ({ default: m.WalletProvider })),
);

export function MaybeWalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!WALLET_LINKING_AVAILABLE) return <>{children}</>;
  return (
    <Suspense fallback={children}>
      <WalletProvider>{children}</WalletProvider>
    </Suspense>
  );
}
