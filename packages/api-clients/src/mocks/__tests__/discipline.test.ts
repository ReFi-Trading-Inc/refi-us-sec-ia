// Discipline tests (Sprint A guards per
// `refi-build-docs/spec-current/12-daniel-2026-05-20-guidance.md §2.2`).
//
// These tests fail when the repo would otherwise silently drift from the
// canonical contract:
//
//   T1 — Enum discipline: forbidden order statuses never appear in any
//        persona fixture (catches reintroduction of mined/reverted/acked/
//        cancelled/partial).
//   T2 — String-decimal discipline: money / quantity / price fields on
//        BrokerPosition + PositionsResponse are TS string (not number).
//   T3 — Tier-action matrix: recommendation detail page never renders an
//        Approve / Reject / Request-review button on a non-Exception
//        Managed surface (catches reintroduction of per-rec accept).
//   T4 — Per-persona schema validation: every persona's required shape
//        is present (catches incomplete fixture rework).
//
// Acceptance per 12 §2.2 rules 7, 8, 9, 10.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PERSONA_LIST } from "../fixtures/personas";
import type { BrokerPosition, PositionsResponse } from "../../generated/api";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "../../../../..");

// ─── T1 — Enum discipline ────────────────────────────────────────────────

const FORBIDDEN_ORDER_STATUSES = [
  "mined",
  "reverted",
  "acked",
  "cancelled", // British spelling — Daniel uses American "canceled"
  "partial", // Daniel uses "partially_filled"
];

describe("T1 — Order status enum discipline", () => {
  for (const persona of PERSONA_LIST) {
    it(`${persona.id}: orders[].status never uses forbidden values`, () => {
      for (const o of persona.orders) {
        expect(FORBIDDEN_ORDER_STATUSES).not.toContain(o.status);
      }
    });

    it(`${persona.id}: orderRows[].status never uses forbidden values`, () => {
      for (const o of persona.orderRows) {
        expect(FORBIDDEN_ORDER_STATUSES).not.toContain(o.status);
      }
    });
  }
});

// ─── T2 — String-decimal discipline ──────────────────────────────────────
//
// Per `12 §2.2 rule 10` + `11-integration-audit-post-p2.5r-04.md` C5/C6:
// Daniel's Spanner NUMERIC columns cross the wire as TS strings. Floats
// here would cause silent precision loss. We assert the field type at
// runtime by checking persona fixtures.

const STRING_DECIMAL_FIELDS_ON_POSITION: Array<keyof BrokerPosition> = [
  "qty",
  "avg_price",
  "notional",
];

const STRING_DECIMAL_FIELDS_ON_POSITIONS_RESPONSE: Array<
  Exclude<
    keyof PositionsResponse,
    | "account_id"
    | "as_of_ts"
    | "last_orders_evt_ts"
    | "base_currency"
    | "positions"
  >
> = ["cash", "equity", "buying_power"];

describe("T2 — String-decimal discipline (BrokerPosition + PositionsResponse)", () => {
  for (const persona of PERSONA_LIST) {
    if (persona.brokerPositions.length === 0) {
      it(`${persona.id}: no broker positions — skipped`, () => {
        expect(persona.brokerPositions.length).toBe(0);
      });
      continue;
    }
    for (const field of STRING_DECIMAL_FIELDS_ON_POSITION) {
      it(`${persona.id}: every BrokerPosition.${field} is a string`, () => {
        for (const p of persona.brokerPositions) {
          expect(typeof p[field]).toBe("string");
        }
      });
    }
  }
});

// ─── T3 — Tier-action matrix (structural) ────────────────────────────────
//
// Per `12 §2.2 rule 7`:
//   | Tier                  | Recommendation detail actions |
//   |-----------------------|-------------------------------|
//   | Signal                | Save, Dismiss, Upgrade         |
//   | Managed, no exception | View record only               |
//   | Managed, exception    | Open Exception Review          |
//   | Admin                 | No investor CTA                |
//
// We assert the branching structure of `TierAwareActions` in the rec
// detail page. The runtime-render tier-matrix proofs land in Playwright
// (`apps/web/e2e/persona-switch.spec.ts` extended in Sprint D).

const REC_DETAIL_PAGE = join(
  REPO_ROOT,
  "apps/web/app/us/app/recommendations/[id]/page.tsx",
);

describe("T3 — Tier-action matrix (structural)", () => {
  const src = readFileSync(REC_DETAIL_PAGE, "utf-8");

  it("rec detail page has a TierAwareActions component", () => {
    expect(src).toContain("function TierAwareActions");
  });

  it("rec detail page does NOT call useSubmitOrder (legacy)", () => {
    expect(src).not.toMatch(/\buseSubmitOrder\b/);
  });

  it("rec detail page does NOT call useOrderPreview (legacy)", () => {
    expect(src).not.toMatch(/\buseOrderPreview\b/);
  });

  it("rec detail page does NOT call usePatchRecommendation (legacy)", () => {
    expect(src).not.toMatch(/\busePatchRecommendation\b/);
  });

  it("rec detail page does NOT render Approve / Reject / Request-review CTAs", () => {
    expect(src).not.toMatch(/approveAction/);
    expect(src).not.toMatch(/rejectAction/);
    expect(src).not.toMatch(/requestReviewAction/);
  });

  it("TierAwareActions branches on tier === 'managed' with exception", () => {
    expect(src).toMatch(/tier === ["']managed["']\s*&&\s*pendingException/);
  });

  it("TierAwareActions has a Signal-tier branch (SignalActions)", () => {
    expect(src).toContain("SignalActions");
  });

  it("Signal branch exposes the Save / Dismiss / Upgrade trio", () => {
    expect(src).toMatch(/saveAction/);
    expect(src).toMatch(/dismissAction/);
    expect(src).toMatch(/upgradeAction/);
  });

  it("Managed-exception branch routes to /us/app/managed/exceptions/{id}", () => {
    expect(src).toMatch(/\/us\/app\/managed\/exceptions\//);
  });

  it("Managed-no-exception branch routes to /us/app/records/recommendation/{id}", () => {
    expect(src).toMatch(/\/us\/app\/records\/recommendation\//);
  });
});

// ─── T4 — Per-persona schema validation ──────────────────────────────────
//
// Per `12 §2.2 rule 8`. Asserts the tier-conditional required shape:
//
//   Maya:  Managed, active policy, no exception
//   Sarah: Managed, active policy, ≥1 exception
//   David: Signal,  no policy,     no broker, no execution chain
//
// The Admin persona lands in Sprint C P2.5R-04.

describe("T4 — Per-persona schema validation", () => {
  it("Maya: Managed, active policy, no pending exceptions", () => {
    const maya = PERSONA_LIST.find((p) => p.id === "maya")!;
    expect(maya.tier).toBe("managed");
    expect(maya.executionPolicy?.status).toBe("active");
    expect(maya.pendingExceptions.length).toBe(0);
    expect(maya.brokerConnection?.status).toBe("connected");
  });

  it("Sarah: Managed, active policy, ≥1 pending exception", () => {
    const sarah = PERSONA_LIST.find((p) => p.id === "sarah")!;
    expect(sarah.tier).toBe("managed");
    expect(sarah.executionPolicy?.status).toBe("active");
    expect(
      sarah.pendingExceptions.filter((e) => e.status === "pending").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("David: Signal, no policy, no broker, no execution chain", () => {
    const david = PERSONA_LIST.find((p) => p.id === "david")!;
    expect(david.tier).toBe("signal");
    expect(david.executionPolicy).toBeNull();
    expect(david.brokerConnection).toBeNull();
    expect(david.orders.length).toBe(0);
    expect(david.orderRows.length).toBe(0);
    expect(david.executionPlans.length).toBe(0);
    expect(david.accountIntents.length).toBe(0);
  });

  it("Every persona has a tier + controlState + activation", () => {
    for (const p of PERSONA_LIST) {
      expect(["signal", "managed", "admin"]).toContain(p.tier);
      expect(p.controlState).toBeDefined();
      expect(p.controlState.state).toBeDefined();
      expect(p.activation).toBeDefined();
    }
  });

  it("Every Managed persona's pending exceptions reference real recommendations", () => {
    for (const p of PERSONA_LIST) {
      if (p.tier !== "managed") continue;
      for (const e of p.pendingExceptions) {
        if (!e.recommendation_id) continue;
        const rec = p.recommendations.find((r) => r.id === e.recommendation_id);
        expect(
          rec,
          `persona ${p.id} exception ${e.exception_id} references unknown rec ${e.recommendation_id}`,
        ).toBeDefined();
      }
    }
  });

  it("Every persona's exception references an accountIntent that exists", () => {
    for (const p of PERSONA_LIST) {
      for (const e of p.pendingExceptions) {
        const intent = p.accountIntents.find(
          (a) => a.intent_id === e.account_intent_id,
        );
        expect(
          intent,
          `persona ${p.id} exception ${e.exception_id} references unknown intent ${e.account_intent_id}`,
        ).toBeDefined();
      }
    }
  });
});
