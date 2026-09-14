/**
 * v1.1.0-alpha.4 adoption (Daniel, issued 2026-09-11; vendored on the handoff
 * line 2026-09-13 from `integration/refinity-dev` commit 09842e4).
 *
 * What this pins, beyond the version/digest selection in
 * `investor-api-alpha3.test.ts` and `investor-api-package.test.ts`:
 *
 *  1. Package integrity is recomputed here, not trusted: every artifact's
 *     sha256 and the package content digest (sha256 of the canonical JSON of
 *     the artifact records, as `tools/conformance.py validate` does).
 *  2. Recommendation TURNOVER UNITS. alpha.3 carried
 *     `estimated_turnover_percent` (percentage points). alpha.4 carries
 *     `turnover` / `summary.turnover` as a FRACTION. Rendering a fraction with
 *     a "%" suffix, or feeding a percent into a fraction field, is a silent
 *     100× corruption. The projection converts exactly (base-10 string math)
 *     and nothing in the alpha.4 package still names the percent field.
 *  3. Summary and detail project to one view; historical `funding_assessment`
 *     null stays null and can never read as "sufficient".
 *  4. Funding notices: stale / superseded / null / incomplete evidence cannot
 *     clear an INSUFFICIENT warning; only newer, current, fresh SUFFICIENT
 *     evidence resolves it.
 *
 * Membership/admission: alpha.4 exposes `listAccountMemberships` (portfolio
 * allocation membership, unchanged since alpha.3). It does NOT expose the
 * closed-Alpha cohort membership or canonical admission (D-A2 / D-A3).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONTRACT_PACKAGE_DIR,
  CONTRACT_VERSION,
  PACKAGE_CONTENT_SHA256,
} from "../investor-api/package";
import { problemsAgainst } from "../investor-api/validation";
import {
  fractionToPercent,
  listRecommendations,
  projectRecommendation,
  type ContractRecommendation,
  type ContractRecommendationSummary,
} from "../../../../apps/web/src/lib/investor-api/recommendations";
import type { InvestorApiReadClient } from "../../../../apps/web/src/lib/investor-api/demo-client";
import { projectFundingNotices } from "../../../../apps/web/src/lib/investor-api/funding-notices";

const PKG = join(__dirname, "../..", CONTRACT_PACKAGE_DIR);
const read = (name: string) => readFileSync(join(PKG, name), "utf8");
const sha256 = (input: string | Buffer) =>
  createHash("sha256").update(input).digest("hex");

const bundle = JSON.parse(read("bundle.json")) as {
  contract_version: string;
  package_content_sha256: string;
  connected_alpha_verified: boolean;
  artifacts: Array<{ path: string; sha256: string }>;
};
const current = JSON.parse(
  readFileSync(
    join(__dirname, "../../contracts/investor-api/CURRENT.json"),
    "utf8",
  ),
) as { contract_version: string; package_content_sha256: string };
const schemas = JSON.parse(read("schemas.json")) as {
  $defs: Record<string, { properties?: Record<string, unknown> }>;
};
const examples = JSON.parse(read("examples.json")) as {
  responses: {
    RecommendationEnvelope: { data: ContractRecommendation };
    RecommendationPageEnvelope: {
      data: { items: ContractRecommendationSummary[] };
    };
  };
};
const detail = examples.responses.RecommendationEnvelope.data;
const summary0 = examples.responses.RecommendationPageEnvelope.data.items[0];
if (!summary0)
  throw new Error("alpha.4 RecommendationPageEnvelope example has no items");
const summary = summary0;
function def(name: string): { properties?: Record<string, unknown> } {
  const d = schemas.$defs[name];
  if (!d) throw new Error(`alpha.4 schemas.json has no $defs.${name}`);
  return d;
}
const now = Date.parse("2026-09-10T20:01:00Z");

describe("alpha.4 package integrity (recomputed, not trusted)", () => {
  it("selects v1.1.0-alpha.4 and CURRENT.json agrees with bundle.json", () => {
    expect(CONTRACT_VERSION).toBe("v1.1.0-alpha.4");
    expect(bundle.contract_version).toBe(CONTRACT_VERSION);
    expect(current.contract_version).toBe(CONTRACT_VERSION);
    expect(current.package_content_sha256).toBe(PACKAGE_CONTENT_SHA256);
    expect(bundle.package_content_sha256).toBe(PACKAGE_CONTENT_SHA256);
    expect(bundle.connected_alpha_verified).toBe(false);
  });

  it("every artifact hash and the package content digest recompute from the vendored bytes", () => {
    expect(bundle.artifacts).toHaveLength(11);
    for (const a of bundle.artifacts) {
      expect(sha256(readFileSync(join(PKG, a.path))), a.path).toBe(a.sha256);
    }
    // conformance.py: sha256(json.dumps(records, sort_keys=True, separators=(",", ":")))
    // List order as issued; dict keys sorted (path < sha256); compact separators.
    const records = bundle.artifacts.map((a) => ({
      path: a.path,
      sha256: a.sha256,
    }));
    expect(sha256(JSON.stringify(records))).toBe(PACKAGE_CONTENT_SHA256);
  });
});

describe("alpha.4 turnover is a fraction, never percentage points", () => {
  it("no alpha.4 schema still names estimated_turnover_percent; turnover lives on the summary shapes", () => {
    const names = new Set<string>();
    for (const def of Object.values(schemas.$defs)) {
      for (const key of Object.keys(def.properties ?? {})) names.add(key);
    }
    expect(names.has("estimated_turnover_percent")).toBe(false);
    expect(
      Object.keys(def("RecommendationSummary").properties ?? {}),
    ).toContain("turnover");
    expect(
      Object.keys(
        (
          def("Recommendation").properties?.["summary"] as {
            properties: Record<string, unknown>;
          }
        ).properties,
      ),
    ).toContain("turnover");
    expect(read("schemas.json")).not.toContain("estimated_turnover_percent");
    expect(read("openapi.json")).not.toContain("estimated_turnover_percent");
  });

  it("Daniel's examples carry the fraction and the projection renders it ×100 exactly", () => {
    expect(summary.turnover).toBe("0.999");
    expect(detail.summary.turnover).toBe("0.999");
    for (const input of [detail, summary]) {
      const view = projectRecommendation(input);
      expect(view.turnover).toBe("0.999");
      expect(view.estimatedTurnoverPercent).toBe("99.9");
    }
  });

  it.each([
    ["0", "0"],
    ["1", "100"],
    ["0.5", "50"],
    ["0.0825", "8.25"],
    ["0.999", "99.9"],
    ["0.00001", "0.001"],
    ["0.0000000000000000001", "0.00000000000000001"],
    ["-0.25", "-25"],
    ["12345678901234567890.1234", "1234567890123456789012.34"],
  ])("fractionToPercent(%s) → %s with no floating point", (value, expected) => {
    expect(fractionToPercent(value)).toBe(expected);
  });

  it("refuses non-canonical decimals instead of guessing units", () => {
    for (const bad of ["", "8.25%", "1e-2", ".5", "0.", "abc", "1,5"]) {
      expect(() => fractionToPercent(bad), bad).toThrow();
    }
  });
});

describe("alpha.4 canonical reads (summary and detail project to one view)", () => {
  it("both example shapes validate and keep funding/lifecycle/content verbatim", () => {
    expect(problemsAgainst("Recommendation", detail)).toEqual([]);
    expect(problemsAgainst("RecommendationSummary", summary)).toEqual([]);
    for (const input of [detail, summary]) {
      const view = projectRecommendation(input);
      expect(view.fundingAssessment).toEqual(input.funding_assessment);
      expect(view.lifecycleStatus).toBe(input.lifecycle_status);
      expect(view.status).toBe(input.lifecycle_status);
      expect(view.contentStatus).toBe(input.content_status);
      expect(view.freshness.status).toBe(input.freshness_status);
      // execution_eligible is `const: false` in alpha.4 — informational only.
      expect(view.executionEligible).toBe(false);
      // alpha.4 has no last_evaluated_at / freshness_policy_version. The
      // compatibility view leaves them EMPTY, never fabricated.
      expect(view.freshness.lastEvaluatedAt).toBe("");
      expect(view.freshness.policyVersion).toBe("");
      expect(view.freshness.sourceAsOf).toBe(input.as_of_time);
    }
    expect(projectRecommendation(detail).templateId).toBe(
      detail.lineage.template_id,
    );
    // A summary has no lineage; template identity comes only from the
    // funding assessment's input bindings or is null — never guessed.
    expect(projectRecommendation(summary).templateId).toBe(
      summary.funding_assessment?.input_versions.template_id ?? null,
    );
    expect(
      projectRecommendation({ ...summary, funding_assessment: null })
        .templateId,
    ).toBeNull();
  });

  it("unassessed history stays null, never a zero funding requirement", () => {
    const view = projectRecommendation({ ...detail, funding_assessment: null });
    expect(view.fundingAssessment).toBeNull();
    expect(projectFundingNotices([view], now)[0]?.state).toBe("unavailable");
  });
});

describe("funding notices rebuilt from persisted recommendations", () => {
  const warning = projectRecommendation(summary);
  const warningAssessment = warning.fundingAssessment;
  if (warningAssessment?.status !== "INSUFFICIENT")
    throw new Error(
      "alpha.4 example summary must carry an INSUFFICIENT funding assessment",
    );
  type View = ReturnType<typeof projectRecommendation>;
  type Assessment = NonNullable<View["fundingAssessment"]>;
  const baseAssessment: Assessment = warningAssessment;
  function observation(status: Assessment["status"], seconds: number): View {
    return {
      ...warning,
      recommendationId: `recommendation_test_${String(seconds)}`,
      createdAt: new Date(
        Date.parse(warning.createdAt) + seconds * 1000,
      ).toISOString(),
      fundingAssessment: { ...baseAssessment, status },
    };
  }

  it("deduplicates replay by portfolio and preserves the account-owned amounts", () => {
    const notices = projectFundingNotices([warning, warning], now);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      state: "active",
      condition: "PORTFOLIO_CAPITAL_BELOW_MINIMUM",
      assessment: warning.fundingAssessment,
    });
  });

  it.each(["stale", "superseded", "null", "incomplete"])(
    "%s evidence cannot clear a warning",
    (kind) => {
      const newer = observation(
        kind === "incomplete" ? "INCOMPLETE" : "SUFFICIENT",
        20,
      );
      if (kind === "stale")
        newer.freshness = { ...newer.freshness, status: "stale" };
      if (kind === "superseded") newer.lifecycleStatus = "superseded";
      const value =
        kind === "null" ? { ...newer, fundingAssessment: null } : newer;
      expect(projectFundingNotices([value, warning], now)[0]?.state).toBe(
        "active",
      );
    },
  );

  it("only newer current fresh SUFFICIENT evidence clears; replay order does not matter", () => {
    const sufficient = observation("SUFFICIENT", 20);
    expect(projectFundingNotices([sufficient, warning], now)[0]?.state).toBe(
      "resolved",
    );
    expect(projectFundingNotices([warning, sufficient], now)[0]?.state).toBe(
      "resolved",
    );
    // Same-time sufficient never wins the tie.
    expect(
      projectFundingNotices([observation("SUFFICIENT", 0), warning], now)[0]
        ?.state,
    ).toBe("active");
    // Once the sufficient evidence itself has aged past fresh_until it no longer clears.
    expect(
      projectFundingNotices([sufficient, warning], now + 3600_000)[0]?.state,
    ).toBe("active");
  });
});

describe("Lane H fixes: fan-out resilience and status-casing normalisation", () => {
  it("one failed detail read leaves that row unresolved; the list survives (H2-3)", async () => {
    const rows = [
      { ...summary, recommendation_id: "rec_a", funding_assessment: null },
      { ...summary, recommendation_id: "rec_b", funding_assessment: null },
      { ...summary, recommendation_id: "rec_c", funding_assessment: null },
    ];
    const detailCalls: string[] = [];
    const fake = {
      call: (
        op: string,
        options?: { path?: { recommendation_id?: string } },
      ) => {
        if (op === "listAccountRecommendations") {
          return Promise.resolve({
            data: {
              data: {
                items: rows,
                page: { has_more: false, next_cursor: null },
              },
            },
          });
        }
        if (op === "getAccountRecommendation") {
          const id = options?.path?.recommendation_id ?? "";
          detailCalls.push(id);
          if (id === "rec_b") return Promise.reject(new Error("upstream 503"));
          return Promise.resolve({
            data: { data: { ...detail, recommendation_id: id } },
          });
        }
        throw new Error(`unexpected operation ${op}`);
      },
    } as unknown as InvestorApiReadClient;
    const out = await listRecommendations(fake, "acct_test");
    expect(detailCalls.sort()).toEqual(["rec_a", "rec_b", "rec_c"]);
    expect(out.items.map((r) => r.recommendationId)).toEqual([
      "rec_a",
      "rec_b",
      "rec_c",
    ]);
    expect(out.items[0]?.templateId).toBe(detail.lineage.template_id);
    expect(out.items[1]?.templateId).toBeNull();
    expect(out.items[2]?.templateId).toBe(detail.lineage.template_id);
    expect(out.truncated).toBe(false);
  });

  // Status/freshness tone casing (H1-6, H1-7) is covered end to end: the demo
  // world emits UPPERCASE lifecycle words and e2e/demo-tier.spec.ts asserts the
  // lower-cased `data-rec-status`, while e2e/recommendations.spec.ts asserts
  // the simulator's lowercase examples against the same attribute.

  it("allocation display uses the exact converter, never float math (H4-2)", () => {
    expect(fractionToPercent("0.125")).toBe("12.5");
    expect(fractionToPercent("0.005")).toBe("0.5");
    expect(fractionToPercent("0.1")).toBe("10");
  });
});
