"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { Button, Card, CardContent, StatusBanner } from "@ui/components";

/**
 * Local-mock-only wallet LINKING card (wagmi hooks; the wallet stack is
 * mounted only when WALLET_LINKING_AVAILABLE). The signature flow verifies
 * against the MSW `/siwe/*` mock; it is never rendered on demo or production.
 */
import { siweCopy } from "../../../_content/app-copy";
import { useSiweAuth } from "../../../../_hooks/useSiweAuth";
import { useAuth } from "../../../../_providers/auth/AuthProvider";

export function WalletLinkCard() {
  const router = useRouter();
  const { isConnected, address } = useAccount();
  const { state, signIn, reset } = useSiweAuth();
  const auth = useAuth();

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
            <p className="text-sm text-charcoal-400">
              {siweCopy.connected.body}
            </p>
            <p className="text-xs font-mono text-charcoal-500 break-all">
              {address}
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
        )}

        {errorMessage && (
          <StatusBanner variant="error">{errorMessage}</StatusBanner>
        )}
        {state.phase === "success" && (
          <StatusBanner variant="success">{siweCopy.success}</StatusBanner>
        )}
      </CardContent>
    </Card>
  );
}
