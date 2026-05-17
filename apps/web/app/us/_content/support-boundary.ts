// Per rule 203A-2(e)(3): advisory personnel cannot generate client-specific advice.
// This copy is a regulatory requirement, not only a product preference.
export const supportBoundaryCopy = {
  bannerTitle: 'Support boundary',
  bannerBody:
    'Support helps with the app, documents, broker connection, billing, and general explanations of how ReFi works. Support does not make client-specific investment decisions or change recommendations outside the platform.',
  blockedPromptMessage:
    'That question may involve client-specific investment advice, which support cannot provide. For questions about your recommendations, please review them directly in the platform.',
  categories: [
    'App issue',
    'Document question',
    'Broker question',
    'Billing',
    'General platform explanation',
    'Other',
  ],
} as const;

// Patterns that trigger the blocked-prompt guardrail.
// Keep this list separate from the copy — it's a compliance control, not UI copy.
export const blockedPromptPatterns: RegExp[] = [
  /should i (buy|sell|hold|invest)/i,
  /is .+ a good investment/i,
  /what should i do with/i,
  /tell me (whether|if) (to|i should)/i,
  /recommend(ation)? for me/i,
  /which stock/i,
  /can you (advise|suggest|recommend)/i,
];
