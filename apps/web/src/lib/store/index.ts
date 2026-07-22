/**
 * Storage-driver factory.
 *
 * Callers ask for a store by (entityId, collectionName); the factory reads
 * backingFor(entityId) and returns the matching driver. This is the seam that
 * lets a single entity flip prototype→durable via REFI_BACKING__<ENTITY>
 * without a code change.
 *
 * `entityId` is the identifier in ENTITY_MATRIX (lib/config/backing.ts).
 * `collectionName` is the storage-level name (folder in prototype-store,
 * collection in Firestore) — kept explicit so a cutover to durable does not
 * force renaming existing prototype-store folders.
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
  return backingFor(entityId) === "durable"
    ? durableKvStore<T>(collectionName)
    : prototypeKvStore<T>(collectionName);
}

export function resolveAppendOnlyStore<T>(
  entityId: EntityId,
  collectionName: string,
): AppendOnlyStore<T> {
  return backingFor(entityId) === "durable"
    ? durableAppendOnlyStore<T>(collectionName)
    : prototypeAppendOnlyStore<T>(collectionName);
}
