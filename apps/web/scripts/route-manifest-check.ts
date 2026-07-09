/**
 * Route manifest gate (S4b).
 *
 * Walks apps/web/app/api/ for every `route.ts(x)` and compares against
 * `apps/web/route-manifest.json`. Fails if:
 *  - a route file exists on disk but is not in the manifest, or
 *  - a manifest entry does not exist on disk, or
 *  - the manifest is malformed.
 *
 * This is deny-by-default construction, not blocklist scanning. Adding a
 * new route requires an explicit manifest entry in the same PR — so a
 * merged proxy route can never sneak past the review that would have
 * verified its ACL / redaction posture.
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..");
const API_ROOT = join(APP_ROOT, "app", "api");
const MANIFEST_PATH = join(APP_ROOT, "route-manifest.json");

interface ManifestEntry {
  path: string;
  purpose: string;
  auth: "public" | "investor" | "internal";
  owner: string;
}
interface Manifest {
  description: string;
  routes: ManifestEntry[];
}

async function walkRoutes(dir: string): Promise<string[]> {
  const found: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await walkRoutes(full)));
    } else if (entry.isFile() && /^route\.tsx?$/.test(entry.name)) {
      found.push(relative(APP_ROOT, full).split("\\").join("/"));
    }
  }
  return found;
}

async function main(): Promise<void> {
  const raw = await readFile(MANIFEST_PATH, "utf8");
  let manifest: Manifest;
  try {
    manifest = JSON.parse(raw) as Manifest;
  } catch (err) {
    fail(`route-manifest.json is not valid JSON: ${(err as Error).message}`);
  }
  if (!Array.isArray(manifest.routes)) {
    fail("route-manifest.json missing `routes` array");
  }

  const declared = new Set(manifest.routes.map((r) => r.path));
  const onDisk = new Set(await walkRoutes(API_ROOT));

  const missingFromManifest = [...onDisk].filter((p) => !declared.has(p));
  const missingFromDisk = [...declared].filter((p) => !onDisk.has(p));
  const stale: string[] = [];
  for (const entry of manifest.routes) {
    const full = join(APP_ROOT, entry.path);
    try {
      await stat(full);
    } catch {
      stale.push(entry.path);
    }
  }
  // Guard against structural malformation.
  const badShape = manifest.routes.filter(
    (r) =>
      typeof r.path !== "string" ||
      typeof r.purpose !== "string" ||
      typeof r.auth !== "string" ||
      typeof r.owner !== "string",
  );

  const problems: string[] = [];
  if (missingFromManifest.length > 0) {
    problems.push(
      `Routes on disk but not in route-manifest.json (add explicit entries):\n${missingFromManifest.map((p) => `  - ${p}`).join("\n")}`,
    );
  }
  if (missingFromDisk.length > 0) {
    problems.push(
      `Manifest entries with no route file on disk (remove or fix path):\n${missingFromDisk.map((p) => `  - ${p}`).join("\n")}`,
    );
  }
  // `stale` is redundant with missingFromDisk when the disk walk is clean;
  // keeping it in as a defence in depth against filesystem-case oddities.
  const staleOnly = stale.filter((p) => !missingFromDisk.includes(p));
  if (staleOnly.length > 0) {
    problems.push(
      `Manifest entries that could not be stat'd:\n${staleOnly.map((p) => `  - ${p}`).join("\n")}`,
    );
  }
  if (badShape.length > 0) {
    problems.push(
      `Manifest entries with missing required fields (path, purpose, auth, owner): ${String(badShape.length)}`,
    );
  }

  if (problems.length > 0) {
    fail(problems.join("\n\n"));
  }

  console.log(
    `route-manifest-check: OK (${String(manifest.routes.length)} routes allowlisted)`,
  );
}

function fail(msg: string): never {
  console.error(`\nroute-manifest-check FAILED:\n\n${msg}\n`);
  process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
