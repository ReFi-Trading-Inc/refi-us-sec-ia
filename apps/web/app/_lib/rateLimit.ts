// Sliding-window in-memory rate limiter. Suitable for single-instance Cloud Run
// (min_instances=1). Not distributed — does not coordinate across replicas.
// For distributed rate limiting, replace the Map store with Redis or Cloud Spanner.

type LimiterOpts = { windowMs: number; max: number };

export function createRateLimiter(opts: LimiterOpts) {
  const store = new Map<string, number[]>();

  return function check(key: string): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const windowStart = now - opts.windowMs;

    const hits = (store.get(key) ?? []).filter((t) => t > windowStart);
    hits.push(now);
    store.set(key, hits);

    const remaining = Math.max(0, opts.max - hits.length);
    return { allowed: hits.length <= opts.max, remaining };
  };
}
