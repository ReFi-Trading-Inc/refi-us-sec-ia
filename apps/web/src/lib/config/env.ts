// Validates process.env at module load. Fails fast with a clear error on missing vars.
// `clientEnv` is safe to import anywhere; `serverEnv` MUST only be imported from
// server components, route handlers, or middleware — never from a 'use client' file.
//
// Env determinism:
//   - When NEXT_PUBLIC_REFI_ENV === "prod" (real production deploys), every
//     variable is required and strictly validated; no defaults apply.
//   - Otherwise (dev, staging, CI, prototype builds) safe non-secret defaults
//     are substituted so `pnpm --filter @refi/web build` and `next dev` run
//     deterministically from a clean shell. The defaults are clearly marked
//     and would never be valid in production: placeholder ids, localhost
//     URLs, and `prototype-only-*` secrets that are 32-char fixed strings.
//   - Real values still win when present in process.env — defaults only fill
//     gaps. Production must explicitly set NEXT_PUBLIC_REFI_ENV=prod + every
//     required value before `next build`; see apps/web/.env.example.
import { z } from "zod";

const IS_PRODUCTION = process.env["NEXT_PUBLIC_REFI_ENV"] === "prod";

// Non-secret placeholder defaults. Safe to commit because they are not valid
// for any real environment and the schema rejects them outright in prod.
const PROTOTYPE_DEFAULTS = {
  NEXT_PUBLIC_API_BASE_URL: "http://localhost:3000",
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "prototype-walletconnect-id",
  NEXT_PUBLIC_POSTHOG_KEY: "phc_prototype_disabled",
  NEXT_PUBLIC_SENTRY_DSN: "https://prototype@sentry.invalid/0",
  NEXT_PUBLIC_REFI_ENV: "dev" as const,
  SESSION_SECRET: "prototype-only-session-secret-32+chars",
  IP_HASH_SECRET: "prototype-only-ip-hash-secret-32+chars",
  ELIGIBILITY_JWT_SECRET: "prototype-only-eligibility-jwt-32+chars",
  // HS256 secret the BFF uses to verify the us_session_v1 cookie. Must match
  // the session mint site (MSW today, auth-siwe later). Server-only.
  SESSION_JWT_SECRET: "prototype-only-session-jwt-secret-32+chars",
  // Server-only deployment tier. This — never the client-visible
  // NEXT_PUBLIC_REFI_ENV — gates security behaviour (e.g. the auth dev
  // fallback). Only "dev" enables the fallback; "staging"/"prod" fail closed.
  REFI_ENV: "dev" as const,
  REFI_DATA_ADAPTER: "mock" as const,
  // AlphaHandoffToken verification (ReFi Alpha spec §2.2). The public key
  // verifies the game-minted ES256 token; iss/aud are pinned so a token
  // minted for another audience cannot pass this verify. Server-only.
  // In non-prod a placeholder P-256 public JWK is substituted so the env
  // layer boots deterministically; it is NOT a valid curve point and any
  // real token fails verification until production sets the real value.
  // The private key never lives here — it stays in the game's secret store.
  ALPHA_HANDOFF_PUBLIC_KEY_JWK: JSON.stringify({
    kty: "EC",
    crv: "P-256",
    x: "prototype-only-x-coord",
    y: "prototype-only-y-coord",
  }),
  ALPHA_HANDOFF_ISSUER: "refi-alpha" as const,
  ALPHA_HANDOFF_AUDIENCE: "refi-us-sec-ia" as const,
  // ─── BFF→investor-api user assertion (Daniel 2026-08-17, D-017) ──────────
  // The BFF signs an ES256 JWT per backend call and publishes its public JWKS;
  // investor-api pins issuer + audience and fetches the JWKS.
  //
  // The issuer must be a STABLE, environment-specific value — explicitly NOT a
  // Vercel preview URL.
  //
  // A URN, not a hostname, deliberately: the issuer is an IDENTITY, and tying
  // it to wherever the app happens to be deployed means any hostname change
  // forces an issuer rotation on Daniel's side. A URN decouples the two. The
  // trade-off is that a URN has no derivable `jwks_uri`, so the JWKS URL must
  // be communicated explicitly in the connection sheet — which it has to be
  // anyway.
  BFF_ASSERTION_ISSUER: "urn:refinity:bff:dev",
  // Logical dev audience specified by Daniel. Environment-specific in staging
  // and prod, so it must be set explicitly there.
  INVESTOR_API_AUDIENCE: "urn:refinity:investor-api:dev",
  // Which release surface this deployment exposes. "signal" is the
  // v1.0.0-dev.1 default: join/leave templates and preference updates only.
  // "managed_paper" additionally enables pause/resume/reduce-only. Server-only
  // so a client build constant can never widen the action surface.
  REFI_RELEASE_STAGE: "signal" as const,
};

/**
 * In non-prod we substitute the placeholder when the var is missing or empty,
 * but pass any real value through so the schema still validates it. In prod
 * the value of process.env is used as-is and the schema rejects gaps.
 *
 * Callers MUST pass `value` as a literal `process.env["NEXT_PUBLIC_*"]`
 * expression so Next.js can inline the build-time value into client bundles.
 * Reading via a dynamic key would defeat that inlining.
 */
function withFallback(
  value: string | undefined,
  key: keyof typeof PROTOTYPE_DEFAULTS,
): string | undefined {
  if (value !== undefined && value !== "") return value;
  if (IS_PRODUCTION) return undefined;
  return PROTOTYPE_DEFAULTS[key];
}

const clientSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.url(),
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1),
  NEXT_PUBLIC_SENTRY_DSN: z.url(),
  NEXT_PUBLIC_REFI_ENV: z.enum(["dev", "staging", "prod"]).default("dev"),
});

const serverSchema = clientSchema.extend({
  SESSION_SECRET: z.string().min(32),
  IP_HASH_SECRET: z.string().min(32),
  ELIGIBILITY_JWT_SECRET: z.string().min(32),
  // Session cookie verification secret (see PROTOTYPE_DEFAULTS). Required in
  // prod; a present-but-invalid session token is rejected, never downgraded.
  SESSION_JWT_SECRET: z.string().min(32),
  // Server-only deployment tier. Security decisions gate on this, not on the
  // public NEXT_PUBLIC_REFI_ENV build constant. No schema default: in prod
  // withFallback yields undefined so a missing value fails boot rather than
  // silently degrading to "dev"; non-prod fills "dev" via PROTOTYPE_DEFAULTS.
  REFI_ENV: z.enum(["dev", "staging", "prod"]),
  REFI_DATA_ADAPTER: z.enum(["mock", "live"]).default("mock"),
  // AlphaHandoffToken verification (§2.2). Public key travels as a JWK JSON
  // string; iss/aud are pinned. Only the public half is ever read here.
  ALPHA_HANDOFF_PUBLIC_KEY_JWK: z.string().min(1),
  ALPHA_HANDOFF_ISSUER: z.string().min(1),
  ALPHA_HANDOFF_AUDIENCE: z.string().min(1),
  // BFF→investor-api user assertion (D-017).
  //
  // ALL FOUR ARE OPTIONAL IN THE SCHEMA, deliberately. Nothing on the request
  // path mints an assertion yet — the outbound client lands with the connection
  // package — so making them required here would fail the next staging/prod
  // BOOT on secrets that are not needed yet. They are enforced at MINT time
  // instead, where the error names the missing variable. Add them to the deploy
  // environments before the outbound client is wired.
  BFF_ASSERTION_ISSUER: z.string().min(1).optional(),
  INVESTOR_API_AUDIENCE: z.string().min(1).optional(),
  /** Private ES256 JWK (JSON string) including `kid`. Server-only, never logged. */
  BFF_ASSERTION_PRIVATE_KEY_JWK: z.string().min(1).optional(),
  /**
   * Optional PREVIOUS public ES256 JWK (JSON string) kept in the published
   * JWKS during a rotation overlap, so assertions signed with the retiring
   * `kid` still verify while investor-api's JWKS cache expires.
   */
  BFF_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK: z.string().min(1).optional(),
  /**
   * Explicit opt-in to the per-process ephemeral signing key.
   *
   * Set ONLY for a single-process local machine or CI run. A deployed dev tier
   * runs multiple Cloud Run instances with ephemeral filesystems, so each one
   * would mint under its own key while serving its own JWKS — assertions signed
   * by instance A would fail verification against the JWKS instance B happens
   * to serve. That failure is intermittent and load-balancer-dependent, which
   * is the worst possible way to discover it.
   *
   * REFI_ENV alone cannot distinguish "localhost dev" from "the deployed dev
   * tier Daniel calls", so this is a separate explicit switch rather than an
   * inference.
   */
  BFF_ASSERTION_ALLOW_EPHEMERAL_KEY: z.enum(["0", "1"]).default("0"),
  /**
   * Release surface. Gated verbs are refused with 403 until Managed paper —
   * enforced in bffMutate, not merely documented in the allowlist.
   */
  REFI_RELEASE_STAGE: z.enum(["signal", "managed_paper"]).default("signal"),
  /**
   * Investor API upstream (C1b-2). Two runtime targets per Daniel's package,
   * configured separately; loopback unless REFI_INVESTOR_API_ALLOW_REMOTE=1
   * (reviewed promotion only — the connected Dev services are
   * provisioned_not_enabled). Unset = the BFF reports "not configured" and
   * records nothing. Never read from the package's connection document.
   */
  REFI_INVESTOR_API_BASE_URL: z.url().optional(),
  REFI_IDENTITY_CCID_BASE_URL: z.url().optional(),
  REFI_INVESTOR_API_ALLOW_REMOTE: z.enum(["0", "1"]).default("0"),
  /**
   * How the BFF obtains the Google service credential for Daniel's services.
   * "unconfigured" (default) fails closed: native Cloud Run invocation vs WIF
   * is pending Daniel's answer. "simulator-fixture" sends the deterministic
   * simulator's fixture bearer and is valid ONLY against the loopback
   * simulator.
   */
  REFI_INVESTOR_API_CREDENTIAL_MODE: z
    .enum(["unconfigured", "simulator-fixture"])
    .default("unconfigured"),
  /** "mint" = real ES256 assertion from the session (user-assertion.ts); "simulator-fixture" for the simulator only. */
  REFI_INVESTOR_API_ASSERTION_MODE: z
    .enum(["mint", "simulator-fixture"])
    .default("mint"),
});

function formatError(error: z.ZodError): string {
  return error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
}

const clientParsed = clientSchema.safeParse({
  NEXT_PUBLIC_API_BASE_URL: withFallback(
    process.env["NEXT_PUBLIC_API_BASE_URL"],
    "NEXT_PUBLIC_API_BASE_URL",
  ),
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: withFallback(
    process.env["NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID"],
    "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
  ),
  NEXT_PUBLIC_POSTHOG_KEY: withFallback(
    process.env["NEXT_PUBLIC_POSTHOG_KEY"],
    "NEXT_PUBLIC_POSTHOG_KEY",
  ),
  NEXT_PUBLIC_SENTRY_DSN: withFallback(
    process.env["NEXT_PUBLIC_SENTRY_DSN"],
    "NEXT_PUBLIC_SENTRY_DSN",
  ),
  NEXT_PUBLIC_REFI_ENV: process.env["NEXT_PUBLIC_REFI_ENV"],
});

if (!clientParsed.success) {
  throw new Error(
    `Invalid client environment variables:\n${formatError(clientParsed.error)}`,
  );
}

export const clientEnv = clientParsed.data;
export type ClientEnv = typeof clientEnv;

// Server env is parsed lazily so that client bundles that accidentally import
// this module don't trip on missing server-only secrets at build time.
let cachedServerEnv: z.infer<typeof serverSchema> | null = null;

export function getServerEnv(): z.infer<typeof serverSchema> {
  if (typeof window !== "undefined") {
    throw new Error("getServerEnv() called from a browser context");
  }
  if (cachedServerEnv) return cachedServerEnv;

  const parsed = serverSchema.safeParse({
    NEXT_PUBLIC_API_BASE_URL: withFallback(
      process.env["NEXT_PUBLIC_API_BASE_URL"],
      "NEXT_PUBLIC_API_BASE_URL",
    ),
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: withFallback(
      process.env["NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID"],
      "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
    ),
    NEXT_PUBLIC_POSTHOG_KEY: withFallback(
      process.env["NEXT_PUBLIC_POSTHOG_KEY"],
      "NEXT_PUBLIC_POSTHOG_KEY",
    ),
    NEXT_PUBLIC_SENTRY_DSN: withFallback(
      process.env["NEXT_PUBLIC_SENTRY_DSN"],
      "NEXT_PUBLIC_SENTRY_DSN",
    ),
    NEXT_PUBLIC_REFI_ENV: process.env["NEXT_PUBLIC_REFI_ENV"],
    SESSION_SECRET: withFallback(
      process.env["SESSION_SECRET"],
      "SESSION_SECRET",
    ),
    IP_HASH_SECRET: withFallback(
      process.env["IP_HASH_SECRET"],
      "IP_HASH_SECRET",
    ),
    ELIGIBILITY_JWT_SECRET: withFallback(
      process.env["ELIGIBILITY_JWT_SECRET"],
      "ELIGIBILITY_JWT_SECRET",
    ),
    REFI_DATA_ADAPTER: process.env["REFI_DATA_ADAPTER"],
    SESSION_JWT_SECRET: withFallback(
      process.env["SESSION_JWT_SECRET"],
      "SESSION_JWT_SECRET",
    ),
    REFI_ENV: withFallback(process.env["REFI_ENV"], "REFI_ENV"),
    ALPHA_HANDOFF_PUBLIC_KEY_JWK: withFallback(
      process.env["ALPHA_HANDOFF_PUBLIC_KEY_JWK"],
      "ALPHA_HANDOFF_PUBLIC_KEY_JWK",
    ),
    ALPHA_HANDOFF_ISSUER: withFallback(
      process.env["ALPHA_HANDOFF_ISSUER"],
      "ALPHA_HANDOFF_ISSUER",
    ),
    ALPHA_HANDOFF_AUDIENCE: withFallback(
      process.env["ALPHA_HANDOFF_AUDIENCE"],
      "ALPHA_HANDOFF_AUDIENCE",
    ),
    BFF_ASSERTION_ISSUER: withFallback(
      process.env["BFF_ASSERTION_ISSUER"],
      "BFF_ASSERTION_ISSUER",
    ),
    INVESTOR_API_AUDIENCE: withFallback(
      process.env["INVESTOR_API_AUDIENCE"],
      "INVESTOR_API_AUDIENCE",
    ),
    BFF_ASSERTION_ALLOW_EPHEMERAL_KEY:
      process.env["BFF_ASSERTION_ALLOW_EPHEMERAL_KEY"] || undefined,
    REFI_RELEASE_STAGE: withFallback(
      process.env["REFI_RELEASE_STAGE"],
      "REFI_RELEASE_STAGE",
    ),
    REFI_INVESTOR_API_BASE_URL:
      process.env["REFI_INVESTOR_API_BASE_URL"] || undefined,
    REFI_IDENTITY_CCID_BASE_URL:
      process.env["REFI_IDENTITY_CCID_BASE_URL"] || undefined,
    REFI_INVESTOR_API_ALLOW_REMOTE:
      process.env["REFI_INVESTOR_API_ALLOW_REMOTE"] || undefined,
    REFI_INVESTOR_API_CREDENTIAL_MODE:
      process.env["REFI_INVESTOR_API_CREDENTIAL_MODE"] || undefined,
    REFI_INVESTOR_API_ASSERTION_MODE:
      process.env["REFI_INVESTOR_API_ASSERTION_MODE"] || undefined,
    // No withFallback: a signing key must never have a committed default.
    BFF_ASSERTION_PRIVATE_KEY_JWK:
      process.env["BFF_ASSERTION_PRIVATE_KEY_JWK"] || undefined,
    BFF_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK:
      process.env["BFF_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK"] || undefined,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid server environment variables:\n${formatError(parsed.error)}`,
    );
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

export type ServerEnv = ReturnType<typeof getServerEnv>;

/**
 * TEST-ONLY seam. Drops the memoised server env so a test can change
 * process.env and re-parse.
 *
 * Application code must never call this: the cache is what makes env reads
 * cheap and, more importantly, what guarantees every request in a process sees
 * the same validated configuration.
 */
export function resetServerEnvCacheForTests(): void {
  cachedServerEnv = null;
}
