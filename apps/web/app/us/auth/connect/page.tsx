"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { Button, Card, CardContent, StatusBanner } from "@ui/components";
import { siweCopy } from "../../_content/app-copy";
import { useSiweAuth } from "../../../_hooks/useSiweAuth";
import { useAuth } from "../../../_providers/auth/AuthProvider";

/**
 * Whether the wallet-LINKING signature can be verified in this build. The
 * `/siwe/*` verifier exists only as the local-dev browser mock (MSW); no
 * identity service is deployed (GAP-IDENTITY-018). Outside mock mode the
 * signature step can never succeed, so the page must not offer it as if it
 * could — the wallet is displayed as connected and the user is told, plainly,
 * that linking is not available here. Wallet linking is never the login.
 */
const LINKING_AVAILABLE =
  process.env["NEXT_PUBLIC_REFI_ENV"] !== "prod" &&
  (process.env["NEXT_PUBLIC_REFI_DATA_ADAPTER"] ?? "mock") === "mock";

export default function SiweConnectPage() {
  const router = useRouter();
  const { isConnected, address } = useAccount();
  const { state, signIn, reset } = useSiweAuth();
  const auth = useAuth();
  // Demo tier detection is runtime (server-only REFI_ENV): the route answers
  // 200 only there. On the demo tier the honest next step is the persona picker.
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

  // Once verify succeeds, the AuthProvider re-fetches the session. When the
  // session flips to authenticated, route the user forward.
  useEffect(() => {
    if (state.phase === "success" && auth.status === "authenticated") {
      router.replace("/us/onboarding");
    }
  }, [state, auth.status, router]);

  // If the user is already authenticated, bounce straight to onboarding.
  useEffect(() => {
    if (auth.status === "authenticated" && state.phase === "idle") {
      router.replace("/us/onboarding");
    }
  }, [auth.status, state.phase, router]);

  const signing =
    state.phase === "fetching_nonce" ||
    state.phase === "awaiting_signature" ||
    state.phase === "verifying";

  const errorMessage =
    state.phase === "error" ? siweCopy.siweErrors[state.code] : null;

  return (
    <main className="min-h-screen bg-charcoal-950 text-charcoal-100 font-sans flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md flex flex-col gap-6">
        <h1 className="text-2xl font-semibold text-charcoal-50">
          {siweCopy.heading}
        </h1>

        <Card>
          <CardContent className="pt-5 flex flex-col gap-4">
            {!isConnected ? (
              <>
                <h2 className="text-base font-medium text-charcoal-100">
                  {siweCopy.notConnected.title}
                </h2>
                <p className="text-sm text-charcoal-400">
                  {siweCopy.notConnected.body}
                </p>
                <div className="pt-2">
                  <ConnectButton
                    label={siweCopy.notConnected.cta}
                    showBalance={false}
                  />
                </div>
              </>
            ) : (
              <>
                <h2 className="text-base font-medium text-charcoal-100">
                  {siweCopy.connected.title}
                </h2>
                <p className="text-xs font-mono text-charcoal-500 break-all">
                  {address}
                </p>
                {LINKING_AVAILABLE ? (
                  <>
                    <p className="text-sm text-charcoal-400">
                      {siweCopy.connected.body}
                    </p>
                    <div className="pt-2">
                      <Button
                        onClick={() => {
                          reset();
                          void signIn();
                        }}
                        disabled={signing || state.phase === "success"}
                      >
                        {signing
                          ? siweCopy.signing
                          : state.phase === "success"
                            ? siweCopy.success
                            : siweCopy.connected.cta}
                      </Button>
                    </div>
                  </>
                ) : (
                  <StatusBanner
                    variant="info"
                    data-testid="wallet-linking-unavailable"
                  >
                    {siweCopy.linkingUnavailable.connected}
                  </StatusBanner>
                )}
              </>
            )}

            {!LINKING_AVAILABLE && (
              <p
                className="text-xs text-charcoal-500"
                data-testid="wallet-linking-notice"
              >
                {siweCopy.linkingUnavailable.notice}
              </p>
            )}
            {demoTier && (
              <div className="pt-1">
                <a
                  href="/us/demo"
                  className="text-sm text-mint-400 hover:underline"
                  data-testid="connect-demo-persona-link"
                >
                  {siweCopy.linkingUnavailable.demoCta}
                </a>
              </div>
            )}

            {LINKING_AVAILABLE && errorMessage && (
              <StatusBanner variant="error">{errorMessage}</StatusBanner>
            )}
            {state.phase === "success" && (
              <StatusBanner variant="success">{siweCopy.success}</StatusBanner>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
