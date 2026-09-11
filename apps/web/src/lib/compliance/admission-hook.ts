/**
 * Fire-and-record re-evaluation of Alpha admission after a prerequisite
 * changed (consent accepted, profile refreshed). Best-effort: a failure to
 * gather prerequisites never fails the originating mutation; the admission
 * read evaluates again from current state.
 */
import type { AuthContext } from "../bff/auth";
import { investorApiClientFor } from "../investor-api/gateway";
import { getKycProvider, KycProviderUnavailableError } from "../kyc";
import type { KycProviderAdapter } from "../kyc/provider";
import { ensureAlphaAdmissionEvaluated } from "./alpha-admission";

export async function reevaluateAlphaAdmission(
  auth: AuthContext,
  correlationId: string,
  trigger: string,
  explicitProvider?: KycProviderAdapter,
): Promise<void> {
  let provider: KycProviderAdapter | null = explicitProvider ?? null;
  if (!provider) {
    try {
      provider = getKycProvider();
    } catch (err) {
      if (!(err instanceof KycProviderUnavailableError)) throw err;
    }
  }
  try {
    await ensureAlphaAdmissionEvaluated({
      auth,
      client: investorApiClientFor(auth),
      provider,
      correlationId,
      trigger,
    });
  } catch {
    // Admission is re-derived on the next read; never fail the caller.
  }
}
