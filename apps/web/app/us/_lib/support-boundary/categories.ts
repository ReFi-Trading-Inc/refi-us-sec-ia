// Support category taxonomy (MIG-P2.5-23).
//
// Implements the SEC Rule 203A-2(e)(3) advisory-personnel-boundary
// requirement: support staff may help with platform, document, broker, and
// billing questions, but may not provide client-specific investment advice.
// The taxonomy is split into `allowed_*` (selectable by the user),
// `blocked_*` (assigned by the classifier when the message implies advice),
// and `complaint` (a regulator-relevant intake distinct from advice).
//
// Submit payload always carries the resolved `category` plus a
// `boundary_rule_id` when blocked. Analytics never receives the prompt
// text — only the category and rule id.

export const SUPPORT_CATEGORIES = [
  "allowed_technical",
  "allowed_broker_connection",
  "allowed_document_explanation",
  "allowed_billing",
  "allowed_general_platform",
  "blocked_buy_sell_advice",
  "blocked_recommendation_approval",
  "blocked_portfolio_change",
  "blocked_custom_strategy",
  "blocked_model_override",
  "complaint",
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

/** Categories the user picks from in the form. */
export const SELECTABLE_CATEGORIES = [
  "allowed_technical",
  "allowed_broker_connection",
  "allowed_document_explanation",
  "allowed_billing",
  "allowed_general_platform",
  "complaint",
] as const satisfies readonly SupportCategory[];

export type SelectableSupportCategory = (typeof SELECTABLE_CATEGORIES)[number];

/** Human-readable labels for selectable categories (rendered in the dropdown). */
export const CATEGORY_LABELS: Record<SelectableSupportCategory, string> = {
  allowed_technical: "Technical issue (app, login, errors)",
  allowed_broker_connection: "Broker connection",
  allowed_document_explanation: "Document explanation",
  allowed_billing: "Billing or fees",
  allowed_general_platform: "How the platform works",
  complaint: "Complaint",
};

export function isBlockedCategory(c: SupportCategory): boolean {
  return c.startsWith("blocked_");
}

export function isAllowedCategory(c: SupportCategory): boolean {
  return c.startsWith("allowed_") || c === "complaint";
}
