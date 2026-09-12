/**
 * Connected security-state store — US Investor Integration Foundation.
 *
 * Everything the connected BFF must remember about a real user's login and
 * session lives here: BFF session records (lookup + revocation), pending
 * Stytch logins (state / challenge / nonce / redirect, single-use), consumed
 * identity-result `jti`s (replay protection) and the opaque subject mapping
 * (provider user id → ReFi `sub`). Cloud Run is stateless: multiple
 * instances, redeploys, cold starts. None of this may depend on process
 * memory or `/tmp`, and none of it may share a collection with the demo
 * world or the prototype store.
 *
 * Backing (`REFI_CONNECTED_STORE_BACKING`):
 *   durable   — Firestore through the existing durable driver. REQUIRED on
 *               a connected deployment (env invariant in config/env.ts).
 *   prototype — the local filesystem store; local development and E2E only.
 *
 * Namespacing (`REFI_CONNECTED_STORE_NAMESPACE`): every collection is
 * `${namespace}--connected-${entity}`. The namespace is mandatory whenever the
 * store is used, must be lowercase kebab-case, and may not contain "demo",
 * "mock", "prototype" or "simulator", so a connected deployment cannot be
 * pointed at demo data by a typo, and demo/prototype collections (which have
 * no namespace prefix) are structurally unreachable from here.
 *
 * Fail closed: there is no in-memory fallback. If the backing is unreachable
 * every operation throws and the calling route answers 503; nothing degrades
 * to a local file or a process map on a connected deployment.
 */
import type { KVStore } from "../store/types";
import { durableKvStore } from "../durable-store/store";
import { kvStore as prototypeKvStore } from "../prototype-store/store";
import { getServerEnv } from "../config/env";

export const CONNECTED_ENTITIES = [
  "session",
  "login-state",
  "login-consumed",
  "identity-result-jti",
  "bridge-assertion-jti",
  "exchange-attempt",
  "subject-map",
  "subject-map-reverse",
  "development-kyc",
  "attestation-decision",
] as const;
export type ConnectedEntity = (typeof CONNECTED_ENTITIES)[number];

export const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]{2,39}$/;
export const FORBIDDEN_NAMESPACE_WORDS = [
  "demo",
  "mock",
  "prototype",
  "simulator",
] as const;

export class ConnectedStoreUnavailableError extends Error {
  constructor(reason: string) {
    super(
      `Connected security state is unavailable: ${reason}. The connected BFF ` +
        "fails closed — no in-memory or filesystem fallback is used.",
    );
    this.name = "ConnectedStoreUnavailableError";
  }
}

export function validateNamespace(ns: string | undefined): string {
  if (!ns) {
    throw new ConnectedStoreUnavailableError(
      "REFI_CONNECTED_STORE_NAMESPACE is not set",
    );
  }
  if (!NAMESPACE_PATTERN.test(ns)) {
    throw new ConnectedStoreUnavailableError(
      `REFI_CONNECTED_STORE_NAMESPACE "${ns}" must match ${NAMESPACE_PATTERN.source}`,
    );
  }
  for (const word of FORBIDDEN_NAMESPACE_WORDS) {
    if (ns.includes(word)) {
      throw new ConnectedStoreUnavailableError(
        `REFI_CONNECTED_STORE_NAMESPACE "${ns}" may not contain "${word}"`,
      );
    }
  }
  return ns;
}

export function collectionNameFor(
  namespace: string | undefined,
  entity: ConnectedEntity,
): string {
  return `${validateNamespace(namespace)}--connected-${entity}`;
}

/** Test seam: substitute the backing (e.g. a shared in-memory map) for all entities. */
type StoreFactory = <T>(collection: string) => KVStore<T>;
let factoryOverride: StoreFactory | null = null;
export function setConnectedStoreFactoryForTests(
  factory: StoreFactory | null,
): void {
  factoryOverride = factory;
}

/**
 * Resolve the KV store for one connected entity. Constructed per call (cheap;
 * the Firestore client is cached inside the durable driver) so that a config
 * change is never masked by a stale module-level singleton.
 */
export function connectedKvStore<T>(entity: ConnectedEntity): KVStore<T> {
  const env = getServerEnv();
  const collection = collectionNameFor(
    env.REFI_CONNECTED_STORE_NAMESPACE,
    entity,
  );
  if (factoryOverride) return factoryOverride<T>(collection);
  switch (env.REFI_CONNECTED_STORE_BACKING) {
    case "durable":
      return durableKvStore<T>(collection);
    case "prototype":
      if (env.REFI_INVESTOR_API_CREDENTIAL_MODE === "native-cloud-run") {
        // Defence in depth: the env schema already refuses this combination.
        throw new ConnectedStoreUnavailableError(
          "prototype backing is not permitted on a connected deployment",
        );
      }
      return prototypeKvStore<T>(collection);
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function isExpired(
  expiresAtIso: string,
  now: Date = new Date(),
): boolean {
  return new Date(expiresAtIso).getTime() <= now.getTime();
}
