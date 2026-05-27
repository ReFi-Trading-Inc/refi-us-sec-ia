// Support-boundary classifier (MIG-P2.5-23).
//
// Inputs: the user-selected category and the message text.
// Output: a `Classification` carrying the *resolved* category (which may
// flip from `allowed_*` to `blocked_*` when patterns match), a confidence
// score, the matched rule ids, the boundary_rule_id, and a `blocked` flag.
//
// Design notes:
// - Multiple rules may match; we keep the first as canonical so the
//   boundary_rule_id is stable. All matches surface in `matched_patterns`.
// - Confidence is a coarse heuristic: 1.0 when a blocked rule matches,
//   0.7 when the user picked complaint, 0.9 otherwise. Tune with telemetry.
// - The classifier is pure — no side effects, no network. Analytics
//   wiring lives in the caller so the prompt text never crosses the
//   classifier→analytics boundary.

import {
  isAllowedCategory,
  type SupportCategory,
  type SelectableSupportCategory,
} from "./categories";
import { BOUNDARY_RULES, type BoundaryRule } from "./blocked-patterns";

export type Classification = {
  /** Resolved category — may differ from the user-selected one. */
  category: SupportCategory;
  /** Coarse confidence in the classification, 0..1. */
  confidence: number;
  /** Ordered list of rule ids that fired. Empty when no blocked rules matched. */
  matched_patterns: string[];
  /** Canonical rule id when blocked; null otherwise. */
  boundary_rule_id: string | null;
  /** True when the message must not be submitted. */
  blocked: boolean;
};

export function classify(
  selectedCategory: SelectableSupportCategory | "",
  message: string,
): Classification {
  const text = message ?? "";
  const matches: BoundaryRule[] = [];
  for (const rule of BOUNDARY_RULES) {
    if (rule.pattern.test(text)) matches.push(rule);
  }

  // Any blocked pattern wins, regardless of what the user picked.
  if (matches.length > 0) {
    const canonical = matches[0]!;
    return {
      category: canonical.category,
      confidence: 1.0,
      matched_patterns: matches.map((m) => m.id),
      boundary_rule_id: canonical.id,
      blocked: true,
    };
  }

  // No blocked match — fall back to the user's category.
  if (selectedCategory === "") {
    return {
      category: "allowed_general_platform",
      confidence: 0.5,
      matched_patterns: [],
      boundary_rule_id: null,
      blocked: false,
    };
  }

  const isAllowed = isAllowedCategory(selectedCategory);
  return {
    category: selectedCategory,
    confidence: selectedCategory === "complaint" ? 0.7 : 0.9,
    matched_patterns: [],
    boundary_rule_id: null,
    blocked: !isAllowed,
  };
}
