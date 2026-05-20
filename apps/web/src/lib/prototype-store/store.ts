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
import { join, resolve } from "node:path";

function rootDir(): string {
  const fromEnv = process.env["REFI_PROTOTYPE_STORE_DIR"];
  if (fromEnv) return resolve(fromEnv);
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
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
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
}

export function kvStore<T>(name: string): KVStore<T> {
  const dir = join(rootDir(), safeKey(name));

  async function pathFor(key: string): Promise<string> {
    await ensureDir(dir);
    return join(dir, `${safeKey(key)}.json`);
  }

  return {
    async get(key) {
      try {
        const buf = await fs.readFile(await pathFor(key), "utf8");
        return JSON.parse(buf) as T;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
    async put(key, value) {
      await atomicWrite(await pathFor(key), JSON.stringify(value, null, 2));
    },
    async putIfAbsent(key, value) {
      const p = await pathFor(key);
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
        await fs.unlink(await pathFor(key));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
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
