/**
 * Server-only gateway from the BFF to Daniel's Investor API, built on the
 * FROZEN v1.1.0-alpha.2 client (`@refi/api-clients/investor-api`, PR #70).
 *
 * This module decides three things per request and nothing else:
 *
 *   1. WHERE the two runtime targets live (identity-ccid, investor-api) —
 *      from server env, never from the package's connection document and
 *      never from a browser value. Both must be loopback unless the reviewed
 *      remote-promotion switch is set (the connected Dev services are
 *      `provisioned_not_enabled` and no connection addendum has promoted
 *      them).
 *   2. HOW the Google service credential is obtained. Daniel decided the
 *      topology on 2026-09-09: the BFF runs as its own Cloud Run runtime
 *      service account and sends that account's Google ID token, one
 *      audience-bound provider per target (`google-id-token.ts`). No WIF, no
 *      key file, no impersonation. The deterministic simulator's fixture
 *      bearer remains available ONLY when the env selects it explicitly.
 *   3. HOW the per-attempt user assertion is minted — the real ES256 mint
 *      (`user-assertion.ts`) from the authenticated session's `sub`, `sid`,
 *      `auth_time`, `amr`, or the simulator fixture string.
 *
 * Nothing here logs, returns, or persists a token or assertion. Nothing here
 * modifies the frozen client; every contract rule (exact status, closed
 * schemas, error profiles, idempotency, deadlines) is the client's.
 */
import {
  createInvestorApiClient,
  type InvestorApiClient,
  type RuntimeTarget,
} from "@refi/api-clients/investor-api";
import type { AuthContext } from "../bff/auth";
import { getServerEnv } from "../config/env";
import { mintUserAssertion } from "./user-assertion";
import {
  createNativeCredentialProviders,
  type NativeCredentialProviders,
} from "./google-id-token";
import {
  createDemoInvestorApiClient,
  subscribeDemoEvents,
  type InvestorApiReadClient,
} from "./demo-client";
import { eventSourceFromClient, type InvestorApiEventSource } from "./events";

export type { InvestorApiReadClient } from "./demo-client";

export class DemoUpstreamNotPermittedError extends Error {
  constructor(tier: string) {
    super(
      `REFI_INVESTOR_API_MODE=demo is permitted only on the demo tier (REFI_ENV=demo); this deployment is "${tier}". ` +
        "The demo world is never an upstream for production, staging, or dev.",
    );
    this.name = "DemoUpstreamNotPermittedError";
  }
}

/** The simulator's fixed synthetic credentials (constants in Daniel's `tools/conformance.py`). */
const SIMULATOR_FIXTURE_BEARER = "fixture-google-oidc";
const SIMULATOR_FIXTURE_ASSERTION = "fixture-user-assertion";

export class UpstreamNotConfiguredError extends Error {
  constructor(what: string) {
    super(
      `Investor API upstream is not configured: ${what}. The connected Dev ` +
        "services are provisioned but not enabled and no connection addendum " +
        "has promoted them; point REFI_INVESTOR_API_BASE_URL / " +
        "REFI_IDENTITY_CCID_BASE_URL at Daniel's loopback simulator for now.",
    );
    this.name = "UpstreamNotConfiguredError";
  }
}

export class GoogleCredentialUnavailableError extends Error {
  constructor() {
    super(
      "No Google service credential is configured for the Investor API " +
        "(REFI_INVESTOR_API_CREDENTIAL_MODE=unconfigured). A connected " +
        "deployment sets native-cloud-run; only the loopback simulator may " +
        "use simulator-fixture. Nothing is sent.",
    );
    this.name = "GoogleCredentialUnavailableError";
  }
}

// One pair of audience-bound providers per process. Each is bound to exactly
// one custom audience from server env; the identity-ccid token can never be
// presented to investor-api or vice versa.
let nativeProviders: NativeCredentialProviders | null = null;
function nativeCredentialProviders(
  env: ReturnType<typeof getServerEnv>,
): NativeCredentialProviders {
  nativeProviders ??= createNativeCredentialProviders({
    identityCcidAudience: env.REFI_IDENTITY_CCID_GOOGLE_AUDIENCE,
    investorApiAudience: env.REFI_INVESTOR_API_GOOGLE_AUDIENCE,
  });
  return nativeProviders;
}
/** Test hook: forget the process-wide providers (and their token caches). */
export function resetNativeCredentialProvidersForTests(): void {
  nativeProviders = null;
}

export class SessionAssertionInputError extends Error {
  constructor(missing: string) {
    super(
      `Cannot mint a user assertion for this session: ${missing} is not on the ` +
        "authenticated context. The identity exchange must propagate it; it " +
        "is never synthesised here.",
    );
    this.name = "SessionAssertionInputError";
  }
}

function targetFor(
  baseUrl: string | undefined,
  name: string,
  allowRemote: boolean,
  getBearer: () => Promise<string>,
): RuntimeTarget {
  if (baseUrl === undefined || baseUrl === "") {
    throw new UpstreamNotConfiguredError(`${name} base URL is unset`);
  }
  return { baseUrl, getBearer, allowRemote };
}

/**
 * A client bound to the calling session. Constructed per request: the
 * assertion minter closes over THIS user's `sub`/`sid`/`auth_time`/`amr`.
 */
export function investorApiClientFor(auth: AuthContext): InvestorApiReadClient {
  const env = getServerEnv();
  if (env.REFI_INVESTOR_API_MODE === "demo") {
    if (env.REFI_ENV !== "demo")
      throw new DemoUpstreamNotPermittedError(env.REFI_ENV);
    return createDemoInvestorApiClient({ authId: auth.authId });
  }
  return createFrozenClient(auth, env);
}

/** Event source for `streamAccountEvents`: demo world on the demo tier, else the frozen client. */
export function investorApiEventSourceFor(
  auth: AuthContext,
): InvestorApiEventSource {
  const env = getServerEnv();
  if (env.REFI_INVESTOR_API_MODE === "demo") {
    if (env.REFI_ENV !== "demo")
      throw new DemoUpstreamNotPermittedError(env.REFI_ENV);
    return {
      subscribe: (accountId, lastEventId, signal) =>
        subscribeDemoEvents(auth.authId, accountId, lastEventId, signal),
    };
  }
  return eventSourceFromClient(createFrozenClient(auth, env));
}

function createFrozenClient(
  auth: AuthContext,
  env: ReturnType<typeof getServerEnv>,
): InvestorApiClient {
  const allowRemote = env.REFI_INVESTOR_API_ALLOW_REMOTE === "1";

  // Per-TARGET bearer providers. In native mode the two providers are
  // distinct objects with distinct audiences; in simulator mode both send the
  // fixture string; unconfigured fails closed for both.
  let identityBearer: () => Promise<string>;
  let investorBearer: () => Promise<string>;
  switch (env.REFI_INVESTOR_API_CREDENTIAL_MODE) {
    case "native-cloud-run": {
      const providers = nativeCredentialProviders(env);
      identityBearer = () => providers.identityCcid.getToken();
      investorBearer = () => providers.investorApi.getToken();
      break;
    }
    case "simulator-fixture":
      identityBearer = () => Promise.resolve(SIMULATOR_FIXTURE_BEARER);
      investorBearer = () => Promise.resolve(SIMULATOR_FIXTURE_BEARER);
      break;
    case "unconfigured":
      identityBearer = () =>
        Promise.reject(new GoogleCredentialUnavailableError());
      investorBearer = () =>
        Promise.reject(new GoogleCredentialUnavailableError());
      break;
  }

  const mintAssertion =
    env.REFI_INVESTOR_API_ASSERTION_MODE === "simulator-fixture"
      ? () => Promise.resolve(SIMULATOR_FIXTURE_ASSERTION)
      : async () => {
          if (auth.sid === undefined)
            throw new SessionAssertionInputError("sid");
          if (auth.authTime === undefined) {
            throw new SessionAssertionInputError("auth_time");
          }
          const minted = await mintUserAssertion({
            userId: auth.authId,
            sid: auth.sid,
            authTime: auth.authTime,
            ...(auth.amr !== undefined ? { amr: auth.amr } : {}),
          });
          return minted.token;
        };

  return createInvestorApiClient({
    identityCcid: targetFor(
      env.REFI_IDENTITY_CCID_BASE_URL,
      "identity-ccid",
      allowRemote,
      identityBearer,
    ),
    investorApi: targetFor(
      env.REFI_INVESTOR_API_BASE_URL,
      "investor-api",
      allowRemote,
      investorBearer,
    ),
    mintAssertion,
  });
}
