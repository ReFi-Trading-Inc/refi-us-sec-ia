// Customer-facing copy for the support boundary banner + blocked-prompt
// callout. The taxonomy and pattern rules live in
// `apps/web/app/us/_lib/support-boundary/` (MIG-P2.5-23). Keep this file
// to copy only — patterns are a compliance control, not UI copy.
//
// Implements SEC Rule 203A-2(e)(3): advisory personnel cannot generate
// client-specific advice.
export const supportBoundaryCopy = {
  bannerTitle: "Support boundary",
  bannerBody:
    "Support helps with the app, documents, broker connection, billing, and general explanations of how ReFi works. Support does not make client-specific investment decisions or change recommendations outside the platform.",
  blockedPromptMessage:
    "That question may involve client-specific investment advice, which support cannot provide. For questions about your recommendations, please review them directly in the platform.",
} as const;
