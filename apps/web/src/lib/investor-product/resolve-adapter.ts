/**
 * Adapter-mode resolution — fail closed.
 *
 * The fixture adapter must be IMPOSSIBLE in Production. Two rules:
 *
 *   1. The decision is made from EXPLICIT runtime configuration
 *      (`NEXT_PUBLIC_REFI_ENV` + `NEXT_PUBLIC_INVESTOR_PRODUCT_ADAPTER`),
 *      never from a hostname, a URL, a port, or a `NODE_ENV` guess. Hostname
 *      heuristics are how a demo build ends up serving fixtures on a
 *      production domain.
 *   2. Production + fixture is a CONFIGURATION ERROR, not a downgrade. It
 *      throws at resolution time rather than silently serving real investors
 *      deterministic fake state.
 *
 * This mirrors the `fail()` discipline already used by
 * `apps/web/src/lib/config/env.ts` for the KYC/identity profiles.
 */

/** Deployment tier, as already defined by the env schema. */
export type RefiEnv = "dev" | "staging" | "demo" | "prod";

export type AdapterMode = "fixture" | "transport";

/** Raised when configuration asks for fixtures in Production. */
export class FixtureAdapterForbiddenError extends Error {
  constructor(readonly env: RefiEnv) {
    super(
      `investor-product fixture adapter is forbidden when REFI_ENV=${env}: ` +
        `set NEXT_PUBLIC_INVESTOR_PRODUCT_ADAPTER=transport`,
    );
    this.name = "FixtureAdapterForbiddenError";
  }
}

/** Raised when the configured value is not a known mode. */
export class AdapterModeInvalidError extends Error {
  constructor(readonly raw: string) {
    super(
      `NEXT_PUBLIC_INVESTOR_PRODUCT_ADAPTER must be "fixture" or ` +
        `"transport", received "${raw}"`,
    );
    this.name = "AdapterModeInvalidError";
  }
}

export interface AdapterModeConfig {
  readonly refiEnv: RefiEnv;
  /** Raw configured value; undefined when unset. */
  readonly configured: string | undefined;
}

/**
 * Resolve the adapter mode.
 *
 * - `prod`: always `transport`. An explicit `fixture` throws; an unset value
 *   resolves to `transport` (fail closed — the absence of configuration must
 *   never enable fixtures).
 * - `dev` / `staging` / `demo`: honour the configured value; default
 *   `fixture`, which is the point of those tiers.
 */
export function resolveAdapterMode(config: AdapterModeConfig): AdapterMode {
  const { refiEnv, configured } = config;

  const requested =
    configured === undefined || configured === ""
      ? null
      : normalizeMode(configured);

  if (refiEnv === "prod") {
    if (requested === "fixture")
      throw new FixtureAdapterForbiddenError(refiEnv);
    return "transport";
  }

  return requested ?? "fixture";
}

function normalizeMode(raw: string): AdapterMode {
  const v = raw.trim().toLowerCase();
  if (v === "fixture" || v === "transport") return v;
  throw new AdapterModeInvalidError(raw);
}

/**
 * Whether fixture data may be displayed at all on this tier.
 *
 * Used by the UI to decide whether to render the simulated-data badge, and by
 * tests to assert Production can never show one.
 */
export function fixtureDataPermitted(refiEnv: RefiEnv): boolean {
  return refiEnv !== "prod";
}
