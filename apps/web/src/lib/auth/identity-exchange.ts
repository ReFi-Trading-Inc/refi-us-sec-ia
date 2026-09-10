/**
 * Daniel's identity exchange (alpha.2 `exchangeIdentity`,
 * POST /api/v1/identity/exchanges, Google bearer for identity-ccid) and
 * verification of the AUTHORITATIVE backend identity result.
 *
 * The request is built ONLY from the frozen client's `IdentityExchangeRequest`
 * fields and ONLY from durable state: the pending login's own state /
 * challenge / nonce / redirect_uri / network_context bindings and the
 * freshly minted bridge assertion. No field is invented; `acquisition` and
 * `invitation_token` are omitted until a reviewed flow supplies them.
 *
 * The response's `identity_result` is verified here against the backend's
 * JWKS (pinned URL, never derived from the token): ES256, fixed iss/aud
 * pair, exp/nbf with 30 s skew, closed claim shapes, email consistent with
 * the provider-verified login, and `jti` consumed EXACTLY ONCE in the
 * durable replay store. Only a verified, first-use result may become a
 * session. Every failure here is a refusal with no session.
 *
 * Remote acceptance stays BLOCKED: the frozen client refuses non-loopback
 * targets unless REFI_INVESTOR_API_ALLOW_REMOTE=1, and this module applies
 * the same rule to the backend JWKS URL. That switch stays OFF until Daniel's
 * step 4 / B1 returns the bound addendum.
 */
import {
  createLocalJWKSet,
  createRemoteJWKSet,
  jwtVerify,
  type JSONWebKeySet,
  type JWTVerifyGetKey,
} from "jose";
import { getServerEnv } from "../config/env";
import type { PendingLoginRecord } from "../connected-store/login-state";
import { consumeJtiOnce, JTI_PATTERN } from "../connected-store/replay";
import type { InvestorApiReadClient } from "../investor-api/demo-client";
import {
  createIdentityExchangeClient,
  GoogleCredentialUnavailableError,
  UpstreamNotConfiguredError,
} from "../investor-api/gateway";
import { IdentityExchangeUnavailableError } from "./connected-session";
import type { MintedBridgeAssertion } from "./identity-bridge";

export const IDENTITY_RESULT_CLOCK_SKEW_SECONDS = 30;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** A verified, first-use backend identity result. */
export interface VerifiedIdentityResult {
  sub: string;
  sid: string;
  jti: string;
  email: string;
  authTime: number;
  amr?: string[];
  exp: number;
  iat: number;
}

export class IdentityResultRejectedError extends Error {
  constructor(readonly reason: string) {
    super(`backend identity result rejected: ${reason}`);
    this.name = "IdentityResultRejectedError";
  }
}

// ─── Test seams ─────────────────────────────────────────────────────────────

let testClient: InvestorApiReadClient | null = null;
let testKeySet: JSONWebKeySet | null = null;
let remoteKeySet: { url: string; getKey: JWTVerifyGetKey } | null = null;

/** Fixture exchange client; production uses the frozen client from the gateway. */
export function setIdentityExchangeClientForTests(
  client: InvestorApiReadClient | null,
): void {
  testClient = client;
}
/** Fixture backend JWKS; production fetches the pinned IDENTITY_CCID_JWKS_URL. */
export function setIdentityResultKeySetForTests(
  jwks: JSONWebKeySet | null,
): void {
  testKeySet = jwks;
  remoteKeySet = null;
}

function backendKeyResolver(): JWTVerifyGetKey {
  if (testKeySet) return createLocalJWKSet(testKeySet);
  const env = getServerEnv();
  const url = env.IDENTITY_CCID_JWKS_URL;
  if (!url) {
    throw new IdentityExchangeUnavailableError(
      "IDENTITY_CCID_JWKS_URL is not configured",
    );
  }
  const host = new URL(url).hostname;
  if (!LOOPBACK.has(host) && env.REFI_INVESTOR_API_ALLOW_REMOTE !== "1") {
    throw new IdentityExchangeUnavailableError(
      "remote backend JWKS is not accepted until the connection addendum promotes it",
    );
  }
  if (!remoteKeySet || remoteKeySet.url !== url) {
    remoteKeySet = {
      url,
      getKey: createRemoteJWKSet(new URL(url), {
        cacheMaxAge: 300_000,
        cooldownDuration: 30_000,
      }),
    };
  }
  return remoteKeySet.getKey;
}

// ─── Exchange ───────────────────────────────────────────────────────────────

export interface ExchangeIdentityArgs {
  bridge: MintedBridgeAssertion;
  /** The bridge assertion's `sub` (durable ReFi opaque subject), for the replay record. */
  bridgeSub: string;
  login: PendingLoginRecord;
  /** Provider-verified, normalised email; the backend result must agree. */
  email: string;
  correlationId: string;
  now?: () => number;
}

/**
 * Send the bridge assertion to Daniel's exchange and return the verified
 * identity result. The bridge `jti` is recorded once BEFORE the call so the
 * same assertion can never be presented twice from this side, whatever the
 * backend does.
 */
export async function exchangeIdentity(
  args: ExchangeIdentityArgs,
): Promise<VerifiedIdentityResult> {
  const bridgeUse = await consumeJtiOnce("bridge-assertion-jti", {
    jti: args.bridge.jti,
    sub: args.bridgeSub,
    exp: args.bridge.exp,
    correlationId: args.correlationId,
  });
  if (!bridgeUse.first) {
    throw new IdentityResultRejectedError("bridge assertion already presented");
  }
  let client: InvestorApiReadClient;
  try {
    client = testClient ?? createIdentityExchangeClient();
  } catch (err) {
    if (err instanceof UpstreamNotConfiguredError) {
      throw new IdentityExchangeUnavailableError(err.message);
    }
    throw err;
  }
  let identityResult: string;
  try {
    const res = await client.call("exchangeIdentity", {
      body: {
        identity_assertion: args.bridge.token,
        state: args.login.state,
        challenge: args.login.challenge,
        nonce: args.login.nonce,
        redirect_uri: args.login.redirectUri,
        network_context: args.login.networkContext,
      },
    });
    // `token_type: "JWT"` is enforced by the frozen client's response schema.
    identityResult = res.data.data.identity_result;
  } catch (err) {
    if (err instanceof IdentityResultRejectedError) throw err;
    if (
      err instanceof UpstreamNotConfiguredError ||
      err instanceof GoogleCredentialUnavailableError
    ) {
      throw new IdentityExchangeUnavailableError(err.message);
    }
    // Contract errors (4xx/5xx profiles, schema mismatch, deadline, remote
    // refusal) are all "no session": the reason is logged upstream by the
    // client's correlation id, never surfaced to the browser.
    throw new IdentityExchangeUnavailableError(
      err instanceof Error ? err.name : "exchange failed",
    );
  }
  return verifyIdentityResult({
    token: identityResult,
    expectedEmail: args.email,
    correlationId: args.correlationId,
    ...(args.now ? { now: args.now } : {}),
  });
}

// ─── Verification of Daniel's identity result ───────────────────────────────

export async function verifyIdentityResult(args: {
  token: string;
  expectedEmail: string;
  correlationId: string;
  now?: () => number;
}): Promise<VerifiedIdentityResult> {
  const env = getServerEnv();
  const getKey = backendKeyResolver();
  const nowSec = args.now ? args.now() : Math.floor(Date.now() / 1000);
  let payload: Record<string, unknown>;
  let kid: string | undefined;
  try {
    const verified = await jwtVerify(args.token, getKey, {
      algorithms: ["ES256"],
      issuer: env.IDENTITY_RESULT_ISSUER,
      audience: env.IDENTITY_RESULT_AUDIENCE,
      clockTolerance: IDENTITY_RESULT_CLOCK_SKEW_SECONDS,
      currentDate: new Date(nowSec * 1000),
      requiredClaims: [
        "iss",
        "aud",
        "sub",
        "iat",
        "nbf",
        "exp",
        "jti",
        "sid",
        "auth_time",
        "email",
        "email_verified",
      ],
    });
    payload = verified.payload;
    kid = verified.protectedHeader.kid;
  } catch (err) {
    throw new IdentityResultRejectedError(
      err instanceof Error ? err.name : "signature",
    );
  }
  if (typeof kid !== "string" || kid.length === 0) {
    throw new IdentityResultRejectedError("kid");
  }
  const str = (k: string): string => {
    const v = payload[k];
    if (typeof v !== "string" || v.length === 0) {
      throw new IdentityResultRejectedError(k);
    }
    return v;
  };
  const num = (k: string): number => {
    const v = payload[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
      throw new IdentityResultRejectedError(k);
    }
    return Math.floor(v);
  };
  const sub = str("sub");
  const sid = str("sid");
  const jti = str("jti");
  if (!OPAQUE_ID_PATTERN.test(sub) || sub.includes("@")) {
    throw new IdentityResultRejectedError("sub");
  }
  if (!OPAQUE_ID_PATTERN.test(sid))
    throw new IdentityResultRejectedError("sid");
  if (!JTI_PATTERN.test(jti)) throw new IdentityResultRejectedError("jti");
  if (payload["email_verified"] !== true) {
    throw new IdentityResultRejectedError("email_verified");
  }
  const email = str("email").trim().toLowerCase();
  if (email !== args.expectedEmail.trim().toLowerCase()) {
    throw new IdentityResultRejectedError("email mismatch");
  }
  const iat = num("iat");
  const exp = num("exp");
  const authTime = num("auth_time");
  if (authTime > nowSec + IDENTITY_RESULT_CLOCK_SKEW_SECONDS) {
    throw new IdentityResultRejectedError("auth_time in the future");
  }
  let amr: string[] | undefined;
  if (payload["amr"] !== undefined) {
    const raw = payload["amr"];
    if (
      !Array.isArray(raw) ||
      raw.length === 0 ||
      !raw.every((m): m is string => typeof m === "string" && m.length > 0)
    ) {
      throw new IdentityResultRejectedError("amr");
    }
    amr = [...new Set(raw)];
  }
  // Single use, durable, atomic: a second presentation of the same result —
  // on this instance, another instance, or after a restart — is refused.
  const use = await consumeJtiOnce("identity-result-jti", {
    jti,
    sub,
    exp,
    correlationId: args.correlationId,
  });
  if (!use.first) throw new IdentityResultRejectedError("jti replay");
  return {
    sub,
    sid,
    jti,
    email,
    authTime,
    ...(amr ? { amr } : {}),
    exp,
    iat,
  };
}
