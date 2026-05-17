import type { Metadata } from "next";
import { usBrand } from "./_content/brand";

export const metadata: Metadata = {
  title: {
    default: usBrand.productSurface,
    template: `%s — ${usBrand.productSurface}`,
  },
  description: "Software-generated investment advisory services.",
};

export default function UsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
