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
    expect(CONTRACT_VERSION).toBe("v1.1.0-alpha.3");
    expect(PACKAGE_CONTENT_SHA256).toBe(
      "5eca1200f6af807093ea0986f835235e2da478b69478e621fd54954ba1d77608",
    );
    expect(SOURCE_CONTRACT_SHA256).toBe(
      "3f5df829b1b74d1c95aa41ba4b9bc306d6b6242b25737373082b95d52d8e1cdb",
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
