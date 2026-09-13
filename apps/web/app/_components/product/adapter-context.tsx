"use client";

/**
 * Investor-product adapter wiring.
 *
 * Resolves WHICH adapter the product surfaces talk to, from explicit runtime
 * configuration only. No hostname, URL or NODE_ENV heuristic participates, so
 * a demo build cannot start serving fixtures because it happens to be on a
 * particular domain.
 *
 * The tier is the SERVER's `REFI_ENV`, handed down by the route layout — not
 * the client-visible `NEXT_PUBLIC_REFI_ENV`. That follows this repo's standing
 * rule (`src/lib/config/env.ts`): the public constant exists so the UI can
 * LABEL an environment, while security gates read the server-only tier. It is
 * also the stricter choice operationally — `NEXT_PUBLIC_*` is baked at build
 * time, so one artifact promoted across tiers would carry a stale verdict,
 * whereas `REFI_ENV` is evaluated per request on the tier actually serving.
 *
 * Production fail-closed, end to end:
 *
 *   `resolveAdapterMode` refuses `fixture` on the prod tier and resolves an
 *   UNSET value to `transport`. Daniel's transport adapter does not exist
 *   yet, so on prod this provider yields NO adapter at all. The surfaces then
 *   render `backend_connection_unavailable` — which is literally true, is
 *   retryable, and is the Scenario A product state. What they never do is
 *   quietly fall back to fixtures, and what this provider never does is take
 *   down the app with a thrown configuration error at render time.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import type { InvestorProductAdapter } from "@lib/investor-product/adapter";
import {
  FixtureInvestorProductAdapter,
  type FixtureScenario,
} from "@lib/investor-product/fixture-adapter";
import {
  fixtureDataPermitted,
  resolveAdapterMode,
  type AdapterMode,
  type RefiEnv,
} from "@lib/investor-product/resolve-adapter";

export interface InvestorProductContextValue {
  /** Null when no adapter is available on this tier (see module docs). */
  readonly adapter: InvestorProductAdapter | null;
  readonly mode: AdapterMode;
  /** Whether simulated data may be labelled as such on this tier. */
  readonly fixtureDataVisible: boolean;
  /** Why the adapter is null, when it is. */
  readonly unavailableReason: "transport_not_implemented" | null;
}

/**
 * The fixture adapter is a per-tab singleton.
 *
 * The journey spans two routes (brokerage → subscription). A fresh instance
 * per layout mount would drop the connection the investor just made the
 * moment they navigated, so the demo would be unwalkable. Module scope in the
 * browser is exactly tab scope: the state survives client-side navigation and
 * dies with the tab.
 *
 * Fixture mode only — `resolveAdapterMode` has already refused this path on
 * the prod tier before we get here, so this cannot become a production cache.
 */
let fixtureSingleton: FixtureInvestorProductAdapter | null = null;
let fixtureSingletonKey: string | null = null;

function getFixtureAdapter(
  key: string,
  scenario?: Partial<FixtureScenario>,
): FixtureInvestorProductAdapter {
  if (fixtureSingleton === null || fixtureSingletonKey !== key) {
    fixtureSingleton = new FixtureInvestorProductAdapter(scenario);
    fixtureSingletonKey = key;
  }
  return fixtureSingleton;
}

/** Test seam: drop the retained fixture world. */
export function resetFixtureAdapterForTests(): void {
  fixtureSingleton = null;
  fixtureSingletonKey = null;
}

/**
 * Named fixture worlds, selectable with `?scenario=` on non-production tiers.
 *
 * These exist so the states that are otherwise unreachable in a browser — a
 * backend outage, and the difference between "identity verification is
 * established" and "we do not know" — can be walked and asserted rather than
 * only unit-tested.
 *
 * This is reachable ONLY in fixture mode. `resolveAdapterMode` has already
 * refused fixtures on the prod tier before this is consulted, so no query
 * string can alter production behaviour.
 */
const FIXTURE_SCENARIOS: Record<string, Partial<FixtureScenario>> = {
  // Authoritative KYC pass, account service down (Scenario A).
  "backend-down": { kycVerified: true, backendAvailable: false },
  // Backend down AND identity-verification state not established.
  "backend-down-kyc-unknown": { kycVerified: false, backendAvailable: false },
  // Already-connected brokerage, for jumping straight to subscription.
  connected: { startConnected: true },
};

const InvestorProductContext =
  createContext<InvestorProductContextValue | null>(null);

export function InvestorProductProvider({
  children,
  /** Test/demo seam: override the fixture world. Ignored outside fixture mode. */
  scenario,
  /**
   * The SERVER's deployment tier, resolved per request in the route layout
   * and handed down. Required: there is no client-side default, so a surface
   * cannot be mounted without a tier having been decided server-side.
   */
  refiEnv,
  /** The server's explicit adapter selection, if configured. */
  configuredMode,
}: {
  children: ReactNode;
  scenario?: Partial<FixtureScenario>;
  refiEnv: RefiEnv;
  configuredMode?: string;
}) {
  const searchParams = useSearchParams();
  const scenarioName = searchParams.get("scenario");

  const value = useMemo<InvestorProductContextValue>(() => {
    const env = refiEnv;
    const mode = resolveAdapterMode({
      refiEnv: env,
      configured: configuredMode,
    });

    if (mode === "fixture") {
      const named = scenarioName ? FIXTURE_SCENARIOS[scenarioName] : undefined;
      const world = { ...named, ...scenario };
      return {
        adapter: getFixtureAdapter(scenarioName ?? "default", world),
        mode,
        fixtureDataVisible: fixtureDataPermitted(env),
        unavailableReason: null,
      };
    }

    // Transport mode: Daniel's client is not bound yet. Yield no adapter —
    // never a fixture — and let the surfaces show the unavailable state.
    return {
      adapter: null,
      mode,
      fixtureDataVisible: false,
      unavailableReason: "transport_not_implemented",
    };
    // `scenario` is a stable test seam; re-resolving per render would discard
    // the fixture's in-memory progress mid-journey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refiEnv, configuredMode, scenarioName]);

  return (
    <InvestorProductContext.Provider value={value}>
      {children}
    </InvestorProductContext.Provider>
  );
}

export function useInvestorProduct(): InvestorProductContextValue {
  const ctx = useContext(InvestorProductContext);
  if (ctx === null) {
    throw new Error(
      "useInvestorProduct must be used inside <InvestorProductProvider>",
    );
  }
  return ctx;
}
