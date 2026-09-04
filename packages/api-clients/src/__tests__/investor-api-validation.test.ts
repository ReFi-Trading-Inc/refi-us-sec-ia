import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ContractVersionMismatchError } from "../investor-api/errors";
import { CONTRACT_PACKAGE_DIR, CONTRACT_ROUTES } from "../investor-api/package";
import {
  assertMatches,
  hasSchema,
  problemsAgainst,
  type SchemaName,
} from "../investor-api/validation";

const examples = JSON.parse(
  readFileSync(
    join(__dirname, "..", "..", CONTRACT_PACKAGE_DIR, "examples.json"),
    "utf8",
  ),
) as {
  requests: Record<string, unknown>;
  responses: Record<string, unknown>;
  identity: Record<string, unknown>;
  errors: Record<string, unknown>;
};

describe("schemas.json (JSON Schema 2020-12) validation", () => {
  it("every contract route names schemas that exist", () => {
    for (const route of CONTRACT_ROUTES) {
      expect(hasSchema(route.response_schema), route.response_schema).toBe(
        true,
      );
      if (route.request_schema) {
        expect(hasSchema(route.request_schema), route.request_schema).toBe(
          true,
        );
      }
    }
  });

  it("Daniel's request examples validate against their schemas", () => {
    for (const [name, value] of Object.entries(examples.requests)) {
      expect(problemsAgainst(name as SchemaName, value), name).toEqual([]);
    }
  });

  it("Daniel's response examples validate against their envelope schemas", () => {
    // Four example keys (AccountMembershipEnvelope, AccountPositionEnvelope,
    // DisclosureEnvelope, RecommendationLegEnvelope) name envelopes that do not
    // exist in schemas.json — those types are only ever paged. Skip them; the
    // 41 route response schemas are covered by the contract-route test above
    // and by the simulator suite.
    let validated = 0;
    for (const [name, value] of Object.entries(examples.responses)) {
      if (!hasSchema(name)) continue;
      expect(problemsAgainst(name, value), name).toEqual([]);
      validated += 1;
    }
    expect(validated).toBe(Object.keys(examples.responses).length - 4);
  });

  it("identity examples validate (BffAssertionClaims, IdentityHandoffResult, Jwks)", () => {
    for (const [name, value] of Object.entries(examples.identity)) {
      if (hasSchema(name)) {
        expect(problemsAgainst(name, value), name).toEqual([]);
      }
    }
  });

  it("an unknown field is a contract-version mismatch, never ignored", () => {
    const req = structuredClone(
      examples.requests["AllocationPreviewRequest"],
    ) as Record<string, unknown>;
    req["unexpected"] = "x";
    expect(() => {
      assertMatches("AllocationPreviewRequest", req, "request");
    }).toThrow(ContractVersionMismatchError);
    try {
      assertMatches("AllocationPreviewRequest", req, "request");
    } catch (e) {
      expect((e as ContractVersionMismatchError).problems.join(" ")).toMatch(
        /unexpected/,
      );
    }
  });

  it("an unknown enum value is rejected", () => {
    const req = structuredClone(
      examples.requests["BrokerageConnectionRequest"],
    ) as Record<string, unknown>;
    req["account_environment"] = "sandbox";
    expect(problemsAgainst("BrokerageConnectionRequest", req)).not.toEqual([]);
  });

  it("decimal-string money is enforced as a string pattern, not a number", () => {
    const req = structuredClone(
      examples.requests["AllocationPreviewRequest"],
    ) as Record<string, unknown>;
    req["allocation_percent"] = 0.25;
    expect(problemsAgainst("AllocationPreviewRequest", req)).not.toEqual([]);
    req["allocation_percent"] = "0.25";
    expect(problemsAgainst("AllocationPreviewRequest", req)).toEqual([]);
  });

  it("2020-12 conditional keywords are honoured: a fresh Freshness carries no reason codes", () => {
    const base = {
      source_as_of: "2026-09-01T00:00:00Z",
      last_evaluated_at: "2026-09-01T00:00:00Z",
      fresh_until: "2026-09-02T00:00:00Z",
      expires_at: "2026-09-03T00:00:00Z",
      freshness_status: "fresh",
      freshness_policy_version: "p1",
      freshness_reason_codes: ["STALE_PRICE"],
    };
    expect(problemsAgainst("Freshness", base)).not.toEqual([]);
    expect(
      problemsAgainst("Freshness", { ...base, freshness_reason_codes: [] }),
    ).toEqual([]);
    expect(
      problemsAgainst("Freshness", { ...base, freshness_status: "stale" }),
    ).toEqual([]);
  });

  it("an unknown Record variant is rejected", () => {
    const record = {
      record_id: "rec_alpha_00000001",
      record_type: "mystery_variant",
      account_id: "acct_alpha_owned_01",
      correlation_id: "corr_1",
      created_at: "2026-09-01T00:00:00Z",
      source_version: "v1",
      details: {
        entity_id: "ent_alpha_00000001",
        status: "APPLIED",
        reason_codes: [],
      },
    };
    expect(problemsAgainst("AccountRecord", record)).not.toEqual([]);
  });

  it("error envelopes validate", () => {
    for (const [name, value] of Object.entries(examples.errors)) {
      expect(problemsAgainst("ErrorEnvelope", value), name).toEqual([]);
    }
  });
});
