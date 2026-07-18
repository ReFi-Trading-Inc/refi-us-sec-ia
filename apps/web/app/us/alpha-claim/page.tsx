import type { Metadata } from "next";
import { Suspense } from "react";
import { AlphaClaimClient } from "./_components/AlphaClaimClient";
import { usBrand } from "../_content/brand";

// Handoff receiving page (§2.3 / §4.4). The ReFi Alpha game redirects here
// with an opaque signed token in `?token=`; this same-origin page forwards
// it to POST /api/v1/investor/alpha-claim (the API rejects cross-origin
// POSTs), then routes the player into formal onboarding. Token-driven and
// public, so it is rendered dynamically.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Claim your ReFi alpha progress",
  description:
    "Bring your ReFi Alpha game progress into ReFi onboarding. Your formal investment profile is collected separately.",
};

export default function AlphaClaimPage() {
  return (
    <div className="min-h-screen bg-charcoal-950 text-charcoal-100 font-sans">
      <header className="border-b border-charcoal-800 px-8 py-4">
        <span className="text-sm font-semibold text-charcoal-200">
          {usBrand.productSurface}
        </span>
      </header>

      <section className="px-6 py-16 max-w-2xl mx-auto">
        <p className="text-xs font-mono uppercase tracking-widest text-mint-400 mb-3">
          Alpha handoff
        </p>
        <h1 className="text-3xl sm:text-4xl font-semibold text-charcoal-50 leading-tight mb-4">
          Claim your progress.
        </h1>
        <p className="text-charcoal-300 mb-8 leading-relaxed">
          You&rsquo;re moving from the ReFi Alpha game into ReFi onboarding.
          Your game progress is preserved; your formal investment profile is
          collected separately.
        </p>

        <Suspense
          fallback={<p className="text-charcoal-400 text-sm">Loading…</p>}
        >
          <AlphaClaimClient />
        </Suspense>

        <p className="text-xs text-charcoal-500 mt-8">
          Not an offer of securities. Investment advisory services offered by
          ReFi Trading Inc., an investment adviser registered with the SEC.
        </p>
      </section>
    </div>
  );
}
