/**
 * Rate limiting (Sprint 6 alpha-gate item).
 *
 * In-memory token-bucket per (route-class, key). Cloud Run runs
 * multiple instances behind a load balancer, so this is per-instance
 * — the point defence is coarse-grained abuse (mash-refresh, hostile
 * script) rather than distributed low-rate scraping. A durable
 * (Firestore counter) tightener lands with S6 evidence work if the
 * per-instance ceiling proves insufficient.
 *
 * Classes:
 *   - `read`     100 req / 60s / key     — dashboard/records browsing
 *   - `mutate`    20 req / 60s / key     — activation, prefs, disclosures
 *   - `stream`     3 conns / 60s / key   — new SSE connects (established
 *                                            connections don't count)
 *   - `signup`    10 req / 60s / key     — F-track intake, high spam risk
 *   - `claim`      5 req / 60s / key     — game handoff, high replay risk
 *
 * `key` composition:
 *   - Session-bound routes → session id (auth cookie hash)
 *   - Public routes        → hashed IP (IP_HASH_SECRET, S1)
 *
 * Never key on unhashed IP or raw session token — that would land
 * PII in the rate-limiter's memory. The hash is one-way; a leak
 * discloses nothing beyond "which bucket am I in".
 */
import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export type RateLimitClass = "read" | "mutate" | "stream" | "signup" | "claim";

interface Bucket {
  tokens: number;
  refilledAt: number;
}

interface ClassPolicy {
  capacity: number;
  refillPerMs: number;
}

// 60_000ms window ÷ capacity gives a smooth per-request refill.
const POLICIES: Record<RateLimitClass, ClassPolicy> = {
  read: { capacity: 100, refillPerMs: 100 / 60_000 },
  mutate: { capacity: 20, refillPerMs: 20 / 60_000 },
  stream: { capacity: 3, refillPerMs: 3 / 60_000 },
  signup: { capacity: 10, refillPerMs: 10 / 60_000 },
  claim: { capacity: 5, refillPerMs: 5 / 60_000 },
};

const buckets = new Map<string, Bucket>();

// LRU-ish eviction cap so a spraying attacker cannot force the map
// to consume unbounded memory. When we exceed CAP, drop the oldest-
// refilled entries (they were quiet and are near-full anyway).
const BUCKET_CAP = 100_000;

function evictIfNeeded(): void {
  if (buckets.size < BUCKET_CAP) return;
  const entries = [...buckets.entries()].sort(
    (a, b) => a[1].refilledAt - b[1].refilledAt,
  );
  const drop = Math.ceil(BUCKET_CAP * 0.1); // evict 10% at a time
  for (let i = 0; i < drop; i++) {
    const entry = entries[i];
    if (entry) buckets.delete(entry[0]);
  }
}

function bucketFor(compositeKey: string, policy: ClassPolicy): Bucket {
  let b = buckets.get(compositeKey);
  const now = Date.now();
  if (!b) {
    b = { tokens: policy.capacity, refilledAt: now };
    evictIfNeeded();
    buckets.set(compositeKey, b);
    return b;
  }
  // Refill by elapsed time; cap at capacity.
  const elapsed = now - b.refilledAt;
  const refill = elapsed * policy.refillPerMs;
  b.tokens = Math.min(policy.capacity, b.tokens + refill);
  b.refilledAt = now;
  return b;
}

/**
 * True if a request from `key` in `cls` is admitted; false if it
 * must be rejected with 429. Consumes one token on admission.
 */
export function admit(cls: RateLimitClass, key: string): boolean {
  const policy = POLICIES[cls];
  const composite = `${cls}::${key}`;
  const b = bucketFor(composite, policy);
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

/**
 * Snapshot the remaining tokens for observability / test assertions.
 * Does NOT consume a token.
 */
export function remaining(cls: RateLimitClass, key: string): number {
  const policy = POLICIES[cls];
  const composite = `${cls}::${key}`;
  const b = bucketFor(composite, policy);
  return Math.floor(b.tokens);
}

/**
 * Test hook — do not export from a barrel.
 */
export function __resetForTests(): void {
  buckets.clear();
}

// ─── Key derivation ─────────────────────────────────────────────────────────

/**
 * Hash the client's IP with `IP_HASH_SECRET`. Falls back to the
 * inbound `x-forwarded-for` chain's first entry, then to a fixed
 * bucket when no address is discoverable (so an anonymous surge
 * still gets a shared ceiling rather than infinite headroom).
 */
export function ipKey(req: NextRequest): string {
  const secret = process.env["IP_HASH_SECRET"] ?? "dev-hash-secret";
  const xff = req.headers.get("x-forwarded-for");
  const ip = xff?.split(",")[0]?.trim() ?? "unknown";
  return createHmac("sha256", secret).update(ip).digest("hex").slice(0, 16);
}

/**
 * Hash the session cookie value into a stable, non-reversible bucket
 * key. If no session, delegates to the IP bucket so unauthenticated
 * mutations still ceiling'd.
 */
export function sessionKey(req: NextRequest): string {
  const secret = process.env["IP_HASH_SECRET"] ?? "dev-hash-secret";
  const cookie = req.cookies.get("us_session_v1")?.value;
  if (!cookie) return `anon:${ipKey(req)}`;
  return `sess:${createHmac("sha256", secret).update(cookie).digest("hex").slice(0, 16)}`;
}

/**
 * Enforce a rate-limit class against a request. Returns null on
 * admission; a 429 NextResponse on rejection. Callers thread this
 * before the mutating body.
 */
export function enforceRateLimit(
  req: NextRequest,
  cls: RateLimitClass,
  key: string,
): NextResponse | null {
  if (admit(cls, key)) return null;
  const policy = POLICIES[cls];
  return NextResponse.json(
    {
      error: {
        code: "rate_limited",
        message: `Rate limit exceeded for ${cls} class`,
        capacity: policy.capacity,
        windowSeconds: 60,
      },
    },
    {
      status: 429,
      headers: {
        "retry-after": "60",
      },
    },
  );
}
