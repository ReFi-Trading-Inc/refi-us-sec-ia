import Link from "next/link";
import { usBrand } from "../_content/brand";
import { BrandMark } from "./BrandMark";

/**
 * The marketing-site footer lockup (mark + legal + nav) applied to the shell.
 * Copy is unchanged from the previous text-only footer — the regulatory
 * language is counsel-owned; only the layout is ported from refi.trading.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-charcoal-800 bg-charcoal-900/60 px-8 py-12">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-2">
            <BrandMark />
            <p className="text-xs text-charcoal-500">
              {usBrand.legalEntityPlaceholder} — {usBrand.regulatoryStatus}
            </p>
          </div>
          <nav className="flex gap-6 text-xs text-charcoal-400">
            <Link
              href="/us/disclosures"
              className="transition-colors hover:text-charcoal-200"
            >
              Disclosures
            </Link>
            <Link
              href="/us/eligibility"
              className="transition-colors hover:text-charcoal-200"
            >
              Eligibility
            </Link>
            <Link
              href="/us/app/support"
              className="transition-colors hover:text-charcoal-200"
            >
              Support
            </Link>
          </nav>
        </div>

        <div className="rounded-lg border border-charcoal-700 bg-charcoal-800/50 p-5">
          <p className="text-xs leading-relaxed text-charcoal-500">
            Investment advisory services are software-generated. Past
            performance is not a guarantee of future results. This is not a
            solicitation to buy or sell any security.
          </p>
        </div>
      </div>
    </footer>
  );
}
