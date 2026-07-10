/**
 * Durable-store driver (Firestore).
 *
 * Implements the KVStore + AppendOnlyStore contracts against Cloud
 * Firestore. Selected per-entity via REFI_BACKING__<ENTITY>=durable
 * (resolver in lib/store/index.ts).
 *
 * Auth: Application Default Credentials. Cloud Run picks up the service
 * account via the metadata server; local dev uses
 * `gcloud auth application-default login` or a service-account key path
 * in GOOGLE_APPLICATION_CREDENTIALS. Emulator sessions set
 * FIRESTORE_EMULATOR_HOST and the SDK routes to the emulator
 * automatically — no code change here.
 *
 * Semantics:
 *   get / put / delete map 1:1 to doc().get() / set() / delete().
 *   putIfAbsent uses doc().create() which fails ALREADY_EXISTS if the
 *     doc is present — the idempotency-key primitive activation-
 *     idempotency and receipt dedupe depend on.
 *   list(prefix) uses documentId() startAt/endAt with a '' upper
 *     bound (Firestore's canonical prefix-scan idiom).
 *   AppendOnlyStore.append writes a new auto-id doc so ordering is
 *     stable within a session; list() returns everything and filters
 *     client-side to match the prototype driver's semantics.
 */
import { Firestore, FieldPath } from "@google-cloud/firestore";
import type { KVStore, AppendOnlyStore } from "../store/types";

let cachedClient: Firestore | null = null;

function client(): Firestore {
  if (cachedClient) return cachedClient;
  // ignoreUndefinedProperties matches prototype-store semantics (JSON
  // stringify drops undefined). Without it, entities that carry optional
  // fields (accountId, reasonCode, etc.) would throw on write.
  cachedClient = new Firestore({ ignoreUndefinedProperties: true });
  return cachedClient;
}

/**
 * Sanitize a key segment. Firestore document IDs cannot be `.`, `..`,
 * cannot contain `/`, and cannot exceed 1500 bytes. Our callers key on
 * hashed ids and email-derived strings; the conservative replace keeps
 * behavior identical to the prototype driver's `safeKey`.
 */
function safeKey(key: string): string {
  const cleaned = key.replace(/[^A-Za-z0-9._-]/g, "_");
  if (cleaned.length === 0 || cleaned.startsWith(".")) {
    throw new Error(`Invalid store key: ${key}`);
  }
  return cleaned;
}

// Firestore-native "already exists" is code 6 (ALREADY_EXISTS). We check
// the numeric code instead of the string to avoid locale/version drift.
function isAlreadyExists(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: number }).code === 6
  );
}

export function durableKvStore<T>(name: string): KVStore<T> {
  const collectionName = safeKey(name);
  return {
    async get(key) {
      const snap = await client()
        .collection(collectionName)
        .doc(safeKey(key))
        .get();
      if (!snap.exists) return null;
      return snap.data() as T;
    },
    async put(key, value) {
      await client()
        .collection(collectionName)
        .doc(safeKey(key))
        .set(value as Record<string, unknown>);
    },
    async putIfAbsent(key, value) {
      try {
        await client()
          .collection(collectionName)
          .doc(safeKey(key))
          .create(value as Record<string, unknown>);
        return true;
      } catch (err) {
        if (isAlreadyExists(err)) return false;
        throw err;
      }
    },
    async list(filterPrefix) {
      const col = client().collection(collectionName);
      // Prefix scan on document id. '' is the highest character in
      // the Basic Multilingual Plane, so it sorts after any legal id
      // continuation — the standard Firestore idiom for "everything
      // starting with this string".
      const query = filterPrefix
        ? col
            .orderBy(FieldPath.documentId())
            .startAt(safeKey(filterPrefix))
            .endAt(`${safeKey(filterPrefix)}`)
        : col;
      const snap = await query.get();
      const out: Array<{ key: string; value: T }> = [];
      snap.forEach((doc) => {
        out.push({ key: doc.id, value: doc.data() as T });
      });
      return out;
    },
    async delete(key) {
      await client().collection(collectionName).doc(safeKey(key)).delete();
    },
  };
}

export function durableAppendOnlyStore<T>(name: string): AppendOnlyStore<T> {
  const collectionName = safeKey(name);
  return {
    async append(event) {
      await client()
        .collection(collectionName)
        .add(event as Record<string, unknown>);
    },
    async list(filter) {
      const snap = await client().collection(collectionName).get();
      const events: T[] = [];
      snap.forEach((doc) => {
        const ev = doc.data() as T;
        if (!filter || filter(ev)) events.push(ev);
      });
      return events;
    },
  };
}

/** Reset for tests. Not exported from the barrel; internal use only. */
export function __resetDurableClientForTests(): void {
  cachedClient = null;
}
