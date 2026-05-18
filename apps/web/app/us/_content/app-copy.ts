export const navItems = [
  { href: "/us/app/home", label: "Home" },
  { href: "/us/app/portfolio", label: "Portfolio" },
  { href: "/us/app/recommendations", label: "Recommendations" },
  { href: "/us/app/activity", label: "Activity" },
  { href: "/us/app/documents", label: "Documents" },
  { href: "/us/app/account", label: "Account" },
  { href: "/us/app/support", label: "Support" },
] as const;

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
      "No positions yet. Once managed execution is active, positions appear here.",
  },
  recommendations: {
    heading: "Recommendations",
    subheading:
      "Software-generated investment recommendations based on your advisory profile.",
    statusLabel: "Status",
    generatedLabel: "Generated",
    emptyState:
      "No recommendations yet. They appear here once your profile and broker are connected.",
    detail: {
      rationale: "Rationale",
      riskFactors: "Risk factors",
      executionPolicy: "Execution policy",
      complianceStatus: "Compliance status",
      reviewAction: "Review exception",
      approveAction: "Approve for execution",
    },
  },
  activity: {
    heading: "Activity",
    subheading:
      "A complete record of every recommendation, decision, and execution.",
    type: "Type",
    timestamp: "Timestamp",
    description: "Description",
    status: "Status",
    decisionRecord: "Decision record",
    emptyState: "No activity yet. Actions taken on your account appear here.",
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

export const siweCopy = {
  heading: "Verify your identity",
  notConnected: {
    title: "Connect your wallet to continue",
    body: "ReFi.Trading uses your Ethereum wallet as your login — no passwords, no email verification. Your wallet address is your account.",
    cta: "Connect wallet",
  },
  connected: {
    title: "Wallet connected",
    body: "Sign a message to verify you own this wallet. This is a free, off-chain signature — it does not initiate a transaction.",
    cta: "Verify identity",
  },
  signing: "Waiting for signature…",
  success: "Identity verified. Redirecting…",
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
    "Verify your identity to complete onboarding. We use a regulated KYC provider; ReFi never stores government ID details.",
  startCta: "Start verification",
  resumeCta: "Resume verification",
  pollingNote: "Checking status…",
  statuses: {
    not_started: {
      label: "Not started",
      tone: "neutral" as const,
      body: "Begin identity verification with our KYC provider. You'll be redirected to complete a short flow.",
    },
    pending: {
      label: "Pending",
      tone: "info" as const,
      body: "Your verification is in progress. We'll update this page automatically when it completes.",
    },
    incomplete: {
      label: "Incomplete",
      tone: "warning" as const,
      body: "Your verification was started but not finished. Resume to complete it.",
    },
    under_review: {
      label: "Under review",
      tone: "warning" as const,
      body: "Your submission is under manual review. This typically takes one to two business days. No action is needed.",
    },
    approved: {
      label: "Approved",
      tone: "success" as const,
      body: "Identity verified. You can continue with onboarding.",
    },
    denied: {
      label: "Denied",
      tone: "error" as const,
      body: "We could not verify your identity at this time. Please contact support if you believe this is an error.",
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
  REVIEW: {
    label: "Manual review required",
    tone: "warning" as const,
    body: "This order requires manual compliance review before submission.",
    cta: "Request manual review",
  },
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
