/**
 * Storage interfaces shared by every backing driver.
 *
 * A driver is a concrete implementation of these interfaces — filesystem
 * (prototype-store), Firestore (durable-store), or a future SQL backend.
 * Callers depend on this module, never on a driver directly, so the
 * REFI_BACKING__<ENTITY> config can flip a single entity between drivers
 * without touching call sites.
 *
 * The interfaces are intentionally minimal (get/put/list/delete for KV;
 * append/list for the event log). Anything beyond this must land on the
 * interface first, be implemented by every driver, and stay uniform —
 * driver-specific escape hatches would defeat the whole point.
 */

export interface KVStore<T> {
  get(key: string): Promise<T | null>;
  put(key: string, value: T): Promise<void>;
  /**
   * Insert only if the key is absent. Returns true if written, false if a
   * value already existed for that key. Used for idempotency-key semantics
   * (activation-idempotency, receipt dedupe, etc.).
   */
  putIfAbsent(key: string, value: T): Promise<boolean>;
  list(filterPrefix?: string): Promise<Array<{ key: string; value: T }>>;
  delete(key: string): Promise<void>;
}

export interface AppendOnlyStore<T> {
  append(event: T): Promise<void>;
  list(filter?: (event: T) => boolean): Promise<T[]>;
}
