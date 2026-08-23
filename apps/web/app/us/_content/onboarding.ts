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
  brokerApiKey: {
    heading: "Connect your Alpaca account",
    subheading:
      "Enter your Alpaca API keys to link your brokerage account. ReFi uses these keys to read your balances, holdings, and order status, and — once you activate managed execution — to submit eligible orders on your behalf.",
    security:
      "Your keys are transmitted securely over HTTPS to ReFi's systems and are never stored in your browser. They are cleared from this form the moment your connection is confirmed.",
    paperOnlyNotice:
      "ReFi Signal connects to paper accounts only. Signal provides recommendations and never places trades, so it does not accept live trading credentials. Live account connection will use a read-only authorization that cannot trade.",
    environment: {
      label: "Trading environment",
      paper: {
        value: "paper",
        label: "Paper trading",
        hint: "Practice with simulated trades. No real money is involved. Recommended for first-time setup.",
      },
      live: {
        value: "live",
        label: "Live trading",
        hint: "Executes real orders against your funded Alpaca account.",
      },
    },
    liveWarning:
      "Live trading executes real orders with real money. Only activate if your Alpaca account is funded and you understand the risks. You can switch to paper at any time.",
    fields: {
      apiKeyId: {
        label: "API Key ID",
        placeholderPaper: "PKXXXXXXXXXXXXXXXXXX",
        placeholderLive: "AKXXXXXXXXXXXXXXXXXX",
        hint: 'Found in your Alpaca dashboard under "API Keys". Paper keys start with PK; live keys start with AK.',
      },
      apiSecret: {
        label: "Secret Key",
        placeholder: "Your Alpaca secret key",
        hint: "Only shown once when you generate the key in Alpaca. If you've lost it, generate a new key pair.",
        showLabel: "Show",
        hideLabel: "Hide",
      },
    },
    errors: {
      apiKeyIdFormat:
        "API Key ID looks invalid. Paper keys start with PK and live keys start with AK, followed by 18 characters (letters and digits).",
      liveKeyNotAccepted:
        "That looks like a live Alpaca key (AK…). ReFi Signal accepts paper keys only — it never places trades, so it does not take credentials that can. Live accounts will connect through a read-only authorization.",
      apiKeyIdEnvMismatchPaper:
        "Paper keys should start with PK. The key you entered looks like a live key.",
      apiKeyIdEnvMismatchLive:
        "Live keys should start with AK. The key you entered looks like a paper key.",
      apiSecretFormat:
        "Secret key looks invalid. It should be a 40-character alphanumeric string.",
      invalidCredentials:
        "Alpaca rejected those keys. Double-check the API Key ID and Secret Key, and confirm they match the selected environment.",
      insufficientPermissions:
        "Those keys don't have the permissions ReFi needs. Generate a new key pair in Alpaca with trading enabled.",
      networkError:
        "We couldn't reach ReFi's servers. Check your connection and try again.",
      generic:
        "Something went wrong connecting your Alpaca account. Please try again.",
    },
    instructions: {
      heading: "How to find your Alpaca API keys",
      paperUrl: "https://app.alpaca.markets/paper/dashboard/overview",
      liveUrl: "https://app.alpaca.markets/",
      steps: [
        "Sign in to your Alpaca account at app.alpaca.markets.",
        "Switch to either the Paper or Live dashboard, matching the environment you selected above.",
        'In the right-hand sidebar, find the "API Keys" panel and click "Generate New Key".',
        "Copy the API Key ID and the Secret Key. The secret is shown only once — save it somewhere safe before closing the dialog.",
        "Paste both values into the form below.",
      ],
    },
    submitLabel: "Connect Alpaca",
    submittingLabel: "Connecting…",
    successTitle: "Alpaca connected",
    successBody:
      "Your Alpaca account is linked. You can continue to the next step.",
    continueLabel: "Continue",
    cancelLabel: "Cancel",
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
