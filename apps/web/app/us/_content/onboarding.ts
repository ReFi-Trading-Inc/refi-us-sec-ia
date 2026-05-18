export const onboardingSteps = [
  { key: "kyc", label: "Identity", path: "/us/onboarding/kyc" },
  { key: "profile", label: "Profile", path: "/us/onboarding/profile" },
  { key: "broker", label: "Broker", path: "/us/onboarding/broker" },
  {
    key: "strategy",
    label: "Strategy review",
    path: "/us/onboarding/strategy",
  },
  { key: "activation", label: "Activation", path: "/us/onboarding/activation" },
] as const;

export type OnboardingStepKey = (typeof onboardingSteps)[number]["key"];

export const onboardingCopy = {
  profile: {
    heading: "Your investment profile",
    subheading:
      "This information shapes your personalized investment recommendations.",
    fields: {
      goal: {
        label: "Investment goal",
        options: [
          "Long-term growth",
          "Income",
          "Capital preservation",
          "Balanced",
        ],
      },
      timeHorizon: {
        label: "Time horizon",
        options: [
          "Less than 1 year",
          "1–3 years",
          "3–5 years",
          "5–10 years",
          "Over 10 years",
        ],
      },
      incomeBand: {
        label: "Annual income",
        options: [
          "Under $50,000",
          "$50,000–$100,000",
          "$100,000–$250,000",
          "Over $250,000",
        ],
      },
      liquidNetWorth: {
        label: "Liquid net worth",
        options: [
          "Under $50,000",
          "$50,000–$200,000",
          "$200,000–$500,000",
          "Over $500,000",
        ],
      },
      riskTolerance: {
        label: "Risk tolerance",
        options: ["Conservative", "Moderate", "Growth-oriented", "Aggressive"],
      },
      investmentExperience: {
        label: "Investment experience",
        options: ["None", "Limited", "Some", "Extensive"],
      },
      accountPurpose: {
        label: "Account purpose",
        options: ["Personal", "Family", "Household"],
      },
    },
    cta: "Save and continue",
    disclaimer:
      "This profile is used to generate software-based investment recommendations. It does not constitute a formal suitability determination.",
  },
  broker: {
    heading: "Connect your broker",
    subheading: "Your assets stay at your broker. ReFi never holds funds.",
    permissionsHeading: "Permissions ReFi requests",
    permissions: [
      "Read account profile",
      "Read balances",
      "Read holdings",
      "Read order status",
      "Submit orders eligible for managed execution (only after activation)",
    ],
    permissionsDisclaimer:
      "No withdrawal, transfer, margin, options, or crypto permissions are requested.",
    brokers: [
      { id: "alpaca", name: "Alpaca", status: "available" as const },
      {
        id: "ibkr",
        name: "Interactive Brokers",
        status: "coming_soon" as const,
      },
      { id: "tradier", name: "Tradier", status: "coming_soon" as const },
    ],
    connectLabel: "Connect",
    comingSoonLabel: "Coming soon",
  },
  strategy: {
    heading: "Your strategy",
    subheading:
      "Review the strategy generated for your profile before proceeding.",
    fields: {
      strategyName: "Strategy",
      rationale: "Why this fits your profile",
      targetAllocation: "Target allocation",
      assetUniverse: "Asset universe",
      riskGuardrails: "Risk guardrails",
      expectedTurnover: "Expected turnover",
      exclusions: "What ReFi will not do",
      costsAndFees: "Costs and fees",
      modelVersion: "Model version",
    },
    cta: "Continue",
    disclaimer:
      "Strategy is software-generated. Past performance is not a guarantee of future results.",
  },
  activation: {
    heading: "Activation checklist",
    subheading: "Complete all items to activate managed execution.",
    checklist: [
      { key: "eligibility", label: "State eligible", auto: true },
      { key: "wallet", label: "Wallet connected", auto: true },
      { key: "kyc", label: "Identity verified (KYC)", auto: true },
      { key: "profile", label: "Investment profile complete", auto: true },
      { key: "broker", label: "Broker connected", auto: false },
      {
        key: "disclosures",
        label: "Disclosure package acknowledged",
        auto: false,
      },
    ],
    activateLabel: "Activate managed execution",
    pendingLabel: "Complete all items above to activate",
    warningDisclosure:
      "Managed execution activation requires Form CRS, ADV Part 2A, and Investment Advisory Agreement acknowledgment. These documents are currently in preparation.",
  },
} as const;
