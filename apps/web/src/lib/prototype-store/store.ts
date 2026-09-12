/**
 * Filesystem-backed prototype store.
 *
 * **This is NOT a compliance system of record.** See
 * docs/bff-prototype-state-contract.md. The prototype store exists so the
 * investor product is testable end-to-end while upstream backend tables (G-003,
 * G-005, G-006, G-007) are absent. When backend lands, every entity migrates
 * per the dual-read plan in the contract doc.
 *
 * Backing: JSON files under `<repo>/apps/web/.refi-prototype-store/` (gitignored).
 * Override via `REFI_PROTOTYPE_STORE_DIR` env var.
 *
 * Concurrency: writes go to a temp file then atomic rename. This is sufficient
 * for single-process Next.js dev mode. Multi-process deployments must override
 * this implementation with a real KV.
 */
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function rootDir(): string {
  const fromEnv = process.env["REFI_PROTOTYPE_STORE_DIR"];
  if (fromEnv) return resolve(fromEnv);
  // Serverless (Vercel) bundles are read-only except the OS temp dir. Without
  // an explicit override every mutation would fail with ENOENT/EROFS on
  // `mkdir /var/task/apps/web/.refi-prototype-store` (demo KYC start, 2026-09-08).
  // The temp dir is per-instance and ephemeral — acceptable only for the
  // prototype tiers; a durable backing is the real fix (docs/alpha-go-live-checklist.md).
  if (process.env["VERCEL"] === "1")
    return join(tmpdir(), "refi-prototype-store");
  // process.cwd() in Next.js dev is apps/web by default; in tests it's the
  // repo root. Resolve relative to a stable anchor (the apps/web dir).
  const cwd = process.cwd();
  if (cwd.endsWith("apps/web")) return join(cwd, ".refi-prototype-store");
  return join(cwd, "apps/web/.refi-prototype-store");
}

/** Sanitize a key segment to filesystem-safe form (no traversal, no special chars). */
function safeKey(key: string): string {
  const cleaned = key.replace(/[^A-Za-z0-9._-]/g, "_");
  if (cleaned.length === 0 || cleaned.startsWith(".")) {
    throw new Error(`Invalid store key: ${key}`);
  }
  return cleaned;
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function atomicWrite(path: string, body: string): Promise<void> {
  const tmp = `${path}.tmp-${String(process.pid)}-${String(Date.now())}`;
  await fs.writeFile(tmp, body, "utf8");
  await fs.rename(tmp, path);
}

// ─── KV store (mutable + put-if-absent) ──────────────────────────────────────

export interface KVStore<T> {
  get(key: string): Promise<T | null>;
  put(key: string, value: T): Promise<void>;
  putIfAbsent(key: string, value: T): Promise<boolean>;
  list(filterPrefix?: string): Promise<Array<{ key: string; value: T }>>;
  delete(key: string): Promise<void>;
  update(
    key: string,
    decide: (current: T | null) => T | null,
  ): Promise<{ value: T | null; written: boolean }>;
}

// Per-key exclusive lock for `update`: an O_EXCL lock file that any process
// on the same filesystem must acquire, plus an in-process promise chain so
// concurrent callers in one process never even race for the file. A lock
// older than LOCK_STALE_MS is treated as abandoned (crashed holder).
const LOCK_STALE_MS = 10_000;
const LOCK_RETRY_MS = 5;
const inProcessChains = new Map<string, Promise<unknown>>();

async function withKeyLock<R>(
  lockPath: string,
  fn: () => Promise<R>,
): Promise<R> {
  const prev = inProcessChains.get(lockPath) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => {
    release = r;
  });
  inProcessChains.set(
    lockPath,
    prev.then(() => mine),
  );
  await prev;
  try {
    const deadline = Date.now() + LOCK_STALE_MS * 2;
    for (;;) {
      try {
        const h = await fs.open(lockPath, "wx");
        await h.writeFile(String(process.pid));
        await h.close();
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
        try {
          const st = await fs.stat(lockPath);
          if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
            await fs.unlink(lockPath).catch(() => undefined);
            continue;
          }
        } catch {
          continue;
        }
        if (Date.now() > deadline)
          throw new Error(`kv lock timeout: ${lockPath}`);
        await new Promise((r) => setTimeout(r, LOCK_RETRY_MS));
      }
    }
    try {
      return await fn();
    } finally {
      await fs.unlink(lockPath).catch(() => undefined);
    }
  } finally {
    release();
    if (inProcessChains.get(lockPath) === prev.then(() => mine))
      inProcessChains.delete(lockPath);
  }
}

export function kvStore<T>(name: string): KVStore<T> {
  const dir = join(rootDir(), safeKey(name));

  function pathFor(key: string): string {
    return join(dir, `${safeKey(key)}.json`);
  }
  async function writablePathFor(key: string): Promise<string> {
    await ensureDir(dir);
    return pathFor(key);
  }

  return {
    async get(key) {
      try {
        const buf = await fs.readFile(pathFor(key), "utf8");
        return JSON.parse(buf) as T;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
    async put(key, value) {
      await atomicWrite(
        await writablePathFor(key),
        JSON.stringify(value, null, 2),
      );
    },
    async putIfAbsent(key, value) {
      const p = await writablePathFor(key);
      try {
        await fs.access(p);
        return false;
      } catch {
        await atomicWrite(p, JSON.stringify(value, null, 2));
        return true;
      }
    },
    async list(filterPrefix) {
      try {
        const entries = await fs.readdir(dir);
        const out: Array<{ key: string; value: T }> = [];
        for (const entry of entries) {
          if (!entry.endsWith(".json")) continue;
          const key = entry.slice(0, -5);
          if (filterPrefix && !key.startsWith(filterPrefix)) continue;
          const buf = await fs.readFile(join(dir, entry), "utf8");
          out.push({ key, value: JSON.parse(buf) as T });
        }
        return out;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw err;
      }
    },
    async delete(key) {
      try {
        await fs.unlink(pathFor(key));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
    },
    async update(key, decide) {
      const p = await writablePathFor(key);
      return withKeyLock(`${p}.lock`, async () => {
        let current: T | null = null;
        try {
          current = JSON.parse(await fs.readFile(p, "utf8")) as T;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
        }
        const next = decide(current);
        if (next === null) return { value: current, written: false };
        await atomicWrite(p, JSON.stringify(next, null, 2));
        return { value: next, written: true };
      });
    },
  };
}

// ─── Append-only event log ───────────────────────────────────────────────────

export interface AppendOnlyStore<T> {
  append(event: T): Promise<void>;
  list(filter?: (event: T) => boolean): Promise<T[]>;
}

export function appendOnlyStore<T>(name: string): AppendOnlyStore<T> {
  const file = join(rootDir(), `${safeKey(name)}.jsonl`);

  return {
    async append(event) {
      await ensureDir(rootDir());
      await fs.appendFile(file, JSON.stringify(event) + "\n", "utf8");
    },
    async list(filter) {
      try {
        const buf = await fs.readFile(file, "utf8");
        const events: T[] = [];
        for (const line of buf.split("\n")) {
          if (!line) continue;
          const ev = JSON.parse(line) as T;
          if (!filter || filter(ev)) events.push(ev);
        }
        return events;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw err;
      }
    },
  };
}

/** Common metadata embedded in every prototype entity. */
export interface PrototypeMeta {
  createdAt: string;
  correlationId: string;
  source: "prototype-bff";
}

export function makePrototypeMeta(correlationId: string): PrototypeMeta {
  return {
    createdAt: new Date().toISOString(),
    correlationId,
    source: "prototype-bff",
  };
}
