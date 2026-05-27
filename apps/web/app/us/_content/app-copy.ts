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
    topHoldings: "Top holdings",
    recentActivity: "Recent activity",
    viewAll: "View all",
    cards: {
      accountState: {
        title: "Account state",
        whatThisMeans:
          "Where your account sits in the onboarding-to-active lifecycle.",
        eligible: "Eligible",
        onboarded: "Onboarded",
        active: "Active",
      },
      managedExecution: {
        title: "Managed execution",
        whatThisMeans:
          "When active, the platform executes eligible software-generated recommendations within the guardrails you authorized at activation.",
        active: "Active",
        notActivated: "Not activated — Signal mode",
        blockedDisclosures: "Blocked — disclosures pending",
        blockedOnboarding: "Blocked — onboarding incomplete",
        paused: "Paused",
      },
      tier: {
        title: "Tier",
        whatThisMeans:
          "Signal = advisory only. Managed = ReFi executes eligible recommendations within your guardrails. Admin = operator only.",
        signal: "Signal",
        managed: "Managed",
        admin: "Admin",
      },
      disclosures: {
        title: "Disclosure status",
        whatThisMeans:
          "Required regulatory documents you must acknowledge before activation.",
        acknowledgedTemplate: "{ack} of {total} acknowledged",
        cta: "Review disclosures",
      },
      broker: {
        title: "Broker",
        whatThisMeans:
          "Your connected brokerage and the freshness of position data.",
        connected: "Connected",
        connectedFresh: "Connected — fresh",
        connectedStale: "Connected — data stale",
        disconnected: "Disconnected",
        pending: "Pending handshake",
        notConnected: "Not connected",
        lastSyncLabel: "Last sync",
        cta: "Manage broker",
      },
      compliance: {
        title: "Compliance",
        whatThisMeans: "Status of the platform's pre-trade compliance check.",
        operational: "Operational",
        degraded: "Degraded",
        unavailable: "Unavailable",
      },
      nextAction: {
        title: "Next action",
        whatThisMeans: "The single most important thing for you to do next.",
        none: "No action needed",
        noneBody: "Your account is up to date. New activity will appear here.",
        ackDisclosures: "Acknowledge regulatory disclosures",
        ackDisclosuresBody:
          "Activation is blocked until required disclosures are acknowledged.",
        approveExceptions: "Approve pending exceptions",
        approveExceptionsBodyTemplate:
          "{n} recommendation{s} fell outside your guardrails and need your decision.",
        upgradeToManaged: "Turn on Managed Execution",
        upgradeToManagedBody:
          "You're set up for Signal mode. Upgrade to Managed to let ReFi execute eligible recommendations automatically within your guardrails.",
        completeOnboarding: "Complete onboarding",
        completeOnboardingBody:
          "Finish onboarding steps to unlock Managed Execution.",
      },
      exceptions: {
        title: "Open exceptions",
        whatThisMeans: "Recommendations or events flagged for manual review.",
        countLabel: "open",
        none: "None open",
        cta: "View activity",
      },
      dataFreshness: {
        label: "Last refresh",
        sourcesLabel: "Sources",
        sources: "broker, compliance, signals",
      },
    },
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
    loadingLabel: "Loading recommendations…",
    emptyState:
      "No recommendations yet. They appear here once your profile and broker are connected.",
    detail: {
      backLink: "← Recommendations",
      loading: "Loading recommendation…",
      unavailable: "Recommendation not available.",
      confidenceSuffix: "% confidence",
      rationale: "Rationale",
      riskFactors: "Risk factors",
      executionPolicy: "Execution policy",
      complianceStatus: "Compliance status",
      reviewAction: "Review exception",
      // Signal-only label. ReFi Signal never submits orders. The CTA points
      // the investor to act on this recommendation through their own broker
      // outside of ReFi. Managed mode hides this block entirely.
      manualAction: "View manual action steps",
      // Deep-detail section labels (MIG-P2.5-19). The richer detail page
      // (Phase 2.5) renders these inline under the summary block.
      summary: "Summary",
      whyNow: "Why now",
      whyFits: "Why this fits your profile",
      portfolioImpact: "Portfolio impact",
      riskNotes: "Risk notes",
      costNotes: "Costs and fees",
      taxNotes: "Tax notes",
      modelFactors: "Model factors",
      modelFactorWeightLabel: "weight",
      guardrails: "Guardrails",
      guardrailLimitLabel: "limit",
      guardrailCurrentLabel: "current",
      automationEligibility: "Compliance preview",
      automationEligibilityNoReasons: "All preconditions pass.",
      automationCheckedAt: "Checked",
      automationExpiresAt: "Valid until",
      automationPolicyVersion: "Policy version",
      automationSourceLabel: "Source",
      decisionRecord: "Decision record",
      recordIdLabel: "Record",
      auditHashLabel: "Audit hash",
      explorerPendingNote: "Audit explorer ships in Phase 3.",
      explorerAvailableNote: "Verify on the audit explorer.",
      advisoryContext: "Advisory context",
      qtyLabel: "Quantity",
      qtyHint:
        "Shares to act on. The managed execution engine may adjust this for position sizing.",
      orderLabel: "Order",
      generatedLabel: "Generated",
      expiresLabel: "Expires",
      shallowFallbackNote:
        "Deep recommendation detail not published for this id — showing summary view.",
      // Tier-aware actions (Phase 2.5 — supersedes the per-rec Accept/Reject/Review,
      // never reintroduces per-trade Accept on the investor surface).
      tier: {
        signal: {
          title: "Signal mode",
          body: "You receive recommendations for review. ReFi does not place trades for you.",
          saveAction: "Save",
          dismissAction: "Dismiss",
          upgradeAction: "Upgrade to Managed Execution",
          savedBody:
            "Saved. You can find this in your records under saved recommendations.",
          dismissedBody:
            "Dismissed. This recommendation will no longer appear in your action list.",
        },
        managed: {
          title: "Managed Execution active",
          body: "You authorized ReFi to execute eligible software-generated recommendations within your guardrails. This recommendation does not require your approval.",
          viewRecordAction: "View record",
        },
        managedException: {
          title: "Resolve exception",
          body: "This recommendation fell outside the guardrails you signed at activation. It will not execute until you resolve the exception.",
          openAction: "Open Exception Review",
        },
        loading: "Loading…",
      },
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
    loadingLabel: "Loading activity…",
    emptyState: "No activity yet. Actions taken on your account appear here.",
  },
  documents: {
    heading: "Documents",
    subheading: "Your regulatory disclosure package and advisory documents.",
    version: "Version",
    effectiveDate: "Effective date",
    hash: "Hash",
    view: "View",
    download: "Download",
    acknowledge: "Acknowledge",
    acknowledgeSelected: "Acknowledge selected",
    acknowledged: "Acknowledged",
    pendingVersion: "Pending",
    pendingDate: "Pending registration",
    pendingHash: "Pending publication",
    pendingStatus: "Document in preparation",
    pendingNote: "Available after registration",
    requiredLabel: "Required for activation",
    recommendedLabel: "Recommended",
    bannerTitle: "Regulatory disclosure package",
    bannerBody:
      "Document names are final. Versions and effective dates are pending SEC registration and counsel sign-off.",
    progressTemplate: "{ack} of {total} required documents acknowledged",
    activationGate:
      "Managed Execution Activation unlocks once all required documents are acknowledged at their published versions.",
    devCanAckNote:
      "In dev/staging you may simulate acknowledgments against the placeholder version. Acks are scoped per browser.",
    internalNoteLabel: "Internal · counsel context",
    unlockCondition: {
      "sec-registration": "Unlocks after SEC registration",
      "counsel-approval": "Unlocks after counsel approval",
      "agreement-terms": "Unlocks with agreement publication",
    },
  },
  account: {
    heading: "Account",
    profile: "Advisory profile",
    broker: "Broker connection",
    preferences: "Preferences",
    security: "Security",
    wallet: "Connected wallet",
    disconnect: "Disconnect wallet",
    walletStatusConnected: "Connected",
    walletNetwork: "Ethereum mainnet · SIWE session",
    walletNone: "No wallet connected.",
    kycCard: {
      title: "Identity verification",
      statusLabel: "KYC status",
      providerLabel: "Provider",
      startCta: "Start verification",
      resumeCta: "Resume verification",
      statusLabels: {
        not_started: "Not started",
        pending: "Pending",
        incomplete: "Incomplete",
        under_review: "Under review",
        approved: "Approved",
        denied: "Denied",
      },
    },
    brokerCard: {
      equityLabel: "Equity",
      buyingPowerLabel: "Buying power",
      connectedLabel: "Connected",
      noneConnected: "No broker connected.",
      connectCta: "Connect broker",
      disconnectCta: "Disconnect broker",
      confirmBody:
        "Disconnecting will stop managed execution. You can reconnect at any time.",
      confirmCta: "Confirm disconnect",
      disconnectingCta: "Disconnecting…",
      cancelCta: "Cancel",
      disconnectErrorFallback: "Disconnect failed. Try again.",
    },
    profileCard: {
      fields: {
        goal: "Goal",
        timeHorizon: "Time horizon",
        riskTolerance: "Risk tolerance",
        experience: "Experience",
        income: "Income",
        netWorth: "Net worth",
      },
      updateCta: "Update profile",
      none: "Profile available after onboarding.",
      completeCta: "Complete profile",
    },
    securityCard: {
      body: "ReFi uses Sign-In With Ethereum (SIWE). There is no password. Your session is tied to your wallet signature and expires automatically.",
      signOutAllCta: "Sign out all devices",
    },
  },
  brokerStatus: {
    staleTitle: "Broker data is stale",
    staleBody:
      "Position data has not refreshed within the freshness window. Submissions will be blocked until the broker syncs again.",
    staleLastSyncedLabel: "Last synced",
    disconnectedTitle: "Broker is disconnected",
    disconnectedBody:
      "Reconnect your broker to resume position tracking and Managed Execution.",
    pendingTitle: "Broker connection is pending",
    pendingBody:
      "Broker handshake is in progress. This usually takes under a minute.",
    reconnectAction: "Reconnect broker",
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
