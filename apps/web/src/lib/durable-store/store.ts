/**
 * Durable-store driver (Cloud Firestore).
 *
 * Implements the KVStore + AppendOnlyStore contracts against Firestore.
 * Selected per-entity via REFI_BACKING__<ENTITY>=durable (resolver in
 * lib/store/index.ts). Unlike the prototype (filesystem) driver, this is
 * durable across redeploys/instances and its putIfAbsent is a real atomic
 * compare-and-set — the property the consumed-jti replay guard needs.
 *
 * Credentials (works on Vercel now, GCP-native later):
 *   - If GCP_SERVICE_ACCOUNT_KEY (a service-account key JSON string) is set,
 *     initialize with those credentials. This is the path for Vercel/other
 *     hosts that have no metadata server.
 *   - Otherwise fall back to Application Default Credentials — Cloud Run picks
 *     up its service account from the metadata server; local dev uses
 *     `gcloud auth application-default login`.
 *   - FIRESTORE_EMULATOR_HOST is honored automatically by the SDK, so contract
 *     tests route to the emulator with no code change.
 *
 * Semantics:
 *   get / put / delete map to doc().get() / set() / delete().
 *   putIfAbsent uses doc().create(), which fails ALREADY_EXISTS (gRPC code 6)
 *     if the doc exists — atomic across processes.
 *   list(prefix) uses a documentId() range scan with the U+F8FF upper bound
 *     (Firestore's canonical prefix-scan idiom).
 */
import { Firestore, FieldPath, type Settings } from "@google-cloud/firestore";
import type { KVStore, AppendOnlyStore } from "../store/types";

// Prefix-scan upper bound: U+F8FF sorts after every legal id continuation,
// so [prefix, prefix + PREFIX_END] matches "every doc id starting with prefix".
const PREFIX_END = "\uf8ff";

let cachedClient: Firestore | null = null;

function client(): Firestore {
  if (cachedClient) return cachedClient;

  // ignoreUndefinedProperties matches prototype-store semantics (JSON
  // stringify drops undefined); without it, entities with optional fields
  // (accountId, campaignSource, …) would throw on write.
  const settings: Settings = { ignoreUndefinedProperties: true };

  const keyJson = process.env["GCP_SERVICE_ACCOUNT_KEY"];
  if (keyJson) {
    const key = JSON.parse(keyJson) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    if (key.client_email && key.private_key) {
      settings.credentials = {
        client_email: key.client_email,
        // Env vars commonly store the PEM with escaped newlines; restore them.
        private_key: key.private_key.replace(/\\n/g, "\n"),
      };
    }
    if (key.project_id) settings.projectId = key.project_id;
  }
  const projectId =
    process.env["GCP_PROJECT_ID"] ?? process.env["GOOGLE_CLOUD_PROJECT"];
  if (projectId && !settings.projectId) settings.projectId = projectId;

  cachedClient = new Firestore(settings);
  return cachedClient;
}

/**
 * Sanitize a key segment. Firestore document IDs cannot be `.` or `..`, cannot
 * contain `/`, and cannot exceed 1500 bytes. Callers key on hashed ids and
 * email-derived strings; this conservative replace keeps behavior identical to
 * the prototype driver's `safeKey`.
 */
function safeKey(key: string): string {
  const cleaned = key.replace(/[^A-Za-z0-9._-]/g, "_");
  if (cleaned.length === 0 || cleaned.startsWith(".")) {
    throw new Error(`Invalid store key: ${key}`);
  }
  return cleaned;
}

/** Firestore's "already exists" is gRPC code 6; check the numeric code to avoid locale/version drift. */
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
      return snap.exists ? (snap.data() as T) : null;
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
      const query = filterPrefix
        ? col
            .orderBy(FieldPath.documentId())
            .startAt(safeKey(filterPrefix))
            .endAt(safeKey(filterPrefix) + PREFIX_END)
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

/** Test-only: drop the cached client (e.g. between emulator test cases). */
export function __resetDurableClientForTests(): void {
  cachedClient = null;
}
