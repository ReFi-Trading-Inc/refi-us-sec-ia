/**
 * Support-boundary classifier rules.
 *
 * One case per SBR rule, plus the benign controls. This is the unit-level half
 * of the support boundary supporting ReFi's intended Rule 203A-2(e) Internet
 * Adviser posture; the server-enforcement half is proven in
 * apps/web/e2e/support.spec.ts, which shows a direct POST cannot bypass it.
 */
import { describe, expect, test } from "vitest";
import {
  BOUNDARY_RULES,
  classifySupportMessage,
} from "../../../../apps/web/src/lib/support-boundary";

const BLOCKED: ReadonlyArray<readonly [string, string]> = [
  ["SBR-001", "Should I buy more of this?"],
  ["SBR-002", "Is Acme Corp a good investment for me?"],
  ["SBR-003", "What should I do with my portfolio this quarter?"],
  ["SBR-004", "Tell me whether to move to cash."],
  ["SBR-005", "Which stock should I pick next?"],
  ["SBR-006", "Can you advise me on my allocation?"],
  ["SBR-010", "Please approve my recommendation so it goes through."],
  ["SBR-011", "Can you make an exception for this recommendation?"],
  ["SBR-020", "Please rebalance my portfolio for me."],
  ["SBR-021", "Sell all my positions today."],
  ["SBR-021", "Please sell my holdings."],
  ["SBR-021", "Sell all of my shares."],
  ["SBR-030", "Can you build a custom strategy for my situation?"],
  ["SBR-031", "Can you make a strategy that beats the index?"],
  ["SBR-040", "Please retrain the model on my account."],
  ["SBR-041", "Turn off the compliance checks for me."],
];

const ALLOWED: ReadonlyArray<string> = [
  // SBR-006 negative controls. "Can you tell me…" is ordinary technical-support
  // English; the Phase 2.5 rule blocked all four of these outright.
  "Can you tell me how to reconnect my broker?",
  "Can you tell me where to download my Form CRS?",
  "Can you tell me why this page is not loading?",
  "Can you tell me how the direct index works?",
  "Can you tell me how to change my email address?",
  "Can you recommend a browser that works better with the site?",
  "I cannot log in after resetting my password.",
  "Where do I download my Form CRS?",
  "My Alpaca connection shows as disconnected — how do I reconnect?",
  "I was charged twice this month; can you check the billing?",
  "Can you explain how the direct index product works in general?",
  "The recommendations page shows a loading spinner forever on Safari.",
  "How do I update my email address?",
];

describe("support boundary — prohibited requests", () => {
  test.each(BLOCKED)("%s is refused", (ruleId, message) => {
    const verdict = classifySupportMessage(message);
    expect(verdict.blocked).toBe(true);
    expect(verdict.ruleId).toBe(ruleId);
  });

  test("every declared rule has a blocked fixture", () => {
    const covered = new Set(BLOCKED.map(([id]) => id));
    const uncovered = BOUNDARY_RULES.filter((r) => !covered.has(r.id)).map(
      (r) => r.id,
    );
    expect(uncovered, "rules without a test fixture").toEqual([]);
  });

  test("rule ids are unique", () => {
    const ids = BOUNDARY_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("support boundary — legitimate requests", () => {
  test.each(ALLOWED)("%s is allowed", (message) => {
    const verdict = classifySupportMessage(message);
    expect(verdict.blocked).toBe(false);
    expect(verdict.ruleId).toBeNull();
  });
});

describe("support boundary — determinism", () => {
  test("the same message always yields the same verdict", () => {
    const message = "Should I buy more of this?";
    const first = classifySupportMessage(message);
    for (let i = 0; i < 25; i += 1) {
      expect(classifySupportMessage(message)).toEqual(first);
    }
  });
});
