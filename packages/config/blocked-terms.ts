/**
 * SEC-sensitive + brand-voice-violating blocked terms for /us copy.
 * Scanned by scripts/scan-copy.ts on every CI run.
 *
 * Opt-out (per line):
 *   // allow-blocked-term: "term" reason: "..."
 *   // allow-placeholder: "..." reason: "..."
 *
 * Two source-of-truth docs feed this list:
 *   1. SEC marketing/conduct rules (Rule 206(4)-1, Rule 203A-2(e), etc.)
 *   2. refi-build-docs/spec-current/04-brand-voice.md §4 "Words we avoid"
 */
export const blockedTerms: string[] = [
  // --- SEC-sensitive trading terminology ---
  "AI trading bot",
  "autopilot",
  "autonomous trading",
  "signal feed",
  "trade queue",
  "alpha engine",
  "quant terminal",
  "low latency",
  "founder reviewed",
  "staff approved",
  "guaranteed return",
  "guaranteed risk reduction",
  "SEC approved",
  "beat the market",
  "risk-free",
  "auto-profit",
  "robo-trading",
  "black-box AI",

  // --- Brand-voice violations (04-brand-voice.md §4) ---
  "best-in-class",
  "best in class",
  "top-rated",
  "leading provider",
  "powered by AI",
  "AI-powered",
  "AI-driven",
  "personalized advice",
  "expert advice",
  "recommended by experts",
  "your money grows",
  "grow your money",
  "limited time",
  "exclusive offer",
  "lightning fast",
  "lightning-fast",
  "game changing",
  "game-changing",
  "crush the market",
  "effortless investing",

  // --- Admin-investor boundary (docs/admin-investor-boundary.md) ---
  // User-facing copy must never imply per-trade investor approval or operator
  // intervention against a specific client. The tripwire script enforces the
  // identifier-level checks; this list catches the textual variants in copy.
  "accept recommendation",
  "approve trade",
  "approve rebalance",
  "approve recommendation",
  "manual rebalance",
  "manual trade",
  "force inference",
  "force training",
  "force data load",
  "cancel order",
  "config write",
  "controls write",
  "account initialize",
  "operator approval",
  "operator review",
];

/**
 * Terms that appeared in the Bolt source repo and must be replaced.
 * Used by scan-copy.ts to surface legacy copy that wasn't migrated.
 */
export const legacyTerms: Record<string, string> = {
  Signals: "Recommendations",
  "Trade Queue": "Exception Review",
  Autopilot: "Managed Execution",
  "Audit Trail": "Records",
  "Risk Engine": "Risk Guardrails",
  Trace: "Decision Record",
  Dashboard: "Home",
  Settings: "Account",
  "Trading Mode": "Management Preference",
  "Paper Mode": "Simulation",
  "Live Trading": "Managed Execution Activation",
};
