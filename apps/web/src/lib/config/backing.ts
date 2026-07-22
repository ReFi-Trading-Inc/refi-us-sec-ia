/**
 * REFI_BACKING resolver — per-entity storage backing selection.
 *
 * Each BFF-owned entity can run against the `prototype` filesystem store
 * (local dev / CI / un-provisioned environments) or the `durable` Firestore
 * store (staging/prod once GCP is provisioned). Selection is per entity via
 * `REFI_BACKING__<ENTITY>` so a single entity can be cut over without a code
 * change and without migrating the others.
 *
 * Fail-closed: an unknown mode, or a mode outside an entity's allowed set,
 * throws at resolution time rather than silently falling back.
 *
 * Scope note: only the entities wired to the resolver appear here. As more
 * entities migrate to durable, add them to ENTITY_MATRIX and switch their
 * call site to resolveKvStore/resolveAppendOnlyStore.
 */
import { z } from "zod";

export const BACKING_MODES = ["prototype", "durable"] as const;
export type BackingMode = (typeof BACKING_MODES)[number];

// Per-entity allowed backings. Extend as entities migrate.
export const ENTITY_MATRIX = {
  "alpha-application": ["prototype", "durable"],
  "alpha-handoff-jti": ["prototype", "durable"],
} as const satisfies Record<string, readonly BackingMode[]>;

export type EntityId = keyof typeof ENTITY_MATRIX;

// Default when the env var is unset: keep local/CI and any un-provisioned
// deploy working on the prototype store. Production opts into durable
// explicitly via REFI_BACKING__<ENTITY>=durable once Firestore is provisioned.
const DEFAULT_MODE: BackingMode = "prototype";

const modeSchema = z.enum(BACKING_MODES);

/** REFI_BACKING__ALPHA_APPLICATION, REFI_BACKING__ALPHA_HANDOFF_JTI, … */
export function envKeyFor(entityId: EntityId): string {
  return `REFI_BACKING__${entityId.replace(/-/g, "_").toUpperCase()}`;
}

export function backingFor(entityId: EntityId): BackingMode {
  const raw = process.env[envKeyFor(entityId)];
  if (raw === undefined || raw === "") return DEFAULT_MODE;

  const parsed = modeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Invalid ${envKeyFor(entityId)}="${raw}". Valid modes: ${BACKING_MODES.join(" | ")}.`,
    );
  }
  const mode = parsed.data;
  const allowed = ENTITY_MATRIX[entityId] as readonly BackingMode[];
  if (!allowed.includes(mode)) {
    throw new Error(
      `${envKeyFor(entityId)}="${mode}" is not allowed for entity "${entityId}". ` +
        `Allowed: ${allowed.join(" | ")}.`,
    );
  }
  return mode;
}
