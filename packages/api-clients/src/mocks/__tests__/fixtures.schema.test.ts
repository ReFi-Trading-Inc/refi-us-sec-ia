// Structural fixture validation (MIG-P2.5-22).
//
// Without a runtime OpenAPI validator we use structural assertions: every
// persona's `recommendations`, `recommendationDetails`, `orders`, etc.
// match the shape the UI consumes. When openapi-typescript codegen wires
// to a real runtime validator (zod or ajv), these assertions become
// schema.parse(fixture) calls.

import { describe, it, expect } from "vitest";
import { PERSONA_LIST } from "../fixtures/personas";
import {
  COMPLIANCE_SCENARIO_IDS,
  VERDICT_FIXTURES,
} from "../fixtures/compliance/verdicts";

// Legacy OrderStatus values — accepted in fixtures during the Sprint A
// bridge period. The forward direction (Daniel-canonical LifecycleOrderStatus)
// is enforced separately by `discipline.test.ts T1`. New retired values
// (mined / reverted / acked / cancelled / partial) MUST NEVER appear in
// fixtures — discipline.test.ts T1 rejects them.
const ORDER_STATUSES = new Set([
  "submitted",
  "mined",
  "reverted",
  "acked",
  "partial",
  "partially_filled",
  "filled",
  "cancelled",
  "rejected",
]);

const REC_STATUSES = new Set([
  "pending",
  "accepted",
  "rejected",
  "expired",
  "review",
  "denied",
]);

const REC_DETAIL_STATUSES = new Set([
  "new",
  "delivered",
  "eligible",
  "executed",
  "review",
  "denied",
  "expired",
  "dismissed",
]);

describe("persona fixtures", () => {
  for (const p of PERSONA_LIST) {
    describe(`persona: ${p.id}`, () => {
      it("session carries a stable account_id", () => {
        expect(p.session.account_id).toBeDefined();
        expect(p.session.account_id).toMatch(/^acct_/);
      });

      it("orders all use Daniel-aligned status enum", () => {
        for (const o of p.orders) {
          expect(ORDER_STATUSES.has(o.status)).toBe(true);
        }
      });

      it("recommendations all use the shallow status enum", () => {
        for (const r of p.recommendations) {
          expect(REC_STATUSES.has(r.status)).toBe(true);
        }
      });

      it("recommendationDetails ids match the shallow list", () => {
        for (const id of Object.keys(p.recommendationDetails)) {
          const ref = p.recommendations.find((r) => r.id === id);
          expect(ref).toBeDefined();
        }
      });

      it("recommendationDetails statuses are in the deep enum", () => {
        for (const d of Object.values(p.recommendationDetails)) {
          expect(REC_DETAIL_STATUSES.has(d.status)).toBe(true);
        }
      });

      it("recommendationDetails carry automation_eligibility with required fields", () => {
        for (const d of Object.values(p.recommendationDetails)) {
          expect(["ALLOW", "REVIEW", "DENY"]).toContain(
            d.automation_eligibility.status,
          );
          expect(typeof d.automation_eligibility.expires_at).toBe("string");
          expect(typeof d.automation_eligibility.policy_version).toBe("string");
        }
      });

      it("recommendationDetails carry decision-record fields", () => {
        for (const d of Object.values(p.recommendationDetails)) {
          expect(d.record.record_id).toMatch(/^rec_record_/);
          expect(d.record.audit_hash).toMatch(/^0x[0-9a-f]+$/i);
          expect(["pending_phase_3", "available"]).toContain(
            d.record.explorer_status,
          );
        }
      });

      it("positions are non-negative quantities", () => {
        for (const pos of p.positions) {
          expect(pos.qty).toBeGreaterThanOrEqual(0);
        }
      });

      it("activation booleans are all defined", () => {
        for (const k of [
          "eligibility",
          "wallet",
          "kyc",
          "profile",
          "broker",
          "disclosures",
        ]) {
          expect(typeof p.activation[k as keyof typeof p.activation]).toBe(
            "boolean",
          );
        }
      });
    });
  }
});

describe("compliance verdict fixtures", () => {
  it("every scenario id resolves to a fixture", () => {
    for (const id of COMPLIANCE_SCENARIO_IDS) {
      expect(VERDICT_FIXTURES[id]).toBeDefined();
    }
  });

  it("every fixture has a verdict status in ALLOW|REVIEW|DENY", () => {
    for (const fixture of Object.values(VERDICT_FIXTURES)) {
      expect(["ALLOW", "REVIEW", "DENY"]).toContain(fixture.verdict.status);
    }
  });

  it("latency band is realistic (0..1000ms)", () => {
    for (const fixture of Object.values(VERDICT_FIXTURES)) {
      expect(fixture.latency_ms).toBeGreaterThanOrEqual(0);
      expect(fixture.latency_ms).toBeLessThanOrEqual(1000);
    }
  });
});
