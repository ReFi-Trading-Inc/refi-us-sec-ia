export const onboardingSteps = [
  { key: "kyc", label: "Identity", path: "/us/onboarding/kyc" },
  {
    key: "profile",
    label: "Profile",
    path: "/us/onboarding/investor-profile",
  },
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
  broker: {
    heading: "Connect your broker",
    subheading: "Your assets stay at your broker. ReFi never holds funds.",
    permissionsHeading: "Permissions ReFi requests",
    permissions: [
      "Read account profile",
      "Read balances",
      "Read holdings",
      "Read order status",
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
      "Enter your Alpaca paper API keys to link your brokerage account. ReFi Signal uses them to read your balances, holdings, and order status so it can build your recommendations. It does not submit orders.",
    security:
      "Your keys are transmitted securely over HTTPS to ReFi's systems and are never stored in your browser. They are cleared from this form the moment your connection is confirmed.",
    paperOnlyNotice:
      "ReFi Signal connects to paper accounts only. Signal provides recommendations and never places trades, so it does not accept live trading credentials. Live account connection will use a read-only method that cannot place trades.",
    fields: {
      apiKeyId: {
        label: "API Key ID",
        placeholderPaper: "PKXXXXXXXXXXXXXXXXXX",
        hint: 'Found in your Alpaca paper dashboard under "API Keys". Paper keys start with PK.',
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
        "API Key ID looks invalid. Paper keys start with PK followed by 18 characters (letters and digits).",
      liveKeyNotAccepted:
        "That looks like a live Alpaca key (AK…). ReFi Signal accepts paper keys only — it never places trades, so it does not take credentials that can. Live accounts will connect through a read-only method instead.",
      apiKeyIdEnvMismatchPaper:
        "Paper keys should start with PK. The key you entered looks like a live key.",
      apiSecretFormat:
        "Secret key looks invalid. It should be a 40-character alphanumeric string.",
      invalidCredentials:
        "Alpaca rejected those keys. Double-check the API Key ID and Secret Key, and confirm they match the selected environment.",
      insufficientPermissions:
        "Those keys don't have the read permissions ReFi needs. Generate a new paper key pair in Alpaca and try again.",
      networkError:
        "We couldn't reach ReFi's servers. Check your connection and try again.",
      generic:
        "Something went wrong connecting your Alpaca account. Please try again.",
    },
    instructions: {
      heading: "How to find your Alpaca API keys",
      paperUrl: "https://app.alpaca.markets/paper/dashboard/overview",
      steps: [
        "Sign in to your Alpaca account at app.alpaca.markets.",
        "Open the Paper dashboard. ReFi Signal connects to paper accounts only.",
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
  brokerProgress: {
    validating: "Validating your credentials with Alpaca…",
    syncing: "Connected. Reading your balances and holdings…",
    synced: "Connected. Your holdings are in.",
    problem:
      "This connection needs attention. Generate a new paper key pair in Alpaca and connect again.",
    alreadyConnected: "An Alpaca connection already exists for this account.",
    holdingsHeading: "What we found at your broker",
    holdingsNote:
      "Read directly from your Alpaca paper account. Nothing was bought or sold; these are your positions as the broker reports them.",
  },
  strategy: {
    heading: "Strategy review",
    subheading:
      "How your profile, your template and what you already hold fit together. Nothing is traded from this page.",
    profileHeading: "Your investor profile",
    permittedBand: "Permitted risk band",
    capacity: "Capacity for loss",
    willingness: "Willingness to take risk",
    fit: "Product fit",
    profileMissing:
      "Complete your investor profile to see your permitted risk band.",
    templateHeading: "Your template",
    templateBenchmark: "Benchmark",
    templateConstituents: "Constituents",
    templateNote:
      "A rules-based, index-following template. Advice is generated by the backend against this template and your preferences; management is enabled after review.",
    holdingsHeading: "What you hold today",
    holdingsMissing:
      "Connect your broker to compare your holdings with the template.",
    holdingsInTemplate: "of your holdings are template constituents",
    guardrailsHeading: "Guardrails",
    driftThreshold: "Drift threshold",
    minOrder: "Minimum order",
    exclusions: "Excluded assets",
    fractional: "Fractional shares",
    cta: "Continue",
    disclaimer:
      "Advice is software-generated from your profile and template. Past performance is not a guarantee of future results.",
  },
  setup: {
    heading: "Setup checklist",
    subheading:
      "Where your setup stands. Each item is read from the record; none is switched on from this page.",
    checklist: [
      {
        key: "identity",
        label: "Identity verified",
        href: "/us/onboarding/kyc",
      },
      {
        key: "profile",
        label: "Investor profile complete",
        href: "/us/onboarding/investor-profile",
      },
      {
        key: "broker",
        label: "Broker connected and holdings read",
        href: "/us/onboarding/broker",
      },
    ],
    onboardingLabel: "Application / Alpha onboarding",
    onboardingNote:
      "The backend's onboarding state for your application. Human Alpha admission is recorded by ReFi operators outside this app; this page only shows the resulting state.",
    authorizationLabel: "Account authorization",
    authorizationNote:
      "The backend's authorization state for this account. It is distinct from onboarding and is never set from this page.",
    managementLabel: "Portfolio management",
    managementNote:
      "Portfolio management is enabled by ReFi after setup review. Until then you see advice and your holdings; nothing is traded.",
    statusDone: "Done",
    statusPending: "Pending",
    dashboardCta: "Go to your dashboard",
    dashboardNote: "Your holdings, advice and records are live now.",
    finishFirst: "Finish the pending items to open your dashboard.",
    gate: {
      onboarding_not_ready:
        "Your application is not marked ready yet. The dashboard opens when the backend reports onboarding READY.",
      authorization_pending:
        "Account authorization is pending review. Nothing else is required from you right now.",
      authorization_denied:
        "This account is not authorized. Contact support for what this means for your application.",
      authorization_suspended:
        "This account's authorization is suspended. Contact support before continuing.",
      authorization_unknown:
        "Account authorization is not available yet for this application.",
    },
    disclosuresNote:
      "Form CRS, ADV Part 2A and the Investment Advisory Agreement are acknowledged in the app under Documents.",
  },
} as const;
