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
  REFI_DATA_ADAPTER: "mock" as const,
  REFI_ENV: "dev" as const,
  REFI_TRUSTED_ORIGINS: "http://localhost:3000,http://127.0.0.1:3000" as const,
  SESSION_JWT_ISSUER: "refi-us-sec-ia" as const,
  SESSION_JWT_AUDIENCE: "refi-us-sec-ia-bff" as const,
  ADMIN_PORTAL_BASE_URL: "http://localhost:4000" as const,
  ADMIN_PORTAL_SERVICE_TOKEN:
    "prototype-only-upstream-service-token-32+chars" as const,
  // Public key that verifies AlphaHandoffToken (ES256). JWK JSON string,
  // server-only. In non-prod a placeholder P-256 public key is used so the
  // envelope layer boots; production must set the real value.
  ALPHA_HANDOFF_PUBLIC_KEY_JWK: JSON.stringify({
    kty: "EC",
    crv: "P-256",
    x: "prototype-only-x-coord",
    y: "prototype-only-y-coord",
  }),
  ALPHA_HANDOFF_ISSUER: "refi-alpha" as const,
  ALPHA_HANDOFF_AUDIENCE: "refi-us-sec-ia" as const,
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
  REFI_DATA_ADAPTER: z.enum(["mock", "live"]).default("mock"),
  // Server-only twin of NEXT_PUBLIC_REFI_ENV. Security decisions (auth
  // fail-closed, CSRF, rate limits) gate on this — never on the
  // NEXT_PUBLIC value, which is a public build-time constant an
  // attacker can inspect and which cannot diverge from client bundles
  // without a rebuild.
  REFI_ENV: z.enum(["dev", "staging", "prod"]).default("dev"),
  // Backing-mode contract, per docs/phase2-6-backing-mode-contract.md.
  // Global default; individual entities can override via
  // REFI_BACKING__<ENTITY>. The four modes are enforced by the resolver
  // in lib/config/backing.ts, which knows which modes are valid per entity.
  REFI_BACKING_DEFAULT: z
    .enum(["msw", "prototype", "durable", "backend"])
    .default("prototype"),
  // Comma-separated allowlist of origins permitted to make mutating BFF
  // calls (S2 CSRF, lib/bff/csrf.ts). No wildcards; each preview/staging
  // origin must be listed explicitly. A misconfigured deploy fails loud
  // rather than silently trusting a broader set.
  REFI_TRUSTED_ORIGINS: z.string().min(1),
  // Session JWT iss/aud policy (S1). Any token that verifies against
  // SESSION_JWT_SECRET is additionally required to declare these values,
  // so a token issued for another audience (a different service sharing
  // the secret in a future misconfiguration) is rejected. Both are
  // documented values, not secrets; they must be stable across mint site
  // (Daniel's auth-siwe / D8 magic-link) and verify site.
  SESSION_JWT_ISSUER: z.string().min(1),
  SESSION_JWT_AUDIENCE: z.string().min(1),
  // Upstream Admin Portal base URL (S4). Pinned at boot so the proxy
  // client never accepts a request-derived host segment — closes the
  // classic SSRF surface by construction rather than by validation.
  ADMIN_PORTAL_BASE_URL: z.url(),
  // Service-to-service token forwarded to the Admin Portal on every
  // proxied call. Ratification is D4 in the Daniel Dependency Ledger.
  ADMIN_PORTAL_SERVICE_TOKEN: z.string().min(1),
  // AlphaHandoffToken verification (§2.2 of the ReFi Alpha spec).
  // Public key travels as a JWK JSON string; iss/aud are pinned so a
  // token minted for another audience cannot pass this verify. Private
  // key lives only in the game's Supabase Edge Function secret store.
  ALPHA_HANDOFF_PUBLIC_KEY_JWK: z.string().min(1),
  ALPHA_HANDOFF_ISSUER: z.string().min(1),
  ALPHA_HANDOFF_AUDIENCE: z.string().min(1),
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
    REFI_ENV: process.env["REFI_ENV"],
    REFI_BACKING_DEFAULT: process.env["REFI_BACKING_DEFAULT"],
    REFI_TRUSTED_ORIGINS: withFallback(
      process.env["REFI_TRUSTED_ORIGINS"],
      "REFI_TRUSTED_ORIGINS",
    ),
    SESSION_JWT_ISSUER: withFallback(
      process.env["SESSION_JWT_ISSUER"],
      "SESSION_JWT_ISSUER",
    ),
    SESSION_JWT_AUDIENCE: withFallback(
      process.env["SESSION_JWT_AUDIENCE"],
      "SESSION_JWT_AUDIENCE",
    ),
    ADMIN_PORTAL_BASE_URL: withFallback(
      process.env["ADMIN_PORTAL_BASE_URL"],
      "ADMIN_PORTAL_BASE_URL",
    ),
    ADMIN_PORTAL_SERVICE_TOKEN: withFallback(
      process.env["ADMIN_PORTAL_SERVICE_TOKEN"],
      "ADMIN_PORTAL_SERVICE_TOKEN",
    ),
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
