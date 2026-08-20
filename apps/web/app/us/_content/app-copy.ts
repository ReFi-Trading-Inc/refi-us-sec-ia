export const navItems = [
  { href: "/us/app/home", label: "Home" },
  { href: "/us/app/portfolio", label: "Portfolio" },
  { href: "/us/app/recommendations", label: "Recommendations" },
  { href: "/us/app/activity", label: "Activity" },
  { href: "/us/app/documents", label: "Documents" },
  { href: "/us/app/account", label: "Account" },
  { href: "/us/app/settings/automation", label: "Automation Center" },
  { href: "/us/app/support", label: "Support" },
] as const;

export const modeCopy = {
  signal: {
    badgeLabel: "ReFi Signal",
    homeStrip: {
      title: "You are on ReFi Signal",
      body: "We send software-generated recommendations. You decide whether to act on them and place orders through your broker. Activate ReFi Managed in your account to automate execution under a policy.",
    },
  },
  managed: {
    badgeLabel: "ReFi Managed",
    homeStrip: {
      title: "ReFi Managed is active",
      body: "Recommendations are executed automatically under your active execution policy. Pause, edit the policy, or open an exception any time. ReFi never executes off-policy without you.",
    },
  },
  unset: {
    badgeLabel: "Mode not set",
    homeStrip: {
      title: "Choose how ReFi works for you",
      body: "You can stay on ReFi Signal (recommendations only) or activate ReFi Managed (recommendations executed automatically under your policy). Set this from your account.",
    },
  },
} as const;

export const exceptionsCopy = {
  heading: "Exception Review",
  subheading:
    "Recommendations that need your attention before ReFi Managed can act on them. Each item carries a reason: profile changed, broker disconnected, disclosure pending, or stale data.",
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
      // Signal-only label. ReFi Signal never submits orders. The CTA points
      // the investor to act on this recommendation through their own broker
      // outside of ReFi. Managed mode hides this block entirely.
      manualAction: "View manual action steps",
    },
    signalManual: {
      title: "Use this outside ReFi",
      body: "ReFi Signal is advisory only. We do not place this order for you. To act on this recommendation, open your connected broker and submit the order yourself. ReFi records that the recommendation was delivered to you; it does not record execution.",
      steps: [
        "Open your broker app or web platform.",
        "Search for the symbol shown above.",
        "Place the order at the size and price you choose. ReFi does not adjust the size.",
        "Return here later to view further recommendations and your activity history.",
      ],
    },
    signal: {
      review: "Review details",
      save: "Save",
      dismiss: "Dismiss",
      actManually: "Act manually",
      upgradeCta: "Activate ReFi Managed",
      upgradeHelp:
        "ReFi Managed executes recommendations automatically under your active policy. You stay in control of policy, pauses, and exceptions.",
    },
    managed: {
      banner:
        "ReFi Managed is active. Recommendations are executed automatically under your active policy. You stay in control of policy, pauses, and exceptions.",
      statusLabels: {
        open: "Pending policy check",
        executing: "Submitted to broker",
        delivered: "Executed",
        dismissed: "Skipped by policy",
        saved: "Held for review",
        blocked: "Blocked by guardrail",
      },
      reviewCta: "Open in Exception Review",
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
