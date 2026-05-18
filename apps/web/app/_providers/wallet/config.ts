import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { type Config } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";

// Empty string causes RainbowKit to throw at module evaluation during SSR.
// 'placeholder' keeps builds working; the env var must be set in production deployments.
const projectId =
  process.env["NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID"] || "placeholder";

export const wagmiConfig: Config = getDefaultConfig({
  appName: "ReFi.Trading USA",
  projectId,
  chains: [
    mainnet,
    ...(process.env["NEXT_PUBLIC_REFI_ENV"] !== "prod" ? [sepolia] : []),
  ],
  ssr: true,
});
