import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONTRACT_BUNDLE,
  CONTRACT_PACKAGE_DIR,
  CONTRACT_ROUTES,
  CONTRACT_VERSION,
  PACKAGE_CONTENT_SHA256,
  SOURCE_CONTRACT_SHA256,
} from "../investor-api/package";

const ROOT = join(__dirname, "..", "..");
const PKG = join(ROOT, CONTRACT_PACKAGE_DIR);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("vendored contract package is byte-identical to Daniel's bundle.json", () => {
  it("pins the expected version and digests", () => {
    expect(CONTRACT_VERSION).toBe("v1.1.0-alpha.4");
    expect(PACKAGE_CONTENT_SHA256).toBe(
      "a6db935b6a398bff00a7ccee4cb268ee565249bbd75c23e36594c9f6b698e7c3",
    );
    expect(SOURCE_CONTRACT_SHA256).toBe(
      "47b670f366b09280fe90c0e01d53f7d616f8d145ca823c314f9dbae060a11be3",
    );
  });

  it("every artifact hash in bundle.json matches the vendored file", () => {
    for (const artifact of CONTRACT_BUNDLE.artifacts) {
      expect(sha256(join(PKG, artifact.path)), artifact.path).toBe(
        artifact.sha256,
      );
    }
  });

  it("the vendored file set is exactly bundle.json's artifacts plus bundle.json", () => {
    const actual = walk(PKG)
      .map((p) => relative(PKG, p))
      .sort();
    const expected = [
      ...CONTRACT_BUNDLE.artifacts.map((a) => a.path),
      "bundle.json",
    ].sort();
    expect(actual).toEqual(expected);
  });

  it("contract.json declares 41 routes with unique operation ids", () => {
    expect(CONTRACT_ROUTES).toHaveLength(41);
    const ids = CONTRACT_ROUTES.map((r) => r.operation_id);
    expect(new Set(ids).size).toBe(41);
  });
});
