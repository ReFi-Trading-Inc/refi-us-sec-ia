import type { Metadata } from "next";
import { AlphaSignupForm } from "./_components/AlphaSignupForm";
import { usBrand } from "../_content/brand";

export const metadata: Metadata = {
  title: "Join the ReFi alpha waitlist",
  description:
    "Software-generated investment advisory services in a controlled alpha. Two-step signup; scored waitlist.",
};

export default function AlphaSignupPage() {
  return (
    <div className="min-h-screen bg-charcoal-950 text-charcoal-100 font-sans">
      <header className="border-b border-charcoal-800 px-8 py-4">
        <span className="text-sm font-semibold text-charcoal-200">
          {usBrand.productSurface}
        </span>
      </header>

      <section className="px-6 py-16 max-w-2xl mx-auto">
        <p className="text-xs font-mono uppercase tracking-widest text-mint-400 mb-3">
          Alpha waitlist
        </p>
        <h1 className="text-3xl sm:text-4xl font-semibold text-charcoal-50 leading-tight mb-4">
          Join the alpha.
        </h1>
        <p className="text-charcoal-300 mb-8 leading-relaxed">
          Signal-mode advisory in a controlled cohort. Two steps: your email
          first, so nothing is lost if you stop. Qualification questions second.
          Waitlist position is scored, not first-come.
        </p>
        <AlphaSignupForm />
        <p className="text-xs text-charcoal-500 mt-8">
          By joining, you agree to the terms and privacy policy in{" "}
          <a className="text-mint-400 hover:underline" href="/us/disclosures">
            Disclosures
          </a>
          . Not an offer of securities. Investment advisory services offered by
          ReFi Trading Inc., an investment adviser registered with the SEC.
        </p>
      </section>
    </div>
  );
}
