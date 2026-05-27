import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@ui/components";
import { landingCopy } from "./_content/landing";
import { usBrand } from "./_content/brand";

export const metadata: Metadata = {
  title: usBrand.productSurface,
  description:
    "Software-generated investment advisory services for US investors.",
};

export default function UsLandingPage() {
  return (
    <div className="min-h-screen bg-charcoal-950 text-charcoal-100 font-sans">
      <header className="border-b border-charcoal-800 px-8 py-4 flex items-center justify-between">
        <Logo
          size={24}
          wordmarkSuffix="USA"
          className="text-sm text-charcoal-200"
        />
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

      <section className="px-8 py-24 max-w-4xl mx-auto text-center">
        <p className="text-xs font-mono uppercase tracking-widest text-mint-400 mb-4">
          {usBrand.regulatoryStatus}
        </p>
        <h1 className="text-4xl sm:text-5xl font-semibold text-charcoal-50 leading-tight mb-6">
          {landingCopy.hero.headline}
        </h1>
        <p className="text-lg text-charcoal-400 mb-10 max-w-2xl mx-auto">
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
      </section>

      <section className="border-y border-charcoal-800 bg-charcoal-900/50 px-8 py-12">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {landingCopy.trustRow.items.map((item) => (
            <div key={item.title}>
              <p className="text-sm font-medium text-charcoal-100 mb-1">
                {item.title}
              </p>
              <p className="text-sm text-charcoal-400">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-8 py-20 max-w-4xl mx-auto">
        <h2 className="text-2xl font-semibold text-charcoal-50 mb-12 text-center">
          {landingCopy.howItWorks.heading}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {landingCopy.howItWorks.steps.map((step) => (
            <div key={step.number} className="flex flex-col gap-3">
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

      <footer className="border-t border-charcoal-800 px-8 py-8">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-charcoal-500">
          <p>
            {usBrand.legalEntityPlaceholder} — {usBrand.regulatoryStatus}
          </p>
          <nav className="flex gap-4">
            <Link
              href="/us/disclosures"
              className="hover:text-charcoal-300 transition-colors"
            >
              Disclosures
            </Link>
            <Link
              href="/us/app/support"
              className="hover:text-charcoal-300 transition-colors"
            >
              Support
            </Link>
          </nav>
        </div>
        <p className="mt-4 max-w-4xl mx-auto text-xs text-charcoal-600">
          Investment advisory services are software-generated. Past performance
          is not a guarantee of future results. This is not a solicitation to
          buy or sell any security.
        </p>
      </footer>
    </div>
  );
}
