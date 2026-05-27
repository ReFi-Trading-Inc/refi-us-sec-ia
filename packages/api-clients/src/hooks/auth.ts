// SIWE auth hooks. Implements the nonce → sign → verify → session flow per
// MIG-P2-01. The wagmi wallet signature step is performed by the caller (the
// AuthProvider) and passed back into `verify` so this package stays UI-agnostic.

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { apiFetch, ApiError } from "../client";
import type {
  OkResult,
  SiweErrorCode,
  SiweNonceResponse,
  SiweVerifyRequest,
} from "../compat";

export type SiweMessageInput = {
  domain: string;
  address: string;
  uri: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
  statement?: string;
};

const DEFAULT_STATEMENT = "Sign in to ReFi.Trading";

export function buildSiweMessage(input: SiweMessageInput): string {
  const statement = input.statement ?? DEFAULT_STATEMENT;
  return [
    `${input.domain} wants you to sign in with your Ethereum account:`,
    input.address,
    "",
    statement,
    "",
    `URI: ${input.uri}`,
    "Version: 1",
    `Chain ID: ${input.chainId}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt}`,
    `Expiration Time: ${input.expirationTime}`,
  ].join("\n");
}

/**
 * SIWE nonce request bindings. Per Daniel's spec (Wallet Sign-In (SIWE).pdf:p4),
 * the server stores the nonce against `{domain, origin, uri, chainId}` so that
 * verify can reject replay across origins or chains.
 */
export type SiweNonceParams = {
  domain: string;
  origin: string;
  uri: string;
  chainId: number;
};

export function useSiweNonce(): UseMutationResult<
  SiweNonceResponse,
  Error,
  SiweNonceParams
> {
  return useMutation({
    mutationFn: (params) => {
      const qs = new URLSearchParams({
        domain: params.domain,
        origin: params.origin,
        uri: params.uri,
        chainId: String(params.chainId),
      });
      return apiFetch<SiweNonceResponse>(`/siwe/nonce?${qs.toString()}`, {
        method: "GET",
      });
    },
  });
}

export function useSiweVerify(): UseMutationResult<
  OkResult,
  Error,
  SiweVerifyRequest
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: SiweVerifyRequest) =>
      apiFetch<OkResult>("/siwe/verify", { method: "POST", body: req }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["auth", "session"] });
    },
  });
}

export function useSessionRefresh(): UseMutationResult<OkResult, Error, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<OkResult>("/auth/refresh", { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["auth", "session"] });
    },
  });
}

export function useSignOut(): UseMutationResult<OkResult, Error, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      // Daniel's spec name (SIWE.pdf:p8). Server-side this revokes the active
      // refresh token; the "all devices" semantic is achieved via the
      // account-wide refresh_jti rotation rule.
      apiFetch<OkResult>("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      qc.clear();
    },
  });
}

/**
 * Maps a backend error response to one of the six standardized SIWE error
 * codes. Falls back to UNKNOWN.
 */
export function siweErrorCode(error: unknown): SiweErrorCode {
  if (error instanceof ApiError) {
    const body = error.body as { code?: unknown } | null | undefined;
    const code = body && typeof body === "object" ? body.code : undefined;
    if (typeof code === "string") {
      switch (code) {
        case "NONCE_INVALID":
        case "SIGNATURE_INVALID":
        case "POLICY_VIOLATION":
        case "CHAIN_DENIED":
        case "ACCOUNT_BLOCKED":
        case "REFRESH_REVOKED":
          return code;
        default:
          return "UNKNOWN";
      }
    }
  }
  return "UNKNOWN";
}
