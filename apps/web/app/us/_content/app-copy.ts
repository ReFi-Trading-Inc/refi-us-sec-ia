export const navItems = [
  { href: "/us/app/home", label: "Home" },
  { href: "/us/app/portfolio", label: "Portfolio" },
  { href: "/us/app/recommendations", label: "Recommendations" },
  { href: "/us/app/activity", label: "Activity" },
  { href: "/us/app/documents", label: "Documents" },
  { href: "/us/app/account", label: "Account" },
  { href: "/us/app/support", label: "Support" },
] as const;

export const exceptionsCopy = {
  heading: "Exception Review",
  subheading:
    "Items that need your attention before they can be reflected in your recommendations. Each carries a reason: profile changed, broker disconnected, disclosure pending, or stale data.",
  placeholder:
    "Exception Review will live here. The list will populate once Surface 6 lands. Until then, expect to see policy guardrail blocks routed to this page.",
} as const;

export const appCopy = {
  home: {
    heading: "Home",
    portfolioValue: "Portfolio value",
    todayChange: "Today's change",
    unrealizedPnl: "Unrealized P&L",
    openPositions: "Open positions",
    pendingReview: "Pending review",
    recentActivity: "Recent activity",
    viewAll: "View all",
  },
  portfolio: {
    heading: "Portfolio",
    allPositions: "All positions",
    symbol: "Symbol",
    quantity: "Qty",
    avgCost: "Avg cost",
    marketValue: "Market value",
    unrealizedPnl: "Unrealized P&L",
    pnlPct: "P&L %",
    emptyState:
      "No positions yet. Once your broker account is connected, positions appear here.",
  },
  recommendations: {
    heading: "Recommendations",
    subheading:
      "Software-generated portfolio recommendations for your account. ReFi Signal is informational: it does not place orders.",
    statusLabel: "Status",
    freshnessLabel: "Freshness",
    legCountLabel: "Constituents",
    turnoverLabel: "Estimated turnover",
    freshUntilLabel: "Fresh until",
    executionEligibilityLabel: "Execution eligibility (informational)",
    executionEligible:
      "Eligible per backend policy — no action is taken by ReFi Signal",
    executionNotEligible: "Not eligible per backend policy",
    emptyState:
      "No recommendations yet. They appear here once your account has a current recommendation.",
    readError: "Recommendations could not be loaded.",
    upstreamStates: {
      not_configured:
        "The recommendation service is not connected in this environment.",
      credential_unavailable:
        "The recommendation service could not be authenticated.",
      contract_mismatch:
        "The recommendation service returned data in an unexpected format.",
      unavailable: "The recommendation service is temporarily unavailable.",
      account_scope: "Your account could not be resolved for this read.",
      pagination: "The recommendation list could not be paged safely.",
      error: "Recommendations could not be loaded.",
    },
    detail: {
      unavailableHeading: "Recommendation",
      idLabel: "Recommendation",
      expiresLabel: "Expires",
      lastEvaluatedLabel: "Last evaluated",
      sourceAsOfLabel: "Source as of",
      freshnessPolicyLabel: "Freshness policy",
      freshnessReasonsLabel: "Freshness notes",
      legsHeading: "Constituent legs",
      // Signal-only label. ReFi Signal never submits orders. The panel points
      // the investor to act on this recommendation through their own broker
      // outside of ReFi.
      manualAction: "View manual action steps",
    },
    legs: {
      symbol: "Symbol",
      securityId: "Security",
      current: "Current qty",
      target: "Target qty",
      delta: "Change",
      notionalDelta: "Notional change",
      referencePrice: "Reference price",
      executable: "Executable (informational)",
      executableYes: "Yes, per backend policy",
      executableNo: "No",
      reasonCodes: "Reason codes",
      empty: "No constituent legs were returned for this recommendation.",
      loadMore: "Show more constituents",
    },
    signalManual: {
      title: "Use this outside ReFi",
      body: "ReFi Signal is advisory only. We do not place these orders for you. To act on this recommendation, open your connected broker and submit any orders yourself. ReFi records that the recommendation was delivered to you; it does not record execution.",
      steps: [
        "Open your broker app or web platform.",
        "Search for each symbol listed above.",
        "Place any order at the size and price you choose. ReFi does not adjust the size.",
        "Return here later to view further recommendations and your activity history.",
      ],
    },
    signal: {
      review: "Review details",
    },
  },
  activity: {
    heading: "Activity",
    subheading:
      "Records of the actions and decisions on your account, as recorded by the backend.",
    type: "Type",
    timestamp: "Timestamp",
    status: "Status",
    reasonCodes: "Reason codes",
    recordReference: "Record reference",
    entityLabel: "Entity",
    relatedLabel: "Related",
    noReasonCodes: "none",
    emptyState: "No activity yet. Actions taken on your account appear here.",
    readError: "Activity could not be loaded.",
    upstreamUnavailable:
      "The account record service is not available in this environment; nothing is shown rather than an approximation.",
  },
  documents: {
    heading: "Documents",
    subheading: "Your regulatory disclosure package and advisory documents.",
    version: "Version",
    effectiveDate: "Effective date",
    view: "View",
    download: "Download",
    acknowledge: "Acknowledge",
    acknowledged: "Acknowledged",
    pendingStatus: "Document in preparation",
    pendingNote: "Available after registration",
  },
  account: {
    heading: "Account",
    profile: "Advisory profile",
    broker: "Broker connection",
    preferences: "Preferences",
    security: "Security",
    wallet: "Connected wallet",
    disconnect: "Disconnect wallet",
  },
  support: {
    heading: "Support",
    subheading:
      "Get help with the app, documents, broker connection, billing, and general explanations.",
    categoryLabel: "Category",
    messageLabel: "Message",
    submitLabel: "Submit request",
    placeholder: "Describe your question…",
  },
} as const;

/**
 * Wallet linking copy.
 *
 * Corrected 2026-07-30. This previously read "ReFi.Trading uses your Ethereum
 * wallet as your login — no passwords, no email verification. Your wallet
 * address is your account." Every clause of that is now wrong under Daniel's
 * 2026-07-28 direction: onboarding is email-first and must not require a
 * wallet, and a wallet address is a LINKED IDENTIFIER, never the user or
 * account id. Wallet linking is optional and secondary.
 */
export const siweCopy = {
  heading: "Link a wallet",
  notConnected: {
    title: "Connect a wallet (optional)",
    body: "Linking a wallet is optional. You do not need one to open or use your ReFi.Trading account — your account is created and secured through your verified email address.",
    cta: "Connect wallet",
  },
  connected: {
    title: "Wallet connected",
    body: "Sign a message to prove you own this wallet so we can link it to your account. This is a free, off-chain signature — it does not initiate a transaction, and it does not replace your email sign-in.",
    cta: "Link wallet",
  },
  signing: "Waiting for signature…",
  success: "Wallet linked. Redirecting…",
  siweErrors: {
    NONCE_INVALID: "Connection expired — please try again.",
    SIGNATURE_INVALID:
      "Signature verification failed. Please reconnect your wallet.",
    POLICY_VIOLATION: "This wallet is not eligible for ReFi.Trading.",
    CHAIN_DENIED: "Please switch to Ethereum mainnet and try again.",
    ACCOUNT_BLOCKED:
      "This account has been suspended. Contact support if you think this is an error.",
    REFRESH_REVOKED: "Your session has been revoked. Please sign in again.",
    UNKNOWN: "Something went wrong. Please try again.",
  },
} as const;

export const kycCopy = {
  heading: "Identity verification",
  subheading:
    "Verify your identity to complete onboarding. ReFi never stores government ID details.",
  startCta: "Start verification",
  resumeCta: "Continue verification",
  pollingNote: "Checking status…",
  readError: "We couldn't load your verification status. Please try again.",
  startError: "We couldn't start verification. Please try again.",
  unavailable: {
    label: "Verification not available yet",
    body: "Identity verification isn't available in this environment yet. Nothing has been recorded.",
  },
  // Provider-neutral lifecycle copy (decision 2026-09-04). No vendor is named
  // and no vendor state is shown.
  statuses: {
    not_started: {
      label: "Verification not started",
      tone: "neutral" as const,
      body: "Begin identity verification to continue onboarding.",
    },
    in_progress: {
      label: "Verification in progress",
      tone: "info" as const,
      body: "Your verification is in progress. This page updates automatically.",
    },
    additional_info_required: {
      label: "Additional information required",
      tone: "warning" as const,
      body: "More information is needed to complete your verification. Continue to provide it.",
    },
    under_review: {
      label: "Review in progress",
      tone: "warning" as const,
      body: "Your verification is being reviewed. No action is needed right now.",
    },
    passed: {
      label: "Verification completed",
      tone: "success" as const,
      body: "Identity verification is complete. Continuing with onboarding.",
    },
    failed: {
      label: "Verification unsuccessful",
      tone: "error" as const,
      body: "We could not complete your identity verification. You can try again or contact support.",
    },
  },
  continueCta: "Continue",
  supportLink: "Contact support",
} as const;

export const compliancePreviewCopy = {
  ALLOW: {
    label: "Approved for execution",
    tone: "success" as const,
    body: "Compliance review passed. You may submit this order.",
  },
  // No REVIEW entry: the risk verdict is binary and a DENY is a backend hard
  // stop, so there is no manual-review escalation to offer. See
  // docs/phase2-6-daniel-answer-resolution.md Q1 (GAP-RISK-BINARY-006).
  DENY: {
    label: "Not approved",
    tone: "error" as const,
    body: "This order cannot be submitted under your current compliance policy.",
  },
  UNAVAILABLE: {
    label: "Compliance check unavailable",
    tone: "warning" as const,
    body: "We could not complete the compliance check. Submission is disabled until we can re-check.",
    cta: "Retry compliance check",
  },
  sourceCache: "Cache hit",
  sourceFresh: "Fresh check",
  reasonsHeading: "Reasons",
} as const;
