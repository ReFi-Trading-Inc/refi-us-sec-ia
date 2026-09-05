/**
 * Resolve the configured KYC provider adapter (server-only).
 *
 * `REFI_KYC_PROVIDER`:
 *   - "unconfigured" (default) — no provider selected; the BFF reports
 *     verification as unavailable and starts nothing. Honest for a public
 *     product whose vendor is not chosen.
 *   - "mock" — the deterministic MockKycProvider for local/E2E use.
 *
 * A real vendor arrives as a new adapter kind behind `KycProviderAdapter`;
 * nothing in the routes or UI changes for that.
 */
import { getServerEnv } from "../config/env";
import { MockKycProvider } from "./mock-provider";
import type { KycProviderAdapter } from "./provider";

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

export function getKycProvider(): KycProviderAdapter {
  const env = getServerEnv();
  if (env.REFI_KYC_PROVIDER === "mock") {
    mock ??= new MockKycProvider();
    return mock;
  }
  throw new KycProviderUnavailableError();
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
