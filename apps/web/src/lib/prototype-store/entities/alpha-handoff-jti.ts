/**
 * Consumed-jti set for the AlphaHandoffToken.
 *
 * The claim route asserts each jti exactly once. Second and later attempts
 * with the same jti return the existing binding (idempotent), never a
 * duplicate application row and never a duplicate acceptance side-effect.
 *
 * ── Replay-prevention grade (READ BEFORE SCALING) ────────────────────────
 * This guard is PROTOTYPE-GRADE, single-process idempotency ONLY.
 * `kvStore.putIfAbsent` on current main is an access-then-write sequence on
 * the filesystem, so it has a TOCTOU race across concurrent processes: two
 * requests carrying the same jti, landing on two workers at the same instant,
 * can both observe "absent" and both write. It is sufficient for the current
 * single-process Next.js prototype. It is NOT a production-grade distributed
 * replay-prevention primitive. Before any horizontally scaled production use
 * it MUST be replaced by a durable conditional write (compare-and-set) or a
 * unique constraint on `jti` in the system of record.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Behavioral contract source: commit 6dbeb7c. Adapted to the current-main
 * `kvStore`; the Phase 2.6 backing resolver / durable driver are not ported.
 */
import { resolveKvStore } from "../../store";

export interface AlphaHandoffJtiRecord {
  jti: string;
  alphaPlayerId: string;
  applicationRef: string;
  consumedAt: string;
  correlationId: string;
}

// Backing selected per-entity via REFI_BACKING__ALPHA_HANDOFF_JTI. In durable
// (Firestore) mode putIfAbsent is a real atomic create() — replay protection
// is distributed-safe. In prototype (filesystem) mode it is single-process
// only (see the grade note above).
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
 * Mark a jti consumed. Returns the freshly written record on first
 * consumption, and the EXISTING stored record on any subsequent call — so
 * the caller shapes an idempotent replay response from the original binding,
 * never from fields supplied by the replaying request.
 *
 * See the file header: `putIfAbsent` is not distributed-atomic. The re-read
 * on the `false` branch narrows, but does not close, the concurrent-write
 * window; a durable conditional write is required for scaled production.
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
  // Replay: return the ORIGINAL stored record, not the replaying request's
  // fields, so the binding observed on refresh is stable.
  return { record: existing, firstConsumption: false };
}
