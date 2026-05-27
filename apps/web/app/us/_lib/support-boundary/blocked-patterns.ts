// Blocked-prompt patterns. Each pattern is bound to a stable
// `boundary_rule_id` so analytics + support routing can reason about which
// rule fired without ever seeing the prompt text.
//
// Rule IDs are versioned (`SBR-001` etc.) and stable across rephrasings —
// rule wording may evolve; the id should not. Append-only.
//
// Mapped category is the inferred `blocked_*` SupportCategory that the
// classifier will surface when the rule fires.

import type { SupportCategory } from "./categories";

export type BoundaryRule = {
  id: string;
  pattern: RegExp;
  category: Extract<
    SupportCategory,
    | "blocked_buy_sell_advice"
    | "blocked_recommendation_approval"
    | "blocked_portfolio_change"
    | "blocked_custom_strategy"
    | "blocked_model_override"
  >;
  /** Short label used in dev tooling; never shipped to investors. */
  label: string;
};

export const BOUNDARY_RULES: readonly BoundaryRule[] = [
  // --- buy/sell advice ---
  {
    id: "SBR-001",
    pattern: /\bshould i (buy|sell|hold|invest|short)\b/i,
    category: "blocked_buy_sell_advice",
    label: "Direct buy/sell advice request",
  },
  {
    id: "SBR-002",
    pattern: /\bis .+ a (good|bad|safe|risky) (investment|buy|sell)\b/i,
    category: "blocked_buy_sell_advice",
    label: "Investment-quality opinion request",
  },
  {
    id: "SBR-003",
    pattern:
      /\bwhat should i do with (my )?(money|portfolio|positions?|shares?)\b/i,
    category: "blocked_buy_sell_advice",
    label: "Open-ended portfolio guidance",
  },
  {
    id: "SBR-004",
    pattern: /\btell me (whether|if) (to|i should)\b/i,
    category: "blocked_buy_sell_advice",
    label: "Yes/no decision request",
  },
  {
    id: "SBR-005",
    pattern: /\bwhich stock (should|do i|to)\b/i,
    category: "blocked_buy_sell_advice",
    label: "Stock-pick request",
  },
  {
    id: "SBR-006",
    pattern: /\bcan you (advise|suggest|recommend|tell me)\b/i,
    category: "blocked_buy_sell_advice",
    label: "Advisory verb",
  },

  // --- recommendation approval / override ---
  {
    id: "SBR-010",
    pattern:
      /\b(approve|reject|override|change) (my|the|this) recommendation\b/i,
    category: "blocked_recommendation_approval",
    label: "Recommendation status change via support",
  },
  {
    id: "SBR-011",
    pattern:
      /\bmake an exception (to|on|for) (this|my) (recommendation|order|trade)\b/i,
    category: "blocked_recommendation_approval",
    label: "Compliance exception via support",
  },

  // --- portfolio change ---
  {
    id: "SBR-020",
    pattern:
      /\b(change|rebalance|reallocate|adjust|reduce|increase) my (portfolio|allocation|positions?|holdings?)\b/i,
    category: "blocked_portfolio_change",
    label: "Portfolio change request",
  },
  {
    id: "SBR-021",
    pattern: /\bsell (off )?(all|my) (positions?|holdings?|shares?)\b/i,
    category: "blocked_portfolio_change",
    label: "Liquidation request",
  },

  // --- custom strategy ---
  {
    id: "SBR-030",
    pattern:
      /\b(build|create|customize|tailor) (a |my )?(custom )?strategy (for|to)\b/i,
    category: "blocked_custom_strategy",
    label: "Custom strategy request",
  },
  {
    id: "SBR-031",
    pattern: /\bcan you make (a |the )?strategy (that|to)\b/i,
    category: "blocked_custom_strategy",
    label: "Custom strategy phrasing",
  },

  // --- model override ---
  {
    id: "SBR-040",
    pattern:
      /\b(retrain|tune|tweak|modify|change|update) (the )?(model|signal|algorithm|engine)\b/i,
    category: "blocked_model_override",
    label: "Model alteration request",
  },
  {
    id: "SBR-041",
    pattern: /\bturn (off|on) (the )?(compliance|risk|guardrail)/i,
    category: "blocked_model_override",
    label: "Guardrail bypass request",
  },
];
