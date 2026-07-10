/**
 * Storage-driver factory.
 *
 * Callers ask for a store by (entityId, collectionName). The factory reads
 * backingFor(entityId) and returns the matching driver's implementation.
 * This is the seam that lets a single entity flip prototype→durable via
 * config without a code change.
 *
 * `entityId` is the identifier declared in ENTITY_MATRIX (lib/config/backing.ts).
 * `collectionName` is the storage-level name (folder in prototype-store,
 * Firestore collection). Kept explicit so migrating to durable does not force
 * a rename of existing prototype-store folders — disposable prototype state
 * still works during the cutover window.
 */
import { backingFor, type EntityId } from "../config/backing";
import {
  kvStore as prototypeKvStore,
  appendOnlyStore as prototypeAppendOnlyStore,
} from "../prototype-store/store";
import { durableKvStore, durableAppendOnlyStore } from "../durable-store/store";
import type { KVStore, AppendOnlyStore } from "./types";

export type { KVStore, AppendOnlyStore } from "./types";

export function resolveKvStore<T>(
  entityId: EntityId,
  collectionName: string,
): KVStore<T> {
  const mode = backingFor(entityId);
  switch (mode) {
    case "prototype":
      return prototypeKvStore<T>(collectionName);
    case "durable":
      return durableKvStore<T>(collectionName);
    case "msw":
    case "backend":
      // Neither of these modes runs against a local KV — Admin-Portal-
      // owned entities are proxied to the upstream, not stored here. The
      // matrix in backing.ts prevents this combination for BFF-owned
      // entities; reaching this branch means the matrix was violated.
      throw new Error(
        `resolveKvStore(${entityId}): backing "${mode}" is not a KV backing. ` +
          `Check ENTITY_MATRIX in lib/config/backing.ts.`,
      );
  }
}

export function resolveAppendOnlyStore<T>(
  entityId: EntityId,
  collectionName: string,
): AppendOnlyStore<T> {
  const mode = backingFor(entityId);
  switch (mode) {
    case "prototype":
      return prototypeAppendOnlyStore<T>(collectionName);
    case "durable":
      return durableAppendOnlyStore<T>(collectionName);
    case "msw":
    case "backend":
      throw new Error(
        `resolveAppendOnlyStore(${entityId}): backing "${mode}" is not an ` +
          `append-only backing. Check ENTITY_MATRIX in lib/config/backing.ts.`,
      );
  }
}
