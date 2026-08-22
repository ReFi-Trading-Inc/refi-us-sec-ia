/**
 * Support-boundary classifier — SHARED, PURE, and the authority is the server.
 *
 * SEC Rule 203A-2(e)(3): advisory personnel cannot generate client-specific
 * advice. The support channel must not become a side door through which a human
 * starts giving individualized investment advice, so a message that solicits it
 * is refused before it reaches any support sink.
 *
 * ─── Where this runs, and which run counts ─────────────────────────────────
 *
 *   browser  — UX only. Warns the investor and disables submit early.
 *   server   — AUTHORITATIVE. Re-runs this exact module against the RAW
 *              message and refuses before any side effect.
 *
 * The browser result is never transmitted and never trusted: the client sends
 * only { category, message }, and the server classifies from scratch. A caller
 * that skips the UI entirely — curl, a script, a modified bundle — meets the
 * same rule set at the same strength. That is the whole point; the previous
 * implementation gated only in the browser, so a direct POST bypassed the
 * control completely.
 *
 * ─── Rule ids are the audit handle ─────────────────────────────────────────
 *
 * Every rule carries a stable `SBR-0xx` id, append-only and stable across
 * rewordings. A blocked InvestorActionReceipt records the id and never the
 * investor's text, so "the classifier ran and this rule fired" is provable
 * without retaining the message itself.
 *
 * Salvaged from `phase2-5-wip-rebase` and revalidated against the Signal
 * direct-index product. The Phase 2.5 confidence heuristic is deliberately not
 * carried over — it was marked "tune with telemetry" and that telemetry does
 * not exist, so it would have been an unfalsifiable number in an audit trail.
 */

export type BoundaryRuleCategory =
  | "buy_sell_advice"
  | "recommendation_approval"
  | "portfolio_change"
  | "custom_strategy"
  | "model_override";

export interface BoundaryRule {
  /** Stable, append-only. Never renumbered — receipts reference these. */
  readonly id: string;
  readonly pattern: RegExp;
  readonly category: BoundaryRuleCategory;
  /** Internal label for operators. Never shown to investors. */
  readonly label: string;
}

export const BOUNDARY_RULES: readonly BoundaryRule[] = [
  // ── Direct advice solicitation ───────────────────────────────────────────
  {
    id: "SBR-001",
    pattern: /\bshould i (buy|sell|hold|invest|short)\b/i,
    category: "buy_sell_advice",
    label: "Direct buy/sell advice request",
  },
  {
    id: "SBR-002",
    pattern: /\bis .+ a (good|bad|safe|risky) (investment|buy|sell)\b/i,
    category: "buy_sell_advice",
    label: "Investment-quality opinion request",
  },
  {
    id: "SBR-003",
    pattern:
      /\bwhat should i do with (my )?(money|portfolio|positions?|shares?)\b/i,
    category: "buy_sell_advice",
    label: "Open-ended portfolio guidance",
  },
  {
    id: "SBR-004",
    pattern: /\btell me (whether|if) (to|i should)\b/i,
    category: "buy_sell_advice",
    label: "Yes/no decision request",
  },
  {
    id: "SBR-005",
    pattern: /\bwhich stock (should|do i|to)\b/i,
    category: "buy_sell_advice",
    label: "Stock-pick request",
  },
  {
    id: "SBR-006",
    pattern: /\bcan you (advise|suggest|recommend|tell me)\b/i,
    category: "buy_sell_advice",
    label: "Advisory verb",
  },

  // ── Recommendation approval / override ───────────────────────────────────
  // Signal recommendations are immutable advice. Support cannot approve,
  // reject, or alter one, and there is no per-recommendation approval surface
  // anywhere in the product.
  {
    id: "SBR-010",
    pattern:
      /\b(approve|reject|override|change) (my|the|this) recommendation\b/i,
    category: "recommendation_approval",
    label: "Recommendation status change via support",
  },
  {
    id: "SBR-011",
    pattern:
      /\bmake an exception (to|on|for) (this|my) (recommendation|order|trade)\b/i,
    category: "recommendation_approval",
    label: "Compliance exception via support",
  },

  // ── Portfolio change ─────────────────────────────────────────────────────
  // Signal has no execution path at all, so a support request to change
  // holdings is asking a human to act outside the platform.
  {
    id: "SBR-020",
    pattern:
      /\b(change|rebalance|reallocate|adjust|reduce|increase) my (portfolio|allocation|positions?|holdings?)\b/i,
    category: "portfolio_change",
    label: "Portfolio change request",
  },
  {
    id: "SBR-021",
    // Widened during salvage. The Phase 2.5 original required the noun to
    // follow `all|my` immediately, so it matched "sell my positions" but NOT
    // "sell all my positions" — the more natural phrasing, and the one a real
    // investor is likelier to write.
    pattern:
      /\bsell (off )?(all|my)( of)?( my)? (positions?|holdings?|shares?)\b/i,
    category: "portfolio_change",
    label: "Liquidation request",
  },

  // ── Custom strategy ──────────────────────────────────────────────────────
  // The launch product is one direct index. A bespoke strategy built for one
  // investor by a human is individualized advice by another name.
  {
    id: "SBR-030",
    pattern:
      /\b(build|create|customize|tailor) (a |my )?(custom )?strategy (for|to)\b/i,
    category: "custom_strategy",
    label: "Custom strategy request",
  },
  {
    id: "SBR-031",
    pattern: /\bcan you make (a |the )?strategy (that|to)\b/i,
    category: "custom_strategy",
    label: "Custom strategy phrasing",
  },

  // ── Model / guardrail override ───────────────────────────────────────────
  {
    id: "SBR-040",
    pattern:
      /\b(retrain|tune|tweak|modify|change|update) (the )?(model|signal|algorithm|engine)\b/i,
    category: "model_override",
    label: "Model alteration request",
  },
  {
    id: "SBR-041",
    pattern: /\bturn (off|on) (the )?(compliance|risk|guardrail)/i,
    category: "model_override",
    label: "Guardrail bypass request",
  },
];

export interface BoundaryVerdict {
  readonly blocked: boolean;
  /** Stable rule id when blocked; null otherwise. Safe to persist and log. */
  readonly ruleId: string | null;
  readonly category: BoundaryRuleCategory | null;
}

const ALLOWED: BoundaryVerdict = {
  blocked: false,
  ruleId: null,
  category: null,
};

/**
 * Classify a raw support message.
 *
 * Pure: no I/O, no clock, no randomness — the same message always yields the
 * same verdict, which is what makes a receipt reproducible after the fact.
 *
 * First match wins so `ruleId` is deterministic when several rules would fire.
 * Rules are ordered most-specific-intent first for that reason.
 */
export function classifySupportMessage(message: string): BoundaryVerdict {
  for (const rule of BOUNDARY_RULES) {
    if (rule.pattern.test(message)) {
      return { blocked: true, ruleId: rule.id, category: rule.category };
    }
  }
  return ALLOWED;
}
