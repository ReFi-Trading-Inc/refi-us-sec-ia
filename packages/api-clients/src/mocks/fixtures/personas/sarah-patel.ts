// Sarah Patel — Texas, KYC under review (exercises polling UI), broker
// connected with stale data flag, 4 positions, 2 recommendations of which
// one sits in compliance REVIEW (tax-impact). Exercises the REVIEW path and
// the broker-stale UI banner.

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
  TradingControlState,
} from "../../../generated/api";
import {
  daysAgo,
  hoursAgo,
  hoursFromNow,
  minutesAgo,
  type PersonaPackage,
} from "./types";

const session: AuthSession = {
  status: "authenticated",
  account_id: "acct_sarah_003",
  wallet_id: "wallet_0xSARAH",
  roles: ["client"],
  kyc_status: "under_review",
  tier: "managed",
};

const kyc: KycStatus = {
  status: "under_review",
  provider: "ComplyCube",
  last_updated: hoursAgo(6),
  provider_reference: "ccid_session_sarah_003",
};

// Sarah's activity feed already carries a stale-broker-data event 12 minutes
// ago — the connection itself reflects that with data_stale: true and a
// last_synced_at older than the freshness window (typically 5 min).
const brokerConnection: BrokerConnection = {
  broker_id: "alpaca",
  broker_name: "Alpaca",
  status: "connected",
  connected_at: daysAgo(14),
  data_stale: true,
  last_synced_at: minutesAgo(12),
};

const brokerAccount: BrokerAccount = {
  account_number: "APX-3318042",
  equity: 23_456.78,
  buying_power: 5_120.0,
  cash: 1_456.78,
  currency: "USD",
};

const positions: Position[] = [
  {
    symbol: "VOO",
    qty: 18,
    market_value: 9_907.2,
    unrealized_pl: 187.2,
    unrealized_plpc: 0.0193,
    current_price: 550.4,
    avg_entry_price: 540.0,
    side: "long",
  },
  {
    symbol: "AAPL",
    qty: 22,
    market_value: 4_754.2,
    unrealized_pl: 354.2,
    unrealized_plpc: 0.0805,
    current_price: 216.1,
    avg_entry_price: 200.0,
    side: "long",
  },
  {
    symbol: "BND",
    qty: 80,
    market_value: 5_824.0,
    unrealized_pl: -176.0,
    unrealized_plpc: -0.0293,
    current_price: 72.8,
    avg_entry_price: 75.0,
    side: "long",
  },
  {
    symbol: "VTI",
    qty: 11,
    market_value: 3_102.0,
    unrealized_pl: 147.78,
    unrealized_plpc: 0.05,
    current_price: 282.0,
    avg_entry_price: 268.57,
    side: "long",
  },
];

const orders: Order[] = [
  {
    id: "ord_s_001",
    symbol: "VOO",
    qty: 3,
    side: "buy",
    type: "market",
    status: "filled",
    filled_qty: 3,
    filled_avg_price: 548.7,
    created_at: daysAgo(6),
    client_order_id: "client_sarah_ord_001",
  },
];

const recommendations: Recommendation[] = [
  {
    id: "rec_s_001",
    symbol: "AAPL",
    action: "sell",
    confidence: 0.62,
    rationale:
      "Trim concentration above 18% — rebalance toward target allocation.",
    created_at: hoursAgo(4),
    status: "review",
    expires_at: hoursFromNow(44),
  },
  {
    id: "rec_s_002",
    symbol: "BND",
    action: "buy",
    confidence: 0.71,
    rationale: "Increase fixed-income allocation to target band.",
    created_at: hoursAgo(20),
    status: "pending",
    expires_at: hoursFromNow(28),
  },
];

const activity: ActivityEvent[] = [
  {
    id: "evt_s_001",
    type: "recommendation",
    description:
      "New recommendation generated for AAPL (sell — concentration rebalance).",
    created_at: hoursAgo(4),
  },
  {
    id: "evt_s_002",
    type: "compliance",
    description:
      "Compliance preview: REVIEW (AAPL sell, REVIEW_TAX_IMPACT — short-term gain).",
    created_at: hoursAgo(4),
  },
  {
    id: "evt_s_003",
    type: "compliance",
    description: "Broker data freshness warning — last sync 12 minutes ago.",
    created_at: minutesAgo(12),
  },
  {
    id: "evt_s_004",
    type: "compliance",
    description: "Identity verification submitted — pending manual review.",
    created_at: hoursAgo(6),
  },
  {
    id: "evt_s_005",
    type: "eligibility",
    description: "Eligibility check completed: eligible (TX).",
    created_at: daysAgo(15),
  },
];

const recommendationDetails: Record<string, RecommendationDetail> = {
  rec_s_001: {
    id: "rec_s_001",
    account_id: "acct_sarah_003",
    title: "Trim AAPL concentration (rebalance toward target)",
    recommendation_type: "rebalance",
    status: "review",
    generated_at: hoursAgo(4),
    expires_at: hoursFromNow(44),
    advisory_context: {
      profile_version: "profile-2026.05.1",
      strategy_version: "strategy-2026.05.1",
      model_version: "signal-1.4.0",
      disclosure_version_set: "disclosures-2026.04",
      execution_policy_version: "exec-pol-2026.05.1",
    },
    recommendation: {
      symbol: "AAPL",
      name: "Apple Inc.",
      side: "sell",
      quantity: 6,
      notional_usd: 1_296.6,
      order_type: "market",
      time_in_force: "day",
    },
    explanation: {
      summary:
        "Sell 6 shares of AAPL to bring single-position weight back to target band.",
      why_now:
        "AAPL has appreciated 8% over the trailing 30 days; position weight now 20.3% vs 18% target band.",
      why_this_fits_profile:
        "Profile: long-term, moderate risk tolerance, 6% per-position cap. Position currently above cap requires rebalance.",
      portfolio_impact:
        "Reduces AAPL weighting from 20.3% to 14.8%. Proceeds reallocated to cash; suggested redeployment to BND in companion recommendation rec_s_002.",
      risk_notes: [
        "Reduces concentration risk in single-name exposure.",
        "Tax-impact concern: short-term gain on 6 of 22 lots — see tax_notes.",
      ],
      cost_notes: ["Commission-free."],
      tax_notes: [
        "Sell triggers short-term capital gain of approximately $354 on the lots acquired within the last 12 months.",
        "Estimated federal+state tax impact: ~$120 at marginal bracket.",
        "REVIEW: tax-impact threshold exceeded — manual approval required.",
      ],
    },
    model_factors: [
      {
        name: "Allocation drift",
        direction: "positive",
        weight: 0.46,
        explanation: "Position 2.3pp above per-position cap.",
      },
      {
        name: "Tax-loss harvesting opportunity",
        direction: "negative",
        weight: 0.22,
        explanation: "No tax-loss harvesting opportunity at current basis.",
      },
      {
        name: "Recent momentum",
        direction: "neutral",
        weight: 0.18,
        explanation: "Trailing momentum decelerating but not negative.",
      },
    ],
    guardrails: [
      {
        code: "PER_POSITION_CAP",
        label: "Per-position cap",
        status: "fail",
        current_value: 0.203,
        limit_value: 0.18,
        message: "AAPL at 20.3% pre-trade; cap is 18%.",
      },
      {
        code: "TAX_IMPACT_THRESHOLD",
        label: "Short-term tax impact",
        status: "fail",
        current_value: 354,
        limit_value: 250,
        message: "Short-term gain on 6 lots exceeds $250 review threshold.",
      },
      {
        code: "DAILY_TURNOVER",
        label: "Daily turnover",
        status: "pass",
        current_value: 0.055,
        limit_value: 0.08,
        message: "Trade size 5.5% of portfolio; cap 8%.",
      },
    ],
    automation_eligibility: {
      status: "REVIEW",
      source: "mock",
      reasons: [
        {
          code: "REVIEW_TAX_IMPACT",
          message:
            "Short-term capital gain exceeds per-trade tax-impact review threshold.",
        },
      ],
      checked_at: minutesAgo(5),
      expires_at: hoursFromNow(1),
      policy_version: "pol-2026.05.1",
    },
    record: {
      record_id: "rec_record_s_001_v1",
      audit_hash:
        "0x5a7c9e1b3d5f7a9c1e3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c",
      explorer_status: "pending_phase_3",
    },
  },
};

const profile: AdvisoryProfileResponse = {
  account_id: "acct_sarah_003",
  goal: "Retirement",
  timeHorizon: "10+ years",
  incomeBand: "$75,000–$100,000",
  liquidNetWorth: "$50,000–$200,000",
  riskTolerance: "Moderate",
  investmentExperience: "Limited",
  accountPurpose: "Retirement (taxable account)",
  updated_at: daysAgo(13),
};

const strategy: StrategyDescriptor = {
  strategyName: "ReFi Signal — Balanced Growth",
  rationale:
    "Allocation tilts toward broad index exposure with conservative guardrails consistent with your long horizon and moderate risk tolerance.",
  targetAllocation: "55% equities (broad index), 40% fixed income, 5% cash",
  assetUniverse: "US-listed equities and ETFs only",
  riskGuardrails:
    "Per-position cap 6%; daily turnover cap 8%; sector concentration cap 25%",
  expectedTurnover: "Low — 10–15% annual",
  exclusions: "No leverage, options, crypto, or non-US securities",
  costsAndFees:
    "Advisory: 0.50% AUM annual. Broker execution fees pass-through.",
  modelVersion: "signal-1.4.0",
};

const activation: AccountActivationStatus = {
  eligibility: true,
  wallet: true,
  // KYC under review — activation correctly blocked even before disclosures.
  kyc: false,
  profile: true,
  broker: true,
  disclosures: false,
};

// Sarah is the canonical Managed-tier persona WITH a pending Exception.
// Her AAPL trim recommendation triggered a REVIEW_TAX_IMPACT verdict from
// the policy engine, which routed it to Exception Review — the ONE place
// under Managed mode where an investor approves an individual decision.
const executionPolicy: ExecutionPolicy = {
  execution_policy_id: "epol_sarah_001",
  execution_policy_version: "v2026.05.1",
  status: "active",
  strategy_id: "strat_balanced_growth_v3",
  broker_connection_id: "bconn_alpaca_sarah",
  investor_profile_version: "profile-2026.05.1",
  disclosure_version_set: "disclosures-2026.04",
  advisory_agreement_version: "iaa-2026.04",
  activated_at: daysAgo(13),
  signed_at_hash:
    "0x9c5b8d1f3e7a4c6b2d8f0e2a4c6b8d1f3e5c7b9a2d4f6e8a0c2b4d6f8e0a2c4b",
  automation_scope:
    "Managed Execution authorized for ReFi Signal — Balanced Growth strategy across US-listed equities and ETFs only. No leverage, no options, no crypto.",
  risk_guardrails:
    "Per-position cap 6%; daily turnover cap 8%; sector concentration cap 25%; tax-impact review threshold $250 short-term gain (auto-route to exception).",
  pause_rules:
    "Pause on broker-data freshness > 60 min; pause on Compliance Adapter unavailable > 5 min; pause on user-initiated halt.",
};

const pendingExceptions: Exception[] = [
  {
    exception_id: "exc_sarah_001",
    account_intent_id: "aint_sarah_001",
    recommendation_id: "rec_s_001",
    status: "pending",
    created_at: hoursAgo(4),
    expires_at: hoursFromNow(44),
    reasons: [
      {
        code: "REVIEW_TAX_IMPACT",
        message:
          "Short-term capital gain of ~$354 on the AAPL trim exceeds the $250 tax-impact threshold set in your guardrails.",
      },
    ],
    summary:
      "AAPL trim — sell 6 shares to rebalance per-position cap. Tax impact exceeds your $250 short-term gain threshold; requires your approval.",
  },
];

// ── Daniel-canonical lineage for Sarah's pending exception ────────────────
//
// AccountIntent for the AAPL trim that was REJECTED by risk-engine due to
// REVIEW_TAX_IMPACT exceeding the $250 short-term gain guardrail.

const CORR_SARAH_001 = "corr_sarah_d2f4e6c8b0a2d4e6f8c0b2a4d6e8f0a2";

const accountIntents: AccountIntent[] = [
  {
    intent_id: "aint_sarah_001",
    action_id: "act_pf_2026_05_19_sarah_001",
    intent_kind: "rebalance",
    template_id: "tmpl_balanced_growth_v3",
    template_version: "v2026.05.1",
    account_id: "acct_sarah_003",
    ts: hoursAgo(4),
    base_currency: "USD",
    notional_summary: {
      gross_delta_notional: "1296.60",
      net_delta_notional: "-1296.60",
      legs_dropped: 0,
      drop_reasons: [],
    },
    status: "blocked",
    blocked_reason: "tax_impact_exceeds_threshold",
    legs_hash:
      "0x5a7c9e1b3d5f7a9c1e3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c",
    correlation_id: CORR_SARAH_001,
    legs: [
      {
        asset_id: "us_eq_AAPL",
        symbol: "AAPL",
        target_weight: "0.148",
        direction: "decrease",
        target_notional: "3457.60",
        current_notional_est: "4754.20",
        delta_notional: "-1296.60",
        delta_qty_est: "-6.0",
        side: "sell",
        price_est: "216.10",
        rounding: { lot: "1", min_qty: "1" },
        constraints_hint: { tax_impact_threshold_usd: "250" },
        reason_codes: ["per_position_cap_exceeded", "tax_impact_review"],
      },
    ],
  },
];

const riskSnapshots: RiskSnapshot[] = [
  {
    decision: "rejected",
    intent_id: "aint_sarah_001",
    account_id: "acct_sarah_003",
    correlation_id: CORR_SARAH_001,
    ts: hoursAgo(4),
    snapshot_hash:
      "0x9c5b8d1f3e7a4c6b2d8f0e2a4c6b8d1f3e5c7b9a2d4f6e8a0c2b4d6f8e0a2c4b",
    constraints: ["tax_impact_review_threshold_250", "per_position_cap_0.18"],
    reasons: [
      {
        code: "REVIEW_TAX_IMPACT",
        message:
          "Short-term capital gain of ~$354 on the AAPL trim exceeds the $250 tax-impact threshold set in your guardrails.",
      },
    ],
    metrics: {
      equity: "23456.78",
      positions_age_ms: 720_000,
      prices_age_ms_max: 720_000,
    },
  },
];

// Sarah's exception has not yet executed (status="blocked" upstream).
// No ExecutionPlan / OrderRow / etc. exist for this intent.
const executionPlans: ExecutionPlan[] = [];
const orderRows: OrderRow[] = [];
const orderEvents: OrderEvent[] = [];
const brokerOrderAttempts: BrokerOrderAttempt[] = [];
const fills: Fill[] = [];
const executionSagas: ExecutionSagaMilestone[] = [];

const brokerPositions: BrokerPosition[] = [
  {
    asset_id: "us_eq_VOO",
    symbol: "VOO",
    qty: "18",
    avg_price: "540.00",
    notional: "9907.20",
    side: "long",
  },
  {
    asset_id: "us_eq_AAPL",
    symbol: "AAPL",
    qty: "22",
    avg_price: "200.00",
    notional: "4754.20",
    side: "long",
  },
  {
    asset_id: "us_eq_BND",
    symbol: "BND",
    qty: "80",
    avg_price: "75.00",
    notional: "5824.00",
    side: "long",
  },
  {
    asset_id: "us_eq_VTI",
    symbol: "VTI",
    qty: "11",
    avg_price: "268.57",
    notional: "3102.00",
    side: "long",
  },
];

const controlState: TradingControlState = {
  state: "active",
  scope: "account",
  scope_id: "acct_sarah_003",
  set_at: daysAgo(13),
};

export const sarahPatel: PersonaPackage = {
  id: "sarah",
  displayName: "Sarah Patel",
  oneLiner: "Texas — Managed, 1 exception pending, broker stale",
  tier: "managed",
  session,
  kyc,
  brokerConnection,
  brokerAccount,
  positions,
  orders,
  recommendations,
  recommendationDetails,
  activity,
  profile,
  strategy,
  activation,
  executionPolicy,
  pendingExceptions,
  accountIntents,
  riskSnapshots,
  executionPlans,
  orderRows,
  orderEvents,
  brokerOrderAttempts,
  fills,
  executionSagas,
  brokerPositions,
  controlState,
};
