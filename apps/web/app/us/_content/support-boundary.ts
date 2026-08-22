// Per rule 203A-2(e)(3): advisory personnel cannot generate client-specific advice.
// This copy is a regulatory requirement, not only a product preference.
export const supportBoundaryCopy = {
  bannerTitle: "Support boundary",
  bannerBody:
    "Support helps with the app, documents, broker connection, billing, and general explanations of how ReFi works. Support does not make client-specific investment decisions or change recommendations outside the platform.",
  blockedPromptMessage:
    "That question may involve client-specific investment advice, which support cannot provide. For questions about your recommendations, please review them directly in the platform.",
  categories: [
    "App issue",
    "Document question",
    "Broker question",
    "Billing",
    "General platform explanation",
    "Other",
  ],
} as const;

// The rule set lives in one place — @lib/support-boundary — because the server
// re-runs the SAME module against the raw message and its verdict is the
// authoritative one. Two copies would drift, and the copy that drifts is the
// one that stops matching what the server enforces.
export {
  BOUNDARY_RULES,
  classifySupportMessage,
  type BoundaryVerdict,
} from "@lib/support-boundary";
