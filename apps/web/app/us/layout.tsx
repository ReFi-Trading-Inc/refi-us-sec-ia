import type { Metadata } from "next";
import { usBrand } from "./_content/brand";
import { WalletProvider } from "../_providers/wallet/WalletProvider";
import { AuthProvider } from "../_providers/auth/AuthProvider";

export const metadata: Metadata = {
  title: {
    default: usBrand.productSurface,
    template: `%s — ${usBrand.productSurface}`,
  },
  description: "Software-generated investment advisory services.",
};

export default function UsLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <AuthProvider>{children}</AuthProvider>
    </WalletProvider>
  );
}
