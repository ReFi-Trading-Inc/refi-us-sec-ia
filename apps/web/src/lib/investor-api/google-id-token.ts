/**
 * Native Cloud Run service-to-service credential (Daniel 2026-09-09, step 1).
 *
 * The connected BFF runs as its OWN user-managed Cloud Run runtime service
 * account and authenticates to Daniel's services with that account's Google
 * ID token, obtained from the runtime metadata server. No WIF exchange, no
 * service-account JSON key, no impersonation of a backend account, no human
 * `gcloud` token, no CI deployment identity.
 *
 * Contract this module enforces:
 *   - ONE provider per target audience. The identity-ccid token is never
 *     reused for investor-api and vice versa: the cache is keyed by the exact
 *     audience string, and a provider only ever answers for its own audience.
 *   - ID tokens, never OAuth access tokens: the metadata `identity` endpoint
 *     with `format=full` (so the token carries `email`, `email_verified` and
 *     the immutable `sub` Daniel pins) and `Metadata-Flavor: Google`.
 *   - Cached only within the token's own lifetime; refreshed ahead of expiry
 *     (`REFRESH_MARGIN_SECONDS`); never served past `exp`.
 *   - Fail closed: any acquisition error surfaces as
 *     `GoogleIdTokenUnavailableError` that names the audience and nothing
 *     else. The token text is never logged, thrown, or returned anywhere but
 *     the `Authorization` header the frozen client sets.
 *
 * Audiences are Cloud Run CUSTOM audiences (`https://identity-ccid.dev.refi.internal`,
 * `https://investor-api.dev.refi.internal`), not service URLs; they come from
 * server env and are pinned by the backend's verifiers.
 */

export const METADATA_IDENTITY_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";
/** Refresh this long before `exp` so an in-flight request never carries a token that expires mid-call. */
export const REFRESH_MARGIN_SECONDS = 60;
/** Metadata server is local; anything slower is a fault, not latency. */
export const METADATA_TIMEOUT_MS = 3_000;

export class GoogleIdTokenUnavailableError extends Error {
  readonly audience: string;
  constructor(audience: string, reason: string) {
    super(
      `Google ID token for audience "${audience}" is unavailable: ${reason}. ` +
        "The BFF fails closed — no simulator or other credential is substituted.",
    );
    this.name = "GoogleIdTokenUnavailableError";
    this.audience = audience;
  }
}

export class AudienceMismatchError extends Error {
  constructor(expected: string, actual: string) {
    super(
      `Google ID token audience mismatch: expected "${expected}", token carries "${actual}". ` +
        "A token minted for one target is never reused for another.",
    );
    this.name = "AudienceMismatchError";
  }
}

/** Minimal fetch surface so tests can substitute a fake metadata server. */
export type MetadataFetch = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export interface IdTokenProvider {
  /** The exact audience this provider answers for. */
  readonly audience: string;
  /** A valid ID token for `audience`; cached within its lifetime. */
  getToken(): Promise<string>;
  /** Test/inspection only: current cache state, never the token. */
  cacheState(): { cached: boolean; expiresAt: number | null };
}

interface DecodedIdToken {
  aud: string;
  exp: number;
  sub: string;
  email: string;
  email_verified: boolean;
}

function base64UrlToUtf8(segment: string): string {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  const pad =
    padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64").toString("utf8");
}

/**
 * Decode (NOT verify) our own token's payload to learn `exp` and check the
 * audience and the full-format identity claims. Verification is the
 * receiving service's job; this token is minted by Google's metadata server
 * for this runtime and leaves this process only in an Authorization header.
 */
export function decodeIdTokenClaims(token: string): DecodedIdToken {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) {
    throw new Error("token is not a JWS compact serialization");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(base64UrlToUtf8(parts[1]));
  } catch {
    throw new Error("token payload is not JSON");
  }
  if (typeof payload !== "object" || payload === null) {
    throw new Error("token payload is not an object");
  }
  const p = payload as Record<string, unknown>;
  if (typeof p["aud"] !== "string") throw new Error("token has no aud");
  if (typeof p["exp"] !== "number") throw new Error("token has no exp");
  if (typeof p["sub"] !== "string" || p["sub"].length === 0) {
    throw new Error("token has no sub (full-format identity required)");
  }
  if (typeof p["email"] !== "string" || p["email"].length === 0) {
    throw new Error("token has no email (full-format identity required)");
  }
  if (p["email_verified"] !== true) {
    throw new Error("token email_verified is not true");
  }
  return {
    aud: p["aud"],
    exp: p["exp"],
    sub: p["sub"],
    email: p["email"],
    email_verified: true,
  };
}

/**
 * Build one audience-bound provider. Call it once per target and keep the two
 * instances apart; nothing in here can answer for a different audience.
 */
export function createIdTokenProvider(options: {
  audience: string;
  fetchImpl?: MetadataFetch;
  now?: () => number;
}): IdTokenProvider {
  const audience = options.audience;
  if (!audience || !/^https:\/\/[^\s/]+/.test(audience)) {
    throw new Error(
      `Google ID-token audience must be an https custom audience, got "${audience}"`,
    );
  }
  const fetchImpl: MetadataFetch =
    options.fetchImpl ?? ((url, init) => fetch(url, init));
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));

  let cached: { token: string; exp: number } | null = null;
  let inflight: Promise<string> | null = null;

  async function acquire(): Promise<string> {
    const url = new URL(METADATA_IDENTITY_URL);
    url.searchParams.set("audience", audience);
    url.searchParams.set("format", "full");
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, METADATA_TIMEOUT_MS);
    let text: string;
    try {
      const res = await fetchImpl(url.toString(), {
        headers: { "Metadata-Flavor": "Google" },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new GoogleIdTokenUnavailableError(
          audience,
          `metadata server answered HTTP ${String(res.status)}`,
        );
      }
      text = (await res.text()).trim();
    } catch (err) {
      if (err instanceof GoogleIdTokenUnavailableError) throw err;
      throw new GoogleIdTokenUnavailableError(
        audience,
        err instanceof Error && err.name === "AbortError"
          ? "metadata server timed out"
          : "metadata server unreachable",
      );
    } finally {
      clearTimeout(timer);
    }
    let claims: DecodedIdToken;
    try {
      claims = decodeIdTokenClaims(text);
    } catch (err) {
      throw new GoogleIdTokenUnavailableError(
        audience,
        err instanceof Error ? err.message : "undecodable token",
      );
    }
    if (claims.aud !== audience) {
      throw new AudienceMismatchError(audience, claims.aud);
    }
    if (claims.exp <= now() + REFRESH_MARGIN_SECONDS) {
      throw new GoogleIdTokenUnavailableError(
        audience,
        "metadata server returned an already-expiring token",
      );
    }
    cached = { token: text, exp: claims.exp };
    return text;
  }

  return {
    audience,
    async getToken() {
      if (cached && cached.exp > now() + REFRESH_MARGIN_SECONDS) {
        return cached.token;
      }
      // Coalesce concurrent refreshes into one metadata call.
      inflight ??= acquire().finally(() => {
        inflight = null;
      });
      return inflight;
    },
    cacheState() {
      return { cached: cached !== null, expiresAt: cached?.exp ?? null };
    },
  };
}

/**
 * The two providers the gateway uses. Constructed once per process; each is
 * bound to exactly one audience from server env.
 */
export interface NativeCredentialProviders {
  identityCcid: IdTokenProvider;
  investorApi: IdTokenProvider;
}

export function createNativeCredentialProviders(args: {
  identityCcidAudience: string;
  investorApiAudience: string;
  fetchImpl?: MetadataFetch;
  now?: () => number;
}): NativeCredentialProviders {
  if (args.identityCcidAudience === args.investorApiAudience) {
    throw new Error(
      "identity-ccid and investor-api must have DISTINCT Google ID-token audiences; " +
        "a shared audience would let one target's token be replayed at the other.",
    );
  }
  const base = { fetchImpl: args.fetchImpl, now: args.now };
  return {
    identityCcid: createIdTokenProvider({
      audience: args.identityCcidAudience,
      ...(base.fetchImpl ? { fetchImpl: base.fetchImpl } : {}),
      ...(base.now ? { now: base.now } : {}),
    }),
    investorApi: createIdTokenProvider({
      audience: args.investorApiAudience,
      ...(base.fetchImpl ? { fetchImpl: base.fetchImpl } : {}),
      ...(base.now ? { now: base.now } : {}),
    }),
  };
}
