/**
 * Durable-store driver (Firestore).
 *
 * Placeholder until the Firestore SDK is added and the driver is wired.
 * The abstraction ships now so callers can migrate through resolveKvStore
 * without a second pass; a follow-up commit installs @google-cloud/firestore
 * and replaces these throws with the real implementation.
 *
 * The throw path is intentional: if an operator flips
 * REFI_BACKING__<ENTITY>=durable before the driver is real, the boot fails
 * loudly with a message pointing at this file rather than silently falling
 * back to prototype (which would evaporate books-and-records state on
 * redeploy — the exact S3 failure this abstraction exists to prevent).
 */
import type { KVStore, AppendOnlyStore } from "../store/types";

const NOT_IMPL =
  "durable-store driver not yet wired. Set REFI_BACKING__<ENTITY>=prototype " +
  "or wait for the Firestore driver (S3 follow-up).";

export function durableKvStore<T>(_name: string): KVStore<T> {
  return {
    get: () => {
      throw new Error(NOT_IMPL);
    },
    put: () => {
      throw new Error(NOT_IMPL);
    },
    putIfAbsent: () => {
      throw new Error(NOT_IMPL);
    },
    list: () => {
      throw new Error(NOT_IMPL);
    },
    delete: () => {
      throw new Error(NOT_IMPL);
    },
  };
}

export function durableAppendOnlyStore<T>(_name: string): AppendOnlyStore<T> {
  return {
    append: () => {
      throw new Error(NOT_IMPL);
    },
    list: () => {
      throw new Error(NOT_IMPL);
    },
  };
}
