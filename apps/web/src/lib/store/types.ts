/**
 * Storage interfaces shared by every backing driver.
 *
 * A driver is a concrete implementation of these interfaces — filesystem
 * (prototype-store) or Cloud Firestore (durable-store). Callers depend on this
 * module (via the resolver in ./index.ts), never on a driver directly, so the
 * REFI_BACKING__<ENTITY> config can flip a single entity between drivers
 * without touching call sites.
 *
 * The interfaces are intentionally minimal (get/put/list/delete for KV;
 * append/list for the event log). Anything beyond this must land on the
 * interface first, be implemented by every driver, and stay uniform — a
 * driver-specific escape hatch would defeat the whole point of the seam.
 */

export interface KVStore<T> {
  get(key: string): Promise<T | null>;
  put(key: string, value: T): Promise<void>;
  /**
   * Insert only if the key is absent. Returns true if written, false if a
   * value already existed. This is the atomic idempotency/replay primitive
   * (consumed-jti dedupe, activation idempotency). The durable driver backs
   * it with a real compare-and-set (Firestore `create()`), so unlike the
   * prototype driver it is safe across concurrent processes.
   */
  putIfAbsent(key: string, value: T): Promise<boolean>;
  list(filterPrefix?: string): Promise<Array<{ key: string; value: T }>>;
  delete(key: string): Promise<void>;
}

export interface AppendOnlyStore<T> {
  append(event: T): Promise<void>;
  list(filter?: (event: T) => boolean): Promise<T[]>;
}
