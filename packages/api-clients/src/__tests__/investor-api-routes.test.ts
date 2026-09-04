import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTRACT_PACKAGE_DIR, CONTRACT_ROUTES } from "../investor-api/package";
import {
  INVESTOR_API_PREFIX,
  INVESTOR_API_ROUTES,
  ROUTES_BY_OPERATION,
  expandPath,
  withAccountId,
} from "../investor-api/routes";

const openapi = JSON.parse(
  readFileSync(
    join(__dirname, "..", "..", CONTRACT_PACKAGE_DIR, "openapi.json"),
    "utf8",
  ),
) as { paths: Record<string, Record<string, { operationId: string }>> };

describe("routes are derived from the contract, not hand-written", () => {
  it("contract.json operation ids equal openapi.json operation ids", () => {
    const fromOpenapi = new Set<string>();
    for (const [, methods] of Object.entries(openapi.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        if (["get", "post", "patch", "delete"].includes(method)) {
          fromOpenapi.add(op.operationId);
        }
      }
    }
    expect(new Set(Object.keys(ROUTES_BY_OPERATION))).toEqual(fromOpenapi);
    expect(fromOpenapi.size).toBe(41);
  });

  it("every route's method+path exists in openapi.json", () => {
    for (const route of CONTRACT_ROUTES) {
      const op = openapi.paths[route.path]?.[route.method.toLowerCase()];
      expect(op?.operationId, `${route.method} ${route.path}`).toBe(
        route.operation_id,
      );
    }
  });

  it("the twelve legacy route names resolve to the contract paths", () => {
    expect(INVESTOR_API_ROUTES).toEqual({
      ONBOARDING_STATUS: "/api/v1/investor/onboarding/status",
      ELIGIBILITY: "/api/v1/investor/eligibility",
      KYC: "/api/v1/investor/kyc",
      ADVISORY_PROFILES: "/api/v1/investor/advisory-profiles",
      ADVISORY_PROFILE_CURRENT: "/api/v1/investor/advisory-profiles/current",
      DISCLOSURES: "/api/v1/investor/disclosures",
      CONSENTS: "/api/v1/investor/consents",
      ACCOUNT_AUTHORIZATION:
        "/api/v1/investor/accounts/{account_id}/authorization",
      ACCOUNT_ACTIONS: "/api/v1/investor/accounts/{account_id}/actions",
      ACCOUNT_PREFERENCES: "/api/v1/investor/accounts/{account_id}/preferences",
      ACCOUNT_PREFERENCES_HISTORY:
        "/api/v1/investor/accounts/{account_id}/preferences/history",
      ACCOUNT_EVENTS: "/api/v1/investor/accounts/{account_id}/events",
    });
  });

  it("the package removed the questionnaire writers: eligibility and advisory profiles are GET-only", () => {
    const methods = (path: string) =>
      CONTRACT_ROUTES.filter((r) => r.path === path).map((r) => r.method);
    expect(methods(INVESTOR_API_ROUTES.ELIGIBILITY)).toEqual(["GET"]);
    expect(methods(INVESTOR_API_ROUTES.ADVISORY_PROFILES)).toEqual(["GET"]);
  });

  it("39 routes are investor-api owned; identity-ccid owns exactly two", () => {
    const owners = CONTRACT_ROUTES.reduce<Record<string, number>>((acc, r) => {
      acc[r.runtime_owner] = (acc[r.runtime_owner] ?? 0) + 1;
      return acc;
    }, {});
    expect(owners).toEqual({ "identity-ccid": 2, "investor-api": 39 });
    expect(
      CONTRACT_ROUTES.filter((r) => r.runtime_owner === "investor-api").every(
        (r) => r.path.startsWith(INVESTOR_API_PREFIX),
      ),
    ).toBe(true);
  });

  it("expandPath encodes and refuses missing parameters", () => {
    expect(withAccountId(INVESTOR_API_ROUTES.ACCOUNT_EVENTS, "acct/1 x")).toBe(
      "/api/v1/investor/accounts/acct%2F1%20x/events",
    );
    expect(() => expandPath(INVESTOR_API_ROUTES.ACCOUNT_EVENTS)).toThrow(
      /account_id/,
    );
  });
});
