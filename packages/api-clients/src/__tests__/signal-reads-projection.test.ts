/**
 * C1b-2 rows 19/20 — projections of Daniel's generated Recommendation /
 * RecommendationLeg / AccountRecord into the Signal read models, bounded
 * pagination, and the D-LAUNCH-06 activity filter. Pure functions under test
 * (imported from apps/web, cross-package pattern):
 *   - apps/web/src/lib/investor-api/recommendations.ts
 *   - apps/web/src/lib/investor-api/account-records.ts
 *   - apps/web/src/lib/investor-api/pagination.ts
 * Fixtures are Daniel's contract examples (openapi.json), never invented.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { CONTRACT_PACKAGE_DIR } from "../investor-api/package";
import { problemsAgainst } from "../investor-api/validation";
import {
  projectLeg,
  projectRecommendation,
  type ContractRecommendation,
  type ContractRecommendationLeg,
} from "../../../../apps/web/src/lib/investor-api/recommendations";
import {
  ACCOUNT_RECORD_CATEGORY,
  ACCOUNT_RECORD_TYPES,
  EXECUTION_CHAIN_RECORD_TYPES,
  isKnownRecordType,
  projectSignalActivity,
  type ContractAccountRecord,
} from "../../../../apps/web/src/lib/investor-api/account-records";
import {
  collectPages,
  PaginationError,
  validateCursor,
} from "../../../../apps/web/src/lib/investor-api/pagination";

const openapi = JSON.parse(
  readFileSync(
    join(__dirname, "..", "..", CONTRACT_PACKAGE_DIR, "openapi.json"),
    "utf8",
  ),
) as {
  paths: Record<
    string,
    {
      get: {
        responses: Record<
          string,
          { content: Record<string, { example: unknown }> }
        >;
      };
    }
  >;
};
const schemas = JSON.parse(
  readFileSync(
    join(__dirname, "..", "..", CONTRACT_PACKAGE_DIR, "schemas.json"),
    "utf8",
  ),
) as {
  $defs: Record<
    string,
    { oneOf?: Array<{ properties?: { record_type?: { const?: string } } }> }
  >;
};
const example = (path: string) =>
  openapi.paths[path]?.get.responses["200"]?.content["application/json"]
    ?.example as { data: unknown };

const RECS = example("/api/v1/investor/accounts/{account_id}/recommendations")
  .data as { items: ContractRecommendation[] };
const LEGS = example(
  "/api/v1/investor/accounts/{account_id}/recommendations/{recommendation_id}/legs",
).data as { items: ContractRecommendationLeg[] };
const RECORDS = example("/api/v1/investor/accounts/{account_id}/records")
  .data as { items: ContractAccountRecord[] };

describe("recommendation projection (row 19)", () => {
  test("Daniel's example validates and projects without inventing legacy flat fields", () => {
    expect(
      problemsAgainst("RecommendationPageEnvelope", { data: RECS }),
    ).toEqual([]);
    const r = RECS.items[0];
    expect(r).toBeDefined();
    if (!r) return;
    const v = projectRecommendation(r);
    expect(v).toEqual({
      recommendationId: "recommendation_alpha_0001",
      templateId: "template_us_sp500_direct_index_v1",
      status: "CURRENT",
      freshness: {
        status: "fresh",
        freshUntil: "2026-12-01T00:00:00Z",
        expiresAt: "2026-12-01T00:00:00Z",
        lastEvaluatedAt: "2026-09-01T00:00:00Z",
        sourceAsOf: "2026-09-01T00:00:00Z",
        policyVersion: "automated-portfolio-freshness-1",
        reasonCodes: [],
      },
      estimatedTurnoverPercent: "8.25",
      legCount: 503,
      executionEligible: true,
    });
    // Decimal stays a string; no symbol/action/confidence/rationale keys exist.
    expect(typeof v.estimatedTurnoverPercent).toBe("string");
    for (const k of [
      "symbol",
      "action",
      "confidence",
      "rationale",
      "expiresAt",
    ]) {
      expect(k in v).toBe(false);
    }
  });

  test("leg projection preserves every decimal as a string and the informational flag", () => {
    expect(
      problemsAgainst("RecommendationLegPageEnvelope", { data: LEGS }),
    ).toEqual([]);
    const l = LEGS.items[0];
    if (!l) throw new Error("fixture leg missing");
    const v = projectLeg(l);
    expect(v).toEqual({
      securityId: "security_us_aapl",
      symbol: "AAPL",
      currentQuantity: "1",
      targetQuantity: "1.25",
      deltaQuantity: "0.25",
      notionalDelta: "50",
      referencePrice: "200",
      executable: true,
      reasonCodes: ["TARGET_DELTA"],
    });
    for (const k of [
      "currentQuantity",
      "targetQuantity",
      "deltaQuantity",
      "notionalDelta",
      "referencePrice",
    ] as const) {
      expect(typeof v[k]).toBe("string");
    }
  });
});

describe("account records → investor activity (row 20; all 16 variants read-only since D-LAUNCH-06 = YES)", () => {
  const variants = (schemas.$defs["AccountRecord"]?.oneOf ?? [])
    .map((v) => v.properties?.record_type?.const)
    .filter((v): v is string => typeof v === "string");

  test("the category map is exhaustive over Daniel's 16-variant union and names the five execution-chain types", () => {
    expect(variants).toHaveLength(16);
    expect(Object.keys(ACCOUNT_RECORD_CATEGORY).sort()).toEqual(
      [...variants].sort(),
    );
    expect(ACCOUNT_RECORD_TYPES).toHaveLength(16);
    expect([...EXECUTION_CHAIN_RECORD_TYPES].sort()).toEqual([
      "account_intent",
      "execution_plan",
      "fill",
      "order",
      "risk_decision",
    ]);
  });

  test("Daniel's example record projects with authoritative fields preserved and a category", () => {
    expect(
      problemsAgainst("AccountRecordPageEnvelope", { data: RECORDS }),
    ).toEqual([]);
    const { items, excludedCount } = projectSignalActivity(RECORDS.items);
    expect(excludedCount).toBe(0);
    expect(items).toEqual([
      {
        recordId: "record_alpha_00000001",
        recordType: "recommendation",
        category: "account",
        createdAt: "2026-09-02T00:00:00Z",
        correlationId: "corr_alpha_00000001",
        sourceVersion: "recommendation-alpha-2",
        entityId: "recommendation_alpha_0001",
        status: "CURRENT",
        reasonCodes: [],
        effectiveAt: "2026-09-02T00:00:00Z",
        completedAt: null,
        relatedRecordId: null,
        notional: "6250.0625",
        quantity: null,
        currency: "USD",
      },
    ]);
  });

  test.each(variants)("variant %s renders read-only with its category", (t) => {
    const base = RECORDS.items[0];
    if (!base) throw new Error("fixture record missing");
    const record = { ...base, record_type: t } as ContractAccountRecord;
    expect(isKnownRecordType(record)).toBe(true);
    const { items, excludedCount } = projectSignalActivity([record]);
    expect(items).toHaveLength(1);
    expect(excludedCount).toBe(0);
    expect(items[0]?.category).toBe(
      (EXECUTION_CHAIN_RECORD_TYPES as string[]).includes(t)
        ? "execution_chain"
        : "account",
    );
  });

  test("regression: a page containing all sixteen variants renders all sixteen, newest first, none dropped", () => {
    const base = RECORDS.items[0];
    if (!base) throw new Error("fixture record missing");
    const all = variants.map((t, i) => ({
      ...base,
      record_id: `record_${String(i).padStart(2, "0")}`,
      record_type: t,
      created_at: `2026-09-${String(1 + i).padStart(2, "0")}T00:00:00Z`,
    })) as ContractAccountRecord[];
    const { items, excludedCount } = projectSignalActivity(all);
    expect(excludedCount).toBe(0);
    expect(items).toHaveLength(16);
    expect(items.filter((i) => i.category === "execution_chain")).toHaveLength(
      5,
    );
    const times = items.map((i) => i.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
  });

  test("an unknown record type (impossible after client validation) is never rendered", () => {
    const base = RECORDS.items[0];
    if (!base) throw new Error("fixture record missing");
    const bogus = {
      ...base,
      record_type: "something_new",
    } as unknown as ContractAccountRecord;
    expect(isKnownRecordType(bogus)).toBe(false);
    expect(projectSignalActivity([bogus]).items).toEqual([]);
  });
});

describe("bounded cursor pagination", () => {
  test("stops at has_more=false and preserves cursors exactly", async () => {
    const seen: Array<string | undefined> = [];
    const r = await collectPages(
      async (cursor) => {
        await Promise.resolve();
        seen.push(cursor);
        if (cursor === undefined)
          return {
            items: [1],
            page: { has_more: true, next_cursor: "c/1+x==" },
          };
        return { items: [2], page: { has_more: false, next_cursor: null } };
      },
      { maxPages: 5 },
    );
    expect(r).toEqual({ items: [1, 2], truncated: false, nextCursor: null });
    expect(seen).toEqual([undefined, "c/1+x=="]);
  });

  test("honours the page cap and reports truncation with the continuation cursor", async () => {
    let n = 0;
    const r = await collectPages(
      async () => {
        await Promise.resolve();
        n++;
        return {
          items: [n],
          page: { has_more: true, next_cursor: `c${String(n)}` },
        };
      },
      { maxPages: 3 },
    );
    expect(n).toBe(3);
    expect(r).toEqual({ items: [1, 2, 3], truncated: true, nextCursor: "c3" });
  });

  test.each([
    [
      "has_more without a cursor",
      { has_more: true, next_cursor: null },
      "has_more_without_cursor",
    ],
    [
      "over-long cursor",
      { has_more: true, next_cursor: "x".repeat(513) },
      "cursor_invalid",
    ],
  ] as const)("fails closed on %s", async (_l, page, reason) => {
    await expect(
      collectPages(() => Promise.resolve({ items: [], page }), { maxPages: 3 }),
    ).rejects.toMatchObject({ name: "PaginationError", reason });
  });

  test("fails closed on a repeated cursor (a simulator that ignores cursors cannot loop)", async () => {
    await expect(
      collectPages(
        () =>
          Promise.resolve({
            items: [1],
            page: { has_more: true, next_cursor: "same" },
          }),
        { maxPages: 10 },
      ),
    ).rejects.toBeInstanceOf(PaginationError);
  });

  test("browser cursors: empty → none; well-formed forwarded; over-long refused", () => {
    expect(validateCursor(null)).toBeUndefined();
    expect(validateCursor("")).toBeUndefined();
    expect(validateCursor("opaque==")).toBe("opaque==");
    expect(() => validateCursor("y".repeat(513))).toThrow(PaginationError);
  });
});
