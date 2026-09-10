/**
 * Frontend ES256 identity bridge (Daniel step 2; mandate §7–§9).
 *
 * Translates a PROVIDER-VERIFIED login (Stytch) into Daniel's closed upstream
 * identity assertion, which identity-ccid verifies at the exchange. It is the
 * frontend's own trust boundary and uses its OWN signing key — never the
 * Investor API per-request assertion key (mandate §15): separate signer
 * config, KMS key version, `kid`, JWKS and issuer relationship.
 *
 * Closed profile, exactly:
 *   header  alg=ES256, typ=JWT, kid
 *   claims  iss, aud, sub, email, email_verified(true), iat, nbf, exp, jti,
 *           sid, auth_time; optional amr (non-empty unique strings)
 *   no other claims; lifetime ≤ 300 s; skew 30 s (verifier);
 *   sub / jti / sid match ^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$;
 *   sub = the durable ReFi opaque subject (never email, name, provider id or
 *   backend user id); auth_time = the genuine provider authentication time.
 */
import type { JWK } from "jose";
import { getServerEnv } from "../config/env";
import {
  createJwkAssertionSigner,
  createKmsAssertionSigner,
  type AssertionSigner,
  type KmsSignClient,
} from "../investor-api/assertion-signer";
import type { ProviderVerifiedIdentity } from "./stytch";

export const BRIDGE_ASSERTION_ALG = "ES256";
export const BRIDGE_ASSERTION_MAX_TTL_SECONDS = 300;
export const BRIDGE_ASSERTION_TTL_SECONDS = 120;
export const BRIDGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
export const BRIDGE_REQUIRED_CLAIMS = [
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

export class BridgeConfigurationError extends Error {
  constructor(message: string) {
    super(`identity bridge: ${message}`);
    this.name = "BridgeConfigurationError";
  }
}

// ─── Signer: separate from the Investor API assertion signer ────────────────

let cachedSigner: AssertionSigner | null = null;
let kmsClientFactory: (() => Promise<KmsSignClient>) | null = null;

export function setBridgeKmsClientFactoryForTests(
  factory: (() => Promise<KmsSignClient>) | null,
): void {
  kmsClientFactory = factory;
  cachedSigner = null;
}
export function resetBridgeSignerCache(): void {
  cachedSigner = null;
}

async function defaultKmsClient(): Promise<KmsSignClient> {
  const { KeyManagementServiceClient } = await import("@google-cloud/kms");
  const client = new KeyManagementServiceClient();
  return {
    getPublicKey: async (req) => {
      const [res] = await client.getPublicKey(req);
      return [{ pem: res.pem ?? null }];
    },
    asymmetricSign: async (req) => {
      const [res] = await client.asymmetricSign({
        name: req.name,
        digest: { sha256: req.digest.sha256 },
      });
      return [{ signature: res.signature ?? null }];
    },
  };
}

function parseJwk(raw: string, label: string): JWK {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BridgeConfigurationError(`${label} is not valid JSON`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new BridgeConfigurationError(`${label} must be a JWK object`);
  }
  return parsed;
}

/**
 * Key separation is enforced here as well as in the env schema: the bridge
 * refuses to sign with the Investor API assertion key material.
 */
function assertSeparateFromInvestorKey(): void {
  const env = getServerEnv();
  if (
    env.BRIDGE_ASSERTION_SIGNER === "kms" &&
    env.BFF_ASSERTION_SIGNER === "kms" &&
    env.BRIDGE_ASSERTION_KMS_KEY_VERSION &&
    env.BRIDGE_ASSERTION_KMS_KEY_VERSION === env.BFF_ASSERTION_KMS_KEY_VERSION
  ) {
    throw new BridgeConfigurationError(
      "the bridge must not use the Investor API assertion KMS key version",
    );
  }
  if (
    env.BRIDGE_ASSERTION_SIGNER === "jwk" &&
    env.BRIDGE_ASSERTION_PRIVATE_KEY_JWK &&
    env.BFF_ASSERTION_PRIVATE_KEY_JWK
  ) {
    const a = parseJwk(env.BRIDGE_ASSERTION_PRIVATE_KEY_JWK, "BRIDGE key");
    const b = parseJwk(env.BFF_ASSERTION_PRIVATE_KEY_JWK, "BFF key");
    if (a.d === b.d || (a.x === b.x && a.y === b.y)) {
      throw new BridgeConfigurationError(
        "the bridge must not use the Investor API assertion private key",
      );
    }
  }
  if (
    env.BRIDGE_ASSERTION_KID &&
    env.BRIDGE_ASSERTION_KID === env.BFF_ASSERTION_KID
  ) {
    throw new BridgeConfigurationError(
      "the bridge kid must differ from the Investor API assertion kid",
    );
  }
}

export async function getBridgeSigner(): Promise<AssertionSigner> {
  if (cachedSigner) return cachedSigner;
  const env = getServerEnv();
  assertSeparateFromInvestorKey();
  if (env.BRIDGE_ASSERTION_SIGNER === "kms") {
    if (!env.BRIDGE_ASSERTION_KMS_KEY_VERSION || !env.BRIDGE_ASSERTION_KID) {
      throw new BridgeConfigurationError(
        "BRIDGE_ASSERTION_SIGNER=kms requires BRIDGE_ASSERTION_KMS_KEY_VERSION and BRIDGE_ASSERTION_KID",
      );
    }
    const client = await (kmsClientFactory ?? defaultKmsClient)();
    cachedSigner = createKmsAssertionSigner({
      keyVersionName: env.BRIDGE_ASSERTION_KMS_KEY_VERSION,
      kid: env.BRIDGE_ASSERTION_KID,
      client,
    });
    return cachedSigner;
  }
  if (!env.BRIDGE_ASSERTION_PRIVATE_KEY_JWK) {
    // No ephemeral fallback for the bridge, on any tier: an assertion the
    // backend cannot verify is worse than no assertion.
    throw new BridgeConfigurationError(
      "BRIDGE_ASSERTION_PRIVATE_KEY_JWK is not configured (or use BRIDGE_ASSERTION_SIGNER=kms)",
    );
  }
  cachedSigner = createJwkAssertionSigner(
    parseJwk(
      env.BRIDGE_ASSERTION_PRIVATE_KEY_JWK,
      "BRIDGE_ASSERTION_PRIVATE_KEY_JWK",
    ),
    "jwk",
  );
  return cachedSigner;
}

/** Bridge JWKS: current public key plus the retiring key during rotation. */
export async function getBridgePublicJwks(): Promise<{ keys: JWK[] }> {
  const signer = await getBridgeSigner();
  const current = await signer.publicJwk();
  const keys: JWK[] = [current];
  const previous = getServerEnv().BRIDGE_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK;
  if (previous) {
    const jwk = parseJwk(previous, "BRIDGE_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK");
    if (typeof jwk.d === "string") {
      throw new BridgeConfigurationError(
        "BRIDGE_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK contains a private component",
      );
    }
    if (jwk.kid !== current.kid) keys.push(jwk);
  }
  return { keys };
}

// ─── Minting ────────────────────────────────────────────────────────────────

export interface BridgeAssertionInput {
  identity: ProviderVerifiedIdentity;
  /** The durable ReFi opaque subject from the subject map. */
  sub: string;
  /** Session id for this login attempt (opaque; becomes the connected sid). */
  sid: string;
  now?: () => number;
}

export interface MintedBridgeAssertion {
  token: string;
  jti: string;
  sid: string;
  exp: number;
}

export class BridgeInputError extends Error {
  constructor(message: string) {
    super(`identity bridge input: ${message}`);
    this.name = "BridgeInputError";
  }
}

function newJti(): string {
  const jti = `bridge_${crypto.randomUUID().replace(/-/g, "")}`;
  if (!BRIDGE_ID_PATTERN.test(jti)) throw new Error("jti pattern");
  return jti;
}

/**
 * Mint the closed upstream identity assertion. Every claim comes from the
 * provider-verified identity, the durable subject map, or this call; nothing
 * is synthesised, nothing provider-specific leaks, no backend account fact
 * is embedded.
 */
export async function mintBridgeAssertion(
  input: BridgeAssertionInput,
): Promise<MintedBridgeAssertion> {
  const env = getServerEnv();
  if (!env.BRIDGE_ASSERTION_ISSUER) {
    throw new BridgeConfigurationError(
      "BRIDGE_ASSERTION_ISSUER is not configured",
    );
  }
  if (!/^https:\/\/[^\s#?]+$/.test(env.BRIDGE_ASSERTION_ISSUER)) {
    throw new BridgeConfigurationError(
      "BRIDGE_ASSERTION_ISSUER must be an https issuer with no query or fragment",
    );
  }
  if (!env.IDENTITY_CCID_UPSTREAM_AUDIENCE) {
    throw new BridgeConfigurationError(
      "IDENTITY_CCID_UPSTREAM_AUDIENCE is not configured (Daniel binds it in step 4)",
    );
  }
  if (env.IDENTITY_CCID_UPSTREAM_AUDIENCE.length > 256) {
    throw new BridgeConfigurationError("audience exceeds 256 characters");
  }
  if (!BRIDGE_ID_PATTERN.test(input.sub)) throw new BridgeInputError("sub");
  if (!BRIDGE_ID_PATTERN.test(input.sid)) throw new BridgeInputError("sid");
  // Runtime guard: the type says `true`; the provider adapter is what proves
  // it, and a caller bypassing the adapter must still be refused.
  if ((input.identity as { emailVerified: unknown }).emailVerified !== true) {
    throw new BridgeInputError("email_verified must be true");
  }
  if (input.identity.email.length === 0 || input.identity.email.length > 320) {
    throw new BridgeInputError("email");
  }
  if (
    !Number.isFinite(input.identity.authTime) ||
    input.identity.authTime <= 0
  ) {
    throw new BridgeInputError("auth_time");
  }
  const amr = [...new Set(input.identity.amr)];
  if (amr.length === 0 || amr.some((m) => m.length === 0)) {
    throw new BridgeInputError("amr");
  }
  const signer = await getBridgeSigner();
  const now = input.now ? input.now() : Math.floor(Date.now() / 1000);
  const exp = now + BRIDGE_ASSERTION_TTL_SECONDS;
  if (exp - now > BRIDGE_ASSERTION_MAX_TTL_SECONDS) {
    throw new BridgeConfigurationError("lifetime exceeds 300 seconds");
  }
  if (input.identity.authTime > now + 30)
    throw new BridgeInputError("auth_time in the future");
  const jti = newJti();
  const header = { alg: BRIDGE_ASSERTION_ALG, typ: "JWT", kid: signer.kid };
  const claims = {
    iss: env.BRIDGE_ASSERTION_ISSUER,
    aud: env.IDENTITY_CCID_UPSTREAM_AUDIENCE,
    sub: input.sub,
    email: input.identity.email,
    email_verified: true,
    iat: now,
    nbf: now,
    exp,
    jti,
    sid: input.sid,
    auth_time: Math.floor(input.identity.authTime),
    amr,
  };
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const signingInput = `${b64(header)}.${b64(claims)}`;
  const signature = await signer.sign(
    new Uint8Array(Buffer.from(signingInput, "utf8")),
  );
  return {
    token: `${signingInput}.${Buffer.from(signature).toString("base64url")}`,
    jti,
    sid: input.sid,
    exp,
  };
}
