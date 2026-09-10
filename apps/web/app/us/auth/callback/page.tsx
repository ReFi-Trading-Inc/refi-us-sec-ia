import type { Metadata } from "next";
import { Suspense } from "react";
import { CallbackClient } from "./_components/CallbackClient";
import { usBrand } from "../../_content/brand";

// Email magic-link return. This is the EXACT registered redirect URI (no
// query state of ours); the provider appends its token. The client half
// posts that token once to the same-origin completion route; the HttpOnly
// login cookie identifies the pending login. Public and token-driven, so it
// renders dynamically and never prerenders a token.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Finishing sign-in",
  description: "Completing your ReFi sign-in.",
};

export default function AuthCallbackPage() {
  return (
    <main className="min-h-screen bg-charcoal-950 text-charcoal-100 font-sans flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md flex flex-col gap-4">
        <span className="text-sm font-semibold text-charcoal-200">
          {usBrand.productSurface}
        </span>
        <Suspense
          fallback={<p className="text-sm text-charcoal-400">Loading…</p>}
        >
          <CallbackClient />
        </Suspense>
      </div>
    </main>
  );
}
