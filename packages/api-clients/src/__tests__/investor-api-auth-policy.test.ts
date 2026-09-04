import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { authPolicyFor, type AuthPolicy } from "../investor-api/auth-policy";
import { CONTRACT_PACKAGE_DIR, CONTRACT_ROUTES } from "../investor-api/package";
import type { OperationId } from "../investor-api/routes";

const openapi = JSON.parse(
  readFileSync(
    join(__dirname, "..", "..", CONTRACT_PACKAGE_DIR, "openapi.json"),
    "utf8",
  ),
) as {
  paths: Record<
    string,
    Record<
      string,
      { operationId: string; security?: Record<string, unknown>[] }
    >
  >;
};

/** Translate an OpenAPI `security` array into our policy vocabulary. */
function policyFromOpenapi(
  security: Record<string, unknown>[] | undefined,
): AuthPolicy {
  const schemes = new Set((security ?? []).flatMap((s) => Object.keys(s)));
  if (schemes.size === 0) return "none";
  if (schemes.has("googleOidc") && schemes.has("userAssertion"))
    return "google+assertion";
  if (schemes.has("googleOidc")) return "google";
  throw new Error(
    `unrecognised security scheme set: ${[...schemes].join(",")}`,
  );
}

describe("auth policy is stated explicitly and equals openapi.json security", () => {
  it("matches for every one of the 41 operations", () => {
    let checked = 0;
    for (const methods of Object.values(openapi.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        if (!["get", "post", "patch", "delete"].includes(method)) continue;
        expect(
          authPolicyFor(op.operationId as OperationId),
          op.operationId,
        ).toBe(policyFromOpenapi(op.security));
        checked += 1;
      }
    }
    expect(checked).toBe(CONTRACT_ROUTES.length);
  });

  it("the public JWKS route is credential-free and the identity exchange is Google-only", () => {
    expect(authPolicyFor("getIdentityJwks")).toBe("none");
    expect(authPolicyFor("exchangeIdentity")).toBe("google");
    expect(authPolicyFor("listAccounts")).toBe("google+assertion");
  });

  it("is not merely inferred from runtime_owner", () => {
    // Both identity-ccid operations have DIFFERENT policies, so any
    // owner-based inference would be wrong for one of them.
    const identityOps = CONTRACT_ROUTES.filter(
      (r) => r.runtime_owner === "identity-ccid",
    ).map((r) => authPolicyFor(r.operation_id as OperationId));
    expect(new Set(identityOps).size).toBe(2);
  });
});
