/**
 * Replay protection for single-use tokens — durable, atomic, shared.
 *
 * Two families, kept in separate collections so a `jti` space never
 * collides across trust boundaries:
 *   - identity-result-jti: the backend identity result (iss
 *     urn:refinity:identity-ccid:dev) consumed exactly once before a session
 *     is created (Daniel step 5: "atomically consume its jti once in the
 *     BFF's shared store before creating the session").
 *   - bridge-assertion-jti: our own upstream identity assertions, so a
 *     captured assertion cannot be presented to the exchange twice from a
 *     second BFF instance.
 *
 * `putIfAbsent` is the whole guarantee: Firestore `create()` is an atomic
 * server-side condition, so the first caller wins on every instance and
 * after every restart. Records carry `exp` so a sweeper can garbage-collect
 * them after the token itself can no longer verify.
 */
import { connectedKvStore, nowIso } from "./index";

export const JTI_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

export interface ConsumedJtiRecord {
  jti: string;
  /** Subject the token was bound to; never PII. */
  sub: string;
  /** Token expiry (Unix seconds) — retention floor for the record. */
  exp: number;
  consumedAt: string;
  correlationId: string;
}

export type JtiFamily = "identity-result-jti" | "bridge-assertion-jti";

export type ConsumeJtiResult =
  | { first: true; record: ConsumedJtiRecord }
  | { first: false; record: ConsumedJtiRecord };

export async function consumeJtiOnce(
  family: JtiFamily,
  args: {
    jti: string;
    sub: string;
    exp: number;
    correlationId: string;
  },
): Promise<ConsumeJtiResult> {
  if (!JTI_PATTERN.test(args.jti)) throw new Error("jti pattern");
  const store = connectedKvStore<ConsumedJtiRecord>(family);
  const record: ConsumedJtiRecord = {
    jti: args.jti,
    sub: args.sub,
    exp: Math.floor(args.exp),
    consumedAt: nowIso(),
    correlationId: args.correlationId,
  };
  const first = await store.putIfAbsent(args.jti, record);
  if (first) return { first: true, record };
  const existing = await store.get(args.jti);
  // A lost read after a successful create is still a replay: fail closed.
  return { first: false, record: existing ?? record };
}

export async function isJtiConsumed(
  family: JtiFamily,
  jti: string,
): Promise<boolean> {
  if (!JTI_PATTERN.test(jti)) return true;
  return (await connectedKvStore<ConsumedJtiRecord>(family).get(jti)) !== null;
}
