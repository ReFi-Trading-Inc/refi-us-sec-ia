/**
 * Resolve the configured KYC provider adapter (server-only).
 *
 * `REFI_KYC_PROVIDER`:
 *   - "unconfigured" (default) — no provider selected; the BFF reports
 *     verification as unavailable and starts nothing. Honest for a public
 *     product whose vendor is not chosen.
 *   - "mock" — the deterministic MockKycProvider for local/E2E/demo use.
 *   - "socure" — the selected production adapter (founder decision
 *     2026-09-10). Requires complete SOCURE_* configuration (env invariants);
 *     never a fallback from or to the mock.
 *
 * Nothing in the routes or UI changes per adapter kind.
 */
import { getServerEnv } from "../config/env";
import { MockKycProvider } from "./mock-provider";
import type { KycProviderAdapter } from "./provider";
import { SocureKycProvider } from "./socure/adapter";

export class KycProviderUnavailableError extends Error {
  constructor() {
    super(
      "No KYC provider is configured (REFI_KYC_PROVIDER=unconfigured). Identity " +
        "verification is not available until a provider adapter is selected; the " +
        "mock adapter is for local/E2E use only.",
    );
    this.name = "KycProviderUnavailableError";
  }
}

let mock: MockKycProvider | null = null;
let socure: SocureKycProvider | null = null;

export function getKycProvider(): KycProviderAdapter {
  const env = getServerEnv();
  switch (env.REFI_KYC_PROVIDER) {
    case "mock":
      mock ??= new MockKycProvider();
      return mock;
    case "socure":
      socure ??= new SocureKycProvider();
      return socure;
    case "unconfigured":
      throw new KycProviderUnavailableError();
  }
}

/** Test seam only: replace the cached production adapter (e.g. with an injected fake client). */
export function setSocureProviderForTests(p: SocureKycProvider | null): void {
  socure = p;
}

/** The mock's test controls exist only when explicitly enabled AND the adapter is the mock. */
export function getMockKycControls(): MockKycProvider | null {
  const env = getServerEnv();
  if (env.REFI_KYC_PROVIDER !== "mock" || env.REFI_KYC_MOCK_CONTROLS !== "1") {
    return null;
  }
  mock ??= new MockKycProvider();
  return mock;
}

export * from "./provider";
export * from "./provenance";
export * from "./evidence";
export * from "./identity-input";
export { kycEvidenceForAttestation } from "./attestation-evidence";
