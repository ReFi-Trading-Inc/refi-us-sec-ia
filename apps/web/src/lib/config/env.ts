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
  // Capability-owned public constants. Optional at the schema level; the
  // runtime profile refinement below requires them only where the capability
  // that consumes them is part of the runtime (WalletConnect → wallet UI,
  // PostHog → analytics, Sentry → observability).
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z.string().min(1).optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
  // "demo" is the isolated founder/investor demonstration tier: simulator/
  // demo-backed, never production, never a connected-Dev claim. Client-visible
  // so the environment indicator can label it; security gates use REFI_ENV.
  NEXT_PUBLIC_REFI_ENV: z
    .enum(["dev", "staging", "demo", "prod"])
    .default("dev"),
  /**
   * Socure frontend SDK key (Digital Intelligence + DocV Web SDK). A PUBLIC
   * SDK key by design — not the Evaluation API key, which is server-only
   * (`SOCURE_API_KEY`). Optional; absent until the founder activates Socure.
   */
  NEXT_PUBLIC_SOCURE_SDK_KEY: z.string().min(8).optional(),
});

const serverSchemaBase = clientSchema.extend({
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
  // "demo" enables exactly one extra surface — the deterministic persona
  // sign-in (`/api/demo/session`) — and, like "staging"/"prod", DISABLES the
  // eligibility-cookie dev fallback. Nothing in "demo" is weaker than "dev".
  REFI_ENV: z.enum(["dev", "staging", "demo", "prod"]),
  REFI_DATA_ADAPTER: z.enum(["mock", "live"]).default("mock"),
  // AlphaHandoffToken verification (§2.2). Public key travels as a JWK JSON
  // string; iss/aud are pinned. Only the public half is ever read here.
  ALPHA_HANDOFF_PUBLIC_KEY_JWK: z.string().min(1).optional(),
  ALPHA_HANDOFF_ISSUER: z.string().min(1).optional(),
  ALPHA_HANDOFF_AUDIENCE: z.string().min(1).optional(),
  /**
   * Runtime capability profile (NOT a release stage — `REFI_RELEASE_STAGE`
   * is the compliance/release concept and is never overloaded for this).
   *   "full"       — the whole investor application; in prod every capability's
   *                  configuration is required (fails closed).
   *   "socure_kyc" — the isolated Socure KYC surface: health, KYC browser
   *                  experience, Device Intelligence, Evaluation BFF route,
   *                  webhook, Firestore KYC state, Secret Manager, session
   *                  boundary. Unrelated capabilities (wallet, analytics, game
   *                  handoff, connected investor API, trading) are disabled and
   *                  their configuration is NOT required to boot. A disabled
   *                  capability never gets dummy configuration; an enabled one
   *                  fails closed without its real configuration.
   */
  REFI_RUNTIME_PROFILE: z.enum(["full", "socure_kyc"]).default("full"),
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
   * Which signer mints the per-request Investor assertion (Daniel 2026-09-09
   * step 3). "jwk" (default): BFF_ASSERTION_PRIVATE_KEY_JWK (or the opted-in
   * ephemeral key). "kms": Google Cloud KMS asymmetric sign on a
   * non-exportable P-256 key version — the private key never leaves KMS and
   * the same key serves every replica and restart.
   */
  BFF_ASSERTION_SIGNER: z.enum(["jwk", "kms"]).default("jwk"),
  /** projects/…/locations/…/keyRings/…/cryptoKeys/…/cryptoKeyVersions/N (kms only). */
  BFF_ASSERTION_KMS_KEY_VERSION: z.string().min(1).optional(),
  /** The published `kid` for the KMS key version (kms only); stable per version. */
  BFF_ASSERTION_KID: z.string().min(1).optional(),
  /**
   * Release surface. Gated verbs are refused with 403 until Managed paper —
   * enforced in bffMutate, not merely documented in the allowlist.
   */
  REFI_RELEASE_STAGE: z
    .enum(["signal", "automated_alpha", "managed_paper"])
    .default("signal"),
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
   *   "unconfigured"      (default) fails closed — nothing is sent.
   *   "simulator-fixture" the deterministic simulator's fixture bearer; valid
   *                       ONLY against the loopback simulator.
   *   "native-cloud-run"  Daniel 2026-09-09 topology decision: the runtime
   *                       service account's Google ID token from the Cloud Run
   *                       metadata server, one audience-bound provider per
   *                       target (lib/investor-api/google-id-token.ts). No WIF,
   *                       no key file, no impersonation. Selecting it turns on
   *                       the connected-deployment invariants below.
   */
  REFI_INVESTOR_API_CREDENTIAL_MODE: z
    .enum(["unconfigured", "simulator-fixture", "native-cloud-run"])
    .default("unconfigured"),
  /**
   * Google ID-token audiences for the two targets. These are Cloud Run CUSTOM
   * audiences configured by Daniel — never the service URLs. Defaults are his
   * fixed Dev values; a connected deployment may override per tier.
   */
  REFI_IDENTITY_CCID_GOOGLE_AUDIENCE: z
    .url()
    .default("https://identity-ccid.dev.refi.internal"),
  REFI_INVESTOR_API_GOOGLE_AUDIENCE: z
    .url()
    .default("https://investor-api.dev.refi.internal"),
  /** "mint" = real ES256 assertion from the session (user-assertion.ts); "simulator-fixture" for the simulator only. */
  REFI_INVESTOR_API_ASSERTION_MODE: z
    .enum(["mint", "simulator-fixture"])
    .default("mint"),
  /**
   * Frontend-owned KYC provider adapter (public U.S. onboarding, decision
   * 2026-09-04). "unconfigured" (default): no provider selected — verification
   * is reported unavailable and nothing starts. "mock": the deterministic mock
   * adapter for local/E2E only; never identity verification.
   */
  // Investor API upstream mode. "client" = the frozen HTTP client against the
  // configured base URLs (simulator or connected). "demo" = the in-process,
  // contract-validated demo world — permitted ONLY when REFI_ENV=demo; the
  // gateway throws otherwise, so production can never be pointed at it.
  REFI_INVESTOR_API_MODE: z.enum(["client", "demo"]).default("client"),
  REFI_KYC_PROVIDER: z
    .enum(["unconfigured", "mock", "socure"])
    .default("unconfigured"),
  /**
   * Socure RiskOS™ (founder decision 2026-09-10: ReFi-owned KYC, provider
   * Socure, "Build Your Own UI", KYC + Fraud + Watchlist > DocV Step Up).
   * All server-only. Required together when REFI_KYC_PROVIDER=socure.
   * Sandbox: https://riskos.sandbox.socure.com. No default base URL: the
   * environment is an explicit choice, never inferred.
   */
  SOCURE_API_BASE_URL: z.url().optional(),
  /** Server-only secret; never a NEXT_PUBLIC_ value, never logged, never echoed. */
  SOCURE_API_KEY: z.string().min(16).optional(),
  SOCURE_WORKFLOW_NAME: z.string().min(1).max(200).optional(),
  SOCURE_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  /**
   * Webhook authentication: the Bearer credential configured for the
   * endpoint in the RiskOS™ dashboard (credential comparison, not payload
   * signing — RiskOS™ documents no HMAC scheme). Founder decision 2026-09-10:
   * Bearer only. Unset → every delivery is refused; required in production.
   */
  SOCURE_WEBHOOK_BEARER_TOKEN: z.string().min(16).optional(),
  /** "1" → deliveries must come from the documented RiskOS™ sender IPs for SOCURE_ENV. */
  SOCURE_WEBHOOK_ENFORCE_SENDER_IP: z.enum(["0", "1"]).default("0"),
  /**
   * Enables the mock adapter's server-side test control route. Must never be
   * set on a deployed production tier; the route answers 404 otherwise.
   */
  REFI_KYC_MOCK_CONTROLS: z.enum(["0", "1"]).default("0"),
  /**
   * Demo tier ONLY: private half of the demo-tier handoff key pair, so the
   * walkthrough can mint a simulated game handoff token that the real
   * alpha-claim route verifies with ALPHA_HANDOFF_PUBLIC_KEY_JWK. Never the
   * game's production key. Unset everywhere but the demo project; the mint
   * route is 404 without it. No default, ever.
   */
  DEMO_HANDOFF_PRIVATE_KEY_JWK: z.string().min(1).optional(),
  /**
   * "1" ONLY behind a TLS-terminating edge proxy that owns Host and
   * X-Forwarded-Proto (Cloud Run). Same-origin checks then compare the browser
   * Origin to `${x-forwarded-proto}://${host}` instead of Next's bind address
   * (`https://0.0.0.0:3000` in standalone mode). See lib/bff/origin.ts.
   */
  REFI_TRUST_PROXY_HOST: z.enum(["0", "1"]).default("0"),
  /**
   * Connected security state (lib/connected-store): BFF sessions, pending
   * logins, consumed jtis, opaque subject map. "durable" = Firestore, REQUIRED
   * on a connected deployment; "prototype" = local filesystem, local/E2E only.
   */
  REFI_CONNECTED_STORE_BACKING: z
    .enum(["prototype", "durable"])
    .default("prototype"),
  /**
   * Collection namespace for connected state (`<ns>--connected-<entity>`).
   * Lowercase kebab-case; may not contain demo/mock/prototype/simulator, so a
   * connected deployment can never read demo or prototype collections.
   */
  REFI_CONNECTED_STORE_NAMESPACE: z.string().min(1).optional(),
  /** Firestore project (durable backing). Read by the durable driver. */
  GCP_PROJECT_ID: z.string().min(1).optional(),
  /**
   * Email-first user authentication provider (founder decision 2026-09-09:
   * Stytch Consumer Authentication, headless). "unconfigured" (default) keeps
   * every /api/v1/auth/login/* route dark (404) — demo and prototype tiers
   * never touch a provider. "stytch" requires the three values below.
   */
  REFI_AUTH_PROVIDER: z
    .enum(["unconfigured", "stytch"])
    .default("unconfigured"),
  STYTCH_PROJECT_ID: z.string().min(1).optional(),
  /** Server-only secret; never a NEXT_PUBLIC_ value, never logged. */
  STYTCH_SECRET: z.string().min(1).optional(),
  STYTCH_ENV: z.enum(["test", "live"]).default("test"),
  /**
   * The EXACT https callback the magic link returns to (Daniel: redirect URIs
   * match exactly, no wildcard, no implicit trailing slash). Registered in
   * the Stytch dashboard and sent as `redirect_uri` to the identity exchange.
   */
  REFI_AUTH_CALLBACK_URL: z.url().optional(),
  /**
   * Frontend identity bridge (Daniel step 2; mandate §7–§9, §15). Mints the
   * upstream identity assertion identity-ccid verifies at the exchange. Its
   * key is LOGICALLY AND STRUCTURALLY SEPARATE from the Investor API
   * assertion key: own signer selection, own KMS key version, own kid, own
   * JWKS route (/.well-known/identity-bridge-jwks.json), own issuer.
   */
  BRIDGE_ASSERTION_SIGNER: z.enum(["jwk", "kms"]).default("jwk"),
  /** Bridge P-256 private JWK (jwk signer). Never a committed default, never ephemeral. */
  BRIDGE_ASSERTION_PRIVATE_KEY_JWK: z.string().min(1).optional(),
  /** KMS key version for the `identity-bridge` key (kms signer). */
  BRIDGE_ASSERTION_KMS_KEY_VERSION: z.string().min(1).optional(),
  /** Published `kid` for the bridge KMS key version (kms signer). */
  BRIDGE_ASSERTION_KID: z.string().min(1).optional(),
  /** Retiring bridge public JWK, served alongside the current one during rotation. */
  BRIDGE_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK: z.string().min(1).optional(),
  /** `iss` of the bridge assertion: the frontend's https origin (Daniel binds it in step 4). */
  BRIDGE_ASSERTION_ISSUER: z.string().min(1).optional(),
  /** `aud` of the bridge assertion, as identity-ccid expects it (Daniel step 4). */
  IDENTITY_CCID_UPSTREAM_AUDIENCE: z.string().min(1).max(256).optional(),
  /** Backend identity-result JWKS URL (Daniel: identity-ccid /.well-known/jwks.json). */
  IDENTITY_CCID_JWKS_URL: z.url().optional(),
  /** Expected `iss` / `aud` of Daniel's identity_result JWT (fixed pairs, alpha.2). */
  IDENTITY_RESULT_ISSUER: z
    .string()
    .min(1)
    .default("urn:refinity:identity-ccid:dev"),
  IDENTITY_RESULT_AUDIENCE: z
    .string()
    .min(1)
    .default("urn:refinity:frontend-bff:dev"),
});

const serverSchema = serverSchemaBase.superRefine((env, ctx) => {
  // ── Connected-deployment invariants (Daniel 2026-09-09, step 1) ───────────
  // Selecting the native Google credential means "this is a connected BFF".
  // Every downgrade path is then a boot failure, not a silent fallback: no
  // simulator credential or assertion, no ephemeral signing key, no mock KYC
  // control, no demo world, no MSW/mock data adapter, and never on the demo
  // tier. REFI_INVESTOR_API_ALLOW_REMOTE stays a separate reviewed switch
  // that is OFF until Daniel's step 4 returns the bound addendum.
  const fail = (path: string, message: string) => {
    ctx.addIssue({ code: "custom", path: [path], message });
  };
  // ── Runtime profile: validate only what the enabled surfaces require ────
  const prodTier =
    env.NEXT_PUBLIC_REFI_ENV === "prod" || env.REFI_ENV === "prod";
  if (env.REFI_RUNTIME_PROFILE === "full" && prodTier) {
    // The whole application in production: every capability is enabled, so
    // every capability's real configuration is required (no defaults in prod).
    for (const k of [
      "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
      "NEXT_PUBLIC_POSTHOG_KEY",
      "NEXT_PUBLIC_SENTRY_DSN",
      "ALPHA_HANDOFF_PUBLIC_KEY_JWK",
      "ALPHA_HANDOFF_ISSUER",
      "ALPHA_HANDOFF_AUDIENCE",
    ] as const) {
      if (!env[k])
        fail(k, "required in production for the full runtime profile");
    }
  }
  if (env.REFI_RUNTIME_PROFILE === "socure_kyc") {
    if (env.REFI_ENV === "demo") {
      fail(
        "REFI_RUNTIME_PROFILE",
        "the socure_kyc profile never runs on the demo tier",
      );
    }
    if (env.REFI_DATA_ADAPTER !== "live") {
      fail("REFI_DATA_ADAPTER", 'must be "live" for the socure_kyc profile');
    }
    if (
      env.REFI_KYC_PROVIDER === "mock" ||
      env.REFI_KYC_MOCK_CONTROLS !== "0"
    ) {
      fail(
        "REFI_KYC_PROVIDER",
        "the socure_kyc profile never runs the mock adapter or its controls",
      );
    }
    if (!env.GCP_PROJECT_ID) {
      fail(
        "GCP_PROJECT_ID",
        "the socure_kyc profile persists KYC state durably and needs the project id",
      );
    }
    if (env.REFI_AUTH_PROVIDER === "stytch") {
      fail(
        "REFI_AUTH_PROVIDER",
        "connected identity is not part of the socure_kyc profile",
      );
    }
    if (process.env["FLAG_ALPHA_CLAIM_ROUTE"] === "on") {
      fail(
        "FLAG_ALPHA_CLAIM_ROUTE",
        "the alpha handoff claim route is not part of the socure_kyc profile",
      );
    }
  }
  // Stytch configuration is all-or-nothing on every tier, and the callback
  // must be https (Daniel: exact HTTPS redirect URIs).
  // ── Socure configuration is all-or-nothing and environment-explicit ─────
  if (env.REFI_KYC_PROVIDER === "socure") {
    if (
      !env.SOCURE_API_BASE_URL ||
      !env.SOCURE_API_KEY ||
      !env.SOCURE_WORKFLOW_NAME
    ) {
      fail(
        "REFI_KYC_PROVIDER",
        "socure requires SOCURE_API_BASE_URL, SOCURE_API_KEY and SOCURE_WORKFLOW_NAME",
      );
    }
    if (env.SOCURE_API_BASE_URL) {
      const host = new URL(env.SOCURE_API_BASE_URL).host;
      const isSandbox = host === "riskos.sandbox.socure.com";
      if (env.SOCURE_ENV === "sandbox" && !isSandbox) {
        fail(
          "SOCURE_API_BASE_URL",
          "SOCURE_ENV=sandbox requires the sandbox host riskos.sandbox.socure.com",
        );
      }
      if (env.SOCURE_ENV === "production" && isSandbox) {
        fail(
          "SOCURE_API_BASE_URL",
          "SOCURE_ENV=production must not point at the sandbox host",
        );
      }
      if (!/\.socure\.com$/.test(host)) {
        fail("SOCURE_API_BASE_URL", "must be a socure.com host");
      }
    }
    if (env.SOCURE_ENV === "production" && !env.SOCURE_WEBHOOK_BEARER_TOKEN) {
      fail(
        "SOCURE_WEBHOOK_BEARER_TOKEN",
        "required when SOCURE_ENV=production — webhook Bearer authentication must not be skipped",
      );
    }
    if (env.REFI_ENV === "demo") {
      fail("REFI_KYC_PROVIDER", "socure never runs on the demo tier");
    }
  }
  if (env.REFI_AUTH_PROVIDER === "stytch") {
    if (!env.STYTCH_PROJECT_ID || !env.STYTCH_SECRET) {
      fail(
        "REFI_AUTH_PROVIDER",
        "stytch requires STYTCH_PROJECT_ID and STYTCH_SECRET",
      );
    }
    if (
      !env.REFI_AUTH_CALLBACK_URL ||
      !env.REFI_AUTH_CALLBACK_URL.startsWith("https://")
    ) {
      fail(
        "REFI_AUTH_CALLBACK_URL",
        "stytch requires an exact https callback URL",
      );
    }
    if (env.REFI_ENV === "demo") {
      fail(
        "REFI_AUTH_PROVIDER",
        "the demo tier never uses a real identity provider",
      );
    }
  }
  // KMS signer configuration is all-or-nothing on every tier.
  if (
    env.BFF_ASSERTION_SIGNER === "kms" &&
    (!env.BFF_ASSERTION_KMS_KEY_VERSION || !env.BFF_ASSERTION_KID)
  ) {
    fail(
      "BFF_ASSERTION_SIGNER",
      "kms requires BFF_ASSERTION_KMS_KEY_VERSION and BFF_ASSERTION_KID",
    );
  }
  // Bridge KMS configuration is all-or-nothing on every tier, and the bridge
  // may never share signing material or kid with the Investor API signer.
  if (
    env.BRIDGE_ASSERTION_SIGNER === "kms" &&
    (!env.BRIDGE_ASSERTION_KMS_KEY_VERSION || !env.BRIDGE_ASSERTION_KID)
  ) {
    fail(
      "BRIDGE_ASSERTION_SIGNER",
      "kms requires BRIDGE_ASSERTION_KMS_KEY_VERSION and BRIDGE_ASSERTION_KID",
    );
  }
  if (
    env.BRIDGE_ASSERTION_KMS_KEY_VERSION &&
    env.BRIDGE_ASSERTION_KMS_KEY_VERSION === env.BFF_ASSERTION_KMS_KEY_VERSION
  ) {
    fail(
      "BRIDGE_ASSERTION_KMS_KEY_VERSION",
      "the identity bridge and the Investor API assertion signer must use different KMS keys",
    );
  }
  if (
    env.BRIDGE_ASSERTION_PRIVATE_KEY_JWK &&
    env.BRIDGE_ASSERTION_PRIVATE_KEY_JWK === env.BFF_ASSERTION_PRIVATE_KEY_JWK
  ) {
    fail(
      "BRIDGE_ASSERTION_PRIVATE_KEY_JWK",
      "the identity bridge and the Investor API assertion signer must use different private keys",
    );
  }
  if (
    env.BRIDGE_ASSERTION_KID &&
    env.BRIDGE_ASSERTION_KID === env.BFF_ASSERTION_KID
  ) {
    fail(
      "BRIDGE_ASSERTION_KID",
      "the identity bridge kid must differ from the Investor API assertion kid",
    );
  }
  if (
    env.BRIDGE_ASSERTION_ISSUER &&
    env.BRIDGE_ASSERTION_ISSUER === env.BFF_ASSERTION_ISSUER
  ) {
    fail(
      "BRIDGE_ASSERTION_ISSUER",
      "the identity bridge issuer must differ from the Investor API assertion issuer",
    );
  }
  if (env.REFI_AUTH_PROVIDER === "stytch") {
    // A real login path needs the whole bridge → exchange chain bound.
    for (const k of [
      "BRIDGE_ASSERTION_ISSUER",
      "IDENTITY_CCID_UPSTREAM_AUDIENCE",
      "IDENTITY_CCID_JWKS_URL",
    ] as const) {
      if (!env[k]) fail(k, "required when REFI_AUTH_PROVIDER=stytch");
    }
    if (
      env.BRIDGE_ASSERTION_SIGNER === "jwk" &&
      !env.BRIDGE_ASSERTION_PRIVATE_KEY_JWK
    ) {
      fail(
        "BRIDGE_ASSERTION_PRIVATE_KEY_JWK",
        "the identity bridge has no ephemeral key: configure a JWK or BRIDGE_ASSERTION_SIGNER=kms",
      );
    }
    if (
      env.BRIDGE_ASSERTION_ISSUER &&
      !/^https:\/\/[^\s#?]+$/.test(env.BRIDGE_ASSERTION_ISSUER)
    ) {
      fail("BRIDGE_ASSERTION_ISSUER", "must be an https issuer");
    }
  }
  if (env.REFI_INVESTOR_API_CREDENTIAL_MODE !== "native-cloud-run") return;
  // A connected deployment signs with a persistent key: KMS, or a JWK from
  // the secret store. Never the per-process ephemeral key.
  if (
    env.BFF_ASSERTION_SIGNER === "jwk" &&
    !env.BFF_ASSERTION_PRIVATE_KEY_JWK
  ) {
    fail(
      "BFF_ASSERTION_PRIVATE_KEY_JWK",
      "a connected deployment needs a persistent signing key (BFF_ASSERTION_SIGNER=kms or a JWK from the secret store)",
    );
  }
  if (env.REFI_INVESTOR_API_MODE !== "client") {
    fail(
      "REFI_INVESTOR_API_MODE",
      'must be "client" when the native Google credential is selected',
    );
  }
  if (env.REFI_INVESTOR_API_ASSERTION_MODE !== "mint") {
    fail(
      "REFI_INVESTOR_API_ASSERTION_MODE",
      'must be "mint" on a connected deployment — no simulator assertion',
    );
  }
  if (env.BFF_ASSERTION_ALLOW_EPHEMERAL_KEY !== "0") {
    fail(
      "BFF_ASSERTION_ALLOW_EPHEMERAL_KEY",
      "must be 0 on a connected deployment — a persistent signing key is required",
    );
  }
  if (env.REFI_KYC_MOCK_CONTROLS !== "0") {
    fail(
      "REFI_KYC_MOCK_CONTROLS",
      "must be 0 on a connected deployment — mock KYC controls never run there",
    );
  }
  // F-1 (founder review 2026-09-10): the mock adapter is a configuration
  // defect on a connected deployment, not only its controls. Permitted:
  // "unconfigured" (verification reported unavailable, never pending) or a
  // COMPLETE "socure" configuration (checked above). Never a silent fallback
  // from socure to mock.
  if (env.REFI_KYC_PROVIDER === "mock") {
    fail(
      "REFI_KYC_PROVIDER",
      'must not be "mock" on a connected deployment — the mock adapter is never an authoritative KYC source',
    );
  }
  if (
    env.REFI_KYC_PROVIDER === "socure" &&
    env.SOCURE_ENV === "production" &&
    !env.SOCURE_WEBHOOK_BEARER_TOKEN
  ) {
    fail(
      "SOCURE_WEBHOOK_BEARER_TOKEN",
      "connected production requires webhook Bearer authentication",
    );
  }
  if (env.REFI_DATA_ADAPTER !== "live") {
    fail(
      "REFI_DATA_ADAPTER",
      'must be "live" on a connected deployment — no MSW/mock identity fallback',
    );
  }
  if (env.REFI_ENV === "demo") {
    fail("REFI_ENV", "the demo tier is never a connected deployment");
  }
  // Durable security state is mandatory: sessions, pending logins, consumed
  // jtis and the subject map must survive instances and restarts, and must
  // never resolve to demo or prototype collections.
  if (env.REFI_CONNECTED_STORE_BACKING !== "durable") {
    fail(
      "REFI_CONNECTED_STORE_BACKING",
      'must be "durable" on a connected deployment — no process-memory or /tmp security state',
    );
  }
  const ns = env.REFI_CONNECTED_STORE_NAMESPACE;
  if (!ns || !/^[a-z][a-z0-9-]{2,39}$/.test(ns)) {
    fail(
      "REFI_CONNECTED_STORE_NAMESPACE",
      "must be set to a lowercase kebab-case namespace on a connected deployment",
    );
  } else if (/demo|mock|prototype|simulator/.test(ns)) {
    fail(
      "REFI_CONNECTED_STORE_NAMESPACE",
      "may not name demo, mock, prototype or simulator collections",
    );
  }
  if (!env.GCP_PROJECT_ID) {
    fail(
      "GCP_PROJECT_ID",
      "the durable (Firestore) backing needs the connected project id",
    );
  }
  if (
    env.REFI_IDENTITY_CCID_GOOGLE_AUDIENCE ===
    env.REFI_INVESTOR_API_GOOGLE_AUDIENCE
  ) {
    fail(
      "REFI_INVESTOR_API_GOOGLE_AUDIENCE",
      "identity-ccid and investor-api audiences must be distinct",
    );
  }
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
  NEXT_PUBLIC_SOCURE_SDK_KEY:
    process.env["NEXT_PUBLIC_SOCURE_SDK_KEY"] || undefined,
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
    NEXT_PUBLIC_SOCURE_SDK_KEY:
      process.env["NEXT_PUBLIC_SOCURE_SDK_KEY"] || undefined,
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
    REFI_RUNTIME_PROFILE: process.env["REFI_RUNTIME_PROFILE"] || undefined,
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
    REFI_IDENTITY_CCID_GOOGLE_AUDIENCE:
      process.env["REFI_IDENTITY_CCID_GOOGLE_AUDIENCE"] || undefined,
    REFI_INVESTOR_API_GOOGLE_AUDIENCE:
      process.env["REFI_INVESTOR_API_GOOGLE_AUDIENCE"] || undefined,
    REFI_INVESTOR_API_ASSERTION_MODE:
      process.env["REFI_INVESTOR_API_ASSERTION_MODE"] || undefined,
    REFI_INVESTOR_API_MODE: process.env["REFI_INVESTOR_API_MODE"] || undefined,
    REFI_KYC_PROVIDER: process.env["REFI_KYC_PROVIDER"] || undefined,
    REFI_KYC_MOCK_CONTROLS: process.env["REFI_KYC_MOCK_CONTROLS"] || undefined,
    SOCURE_API_BASE_URL: process.env["SOCURE_API_BASE_URL"] || undefined,
    SOCURE_API_KEY: process.env["SOCURE_API_KEY"] || undefined,
    SOCURE_WORKFLOW_NAME: process.env["SOCURE_WORKFLOW_NAME"] || undefined,
    SOCURE_ENV: process.env["SOCURE_ENV"] || undefined,
    SOCURE_WEBHOOK_BEARER_TOKEN:
      process.env["SOCURE_WEBHOOK_BEARER_TOKEN"] || undefined,
    SOCURE_WEBHOOK_ENFORCE_SENDER_IP:
      process.env["SOCURE_WEBHOOK_ENFORCE_SENDER_IP"] || undefined,
    DEMO_HANDOFF_PRIVATE_KEY_JWK:
      process.env["DEMO_HANDOFF_PRIVATE_KEY_JWK"] || undefined,
    REFI_TRUST_PROXY_HOST: process.env["REFI_TRUST_PROXY_HOST"] || undefined,
    REFI_CONNECTED_STORE_BACKING:
      process.env["REFI_CONNECTED_STORE_BACKING"] || undefined,
    REFI_CONNECTED_STORE_NAMESPACE:
      process.env["REFI_CONNECTED_STORE_NAMESPACE"] || undefined,
    GCP_PROJECT_ID: process.env["GCP_PROJECT_ID"] || undefined,
    REFI_AUTH_PROVIDER: process.env["REFI_AUTH_PROVIDER"] || undefined,
    STYTCH_PROJECT_ID: process.env["STYTCH_PROJECT_ID"] || undefined,
    STYTCH_SECRET: process.env["STYTCH_SECRET"] || undefined,
    STYTCH_ENV: process.env["STYTCH_ENV"] || undefined,
    REFI_AUTH_CALLBACK_URL: process.env["REFI_AUTH_CALLBACK_URL"] || undefined,
    // No withFallback: a signing key must never have a committed default.
    BFF_ASSERTION_PRIVATE_KEY_JWK:
      process.env["BFF_ASSERTION_PRIVATE_KEY_JWK"] || undefined,
    BFF_ASSERTION_SIGNER: process.env["BFF_ASSERTION_SIGNER"] || undefined,
    BFF_ASSERTION_KMS_KEY_VERSION:
      process.env["BFF_ASSERTION_KMS_KEY_VERSION"] || undefined,
    BFF_ASSERTION_KID: process.env["BFF_ASSERTION_KID"] || undefined,
    BFF_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK:
      process.env["BFF_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK"] || undefined,
    BRIDGE_ASSERTION_SIGNER:
      process.env["BRIDGE_ASSERTION_SIGNER"] || undefined,
    BRIDGE_ASSERTION_PRIVATE_KEY_JWK:
      process.env["BRIDGE_ASSERTION_PRIVATE_KEY_JWK"] || undefined,
    BRIDGE_ASSERTION_KMS_KEY_VERSION:
      process.env["BRIDGE_ASSERTION_KMS_KEY_VERSION"] || undefined,
    BRIDGE_ASSERTION_KID: process.env["BRIDGE_ASSERTION_KID"] || undefined,
    BRIDGE_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK:
      process.env["BRIDGE_ASSERTION_PREVIOUS_PUBLIC_KEY_JWK"] || undefined,
    BRIDGE_ASSERTION_ISSUER:
      process.env["BRIDGE_ASSERTION_ISSUER"] || undefined,
    IDENTITY_CCID_UPSTREAM_AUDIENCE:
      process.env["IDENTITY_CCID_UPSTREAM_AUDIENCE"] || undefined,
    IDENTITY_CCID_JWKS_URL: process.env["IDENTITY_CCID_JWKS_URL"] || undefined,
    IDENTITY_RESULT_ISSUER: process.env["IDENTITY_RESULT_ISSUER"] || undefined,
    IDENTITY_RESULT_AUDIENCE:
      process.env["IDENTITY_RESULT_AUDIENCE"] || undefined,
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
