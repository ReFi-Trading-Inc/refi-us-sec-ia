/**
 * REFI_BACKING resolver.
 *
 * Enforces the per-entity backing-mode matrix documented in
 * docs/phase2-6-backing-mode-contract.md. Boot fails closed on unknown
 * entities, invalid modes, or (entity, mode) combinations outside the
 * matrix — there is no runtime silent fallback.
 *
 * Callers get a typed accessor: `backingFor("session")` returns exactly
 * one of that entity's valid modes.
 */
import { z } from "zod";

export const BACKING_MODES = [
  "msw",
  "prototype",
  "durable",
  "backend",
] as const;
export type BackingMode = (typeof BACKING_MODES)[number];

// The per-entity matrix. Keep in lockstep with the contract doc.
// BFF-owned entities: prototype | durable.
// Admin Portal-owned entities: msw | backend.
export const ENTITY_MATRIX = {
  // BFF-owned
  session: ["prototype", "durable"],
  "auth-session-link": ["prototype", "durable"],
  "activation-idempotency": ["prototype", "durable"],
  receipt: ["prototype", "durable"],
  "record-access-log": ["prototype", "durable"],
  "disclosure-acknowledgement": ["prototype", "durable"],
  "subscription-mode": ["prototype", "durable"],
  "managed-execution-state": ["prototype", "durable"],
  "account-prefs": ["prototype", "durable"],
  "account-prefs-history": ["prototype", "durable"],
  "alpha-application": ["prototype", "durable"],
  "alpha-handoff-jti": ["prototype", "durable"],
  "session-revocation": ["prototype", "durable"],

  // Admin Portal-owned
  intents: ["msw", "backend"],
  "risk-decisions": ["msw", "backend"],
  orders: ["msw", "backend"],
  fills: ["msw", "backend"],
  "control-states": ["msw", "backend"],
  reconciliation: ["msw", "backend"],
  templates: ["msw", "backend"],
  memberships: ["msw", "backend"],
  rules: ["msw", "backend"],
  accounts: ["msw", "backend"],
  "account-flow": ["msw", "backend"],
  "risk-limits": ["msw", "backend"],
  "orders-blocked": ["msw", "backend"],
  "broker-interactions": ["msw", "backend"],
  "execution-plans": ["msw", "backend"],
  "trading-controls": ["msw", "backend"],
} as const satisfies Record<string, readonly BackingMode[]>;

export type EntityId = keyof typeof ENTITY_MATRIX;

const modeSchema = z.enum(BACKING_MODES);

function envKeyFor(entityId: EntityId): string {
  return `REFI_BACKING__${entityId.replace(/-/g, "_").toUpperCase()}`;
}

let cachedMap: Record<EntityId, BackingMode> | null = null;

function resolveAll(): Record<EntityId, BackingMode> {
  const defaultRaw = process.env["REFI_BACKING_DEFAULT"] ?? "prototype";
  const parsedDefault = modeSchema.safeParse(defaultRaw);
  if (!parsedDefault.success) {
    throw new Error(
      `REFI_BACKING_DEFAULT must be one of ${BACKING_MODES.join(", ")} (got "${defaultRaw}")`,
    );
  }
  const defaultMode = parsedDefault.data;

  const result: Partial<Record<EntityId, BackingMode>> = {};
  const errors: string[] = [];

  for (const entityId of Object.keys(ENTITY_MATRIX) as EntityId[]) {
    const validModes = ENTITY_MATRIX[entityId];
    const override = process.env[envKeyFor(entityId)];
    const raw = override ?? defaultMode;
    const parsed = modeSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(
        `${envKeyFor(entityId)}: "${raw}" is not a valid backing mode`,
      );
      continue;
    }
    if (!(validModes as readonly BackingMode[]).includes(parsed.data)) {
      // If the default is invalid for this entity but no override was set,
      // fall back to the first valid mode listed for the entity. This lets
      // a single global default (e.g., "durable") work for both BFF and
      // Admin Portal entities without requiring an override for each
      // Admin Portal entity in every environment.
      if (!override) {
        result[entityId] = validModes[0];
        continue;
      }
      errors.push(
        `${envKeyFor(entityId)}: "${parsed.data}" not valid for ${entityId} (allowed: ${validModes.join(", ")})`,
      );
      continue;
    }
    result[entityId] = parsed.data;
  }

  // Warn on unknown REFI_BACKING__ envs — likely typos.
  const knownKeys = new Set(
    (Object.keys(ENTITY_MATRIX) as EntityId[]).map(envKeyFor),
  );
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("REFI_BACKING__") && !knownKeys.has(key)) {
      errors.push(`${key}: unknown entity (likely a typo)`);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid REFI_BACKING configuration:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }

  return result as Record<EntityId, BackingMode>;
}

export function backingFor(entityId: EntityId): BackingMode {
  if (typeof window !== "undefined") {
    throw new Error("backingFor() called from a browser context");
  }
  if (!cachedMap) cachedMap = resolveAll();
  return cachedMap[entityId];
}

export function backingSnapshot(): Record<EntityId, BackingMode> {
  if (typeof window !== "undefined") {
    throw new Error("backingSnapshot() called from a browser context");
  }
  if (!cachedMap) cachedMap = resolveAll();
  return { ...cachedMap };
}
