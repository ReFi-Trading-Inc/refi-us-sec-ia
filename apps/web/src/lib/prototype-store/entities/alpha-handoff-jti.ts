/**
 * Consumed-jti set for the AlphaHandoffToken (Sprint 3, G-track sync 1).
 *
 * The claim route asserts each jti exactly once. Second and later attempts
 * with the same jti return the existing binding (idempotent), never a
 * duplicate application row and never a duplicate acceptance side-effect.
 * The store is keyed by jti; TTL enforcement lives in the caller (the
 * durable driver's TTL policy is scoped per collection).
 */
import { resolveKvStore } from "../../store";

export interface AlphaHandoffJtiRecord {
  jti: string;
  alphaPlayerId: string;
  applicationRef: string;
  consumedAt: string;
  correlationId: string;
}

const store = resolveKvStore<AlphaHandoffJtiRecord>(
  "alpha-handoff-jti",
  "alpha-handoff-jti",
);

export async function getConsumedJti(
  jti: string,
): Promise<AlphaHandoffJtiRecord | null> {
  return store.get(jti);
}

/**
 * Mark a jti consumed atomically. Returns:
 *   - the freshly written record on first consumption, and
 *   - the existing record on any subsequent call — allowing the caller
 *     to shape an idempotent 200 response with the original binding.
 */
export async function consumeJtiIfAbsent(
  args: Omit<AlphaHandoffJtiRecord, "consumedAt"> & { consumedAt?: string },
): Promise<{ record: AlphaHandoffJtiRecord; firstConsumption: boolean }> {
  const record: AlphaHandoffJtiRecord = {
    jti: args.jti,
    alphaPlayerId: args.alphaPlayerId,
    applicationRef: args.applicationRef,
    consumedAt: args.consumedAt ?? new Date().toISOString(),
    correlationId: args.correlationId,
  };
  const written = await store.putIfAbsent(args.jti, record);
  if (written) return { record, firstConsumption: true };
  const existing = await store.get(args.jti);
  if (!existing) {
    // Race between putIfAbsent returning false and a concurrent delete;
    // treat as first consumption of the current record.
    await store.put(args.jti, record);
    return { record, firstConsumption: true };
  }
  return { record: existing, firstConsumption: false };
}
