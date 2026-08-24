/**
 * BFF→investor-api user assertion — the SECOND of the two signed assertions in
 * the identity chain. Server-only.
 *
 * Source of truth: Daniel's written reply 2026-08-17, recorded in
 *   docs/phase2-7-daniel-contract-mechanics-resolution.md §2 (closes D-017).
 *
 * ─── The two assertions, kept straight ─────────────────────────────────────
 *
 *   1. identity-ccid → BFF  (July direction §1, see src/lib/bff/auth.ts)
 *      Establishes the browser session. Verified by us, minted by them.
 *   2. BFF → investor-api   (THIS MODULE)
 *      Carries user context on every backend call. Minted by us, verified by
 *      them. Daniel: "the backend will not trust a plain user-ID header."
 *
 * They are not interchangeable and the first is never forwarded as the second.
 *
 * ─── Contract ──────────────────────────────────────────────────────────────
 *
 *   header      X-Refinity-User-Assertion
 *   alg         ES256 (pinned)
 *   iss         stable, environment-specific — NEVER a Vercel preview URL
 *   aud         urn:refinity:investor-api:dev in dev
 *   sub         the stable backend user_id (opaque; never an email or wallet)
 *   ttl         2 minutes maximum
 *   jti         unique per BFF→backend CALL (not per user action)
 *   sid         the BFF session id
 *   auth_time   time of the UNDERLYING user authentication, not the mint time
 *   amr         REQUIRED in v1 — non-empty array of authentication methods
 *   acr         optional; Daniel 2026-08-19 may add it later, never instead
 *   account_id  MUST NOT appear — investor-api resolves and re-authorizes
 *               account ownership server-side on every account request
 *
 * ─── auth_time is load-bearing ─────────────────────────────────────────────
 *
 * It is the input to the step-up rule (D-015): investor-api enforces a maximum
 * underlying auth_time age of 10 minutes and answers STEP_UP_REQUIRED
 * otherwise. Daniel, explicitly: "Merely minting a new BFF assertion from an
 * old session does not satisfy step-up." So auth_time must be propagated from
 * the identity-ccid assertion through the BFF session and NEVER replaced with
 * `now`. This module has no fallback for a missing auth_time — it throws,
 * because inventing one would silently defeat step-up.
 */
import { SignJWT, exportJWK, generateKeyPair, importJWK, type JWK } from "jose";
import { getServerEnv } from "../config/env";

/** The header investor-api reads the assertion from. */
export const USER_ASSERTION_HEADER = "X-Refinity-User-Assertion";

/** Pinned signing algorithm. */
export const USER_ASSERTION_ALG = "ES256";

/** Daniel 2026-08-17: "The maximum TTL is two minutes." */
export const USER_ASSERTION_MAX_TTL_SECONDS = 120;

/**
 * TTL we actually mint with. Short by design: one assertion per call means
 * there is no reason to approach the ceiling, and a tight window shrinks the
 * replay surface. Must never exceed USER_ASSERTION_MAX_TTL_SECONDS.
 */
export const USER_ASSERTION_TTL_SECONDS = 60;

/** Daniel's logical dev audience. Environment-specific elsewhere. */
export const INVESTOR_API_DEV_AUDIENCE = "urn:refinity:investor-api:dev";

/**
 * Claims investor-api requires. Listed so the mint path and the contract
 * assertions read from one place.
 */
export const REQUIRED_ASSERTION_CLAIMS = [
  "iss",
  "aud",
  "sub",
  "iat",
  "nbf",
  "exp",
  "jti",
  "sid",
  "auth_time",
] as const;

/**
 * The authentication-method claim, REQUIRED and non-empty.
 *
 * Daniel 2026-08-19, narrowing the 2026-08-17 "amr or acr": identity-ccid will
 * include `auth_time` and "a non-empty `amr` array describing the
 * authentication method", and "`acr` may be added later, but `amr` will be the
 * required v1 method claim". So `acr` is an ADDITION, never a substitution —
 * an assertion carrying only `acr` is not mintable, because investor-api reads
 * `amr`.
 *
 * The values themselves are exported with the contract, "initially covering
 * email verification code and email magic link". We do not enumerate them
 * here: guessing the spellings would produce a set that silently disagrees
 * with `v1.0.0-dev.1`.
 */
export const REQUIRED_AUTH_METHOD_CLAIM = "amr" as const;

/**
 * Optional and additive. Present only if identity-ccid sends it; never
 * synthesised, and never accepted in place of `amr`.
 */
export const OPTIONAL_AUTH_METHOD_CLAIM = "acr" as const;

// ─── Issuer validation ──────────────────────────────────────────────────────

/**
 * Host shapes that indicate a per-deployment URL rather than a stable issuer.
 *
 * Daniel: "The BFF should use a stable environment-specific issuer, not a
 * Vercel preview URL, and publish a JWKS." A preview issuer would break every
 * assertion the moment a redeploy changed the URL, and investor-api pins the
 * issuer — so this fails closed rather than degrading at runtime.
 */
const PREVIEW_HOST_PATTERNS: ReadonlyArray<RegExp> = [
  /\.vercel\.app$/i,
  /-git-[^.]+\./i,
  /^localhost$/i,
  /^127\.0\.0\.1$/,
];

export class UnstableIssuerError extends Error {
  constructor(issuer: string, reason: string) {
    super(
      `BFF_ASSERTION_ISSUER "${issuer}" is not a stable environment issuer: ${reason}. ` +
        `Daniel 2026-08-17 requires a stable environment-specific issuer with a published JWKS; ` +
        `investor-api pins it. Set BFF_ASSERTION_ISSUER to the stable BFF origin for this tier.`,
    );
    this.name = "UnstableIssuerError";
  }
}

/**
 * Assert the configured issuer is publishable to investor-api.
 *
 * Localhost is permitted ONLY under REFI_ENV=dev, where nothing is published
 * to a real backend. Every other tier rejects both localhost and
 * preview-shaped hosts.
 */
export function assertPublishableIssuer(
  issuer: string,
  tier: "dev" | "staging" | "prod",
): void {
  let host: string;
  try {
    host = new URL(issuer).host.split(":")[0] ?? "";
  } catch {
    // A URN issuer (no host) is a legitimate stable choice.
    if (issuer.startsWith("urn:")) return;
    throw new UnstableIssuerError(issuer, "not a valid absolute URL or URN");
  }
  if (tier === "dev") return;
  for (const pattern of PREVIEW_HOST_PATTERNS) {
    if (pattern.test(host)) {
      throw new UnstableIssuerError(
        issuer,
        `host "${host}" looks like a per-deployment or local host`,
      );
    }
  }
}

// NOTE: a `jwksUrlFor(issuer)` helper used to live here, deriving the JWKS URL
// from `iss`. Deleted 2026-08-24: Daniel's 2026-08-19 contract is explicit that
// investor-api uses only its explicitly configured JWKS URL and never derives
// one from the issuer — the URN issuer and the JWKS hostname move
// independently. The contract assertions pin the export's absence.

// ─── Signing key ────────────────────────────────────────────────────────────

interface SigningKey {
  kid: string;
  privateJwk: JWK;
  publicJwk: JWK;
}

let cachedKey: SigningKey | null = null;

/**
 * LOCAL-ONLY ephemeral key. Generated per process so no private key is ever
 * committed.
 *
 * Safe only where exactly one process signs and serves the JWKS — a developer
 * machine or a CI run. NOT safe on any deployed tier: Cloud Run runs multiple
 * instances with ephemeral filesystems, so instance A would sign under a key
 * that never appears in the JWKS instance B serves, and verification would fail
 * intermittently depending on which instance answered. Gated behind an explicit
 * opt-in for that reason.
 */
async function generateEphemeralKey(): Promise<SigningKey> {
  const { publicKey, privateKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const privateJwk = await exportJWK(privateKey);
  const publicJwk = await exportJWK(publicKey);
  const kid = `dev-ephemeral-${crypto.randomUUID().slice(0, 8)}`;
  return {
    kid,
    privateJwk: { ...privateJwk, kid, alg: USER_ASSERTION_ALG, use: "sig" },
    publicJwk: { ...publicJwk, kid, alg: USER_ASSERTION_ALG, use: "sig" },
  };
}

function parseJwk(raw: string, label: string): JWK {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`${label} must be a JWK object`);
  }
  return parsed;
}

/**
 * Resolve the signing key.
 *
 * Fails closed unless a real key is configured OR the ephemeral fallback is
 * explicitly opted into. The opt-in is a separate variable rather than an
 * inference from REFI_ENV because "dev" covers both a laptop and the deployed
 * dev tier that investor-api will actually call, and only the first can safely
 * mint under a per-process key.
 */
export async function getSigningKey(): Promise<SigningKey> {
  if (cachedKey) return cachedKey;
  const env = getServerEnv();
  const raw = env.BFF_ASSERTION_PRIVATE_KEY_JWK;

  if (!raw) {
    const ephemeralAllowed =
      env.REFI_ENV === "dev" && env.BFF_ASSERTION_ALLOW_EPHEMERAL_KEY === "1";
    if (!ephemeralAllowed) {
      throw new Error(
        "BFF_ASSERTION_PRIVATE_KEY_JWK is not configured. Every deployed tier — " +
          "including the deployed dev tier — needs a persistent ES256 key from the " +
          "secret store, because multiple instances each serving their own " +
          "per-process key would verify intermittently or not at all. " +
          "For a single-process local machine or CI run, set " +
          "BFF_ASSERTION_ALLOW_EPHEMERAL_KEY=1 (REFI_ENV=dev only). " +
          "See docs/security/RUNBOOK-bff-assertion-signing-key.md.",
      );
    }
    cachedKey = await generateEphemeralKey();
    return cachedKey;
  }

  const privateJwk = parseJwk(raw, "BFF_ASSERTION_PRIVATE_KEY_JWK");
  if (privateJwk.kty !== "EC" || privateJwk.crv !== "P-256") {
    throw new Error(
      "BFF_ASSERTION_PRIVATE_KEY_JWK must be an EC P-256 key (ES256).",
    );
  }
  if (typeof privateJwk.d !== "string") {
    throw new Error(
      "BFF_ASSERTION_PRIVATE_KEY_JWK has no private component `d`.",
    );
  }
  if (typeof privateJwk.kid !== "string" || privateJwk.kid.length === 0) {
    throw new Error(
      "BFF_ASSERTION_PRIVATE_KEY_JWK must carry a `kid` — investor-api " +
        "supports kid-based rotation and cannot select a key without one.",
    );
  }
  // Public half is the private JWK minus `d`. Deriving it here means the
  // published JWKS can never drift from the key actually signing.
  const { d: _private, ...publicParts } = privateJwk;
  cachedKey = {
    kid: privateJwk.kid,
    privateJwk,
    publicJwk: { ...publicParts, alg: USER_ASSERTION_ALG, use: "sig" },
  };
  return cachedKey;
}

/** Test seam: drop the cached key so a test can swap env and re-resolve. */
export function resetSigningKeyCache(): void {
  cachedKey = null;
}

/**
 * The public JWKS served at /.well-known/jwks.json.
 *
 * Includes the retiring key when BFF_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK is set,
 * so a rotation can overlap: investor-api caches the JWKS, and assertions
 * already in flight under the old `kid` must keep verifying until that cache
 * expires. Remove the previous key only after the overlap window.
 */
export async function getPublicJwks(): Promise<{ keys: JWK[] }> {
  const { publicJwk } = await getSigningKey();
  const keys: JWK[] = [publicJwk];
  const previous = getServerEnv().BFF_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK;
  if (previous) {
    const jwk = parseJwk(previous, "BFF_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK");
    if (typeof jwk.d === "string") {
      throw new Error(
        "BFF_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK contains a private component `d` — " +
          "publish the PUBLIC half only.",
      );
    }
    if (jwk.kid !== publicJwk.kid) keys.push(jwk);
  }
  return { keys };
}

// ─── Minting ────────────────────────────────────────────────────────────────

export interface UserAssertionInput {
  /** Stable backend user_id. Opaque — never an email, IdP subject, or wallet. */
  userId: string;
  /** BFF session id. */
  sid: string;
  /**
   * UNIX seconds of the underlying user authentication, propagated from the
   * identity-ccid assertion. Never `Date.now()`.
   */
  authTime: number;
  /**
   * Authentication methods from the identity-ccid assertion. REQUIRED and
   * non-empty (Daniel 2026-08-19). Optional in the type only because the
   * caller may not have it — in which case minting throws rather than
   * inventing a method.
   */
  amr?: string[];
  /**
   * Authentication context class reference. Additive, not alternative:
   * present only when identity-ccid sends it, and never accepted in place of
   * `amr`.
   */
  acr?: string;
}

export interface MintedUserAssertion {
  token: string;
  jti: string;
  expiresAt: number;
}

export class MissingAuthTimeError extends Error {
  constructor() {
    super(
      "Cannot mint a user assertion without the underlying auth_time. " +
        "It must be propagated from the identity-ccid assertion through the BFF " +
        "session; substituting the mint time would silently defeat step-up (D-015).",
    );
    this.name = "MissingAuthTimeError";
  }
}

export class MissingAuthMethodError extends Error {
  constructor() {
    super(
      "Cannot mint a user assertion without a non-empty `amr`. " +
        "Daniel 2026-08-19: identity-ccid sends a non-empty `amr` array and it is " +
        "the required v1 method claim; `acr` is additive and never a substitute. " +
        "An absent `amr` means the identity-ccid assertion was not propagated — " +
        "synthesising one would assert an authentication method we did not observe.",
    );
    this.name = "MissingAuthMethodError";
  }
}

/**
 * Mint ONE assertion for ONE BFF→investor-api call.
 *
 * Daniel: "Mint an assertion per BFF-to-backend call with a unique `jti`."
 * Do not cache the result, do not reuse it across a fan-out, and do not hold
 * it between requests.
 *
 * The caller supplies the Idempotency-Key separately on mutations: replay is
 * governed by `jti` AND `Idempotency-Key` together — an exact repeat may return
 * its existing receipt, while reuse for a different request is rejected.
 */
export async function mintUserAssertion(
  input: UserAssertionInput,
): Promise<MintedUserAssertion> {
  if (!Number.isFinite(input.authTime) || input.authTime <= 0) {
    throw new MissingAuthTimeError();
  }
  if (!input.amr?.length) {
    throw new MissingAuthMethodError();
  }

  const env = getServerEnv();
  // Enforced here rather than in the env schema: nothing mints yet, and making
  // these boot-required would fail a staging deploy on secrets that are not
  // needed until the outbound client is wired.
  if (!env.BFF_ASSERTION_ISSUER) {
    throw new Error(
      "BFF_ASSERTION_ISSUER is not configured — investor-api pins the issuer, " +
        "so it must be set to this tier's stable value (e.g. urn:refinity:bff:dev).",
    );
  }
  if (!env.INVESTOR_API_AUDIENCE) {
    throw new Error(
      "INVESTOR_API_AUDIENCE is not configured — investor-api pins the audience " +
        "(urn:refinity:investor-api:dev in dev).",
    );
  }
  assertPublishableIssuer(env.BFF_ASSERTION_ISSUER, env.REFI_ENV);

  const { kid, privateJwk } = await getSigningKey();
  const key = await importJWK(privateJwk, USER_ASSERTION_ALG);

  const now = Math.floor(Date.now() / 1000);
  const exp = now + USER_ASSERTION_TTL_SECONDS;
  const jti = crypto.randomUUID();

  const token = await new SignJWT({
    sid: input.sid,
    auth_time: input.authTime,
    // Unconditional: the guard above already refused an absent or empty
    // `amr`, so there is no branch in which this assertion is minted without
    // one. `acr` stays conditional — it is additive and may simply not exist.
    amr: input.amr,
    ...(input.acr ? { acr: input.acr } : {}),
  })
    .setProtectedHeader({ alg: USER_ASSERTION_ALG, kid, typ: "JWT" })
    .setIssuer(env.BFF_ASSERTION_ISSUER)
    .setAudience(env.INVESTOR_API_AUDIENCE)
    .setSubject(input.userId)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(exp)
    .setJti(jti)
    .sign(key);

  return { token, jti, expiresAt: exp };
}

/**
 * Build the outbound headers for one investor-api call.
 *
 * `Idempotency-Key` is required on mutations (July direction §3) and
 * co-governs replay with `jti` (D-017). Pass it for every mutation and omit it
 * for reads.
 */
export async function investorApiAuthHeaders(
  input: UserAssertionInput & {
    correlationId: string;
    idempotencyKey?: string;
  },
): Promise<Record<string, string>> {
  const { token } = await mintUserAssertion(input);
  return {
    [USER_ASSERTION_HEADER]: token,
    "X-Correlation-ID": input.correlationId,
    ...(input.idempotencyKey
      ? { "Idempotency-Key": input.idempotencyKey }
      : {}),
  };
}
