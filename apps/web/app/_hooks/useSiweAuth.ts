"use client";

import { useCallback, useState } from "react";
import { useAccount, useChainId, useSignMessage } from "wagmi";
import {
  buildSiweMessage,
  siweErrorCode,
  useSiweNonce,
  useSiweVerify,
  type SiweErrorCode,
} from "@refi/api-clients";

export type SiweFlowState =
  | { phase: "idle" }
  | { phase: "fetching_nonce" }
  | { phase: "awaiting_signature" }
  | { phase: "verifying" }
  | { phase: "success" }
  | { phase: "error"; code: SiweErrorCode };

/**
 * NOT THE PRIMARY LOGIN PATH (Daniel 2026-07-28).
 *
 * `auth-siwe` is not the investor identity integration. `identity-ccid` is:
 * email-first onboarding (magic link or verification code) that must not
 * require a wallet, exchanged for a BFF-owned session. See
 * `apps/web/src/lib/bff/auth.ts` for the boundary this swaps to.
 *
 * SIWE's remaining approved purpose is to verify a wallet signature in order
 * to LINK an address to an existing `user_id`, where there is a defined
 * authorization purpose. A wallet address is a linked identifier — never a
 * user id, never an account id.
 *
 * Until identity-ccid deploys (`GAP-IDENTITY-018`, blocked on the §8
 * connection package) this flow is also what mints a local session for
 * development, because the email-first exchange cannot be built without
 * Daniel's JWKS URL, issuer, and audience. That is an interim local-dev
 * stand-in, not the product's login design. Retire the MSW `/siwe/*` handlers
 * with PR-E″ rather than swapping them to a backend.
 *
 * Orchestrates the full SIWE flow:
 *   1. POST /siwe/nonce
 *   2. Build EIP-4361 message
 *   3. wagmi signMessage
 *   4. POST /siwe/verify
 *   5. Refetch session (handled by hook consumer via AuthProvider invalidation)
 *
 * REAL/MOCK BOUNDARY: the wallet interaction (step 3) is real; the /siwe
 * endpoints (steps 1 + 4) exist only as MSW browser mocks — no identity
 * service is deployed, so production fails closed here (roadmap 1.5 / D8).
 * See docs/mock-boundary-map.md.
 */
export function useSiweAuth() {
  const { address } = useAccount();
  const chainId = useChainId();
  const nonceMut = useSiweNonce();
  const verifyMut = useSiweVerify();
  const { signMessageAsync } = useSignMessage();
  const [state, setState] = useState<SiweFlowState>({ phase: "idle" });

  const signIn = useCallback(async () => {
    if (!address) {
      setState({ phase: "error", code: "SIGNATURE_INVALID" });
      return;
    }
    try {
      setState({ phase: "fetching_nonce" });
      const { nonce } = await nonceMut.mutateAsync();

      const now = new Date();
      const expirationTime = new Date(now.getTime() + 10 * 60_000);
      const domain =
        typeof window !== "undefined" ? window.location.host : "refi.trading";
      const uri =
        typeof window !== "undefined"
          ? window.location.origin
          : "https://refi.trading";

      const message = buildSiweMessage({
        domain,
        address,
        uri,
        chainId: chainId || 1,
        nonce,
        issuedAt: now.toISOString(),
        expirationTime: expirationTime.toISOString(),
      });

      setState({ phase: "awaiting_signature" });
      const signature = await signMessageAsync({ message });

      setState({ phase: "verifying" });
      await verifyMut.mutateAsync({ message, signature });

      setState({ phase: "success" });
    } catch (err) {
      // User-rejected wagmi signature errors do not carry an ApiError body,
      // but they should still surface as SIGNATURE_INVALID to the user.
      const wagmiRejected =
        err instanceof Error && /user rejected|reject/i.test(err.message);
      const code = wagmiRejected ? "SIGNATURE_INVALID" : siweErrorCode(err);
      setState({ phase: "error", code });
    }
  }, [address, chainId, nonceMut, signMessageAsync, verifyMut]);

  const reset = useCallback(() => {
    setState({ phase: "idle" });
  }, []);

  return { state, signIn, reset };
}
