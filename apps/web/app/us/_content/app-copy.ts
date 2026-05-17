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
