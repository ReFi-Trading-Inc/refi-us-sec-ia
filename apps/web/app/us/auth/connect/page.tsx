"use client";

/**
 * /us/auth/connect — the step between eligibility and onboarding.
 *
 * Wallets are optional linked identifiers, never the login. Where a linking
 * signature can be verified (local mock mode) this page renders the wallet
 * card. Everywhere else (demo, production) the wallet stack is not loaded at
 * all: a signed-in visitor continues straight into onboarding; a visitor
 * without a session is told plainly that sign-in is not connected in this
 * environment, and on the demo tier is pointed to the walkthrough profiles.
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, StatusBanner } from "@ui/components";
import { siweCopy } from "../../_content/app-copy";
import { useAuth } from "../../../_providers/auth/AuthProvider";
import { WALLET_LINKING_AVAILABLE } from "../../../_providers/wallet/MaybeWalletProvider";

// Lazy so the wagmi/WalletConnect bundle is only fetched where it can be used.
const WalletLinkCard = lazy(() =>
  import("./_components/WalletLinkCard").then((m) => ({
    default: m.WalletLinkCard,
  })),
);

export default function ConnectPage() {
  const router = useRouter();
  const auth = useAuth();
  const [demoTier, setDemoTier] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/demo/session", { credentials: "include" })
      .then((r) => {
        if (!cancelled && r.ok) setDemoTier(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Signed in: this step has nothing to add outside mock mode — continue.
  useEffect(() => {
    if (!WALLET_LINKING_AVAILABLE && auth.status === "authenticated") {
      router.replace("/us/onboarding");
    }
  }, [auth.status, router]);

  return (
    <main className="min-h-screen bg-charcoal-950 text-charcoal-100 font-sans flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md flex flex-col gap-6">
        <h1 className="text-2xl font-semibold text-charcoal-50">
          {WALLET_LINKING_AVAILABLE
            ? siweCopy.heading
            : siweCopy.continueHeading}
        </h1>
        {WALLET_LINKING_AVAILABLE ? (
          <Suspense fallback={null}>
            <WalletLinkCard />
          </Suspense>
        ) : (
          <Card>
            <CardContent className="pt-5 flex flex-col gap-4">
              {auth.status === "loading" ? (
                <p
                  className="text-sm text-charcoal-500"
                  aria-busy="true"
                  data-testid="connect-loading"
                >
                  …
                </p>
              ) : auth.status === "authenticated" ? (
                <p
                  className="text-sm text-charcoal-400"
                  data-testid="connect-continuing"
                >
                  {siweCopy.continuing}
                </p>
              ) : (
                <>
                  <StatusBanner
                    variant="info"
                    data-testid="connect-signin-unavailable"
                  >
                    {siweCopy.signInUnavailable}
                  </StatusBanner>
                  <p
                    className="text-xs text-charcoal-500"
                    data-testid="wallet-linking-notice"
                  >
                    {siweCopy.linkingUnavailable.notice}
                  </p>
                  {demoTier && (
                    <a
                      href="/us/demo"
                      className="text-sm text-mint-400 hover:underline"
                      data-testid="connect-demo-persona-link"
                    >
                      {siweCopy.linkingUnavailable.demoCta}
                    </a>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
