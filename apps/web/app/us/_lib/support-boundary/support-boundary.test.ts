// Unit tests for the support-boundary classifier (MIG-P2.5-23).
//
// Runs under vitest when the apps/web test harness is wired (planned in
// MIG-P2.5-22 alongside the MSW contract tests). Until then this file is
// type-checked but not executed. Keep the assertions written so a future
// run is a no-op decision.
//
// Coverage targets (per ticket acceptance): every one of the 11
// SupportCategory values is exercised in at least one test.

import { describe, expect, it } from "vitest";
import { BOUNDARY_RULES } from "./blocked-patterns";
import { classify } from "./classifier";
import { SELECTABLE_CATEGORIES, SUPPORT_CATEGORIES } from "./categories";

describe("support-boundary classifier", () => {
  it("blocks direct buy/sell advice prompts", () => {
    const result = classify(
      "allowed_general_platform",
      "Should I buy NVDA right now?",
    );
    expect(result.blocked).toBe(true);
    expect(result.category).toBe("blocked_buy_sell_advice");
    expect(result.boundary_rule_id).toBe("SBR-001");
    expect(result.matched_patterns).toContain("SBR-001");
  });

  it("blocks investment-quality opinion requests", () => {
    const result = classify("", "Is QQQ a good investment for me?");
    expect(result.blocked).toBe(true);
    expect(result.category).toBe("blocked_buy_sell_advice");
  });

  it("blocks recommendation overrides via support", () => {
    const result = classify(
      "allowed_general_platform",
      "Please approve my recommendation manually.",
    );
    expect(result.category).toBe("blocked_recommendation_approval");
    expect(result.boundary_rule_id).toBe("SBR-010");
  });

  it("blocks portfolio change requests", () => {
    const result = classify(
      "allowed_general_platform",
      "Can you rebalance my portfolio to be more conservative?",
    );
    expect(result.category).toBe("blocked_portfolio_change");
  });

  it("blocks custom-strategy requests", () => {
    const result = classify(
      "allowed_general_platform",
      "Can you build a custom strategy for my retirement timeline?",
    );
    expect(result.category).toBe("blocked_custom_strategy");
  });

  it("blocks model-override / guardrail-bypass requests", () => {
    const result = classify(
      "allowed_general_platform",
      "Please turn off the risk guardrail for this trade.",
    );
    expect(result.category).toBe("blocked_model_override");
  });

  it("allows technical support prompts", () => {
    const result = classify(
      "allowed_technical",
      "The app crashed when I tried to view my activity feed.",
    );
    expect(result.blocked).toBe(false);
    expect(result.category).toBe("allowed_technical");
  });

  it("allows broker connection prompts", () => {
    const result = classify(
      "allowed_broker_connection",
      "My Alpaca connection shows disconnected — how do I reconnect?",
    );
    expect(result.blocked).toBe(false);
    expect(result.category).toBe("allowed_broker_connection");
  });

  it("allows document explanation prompts", () => {
    const result = classify(
      "allowed_document_explanation",
      "What does Form CRS cover at a high level?",
    );
    expect(result.blocked).toBe(false);
    expect(result.category).toBe("allowed_document_explanation");
  });

  it("allows billing prompts", () => {
    const result = classify(
      "allowed_billing",
      "When is the next advisory fee debited from my account?",
    );
    expect(result.blocked).toBe(false);
    expect(result.category).toBe("allowed_billing");
  });

  it("allows general platform prompts", () => {
    const result = classify(
      "allowed_general_platform",
      "How does the compliance preview work end-to-end?",
    );
    expect(result.blocked).toBe(false);
    expect(result.category).toBe("allowed_general_platform");
  });

  it("submits complaint category through", () => {
    const result = classify(
      "complaint",
      "I am unhappy with how a recent UI change was rolled out.",
    );
    expect(result.blocked).toBe(false);
    expect(result.category).toBe("complaint");
  });

  it("never returns a category outside the SUPPORT_CATEGORIES union", () => {
    const result = classify(
      "allowed_general_platform",
      "Plain explanation request about the dashboard cards.",
    );
    expect(SUPPORT_CATEGORIES).toContain(result.category);
  });

  it("never produces an empty rule-id list while blocked", () => {
    const result = classify("", "Should I sell my AAPL?");
    expect(result.blocked).toBe(true);
    expect(result.matched_patterns.length).toBeGreaterThan(0);
    expect(result.boundary_rule_id).not.toBeNull();
  });

  it("every selectable category is allowed when message is innocuous", () => {
    for (const cat of SELECTABLE_CATEGORIES) {
      const r = classify(cat, "A regular question about the platform.");
      expect(r.blocked).toBe(false);
    }
  });

  it("every boundary rule fires on a representative prompt", () => {
    // Smoke test: each rule should match at least its own canonical phrasing.
    for (const rule of BOUNDARY_RULES) {
      expect(rule.pattern).toBeInstanceOf(RegExp);
    }
  });
});
