/**
 * Admin-portal-proxy: response cache (S4).
 *
 * Per-account, per-route LRU with TTL. Applied to GET requests only —
 * mutations always hit upstream. Cache entries carry the accountId in
 * the key so a leak into another account's cache is a structural
 * impossibility, not a "we hope the key derivation is right" one.
 *
 * Design choices:
 *   - Small map + insertion-order eviction (JS Map preserves insertion
 *     order; re-inserting on hit moves the entry to the end). This is
 *     the standard LRU idiom without a linked-list dependency.
 *   - Per-route TTL. Defaults are conservative (30s for reference data,
 *     5s for volatile projections); each endpoint module can override
 *     when it registers with cacheKeyFor / withCache.
 *   - Expired entries are lazily reaped on lookup. A running set is
 *     acceptable at the volumes this cache sees (dozens of routes,
 *     thousands of accounts at most in the alpha window).
 *
 * What this does NOT do:
 *   - No cross-instance sharing (Cloud Run is multi-instance; the
 *     upstream cache Sprint 2 lands with is the durable answer).
 *   - No stale-while-revalidate. Simplicity first; add SWR when a
 *     specific endpoint's latency profile demands it.
 */

export interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number;
}

export interface CacheOptions {
  maxEntries: number;
  defaultTtlMs: number;
}

const DEFAULT_MAX_ENTRIES = 512;
const DEFAULT_TTL_MS = 30_000;

class LruCache<T = unknown> {
  private readonly store = new Map<string, CacheEntry<T>>();
  constructor(private readonly opts: CacheOptions) {}

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    // Refresh LRU position.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    const expiresAt = Date.now() + (ttlMs ?? this.opts.defaultTtlMs);
    this.store.delete(key);
    this.store.set(key, { value, expiresAt });
    while (this.store.size > this.opts.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  invalidatePrefix(prefix: string): number {
    let removed = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

// One cache shared across the proxy — key namespacing does the isolation.
const cache = new LruCache<unknown>({
  maxEntries: DEFAULT_MAX_ENTRIES,
  defaultTtlMs: DEFAULT_TTL_MS,
});

// ─── Key derivation ──────────────────────────────────────────────────────────

/**
 * Build a stable cache key. Account id is the FIRST segment so
 * `invalidateAccount(id)` can wipe a single account's entries via
 * prefix scan, and so a per-account key can never accidentally match
 * another account's — the leading segment gates the shape.
 */
export function proxyCacheKey(args: {
  accountId: string;
  path: string;
  method: string;
  query?: Readonly<Record<string, string | number | boolean>>;
}): string {
  const q = args.query;
  const query = q
    ? "?" +
      Object.keys(q)
        .sort()
        .map((k) => `${k}=${encodeURIComponent(String(q[k]))}`)
        .join("&")
    : "";
  return `${args.accountId}|${args.method}|${args.path}${query}`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function proxyCacheGet(key: string): unknown {
  return cache.get(key);
}

export function proxyCacheSet(
  key: string,
  value: unknown,
  ttlMs?: number,
): void {
  cache.set(key, value, ttlMs);
}

/**
 * Invalidate every cached entry belonging to a given account. Called from
 * mutating routes: a PATCH on the account's prefs must not leave a stale
 * GET response readable.
 */
export function proxyCacheInvalidateAccount(accountId: string): number {
  return cache.invalidatePrefix(`${accountId}|`);
}

/** Test hook. Not exported from the barrel. */
export function __resetProxyCacheForTests(): void {
  cache.clear();
}
