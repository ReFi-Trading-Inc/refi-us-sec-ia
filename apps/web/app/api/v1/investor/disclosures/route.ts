/**
 * GET /api/v1/investor/disclosures
 *
 * The backend's EFFECTIVE disclosures, read through the frozen v1.1.0-alpha.2
 * Investor API client (`listEffectiveDisclosures`). First C1b-2 slice
 * (reclassification row 21). The browser never calls the Investor API; this
 * same-origin BFF route is its only path.
 *
 * Fail-closed semantics: a contract mismatch from the frozen client, an
 * unconfigured upstream, or a transport failure is reported as an explicit
 * `upstream` state with an empty list — never as an invented "no disclosures"
 * success and never with a fabricated document.
 */
import { bffRead } from "@lib/bff/handler";
import {
  ContractVersionMismatchError,
  InvestorApiError,
  InvestorApiTransportError,
} from "@refi/api-clients/investor-api";
import {
  GoogleCredentialUnavailableError,
  investorApiClientFor,
  SessionAssertionInputError,
  UpstreamNotConfiguredError,
} from "@lib/investor-api/gateway";
import {
  listEffectiveDisclosures,
  type EffectiveDisclosure,
} from "@lib/investor-api/disclosure-consent";

export interface DisclosuresReadView {
  disclosures: EffectiveDisclosure[];
  hasMore: boolean;
  upstream:
    | { state: "ok"; contractVersion: "v1.1.0-alpha.2" }
    | {
        state:
          | "not_configured"
          | "credential_unavailable"
          | "contract_mismatch"
          | "unavailable"
          | "error";
        reason: string;
        code?: string;
      };
}

export const GET = bffRead({
  source: "backend",
  fetch: async (ctx): Promise<DisclosuresReadView> => {
    if (!ctx.auth) {
      return {
        disclosures: [],
        hasMore: false,
        upstream: { state: "error", reason: "unauthenticated" },
      };
    }
    try {
      const client = investorApiClientFor(ctx.auth);
      const { items, hasMore } = await listEffectiveDisclosures(client);
      return {
        disclosures: items,
        hasMore,
        upstream: { state: "ok", contractVersion: "v1.1.0-alpha.2" },
      };
    } catch (err) {
      return { disclosures: [], hasMore: false, upstream: classify(err) };
    }
  },
});

function classify(
  err: unknown,
): Exclude<DisclosuresReadView["upstream"], { state: "ok" }> {
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
  if (err instanceof InvestorApiError) {
    return { state: "error", reason: err.name, code: err.code };
  }
  return {
    state: "error",
    reason: err instanceof Error ? err.name : "unknown",
  };
}
