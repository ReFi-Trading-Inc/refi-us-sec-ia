/**
 * The Investor API client is a BFF-only module. This test is the tripwire:
 * nothing that ships to a browser may import it, and nothing at runtime may
 * read `connection.dev.json` (documentation only — it must never seed URLs).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..", "..");
const WEB = join(REPO, "apps", "web");
const PKG_SRC = join(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "generated")
      continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mts|cts|js|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

const INVESTOR_API_IMPORT =
  /from\s+["'](@refi\/api-clients\/investor-api|@api\/investor-api[^"']*|@lib\/investor-api\/(routes|user-assertion)[^"']*|\.{1,2}\/investor-api\/[^"']*)["']/;

function isServerFile(rel: string): boolean {
  const parts = rel.split(sep);
  return (
    rel.endsWith(`${sep}route.ts`) ||
    parts.includes("api") ||
    (parts[0] === "src" && parts[1] === "lib") ||
    parts[0] === "e2e" ||
    parts.includes("__tests__") ||
    rel.startsWith(`app${sep}.well-known`) ||
    rel === "proxy.ts" ||
    rel === "middleware.ts"
  );
}

describe("Investor API client stays behind the BFF boundary", () => {
  it("no browser-facing file in apps/web imports the investor-api modules", () => {
    const offenders: string[] = [];
    for (const file of walk(join(WEB, "app")).concat(walk(join(WEB, "src")))) {
      const rel = relative(WEB, file);
      const text = readFileSync(file, "utf8");
      if (!INVESTOR_API_IMPORT.test(text)) continue;
      const isClient = /^\s*["']use client["']/m.test(text);
      if (isClient || !isServerFile(rel)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it("the package's browser surface (src/index.ts, hooks, mocks) does not re-export investor-api", () => {
    const browserFiles = [
      join(PKG_SRC, "index.ts"),
      ...walk(join(PKG_SRC, "hooks")),
      ...walk(join(PKG_SRC, "mocks")),
      join(PKG_SRC, "client.ts"),
      join(PKG_SRC, "compat.ts"),
    ];
    for (const file of browserFiles) {
      expect(readFileSync(file, "utf8"), relative(PKG_SRC, file)).not.toMatch(
        /investor-api/,
      );
    }
  });

  it("no runtime module reads connection.dev.json, capabilities.json, or the README", () => {
    for (const file of walk(join(PKG_SRC, "investor-api"))) {
      const text = readFileSync(file, "utf8");
      expect(text, relative(PKG_SRC, file)).not.toMatch(
        /connection\.dev\.json|capabilities\.json|README\.md/,
      );
    }
  });

  it("no runtime module names a provisioned Cloud Run or refi.internal host", () => {
    for (const file of walk(join(PKG_SRC, "investor-api"))) {
      const text = readFileSync(file, "utf8");
      expect(text, relative(PKG_SRC, file)).not.toMatch(
        /\.run\.app|refi\.internal|bff-dev\.refi\.trading/,
      );
    }
  });
});
