/**
 * Investor product track (P1).
 *
 * These surfaces are adapter-driven and fixture-first. They deliberately do
 * NOT replace `/us/onboarding/broker` and `/us/onboarding/strategy` yet: those
 * are wired straight to the BFF and carry the current demo path. Once Daniel's
 * transport adapter lands and maps into `InvestorProductAdapter`, these
 * supersede them and the BFF-wired pages retire.
 *
 * Rendering is forced dynamic so the adapter tier is read from the SERVER's
 * `REFI_ENV` on the tier actually serving the request. A statically
 * prerendered layout would bake the build-time tier into the artifact, and one
 * artifact promoted from staging to production would then carry staging's
 * verdict — exactly the silent fixture-in-production failure this track must
 * make impossible.
 */
import type { ReactNode } from "react";
import { getServerEnv } from "@lib/config/env";
import { InvestorProductProvider } from "../../_components/product/adapter-context";
import { ProductAuthGate } from "../../_components/product/ProductAuthGate";

export const dynamic = "force-dynamic";

export default function ProductLayout({ children }: { children: ReactNode }) {
  const serverEnv = getServerEnv();

  return (
    <div className="min-h-screen bg-charcoal-900 font-sans text-charcoal-100">
      <a
        href="#product-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-app-btn focus:bg-mint-400 focus:px-4 focus:py-2 focus:text-app-body focus:font-semibold focus:text-charcoal-900"
      >
        Skip to main content
      </a>
      <InvestorProductProvider
        refiEnv={serverEnv.REFI_ENV}
        configuredMode={process.env["INVESTOR_PRODUCT_ADAPTER"]}
      >
        <main
          id="product-main"
          className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6"
        >
          {/* Session authority first: nothing investor-shaped renders, and no
              adapter read is issued, until the viewer is known. */}
          <ProductAuthGate>{children}</ProductAuthGate>
        </main>
      </InvestorProductProvider>
    </div>
  );
}
