import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { type Config } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";

// Empty string causes RainbowKit to throw at module evaluation during SSR.
// 'placeholder' keeps builds working; the env var must be set in production deployments.
const projectId =
  process.env["NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID"] || "placeholder";

let cached: Config | null = null;

/**
 * LAZY on purpose. Building the RainbowKit/wagmi config initialises the
 * WalletConnect AppKit, which phones home (pulse.walletconnect.org) as a side
 * effect of module evaluation. The wallet stack mounts only in local mock mode
 * (`MaybeWalletProvider`), so the config must not exist until a provider
 * actually mounts — importing this module must have no network effect.
 */
export function getWagmiConfig(): Config {
  cached ??= getDefaultConfig({
    appName: "ReFi.Trading USA",
    projectId,
    chains: [
      mainnet,
      ...(process.env["NEXT_PUBLIC_REFI_ENV"] !== "prod" ? [sepolia] : []),
    ],
    ssr: true,
  });
  return cached;
}
