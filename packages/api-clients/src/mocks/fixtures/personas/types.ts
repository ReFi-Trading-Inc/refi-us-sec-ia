// Shared types and helpers for persona fixtures.
//
// A PersonaPackage is the full mock dataset for one investor. The MSW handlers
// route every per-account read/write through `getActivePersona(request)`
// which reads the `refi_persona_v1` cookie and returns the matching package.
// In production (`NEXT_PUBLIC_REFI_ENV=prod`) the persona switcher is hidden
// and the cookie is never set.

import type {
  AccountActivationStatus,
  AccountIntent,
  ActivityEvent,
  AdvisoryProfileResponse,
  AuthSession,
  BrokerAccount,
  BrokerConnection,
  BrokerOrderAttempt,
  BrokerPosition,
  Exception,
  ExecutionPlan,
  ExecutionPolicy,
  ExecutionSagaMilestone,
  Fill,
  KycStatus,
  Order,
  OrderEvent,
  OrderRow,
  Position,
  Recommendation,
  RecommendationDetail,
  RiskSnapshot,
  StrategyDescriptor,
  Tier,
  TradingControlState,
} from "../../../generated/api";

export type PersonaId = "maya" | "david" | "sarah";

export type PersonaPackage = {
  id: PersonaId;
  displayName: string;
  oneLiner: string;
  /** Investor tier — drives every tier-aware UI surface. */
  tier: Tier;
  session: AuthSession;
  kyc: KycStatus;
  /** null when no broker is connected (David). */
  brokerConnection: BrokerConnection | null;
  /** null when no broker account exists yet. */
  brokerAccount: BrokerAccount | null;
  positions: Position[];
  orders: Order[];
  recommendations: Recommendation[];
  /** Map of recommendation id → deep RecommendationDetail. Not every */
  /** recommendation needs a detail record; missing ids return 404 from MSW. */
  recommendationDetails: Record<string, RecommendationDetail>;
  activity: ActivityEvent[];
  profile: AdvisoryProfileResponse | null;
  strategy: StrategyDescriptor | null;
  activation: AccountActivationStatus;
  /** null for Signal-tier users who haven't activated Managed. */
  executionPolicy: ExecutionPolicy | null;
  /** Open exceptions awaiting investor decision. Empty for Signal. */
  pendingExceptions: Exception[];

  // ── Daniel-canonical lineage data (P2.5R-04 additive) ──────────────────
  // Returned by the new BFF endpoints; powers the recommendation-detail
  // lineage panel (P2.5R-05), the records center (P2.5R-11), and the
  // dashboard composite (P2.5R-07).
  // Per-persona scoping:
  //   - Maya: rich lineage for rec_m_001 (1 chain end-to-end)
  //   - Sarah: lineage for the pending exception (intent + rejected snapshot)
  //   - David: all empty
  accountIntents: AccountIntent[];
  riskSnapshots: RiskSnapshot[];
  executionPlans: ExecutionPlan[];
  orderRows: OrderRow[];
  orderEvents: OrderEvent[];
  brokerOrderAttempts: BrokerOrderAttempt[];
  fills: Fill[];
  executionSagas: ExecutionSagaMilestone[];
  /** Daniel-canonical Position wire shape (string decimals, asset_id keyed). */
  brokerPositions: BrokerPosition[];
  /** Trading control state. `active` is the default; `halt`/etc. exercise the banner. */
  controlState: TradingControlState;
};

// Relative-time helpers — keep all timestamps live so demos never look stale.
export const hoursAgo = (h: number): string =>
  new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
export const daysAgo = (d: number): string => hoursAgo(d * 24);
export const minutesAgo = (m: number): string =>
  new Date(Date.now() - m * 60 * 1000).toISOString();
export const hoursFromNow = (h: number): string => hoursAgo(-h);
