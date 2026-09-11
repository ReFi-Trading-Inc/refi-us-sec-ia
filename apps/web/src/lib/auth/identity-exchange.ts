/**
 * Daniel's identity exchange (alpha.3 `exchangeIdentity`, POST
 * /api/v1/identity/exchanges, Google bearer for identity-ccid) and CLOSED
 * verification of the authoritative backend identity result.
 *
 * Request: exactly the stored `ExchangeAttemptRecord.request` — the frozen
 * client's `IdentityExchangeRequest` fields built once from the pending
 * login's durable bindings plus the bridge assertion. No field is invented;
 * `acquisition` and `invitation_token` are omitted until a reviewed flow
 * supplies them.
 *
 * Recovery (alpha.3 step 5): "A lost response can be recovered using the
 * identical still-valid exchange request; changed binding fields with the
 * same upstream JTI are rejected." So the bridge assertion is NOT consumed
 * before the call; the attempt record holds the exact request, a lost or
 * ambiguous response leaves it `sent`, and a recovery re-sends that request
 * byte-identically while the assertion is unexpired. The backend's own
 * replay authority over the upstream JTI is untouched.
 *
 * Result verification is closed: exact protected-header field set
 * (alg=ES256, typ=JWT, kid), exact claim set with optional `amr`
 * (non-empty, unique, non-empty strings), integer NumericDates (a fractional
 * timestamp is rejected, never floored), lifetime ≤ 300 s, 30 s skew, fixed
 * iss/aud pair, pattern-checked sub/jti/sid, and BINDING to the login's
 * authenticated facts: email, original `auth_time`, and the bridge `sid`
 * (the result "retains upstream sid"; equality is proved, never assumed).
 * The result `jti` is consumed exactly once, durably and atomically, BEFORE
 * any session exists.
 */
import {
  createLocalJWKSet,
  createRemoteJWKSet,
  jwtVerify,
  type JSONWebKeySet,
  type JWTVerifyGetKey,
} from "jose";
import {
  ContractVersionMismatchError,
  InvestorApiError,
} from "@refi/api-clients/investor-api";
import { getServerEnv } from "../config/env";
import { consumeJtiOnce, JTI_PATTERN } from "../connected-store/replay";
import type { ExchangeAttemptRecord } from "../connected-store/exchange-attempt";
import type { InvestorApiReadClient } from "../investor-api/demo-client";
import {
  createIdentityExchangeClient,
  GoogleCredentialUnavailableError,
  UpstreamNotConfiguredError,
} from "../investor-api/gateway";
import { IdentityExchangeUnavailableError } from "./connected-session";

export const IDENTITY_RESULT_CLOCK_SKEW_SECONDS = 30;
export const IDENTITY_RESULT_MAX_LIFETIME_SECONDS = 300;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
export const IDENTITY_RESULT_HEADER_FIELDS = ["alg", "kid", "typ"] as const;
export const IDENTITY_RESULT_REQUIRED_CLAIMS = [
  "iss",
  "aud",
  "sub",
  "email",
  "email_verified",
  "iat",
  "nbf",
  "exp",
  "jti",
  "sid",
  "auth_time",
] as const;
export const IDENTITY_RESULT_OPTIONAL_CLAIMS = ["amr"] as const;

/** A verified, first-use, login-bound backend identity result. */
export interface VerifiedIdentityResult {
  sub: string;
  sid: string;
  jti: string;
  email: string;
  authTime: number;
  amr?: string[];
  iat: number;
  nbf: number;
  exp: number;
}

export class IdentityResultRejectedError extends Error {
  constructor(readonly reason: string) {
    super(`backend identity result rejected: ${reason}`);
    this.name = "IdentityResultRejectedError";
  }
}

/**
 * The exchange call produced no usable answer (transport failure, deadline,
 * unknown error): the attempt stays recoverable with the identical request.
 */
export class IdentityExchangeLostResponseError extends Error {
  constructor(readonly cause_name: string) {
    super(
      `identity exchange response lost (${cause_name}); recoverable with the identical request while the assertion is valid`,
    );
    this.name = "IdentityExchangeLostResponseError";
  }
}

// ─── Test seams ─────────────────────────────────────────────────────────────

let testClient: InvestorApiReadClient | null = null;
let testKeySet: JSONWebKeySet | null = null;
let remoteKeySet: { url: string; getKey: JWTVerifyGetKey } | null = null;

export function setIdentityExchangeClientForTests(
  client: InvestorApiReadClient | null,
): void {
  testClient = client;
}
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

// ─── Exchange (send the stored request exactly) ─────────────────────────────

/**
 * Send the attempt's stored request and return the raw `identity_result`.
 * Distinguishes a LOST/ambiguous answer (recoverable) from a definitive
 * refusal or configuration failure (not recoverable). Never re-mints.
 */
export async function sendIdentityExchange(
  attempt: ExchangeAttemptRecord,
): Promise<string> {
  let client: InvestorApiReadClient;
  try {
    client = testClient ?? createIdentityExchangeClient();
  } catch (err) {
    if (err instanceof UpstreamNotConfiguredError) {
      throw new IdentityExchangeUnavailableError(err.message);
    }
    throw err;
  }
  try {
    const res = await client.call("exchangeIdentity", {
      body: { ...attempt.request },
    });
    return res.data.data.identity_result;
  } catch (err) {
    if (
      err instanceof UpstreamNotConfiguredError ||
      err instanceof GoogleCredentialUnavailableError
    ) {
      throw new IdentityExchangeUnavailableError(err.message);
    }
    if (err instanceof InvestorApiError) {
      // A definitive backend answer (4xx/5xx envelope): not a lost response.
      throw new IdentityResultRejectedError(`exchange refused: ${err.code}`);
    }
    if (err instanceof ContractVersionMismatchError) {
      throw new IdentityExchangeUnavailableError(err.message);
    }
    // Transport failure, deadline, abort, unknown: the answer is unknown.
    throw new IdentityExchangeLostResponseError(
      err instanceof Error ? err.name : "unknown",
    );
  }
}

// ─── Closed verification of Daniel's identity result ────────────────────────

export interface IdentityResultBinding {
  /** Provider-verified, normalised email. */
  email: string;
  /** The GENUINE provider authentication time the bridge asserted. */
  authTime: number;
  /** The bridge assertion's sid; the result must retain it. */
  sid: string;
}

function b64urlJson(segment: string, what: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    throw new IdentityResultRejectedError(`${what} is not JSON`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new IdentityResultRejectedError(`${what} is not an object`);
  }
  return parsed as Record<string, unknown>;
}

function integerClaim(payload: Record<string, unknown>, k: string): number {
  const v = payload[k];
  if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) {
    throw new IdentityResultRejectedError(`${k} must be a positive integer`);
  }
  return v;
}

function stringClaim(payload: Record<string, unknown>, k: string): string {
  const v = payload[k];
  if (typeof v !== "string" || v.length === 0) {
    throw new IdentityResultRejectedError(k);
  }
  return v;
}

export async function verifyIdentityResult(args: {
  token: string;
  binding: IdentityResultBinding;
  correlationId: string;
  now?: () => number;
}): Promise<VerifiedIdentityResult> {
  const env = getServerEnv();
  const nowSec = args.now ? args.now() : Math.floor(Date.now() / 1000);
  const skew = IDENTITY_RESULT_CLOCK_SKEW_SECONDS;

  // 1. Structure first: exact header field set and exact claim set, checked
  //    on the raw segments so nothing is normalised before it is refused.
  const parts = args.token.split(".");
  if (parts.length !== 3) throw new IdentityResultRejectedError("compact JWS");
  const header = b64urlJson(parts[0] ?? "", "protected header");
  const payload = b64urlJson(parts[1] ?? "", "claims");
  const headerKeys = Object.keys(header).sort();
  if (
    headerKeys.join(",") !== [...IDENTITY_RESULT_HEADER_FIELDS].sort().join(",")
  ) {
    throw new IdentityResultRejectedError(
      `protected header fields must be exactly ${IDENTITY_RESULT_HEADER_FIELDS.join(",")}`,
    );
  }
  if (header["alg"] !== "ES256") throw new IdentityResultRejectedError("alg");
  if (header["typ"] !== "JWT") throw new IdentityResultRejectedError("typ");
  if (typeof header["kid"] !== "string" || header["kid"].length === 0) {
    throw new IdentityResultRejectedError("kid");
  }
  const allowed = new Set<string>([
    ...IDENTITY_RESULT_REQUIRED_CLAIMS,
    ...IDENTITY_RESULT_OPTIONAL_CLAIMS,
  ]);
  for (const k of Object.keys(payload)) {
    if (!allowed.has(k))
      throw new IdentityResultRejectedError(`unexpected claim ${k}`);
  }
  for (const k of IDENTITY_RESULT_REQUIRED_CLAIMS) {
    if (!(k in payload))
      throw new IdentityResultRejectedError(`missing claim ${k}`);
  }

  // 2. Signature and the fixed pair, via jose (kid → pinned JWKS).
  const getKey = backendKeyResolver();
  try {
    await jwtVerify(args.token, getKey, {
      algorithms: ["ES256"],
      typ: "JWT",
      issuer: env.IDENTITY_RESULT_ISSUER,
      audience: env.IDENTITY_RESULT_AUDIENCE,
      clockTolerance: skew,
      currentDate: new Date(nowSec * 1000),
    });
  } catch (err) {
    throw new IdentityResultRejectedError(
      err instanceof Error ? err.name : "signature",
    );
  }

  // 3. Claim shapes: integers, patterns, exact fixed values.
  if (payload["iss"] !== env.IDENTITY_RESULT_ISSUER) {
    throw new IdentityResultRejectedError("iss");
  }
  if (payload["aud"] !== env.IDENTITY_RESULT_AUDIENCE) {
    throw new IdentityResultRejectedError("aud");
  }
  const sub = stringClaim(payload, "sub");
  const sid = stringClaim(payload, "sid");
  const jti = stringClaim(payload, "jti");
  if (!OPAQUE_ID_PATTERN.test(sub) || sub.includes("@")) {
    throw new IdentityResultRejectedError("sub");
  }
  if (!OPAQUE_ID_PATTERN.test(sid))
    throw new IdentityResultRejectedError("sid");
  if (!JTI_PATTERN.test(jti)) throw new IdentityResultRejectedError("jti");
  if (payload["email_verified"] !== true) {
    throw new IdentityResultRejectedError("email_verified");
  }
  const email = stringClaim(payload, "email").trim().toLowerCase();
  const iat = integerClaim(payload, "iat");
  const nbf = integerClaim(payload, "nbf");
  const exp = integerClaim(payload, "exp");
  const authTime = integerClaim(payload, "auth_time");
  if (iat > nowSec + skew)
    throw new IdentityResultRejectedError("iat in the future");
  if (nbf > nowSec + skew)
    throw new IdentityResultRejectedError("nbf in the future");
  if (exp <= nowSec - skew) throw new IdentityResultRejectedError("expired");
  if (exp <= iat || exp - iat > IDENTITY_RESULT_MAX_LIFETIME_SECONDS) {
    throw new IdentityResultRejectedError("lifetime");
  }
  if (nbf > exp) throw new IdentityResultRejectedError("nbf after exp");
  if (authTime > iat + skew)
    throw new IdentityResultRejectedError("auth_time after iat");
  let amr: string[] | undefined;
  if ("amr" in payload) {
    const raw = payload["amr"];
    if (
      !Array.isArray(raw) ||
      raw.length === 0 ||
      !raw.every((m): m is string => typeof m === "string" && m.length > 0)
    ) {
      throw new IdentityResultRejectedError("amr");
    }
    if (new Set(raw).size !== raw.length) {
      throw new IdentityResultRejectedError("amr duplicates");
    }
    amr = raw;
  }

  // 4. Binding to the authenticated login facts (contract: verify "against
  //    the expected pending exchange, upstream email/session/authentication
  //    facts"; the result "retains upstream … sid").
  if (email !== args.binding.email.trim().toLowerCase()) {
    throw new IdentityResultRejectedError("email mismatch");
  }
  if (authTime !== args.binding.authTime) {
    throw new IdentityResultRejectedError("auth_time mismatch");
  }
  if (sid !== args.binding.sid)
    throw new IdentityResultRejectedError("sid mismatch");

  // 5. Single use, durable, atomic — before any session exists.
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
    iat,
    nbf,
    exp,
  };
}
