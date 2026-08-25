#!/usr/bin/env tsx
/**
 * CM-04 — deny-by-default API route manifest gate.
 *
 * The deployed application may not acquire a new API route, or a new HTTP
 * method on an existing route, without an explicit reviewed change to
 * compliance/API_ROUTE_MANIFEST.json. This gate independently discovers every
 * apps/web/app/api/​**​/route.ts from disk (never from the manifest), extracts
 * the actually-exported HTTP methods with the TypeScript compiler API, and
 * fails CI on any drift in either direction — unlisted route, ghost entry,
 * route-path mismatch, method added in code, method claimed but not exported,
 * duplicate entries, or malformed/unknown metadata.
 *
 * SCOPE OF PROOF: inventory completeness and reviewed route/method expansion
 * ONLY. A green run does not prove any route's authorization behaviour is
 * correct — the manifest's auth field records the measured mechanism, and the
 * auth-specific controls (AC-*, CS-*, IB-* in compliance/CONTROL_MATRIX.md)
 * prove behaviour.
 *
 * Self-proving, in the tripwire pattern: the reconciliation logic demonstrates
 * on synthetic inventories that it catches each failure class BEFORE it is
 * trusted to police the real tree. Self-tests never touch the worktree.
 *
 * Run: pnpm route-manifest
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), "..");
const API_ROOT = join(REPO_ROOT, "apps/web/app/api");
const MANIFEST_PATH = join(REPO_ROOT, "compliance/API_ROUTE_MANIFEST.json");

const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];
const HTTP_METHOD_SET: ReadonlySet<string> = new Set(HTTP_METHODS);

interface DiscoveredRoute {
  source: string; // repo-relative, forward slashes
  route: string; // canonical /api/... path, dynamic segments kept as [seg]
  methods: string[]; // sorted
}

interface ManifestEntry {
  source: string;
  route: string;
  methods: string[];
  purpose: string;
  owner: string;
  auth: Record<string, string>;
}

interface Manifest {
  description: string;
  auth_vocabulary: Record<string, string>;
  owner_vocabulary: Record<string, string>;
  routes: ManifestEntry[];
}

// ─── Discovery (filesystem + TypeScript AST; never the manifest) ────────────

function walkRouteFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkRouteFiles(full, out);
    else if (entry === "route.ts" || entry === "route.tsx") out.push(full);
  }
  return out;
}

/** Extract the HTTP methods a route file actually exports. */
export function exportedHttpMethods(
  fileText: string,
  fileName: string,
): string[] {
  const sf = ts.createSourceFile(
    fileName,
    fileText,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
  );
  const methods = new Set<string>();
  const isExported = (node: ts.HasModifiers): boolean =>
    (ts.getModifiers(node) ?? []).some(
      (m) => m.kind === ts.SyntaxKind.ExportKeyword,
    );
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && isExported(stmt)) {
      if (HTTP_METHOD_SET.has(stmt.name.text)) methods.add(stmt.name.text);
    } else if (ts.isVariableStatement(stmt) && isExported(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && HTTP_METHOD_SET.has(decl.name.text)) {
          methods.add(decl.name.text);
        }
      }
    } else if (ts.isExportDeclaration(stmt) && stmt.exportClause) {
      if (ts.isNamedExports(stmt.exportClause)) {
        for (const el of stmt.exportClause.elements) {
          if (HTTP_METHOD_SET.has(el.name.text)) methods.add(el.name.text);
        }
      }
    }
  }
  return [...methods].sort();
}

function routeFromSource(repoRelSource: string): string {
  // apps/web/app/api/foo/[id]/route.ts -> /api/foo/[id]
  const posix = repoRelSource.split(sep).join("/");
  const m = /^apps\/web\/app(\/api\/.*)\/route\.tsx?$/.exec(posix);
  if (!m || !m[1]) return `<unparseable:${posix}>`;
  return m[1];
}

function discoverRoutes(): DiscoveredRoute[] {
  return walkRouteFiles(API_ROOT)
    .map((abs) => {
      const source = relative(REPO_ROOT, abs).split(sep).join("/");
      return {
        source,
        route: routeFromSource(source),
        methods: exportedHttpMethods(readFileSync(abs, "utf8"), abs),
      };
    })
    .sort((a, b) => a.route.localeCompare(b.route));
}

// ─── Reconciliation (pure; unit-testable with synthetic inventories) ────────

export function reconcile(
  discovered: ReadonlyArray<DiscoveredRoute>,
  manifest: Manifest,
): string[] {
  const errors: string[] = [];
  const authVocab = new Set(Object.keys(manifest.auth_vocabulary ?? {}));
  const ownerVocab = new Set(Object.keys(manifest.owner_vocabulary ?? {}));
  const entries = manifest.routes ?? [];

  // Manifest-internal validity.
  const bySource = new Map<string, ManifestEntry>();
  const byRoute = new Map<string, ManifestEntry>();
  let prevRoute = "";
  for (const e of entries) {
    if (bySource.has(e.source))
      errors.push(`duplicate manifest source: ${e.source}`);
    if (byRoute.has(e.route))
      errors.push(`duplicate manifest route: ${e.route}`);
    bySource.set(e.source, e);
    byRoute.set(e.route, e);

    if (!/^\/api\/[A-Za-z0-9[\]/_-]+$/.test(e.route) && e.route !== "/api") {
      errors.push(`malformed route path: ${e.route}`);
    }
    if (routeFromSource(e.source) !== e.route) {
      errors.push(
        `route/source mismatch: ${e.source} derives ${routeFromSource(e.source)} but manifest says ${e.route}`,
      );
    }
    if (!e.purpose || !e.purpose.trim()) {
      errors.push(`empty purpose: ${e.route}`);
    }
    if (!ownerVocab.has(e.owner)) {
      errors.push(
        `unknown owner "${e.owner}" on ${e.route} (not in owner_vocabulary)`,
      );
    }
    const sortedMethods = [...e.methods].sort();
    if (JSON.stringify(e.methods) !== JSON.stringify(sortedMethods)) {
      errors.push(
        `methods not deterministically sorted on ${e.route}: [${e.methods.join(", ")}]`,
      );
    }
    for (const m of e.methods) {
      if (!HTTP_METHOD_SET.has(m))
        errors.push(`unknown HTTP method "${m}" on ${e.route}`);
    }
    const authKeys = Object.keys(e.auth ?? {}).sort();
    if (JSON.stringify(authKeys) !== JSON.stringify(sortedMethods)) {
      errors.push(
        `auth map keys [${authKeys.join(", ")}] do not match methods [${sortedMethods.join(", ")}] on ${e.route}`,
      );
    }
    for (const [m, cls] of Object.entries(e.auth ?? {})) {
      if (!authVocab.has(cls)) {
        errors.push(
          `unknown auth classification "${cls}" for ${m} ${e.route} (not in auth_vocabulary)`,
        );
      }
    }
    if (prevRoute && e.route.localeCompare(prevRoute) <= 0) {
      errors.push(
        `manifest not deterministically ordered by route: ${e.route} after ${prevRoute}`,
      );
    }
    prevRoute = e.route;
  }

  // Discovery vs manifest.
  const discoveredBySource = new Map(discovered.map((d) => [d.source, d]));
  for (const d of discovered) {
    const e = bySource.get(d.source);
    if (!e) {
      errors.push(
        `UNLISTED ROUTE: ${d.source} (${d.route}, methods [${d.methods.join(", ")}]) has no manifest entry — a new API surface requires a reviewed manifest change`,
      );
      continue;
    }
    if (e.route !== d.route) {
      errors.push(
        `route mismatch for ${d.source}: discovered ${d.route}, manifest ${e.route}`,
      );
    }
    const manifestMethods = [...e.methods].sort();
    for (const m of d.methods) {
      if (!manifestMethods.includes(m)) {
        errors.push(
          `METHOD ADDED IN CODE: ${m} ${d.route} is exported by ${d.source} but absent from the manifest — method expansion requires a reviewed manifest change`,
        );
      }
    }
    for (const m of manifestMethods) {
      if (!d.methods.includes(m)) {
        errors.push(
          `stale manifest method: ${m} ${d.route} is listed but ${d.source} does not export it`,
        );
      }
    }
  }
  for (const e of entries) {
    if (!discoveredBySource.has(e.source)) {
      errors.push(
        `GHOST ENTRY: manifest lists ${e.source} (${e.route}) but no such route file exists`,
      );
    }
  }
  return errors;
}

// ─── Self-tests (synthetic inventories; never touch the worktree) ───────────

function selfTest(): string[] {
  const failures: string[] = [];
  const vocabManifest = {
    description: "t",
    auth_vocabulary: { "bff-read": "d", "bff-mutate": "d" },
    owner_vocabulary: { "investor-bff": "d" },
  };
  const entry = (over: Partial<ManifestEntry> = {}): ManifestEntry => ({
    source: "apps/web/app/api/v1/investor/thing/route.ts",
    route: "/api/v1/investor/thing",
    methods: ["GET"],
    purpose: "Test route.",
    owner: "investor-bff",
    auth: { GET: "bff-read" },
    ...over,
  });
  const disc = (over: Partial<DiscoveredRoute> = {}): DiscoveredRoute => ({
    source: "apps/web/app/api/v1/investor/thing/route.ts",
    route: "/api/v1/investor/thing",
    methods: ["GET"],
    ...over,
  });
  const run = (
    name: string,
    discovered: DiscoveredRoute[],
    routes: ManifestEntry[],
    wantClean: boolean,
    wantFragment?: string,
  ) => {
    const errs = reconcile(discovered, { ...vocabManifest, routes });
    if (wantClean && errs.length > 0) {
      failures.push(`${name}: expected clean, got: ${errs.join(" | ")}`);
    }
    if (!wantClean && errs.length === 0) {
      failures.push(`${name}: expected failure, gate reported clean`);
    }
    if (wantFragment && !errs.some((e) => e.includes(wantFragment))) {
      failures.push(
        `${name}: expected an error containing "${wantFragment}", got: ${errs.join(" | ") || "(none)"}`,
      );
    }
  };

  // 1. A matching inventory passes.
  run("matched-pair", [disc()], [entry()], true);
  // 2. A discovered route with no manifest entry fails.
  run(
    "unlisted-route",
    [
      disc(),
      disc({ source: "apps/web/app/api/rogue/route.ts", route: "/api/rogue" }),
    ],
    [entry()],
    false,
    "UNLISTED ROUTE",
  );
  // 3. A method added in code fails.
  run(
    "method-expansion",
    [disc({ methods: ["GET", "POST"] })],
    [entry()],
    false,
    "METHOD ADDED IN CODE",
  );
  // 4. A manifest-only ghost route fails.
  run("ghost-entry", [], [entry()], false, "GHOST ENTRY");
  // 5. Duplicate manifest routes fail.
  run(
    "duplicate-route",
    [disc()],
    [entry(), entry()],
    false,
    "duplicate manifest",
  );
  // 6. Unknown auth classification fails.
  run(
    "unknown-auth",
    [disc()],
    [entry({ auth: { GET: "made-up-class" } })],
    false,
    "unknown auth classification",
  );
  // 6b. Stale manifest method fails.
  run(
    "stale-method",
    [disc()],
    [
      entry({
        methods: ["GET", "POST"],
        auth: { GET: "bff-read", POST: "bff-mutate" },
      }),
    ],
    false,
    "stale manifest method",
  );
  // AST extraction proves itself on every export form used in the repo.
  const astCases: Array<[string, string[]]> = [
    ["export function GET() {}", ["GET"]],
    ["export async function POST(req: Request) {}", ["POST"]],
    ["export const GET = bffRead({});", ["GET"]],
    ["export const POST = bffMutate<X>({});", ["POST"]],
    ["const GET = () => {}; export { GET };", ["GET"]],
    ["export const revalidate = 0; export function GET() {}", ["GET"]],
    ["function helper() {} export async function DELETE() {}", ["DELETE"]],
  ];
  for (const [src, want] of astCases) {
    const got = exportedHttpMethods(src, "self-test.ts");
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      failures.push(
        `AST extraction: "${src}" -> [${got.join(", ")}], expected [${want.join(", ")}]`,
      );
    }
  }
  return failures;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main(): number {
  const selfTestFailures = selfTest();
  if (selfTestFailures.length > 0) {
    console.error(
      `\nroute-manifest: SELF-TEST FAILED (${selfTestFailures.length}) — the gate does not enforce what it claims.\n`,
    );
    for (const f of selfTestFailures) console.error(`    ${f}`);
    console.error("");
    return 1;
  }

  let manifest: Manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
  } catch (err) {
    console.error(
      `route-manifest: cannot read/parse ${relative(REPO_ROOT, MANIFEST_PATH)}: ${String(err)}`,
    );
    return 1;
  }

  const discovered = discoverRoutes();
  const errors = reconcile(discovered, manifest);

  if (errors.length === 0) {
    const methodCount = discovered.reduce((n, d) => n + d.methods.length, 0);
    console.log(
      `route-manifest: ${discovered.length} routes / ${methodCount} exported methods reconciled against compliance/API_ROUTE_MANIFEST.json (self-tests passed).`,
    );
    return 0;
  }

  console.error(
    `\nroute-manifest: ${errors.length} violation(s) — the API surface and compliance/API_ROUTE_MANIFEST.json disagree. CI will fail.\n`,
  );
  for (const e of errors) console.error(`    ${e}`);
  console.error(
    `\nA new route or HTTP method is a reviewed change: update compliance/API_ROUTE_MANIFEST.json in the same PR,\n` +
      `with purpose, owner, and measured auth classification. See compliance/CONTROL_MATRIX.md CM-04.\n`,
  );
  return 1;
}

process.exit(main());
