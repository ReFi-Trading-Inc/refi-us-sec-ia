/**
 * Explicit upstream state for BFF reads that go through the frozen
 * v1.1.0-alpha.2 Investor API client. A failure is reported as a named state
 * with an empty result — never as an invented success. Mirrors the
 * classification introduced by the disclosures read (C1b-2 slice 1).
 */
import {
  ContractVersionMismatchError,
  InvestorApiError,
  InvestorApiTransportError,
} from "@refi/api-clients/investor-api";
import {
  GoogleCredentialUnavailableError,
  SessionAssertionInputError,
  UpstreamNotConfiguredError,
} from "./gateway";
import { AccountScopeError } from "./account-scope";
import { PaginationError } from "./pagination";

export const CONTRACT_VERSION = "v1.1.0-alpha.2" as const;

export type UpstreamState =
  | { state: "ok"; contractVersion: typeof CONTRACT_VERSION }
  | {
      state:
        | "not_configured"
        | "credential_unavailable"
        | "contract_mismatch"
        | "unavailable"
        | "account_scope"
        | "pagination"
        | "error";
      reason: string;
      code?: string;
      status?: number;
    };

export const UPSTREAM_OK: UpstreamState = {
  state: "ok",
  contractVersion: CONTRACT_VERSION,
};

export function classifyUpstream(
  err: unknown,
): Exclude<UpstreamState, { state: "ok" }> {
  if (err instanceof UpstreamNotConfiguredError) {
    return { state: "not_configured", reason: err.name };
  }
  if (
    err instanceof GoogleCredentialUnavailableError ||
    err instanceof SessionAssertionInputError
  ) {
    return { state: "credential_unavailable", reason: err.name };
  }
  if (err instanceof ContractVersionMismatchError) {
    return { state: "contract_mismatch", reason: err.schema };
  }
  if (err instanceof InvestorApiTransportError) {
    return { state: "unavailable", reason: err.name };
  }
  if (err instanceof AccountScopeError) {
    return { state: "account_scope", reason: err.reason };
  }
  if (err instanceof PaginationError) {
    return { state: "pagination", reason: err.reason };
  }
  if (err instanceof InvestorApiError) {
    return {
      state: "error",
      reason: err.name,
      code: err.code,
      status: err.status,
    };
  }
  return {
    state: "error",
    reason: err instanceof Error ? err.name : "unknown",
  };
}
