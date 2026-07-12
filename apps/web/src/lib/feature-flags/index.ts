/**
 * Feature flags — single typed module.
 *
 * Every new investor surface or upstream proxy route ships behind a
 * flag defined here. Flags are read from process.env exactly once at
 * boot and cached; they are server-only decisions (`getServerFlag`), so
 * whether a route is enabled is not observable to the browser except
 * via the surface's own response shape.
 *
 * Naming: FLAG_<SURFACE>_<VERB>, e.g. FLAG_ADMIN_PROXY_INTENTS.
 * Values: any of "on" | "off"; anything else parses as "off" (deny by
 * default). A flag with no env value defaults to "off" unless
 * explicitly overridden in the definition below.
 */
import { z } from "zod";

const flagValueSchema = z.enum(["on", "off"]);

const flagDefinitions = {
  // Sprint 1 admin-portal-proxy read routes.
  FLAG_ADMIN_PROXY_TEMPLATES: { default: "off" },
  FLAG_ADMIN_PROXY_MEMBERSHIPS: { default: "off" },
  FLAG_ADMIN_PROXY_RULES: { default: "off" },
  FLAG_ADMIN_PROXY_ACCOUNTS: { default: "off" },
  FLAG_ADMIN_PROXY_ACCOUNT_FLOW: { default: "off" },
  FLAG_ADMIN_PROXY_RISK_LIMITS: { default: "off" },
  FLAG_ADMIN_PROXY_INTENTS: { default: "off" },
  FLAG_ADMIN_PROXY_RISK_DECISIONS: { default: "off" },
  // Sprint 2 remaining routes.
  FLAG_ADMIN_PROXY_EXECUTION_PLANS: { default: "off" },
  FLAG_ADMIN_PROXY_ORDERS: { default: "off" },
  FLAG_ADMIN_PROXY_ORDERS_BLOCKED: { default: "off" },
  FLAG_ADMIN_PROXY_BROKER_INTERACTIONS: { default: "off" },
  FLAG_ADMIN_PROXY_RECONCILIATION: { default: "off" },
  FLAG_ADMIN_PROXY_TRADING_CONTROLS: { default: "off" },
  // Sprint 2 SSE bridge.
  FLAG_ADMIN_PROXY_STREAM: { default: "off" },
  // Sprint 2 F-track on-domain signup.
  FLAG_ALPHA_APPLICATION_ROUTE: { default: "off" },
  // Sprint 3 PR-F surfaces.
  FLAG_ACCOUNT_CONTROLS_CENTER: { default: "off" },
  FLAG_ACCOUNT_PREFS_PATCH: { default: "off" },
  // Sprint 4.
  FLAG_RECORDS_CENTER_SPINE: { default: "off" },
  FLAG_EXCEPTION_REVIEW_REFRAME: { default: "off" },
  // Sprint 3 alpha handoff (G-track sync point 1).
  FLAG_ALPHA_CLAIM_ROUTE: { default: "off" },
} as const satisfies Record<string, { default: "on" | "off" }>;

export type FlagId = keyof typeof flagDefinitions;

let cache: Partial<Record<FlagId, "on" | "off">> = {};
let resolved = false;

function resolveAll(): void {
  cache = {};
  for (const id of Object.keys(flagDefinitions) as FlagId[]) {
    const raw = process.env[id];
    if (raw === undefined) {
      cache[id] = flagDefinitions[id].default;
      continue;
    }
    const parsed = flagValueSchema.safeParse(raw.trim().toLowerCase());
    // Deny by default: unrecognized values become "off" and are logged
    // once so an operator can spot a typo without breaking the boot.
    if (!parsed.success) {
      console.warn(
        `feature-flags: ${id}="${raw}" is not a valid value; treating as "off"`,
      );
      cache[id] = "off";
      continue;
    }
    cache[id] = parsed.data;
  }
  resolved = true;
}

export function getServerFlag(id: FlagId): "on" | "off" {
  if (typeof window !== "undefined") {
    throw new Error("getServerFlag() called from a browser context");
  }
  if (!resolved) resolveAll();
  const value = cache[id];
  if (!value) throw new Error(`feature-flags: ${id} not resolved`);
  return value;
}

export function isEnabled(id: FlagId): boolean {
  return getServerFlag(id) === "on";
}

export function flagsSnapshot(): Record<FlagId, "on" | "off"> {
  if (!resolved) resolveAll();
  return { ...cache } as Record<FlagId, "on" | "off">;
}
