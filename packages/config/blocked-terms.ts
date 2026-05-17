/**
 * SEC-sensitive blocked terms for /us copy.
 * Scanned by scripts/scan-copy.ts on every CI run.
 * Opt-out: // allow-blocked-term: "term" reason: "..."
 */
export const blockedTerms: string[] = [
  'AI trading bot',
  'autopilot',
  'autonomous trading',
  'signal feed',
  'trade queue',
  'alpha engine',
  'quant terminal',
  'low latency',
  'founder reviewed',
  'staff approved',
  'guaranteed return',
  'guaranteed risk reduction',
  'SEC approved',
  'beat the market',
  'risk-free',
  'auto-profit',
  'robo-trading',
  'black-box AI',
];

/**
 * Terms that appeared in the Bolt source repo and must be replaced.
 * Used by scan-copy.ts to surface legacy copy that wasn't migrated.
 */
export const legacyTerms: Record<string, string> = {
  Signals: 'Recommendations',
  'Trade Queue': 'Exception Review',
  Autopilot: 'Managed Execution',
  'Audit Trail': 'Records',
  'Risk Engine': 'Risk Guardrails',
  Trace: 'Decision Record',
  Dashboard: 'Home',
  Settings: 'Account',
  'Trading Mode': 'Management Preference',
  'Paper Mode': 'Simulation',
  'Live Trading': 'Managed Execution Activation',
};
