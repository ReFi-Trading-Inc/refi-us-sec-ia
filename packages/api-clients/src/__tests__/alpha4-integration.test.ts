import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTRACT_PACKAGE_DIR } from "../investor-api/package";
import { problemsAgainst } from "../investor-api/validation";
import {
  projectRecommendation,
  fractionToPercent,
  type ContractRecommendation,
  type ContractRecommendationSummary,
} from "../../../../apps/web/src/lib/investor-api/recommendations";
import { projectFundingNotices } from "../../../../apps/web/src/lib/investor-api/funding-notices";
import { collectComplete } from "../../../../apps/web/src/lib/investor-api/pagination";
import {
  previewIdempotencyKey,
  actionIdempotencyKey,
} from "../../../../apps/web/src/lib/investor-api/account-actions";
import {
  rotationIdempotencyKey,
  syncIdempotencyKey,
} from "../../../../apps/web/src/lib/investor-api/brokerage-maintenance";
import { operationIdFrom } from "../../../../apps/web/src/lib/investor-api/operation-identity";

const examples = JSON.parse(
  readFileSync(
    join(__dirname, "../..", CONTRACT_PACKAGE_DIR, "examples.json"),
    "utf8",
  ),
);
const detail = examples.responses.RecommendationEnvelope
  .data as ContractRecommendation;
const summary = examples.responses.RecommendationPageEnvelope.data
  .items[0] as ContractRecommendationSummary;
const now = Date.parse("2026-09-10T20:01:00Z");

describe("alpha.4 canonical reads", () => {
  it("keeps summary/detail distinct and preserves complete funding decimals/lineage", () => {
    expect(problemsAgainst("Recommendation", detail)).toEqual([]);
    expect(problemsAgainst("RecommendationSummary", summary)).toEqual([]);
    for (const input of [detail, summary]) {
      const view = projectRecommendation(input);
      expect(view.fundingAssessment).toEqual(input.funding_assessment);
      expect(view.lifecycleStatus).toBe(input.lifecycle_status);
      expect(view.contentStatus).toBe(input.content_status);
      expect(view.executionEligible).toBe(false);
      expect(view.freshness.lastEvaluatedAt).toBe("");
      expect(view.freshness.policyVersion).toBe("");
    }
  });
  it.each([
    ["0.999", "99.9"],
    ["0.0000000000000000001", "0.00000000000000001"],
    ["-0.25", "-25"],
    ["12345678901234567890.1234", "1234567890123456789012.34"],
  ])("exact turnover %s → %s", (value, expected) => {
    expect(fractionToPercent(value!)).toBe(expected);
  });
  it("unassessed history stays null, never a zero funding requirement", () => {
    const view = projectRecommendation({ ...detail, funding_assessment: null });
    expect(view.fundingAssessment).toBeNull();
    expect(view.templateId).toBe(detail.lineage.template_id);
    expect(projectFundingNotices([view], now)[0]?.state).toBe("unavailable");
  });
});

describe("funding warning recovery from backend-persisted recommendations", () => {
  const warning = projectRecommendation(summary);
  function observation(
    status: "SUFFICIENT" | "INSUFFICIENT" | "INCOMPLETE",
    seconds: number,
  ) {
    return {
      ...warning,
      recommendationId: `recommendation_test_${seconds}`,
      createdAt: new Date(
        Date.parse(warning.createdAt) + seconds * 1000,
      ).toISOString(),
      fundingAssessment: { ...warning.fundingAssessment!, status },
    };
  }
  it("deduplicates replay by portfolio and preserves account-owned amounts", () => {
    const notices = projectFundingNotices([warning, warning], now);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      state: "active",
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
  it("only newer current fresh sufficient evidence clears; reordered replay is stable", () => {
    const sufficient = observation("SUFFICIENT", 20);
    expect(projectFundingNotices([sufficient, warning], now)[0]?.state).toBe(
      "resolved",
    );
    expect(
      projectFundingNotices([observation("SUFFICIENT", 0), warning], now)[0]
        ?.state,
    ).toBe("active");
    expect(
      projectFundingNotices([sufficient, warning], now + 3600_000)[0]?.state,
    ).toBe("active");
  });
});

describe("bounded complete account truth", () => {
  it("retrieves all 503 constituents, beyond five pages", async () => {
    const seen: Array<string | undefined> = [];
    const rows = await collectComplete(async (cursor) => {
      seen.push(cursor);
      const start = Number(cursor ?? "0");
      const end = Math.min(start + 100, 503);
      return {
        items: Array.from({ length: end - start }, (_, i) => start + i),
        page: {
          has_more: end < 503,
          next_cursor: end < 503 ? String(end) : null,
        },
      };
    });
    expect(rows).toHaveLength(503);
    expect(seen).toHaveLength(6);
    expect(rows[502]).toBe(502);
  });
  it("never silently returns a partial ownership/holdings view", async () => {
    let n = 0;
    await expect(
      collectComplete(
        async () => ({
          items: [n++],
          page: { has_more: true, next_cursor: `cursor_${n}` },
        }),
        2,
      ),
    ).rejects.toMatchObject({ reason: "page_cap_exceeded" });
  });
});

describe("logical operation identity, not parameter/time buckets", () => {
  const input = {
    operationId: "operation_new_0001",
    templateId: "template_alpha_0001",
    allocationPercent: "0.25",
  };
  it("same retry key survives changed clocks; a deliberate fresh preview gets a new key", () => {
    const key = previewIdempotencyKey("acct_test_0001", input);
    expect(previewIdempotencyKey("acct_test_0001", { ...input })).toBe(key);
    expect(
      previewIdempotencyKey("acct_test_0001", {
        ...input,
        operationId: "operation_new_0002",
      }),
    ).not.toBe(key);
    // Same operation + changed body MUST reuse the key so backend conflict detection runs.
    expect(
      previewIdempotencyKey("acct_test_0001", {
        ...input,
        allocationPercent: "0.5",
      }),
    ).toBe(key);
    expect(previewIdempotencyKey("acct_other_0001", input)).not.toBe(key);
  });
  it("leave/rejoin, repeat rotations and syncs have independent explicit identities", () => {
    for (const key of [
      (id: string) =>
        actionIdempotencyKey("acct_test_0001", {
          ...input,
          operationId: id,
          action: "leave_template",
        }),
      (id: string) =>
        rotationIdempotencyKey("acct_test_0001", "connection_0001", id),
      (id: string) =>
        syncIdempotencyKey("acct_test_0001", "connection_0001", id),
    ]) {
      expect(key("operation_retry_01")).toBe(key("operation_retry_01"));
      expect(key("operation_retry_01")).not.toBe(key("operation_new_002"));
    }
  });
  it("requires a bounded header, not user-supplied account or credential material", () => {
    expect(operationIdFrom(new Headers())).toBeNull();
    expect(
      operationIdFrom(new Headers({ "Idempotency-Key": "bad" })),
    ).toBeNull();
    expect(
      operationIdFrom(new Headers({ "Idempotency-Key": input.operationId })),
    ).toBe(input.operationId);
  });
});
