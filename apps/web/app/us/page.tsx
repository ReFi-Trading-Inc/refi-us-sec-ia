import Link from "next/link";
import type { Metadata } from "next";
import { landingCopy } from "./_content/landing";
import { usBrand } from "./_content/brand";
import { BrandMark } from "./_components/BrandMark";
import { SiteFooter } from "./_components/SiteFooter";

export const metadata: Metadata = {
  title: usBrand.productSurface,
  description:
    "Software-generated investment advisory services for US investors.",
};

export default function UsLandingPage() {
  return (
    <div className="min-h-screen bg-charcoal-950 text-charcoal-100 font-sans">
      <header className="border-b border-charcoal-800 px-8 py-4 flex items-center justify-between">
        <BrandMark />
        <nav className="flex items-center gap-4 text-sm">
          <Link
            href="/us/disclosures"
            className="text-charcoal-400 hover:text-charcoal-200 transition-colors"
          >
            Disclosures
          </Link>
          <Link
            href="/us/eligibility"
            className="rounded-md bg-mint-400 px-4 py-1.5 text-charcoal-950 font-medium hover:bg-mint-300 transition-colors"
          >
            Check eligibility
          </Link>
        </nav>
      </header>

      <section className="relative overflow-hidden px-8 py-28 md:py-36">
        {/* Marketing-site hero background treatment, buttoned-down for the
            shell register: dot grid + soft mint glow instead of the photo. */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute inset-0 grid-pattern opacity-20" />
          <div className="absolute inset-0 bg-gradient-to-b from-charcoal-900 via-charcoal-950/40 to-charcoal-950" />
          <div className="absolute -top-24 left-1/4 h-64 w-64 rounded-full bg-mint-400/5 blur-3xl" />
          <div className="absolute -bottom-32 right-1/4 h-96 w-96 rounded-full bg-mint-400/5 blur-3xl" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-mint-400 mb-4">
            {usBrand.regulatoryStatus}
          </p>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-charcoal-50 leading-tight mb-6">
            {landingCopy.hero.headline}
          </h1>
          <p className="text-lg md:text-xl leading-relaxed text-charcoal-300 mb-10 max-w-2xl mx-auto">
            {landingCopy.hero.subheadline}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/us/eligibility"
              className="rounded-md bg-mint-400 px-6 py-3 text-charcoal-950 font-medium hover:bg-mint-300 transition-colors"
            >
              {landingCopy.hero.primaryCta}
            </Link>
            <Link
              href="/us/disclosures"
              className="rounded-md border border-charcoal-700 px-6 py-3 text-charcoal-300 hover:border-charcoal-500 hover:text-charcoal-100 transition-colors"
            >
              View disclosures
            </Link>
          </div>
        </div>
      </section>

      <section className="border-y border-charcoal-800 bg-charcoal-900/50 px-8 py-16 md:py-20">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {landingCopy.trustRow.items.map((item) => (
            <div
              key={item.title}
              className="rounded-lg border border-charcoal-500/60 bg-charcoal-700/40 p-6 transition-colors duration-300 hover:border-mint-400/30"
            >
              <p className="text-sm font-medium text-charcoal-100 mb-1">
                {item.title}
              </p>
              <p className="text-sm text-charcoal-400">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-8 py-20 md:py-24 max-w-4xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-charcoal-50 mb-12 md:mb-16 text-center">
          {landingCopy.howItWorks.heading}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {landingCopy.howItWorks.steps.map((step) => (
            <div
              key={step.number}
              className="flex flex-col gap-3 rounded-lg border border-charcoal-500/60 bg-charcoal-700/40 p-6 transition-colors duration-300 hover:border-mint-400/30"
            >
              <span className="text-3xl font-mono text-mint-400/40">
                {step.number}
              </span>
              <p className="text-sm font-medium text-charcoal-100">
                {step.title}
              </p>
              <p className="text-sm text-charcoal-400">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
