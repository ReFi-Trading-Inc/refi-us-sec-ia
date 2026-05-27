// Maya Thompson — California, eligible, Alpaca connected, KYC approved.
// Full production-depth persona: 10 positions, 6 recommendations spanning
// every status, partial fill + broker reject + stale broker event + support
// boundary event in activity feed, all three compliance verdict tiers
// (ALLOW/REVIEW/DENY) represented in activity history.

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
  account_id: "acct_maya_001",
  wallet_id: "wallet_0xMAYA",
  roles: ["client"],
  kyc_status: "approved",
  tier: "managed",
};

const kyc: KycStatus = {
  status: "approved",
  provider: "ComplyCube",
  last_updated: daysAgo(9),
  provider_reference: "ccid_session_maya_001",
};

const brokerConnection: BrokerConnection = {
  broker_id: "alpaca",
  broker_name: "Alpaca",
  status: "connected",
  connected_at: daysAgo(27),
  data_stale: false,
  last_synced_at: minutesAgo(3),
};

const brokerAccount: BrokerAccount = {
  account_number: "APX-7741920",
  equity: 84_312.41,
  buying_power: 18_004.18,
  cash: 6_204.09,
  currency: "USD",
};

// 10 positions across asset classes — broad market, growth, defensives, bonds.
const positions: Position[] = [
  {
    symbol: "AAPL",
    qty: 40,
    market_value: 8_644.0,
    unrealized_pl: 644.0,
    unrealized_plpc: 0.0805,
    current_price: 216.1,
    avg_entry_price: 200.0,
    side: "long",
  },
  {
    symbol: "MSFT",
    qty: 22,
    market_value: 9_416.66,
    unrealized_pl: 1_216.66,
    unrealized_plpc: 0.1483,
    current_price: 428.03,
    avg_entry_price: 372.73,
    side: "long",
  },
  {
    symbol: "VOO",
    qty: 30,
    market_value: 16_512.0,
    unrealized_pl: 312.0,
    unrealized_plpc: 0.01928,
    current_price: 550.4,
    avg_entry_price: 540.0,
    side: "long",
  },
  {
    symbol: "QQQ",
    qty: 18,
    market_value: 9_882.0,
    unrealized_pl: 1_152.0,
    unrealized_plpc: 0.132,
    current_price: 549.0,
    avg_entry_price: 485.0,
    side: "long",
  },
  {
    symbol: "NVDA",
    qty: 12,
    market_value: 14_280.0,
    unrealized_pl: 3_360.0,
    unrealized_plpc: 0.3077,
    current_price: 1_190.0,
    avg_entry_price: 910.0,
    side: "long",
  },
  {
    symbol: "GOOGL",
    qty: 25,
    market_value: 4_625.0,
    unrealized_pl: 125.0,
    unrealized_plpc: 0.0278,
    current_price: 185.0,
    avg_entry_price: 180.0,
    side: "long",
  },
  {
    symbol: "VTI",
    qty: 35,
    market_value: 9_870.0,
    unrealized_pl: 470.0,
    unrealized_plpc: 0.05,
    current_price: 282.0,
    avg_entry_price: 268.57,
    side: "long",
  },
  {
    symbol: "BND",
    qty: 60,
    market_value: 4_368.0,
    unrealized_pl: -132.0,
    unrealized_plpc: -0.0293,
    current_price: 72.8,
    avg_entry_price: 75.0,
    side: "long",
  },
  {
    symbol: "JNJ",
    qty: 14,
    market_value: 2_184.0,
    unrealized_pl: -56.0,
    unrealized_plpc: -0.025,
    current_price: 156.0,
    avg_entry_price: 160.0,
    side: "long",
  },
  {
    symbol: "BRK.B",
    qty: 5,
    market_value: 2_325.66,
    unrealized_pl: 175.66,
    unrealized_plpc: 0.0817,
    current_price: 465.13,
    avg_entry_price: 430.0,
    side: "long",
  },
];

// Orders: 1 filled, 1 submitted (open limit), 1 partial fill, 1 broker reject.
const orders: Order[] = [
  {
    id: "ord_m_001",
    symbol: "AAPL",
    qty: 10,
    side: "buy",
    type: "market",
    status: "filled",
    filled_qty: 10,
    filled_avg_price: 214.8,
    created_at: daysAgo(4),
    client_order_id: "client_maya_ord_001",
  },
  {
    id: "ord_m_002",
    symbol: "VOO",
    qty: 5,
    side: "buy",
    type: "limit",
    status: "submitted",
    limit_price: 545.0,
    created_at: hoursAgo(26),
    client_order_id: "client_maya_ord_002",
  },
  {
    id: "ord_m_003",
    symbol: "NVDA",
    qty: 8,
    side: "buy",
    type: "market",
    // Daniel-canonical per apps/common/trade_lifecycle/states.py.
    // The retired "partial" value is rejected by discipline.test.ts T1.
    status: "partially_filled",
    filled_qty: 3,
    filled_avg_price: 1_188.5,
    created_at: hoursAgo(8),
    client_order_id: "client_maya_ord_003",
  },
  {
    id: "ord_m_004",
    symbol: "TSLA",
    qty: 4,
    side: "buy",
    type: "limit",
    status: "rejected",
    limit_price: 240.0,
    created_at: hoursAgo(36),
    client_order_id: "client_maya_ord_004",
  },
];

// 6 recommendations spanning every status: 3 accepted, 1 denied, 1 review, 1 expired.
const recommendations: Recommendation[] = [
  {
    id: "rec_m_001",
    symbol: "QQQ",
    action: "buy",
    confidence: 0.78,
    rationale:
      "Reallocation toward growth-tilted index exposure consistent with your stated horizon and risk tolerance.",
    created_at: hoursAgo(2),
    status: "pending",
    expires_at: hoursFromNow(46),
  },
  {
    id: "rec_m_002",
    symbol: "AAPL",
    action: "buy",
    confidence: 0.81,
    rationale:
      "Add 10 shares — within concentration cap; aligns with growth tilt.",
    created_at: daysAgo(4),
    status: "accepted",
    expires_at: hoursAgo(70),
  },
  {
    id: "rec_m_003",
    symbol: "MSFT",
    action: "buy",
    confidence: 0.74,
    rationale: "Quarterly rebalance toward technology overweight.",
    created_at: daysAgo(12),
    status: "accepted",
    expires_at: daysAgo(10),
  },
  {
    id: "rec_m_004",
    symbol: "BND",
    action: "buy",
    confidence: 0.66,
    rationale: "Increase fixed-income allocation to target band.",
    created_at: daysAgo(18),
    status: "accepted",
    expires_at: daysAgo(16),
  },
  {
    id: "rec_m_005",
    symbol: "TSLA",
    action: "buy",
    confidence: 0.52,
    rationale:
      "Momentum signal triggered — flagged for manual review due to single-position concentration.",
    created_at: hoursAgo(14),
    status: "review",
    expires_at: hoursFromNow(34),
  },
  {
    id: "rec_m_006",
    symbol: "GLD",
    action: "buy",
    confidence: 0.41,
    rationale: "Hedge inflation exposure with gold allocation.",
    created_at: daysAgo(2),
    status: "denied",
    expires_at: hoursFromNow(22),
  },
  {
    id: "rec_m_007",
    symbol: "VTI",
    action: "buy",
    confidence: 0.69,
    rationale: "Broad-market rebalance — expired without user action.",
    created_at: daysAgo(8),
    status: "expired",
    expires_at: daysAgo(6),
  },
];

// Activity feed: 1 each of KYC approved, eligibility, ALLOW/REVIEW/DENY verdicts,
// partial fill, broker reject, stale broker event, disclosure-blocked activation,
// support boundary event, plus the 3 accepted recommendations.
const activity: ActivityEvent[] = [
  {
    id: "evt_m_001",
    type: "recommendation",
    description: "New recommendation generated for QQQ.",
    created_at: hoursAgo(2),
  },
  {
    id: "evt_m_002",
    type: "compliance",
    description: "Compliance preview: ALLOW (QQQ buy, fresh, 38ms).",
    created_at: hoursAgo(2),
  },
  {
    id: "evt_m_003",
    type: "compliance",
    description: "Compliance preview: REVIEW (TSLA buy, REVIEW_CONCENTRATION).",
    created_at: hoursAgo(14),
  },
  {
    id: "evt_m_004",
    type: "compliance",
    description:
      "Compliance preview: DENY (GLD buy, DENY_DISCLOSURE_REQUIRED).",
    created_at: daysAgo(2),
  },
  {
    id: "evt_m_005",
    type: "order",
    description: "Market buy of 8 NVDA — partial fill 3/8 at $1,188.50.",
    created_at: hoursAgo(8),
  },
  {
    id: "evt_m_006",
    type: "order",
    description:
      "Limit buy of 4 TSLA @ $240.00 rejected by broker (insufficient buying power).",
    created_at: hoursAgo(36),
  },
  {
    id: "evt_m_007",
    type: "compliance",
    description: "Broker data freshness warning — last sync 47 minutes ago.",
    created_at: minutesAgo(47),
  },
  {
    id: "evt_m_008",
    type: "compliance",
    description:
      "Managed Execution activation blocked — pending Form CRS, ADV Part 2A, IAA acknowledgment.",
    created_at: daysAgo(1),
  },
  {
    id: "evt_m_009",
    type: "compliance",
    description:
      "Support boundary engaged — request for buy/sell guidance classified as advice; ticket not submitted.",
    created_at: daysAgo(3),
  },
  {
    id: "evt_m_010",
    type: "order",
    description: "Limit buy of 5 VOO @ $545.00 submitted.",
    created_at: hoursAgo(26),
  },
  {
    id: "evt_m_011",
    type: "order",
    description: "Market buy of 10 AAPL filled at $214.80.",
    created_at: daysAgo(4),
  },
  {
    id: "evt_m_012",
    type: "eligibility",
    description: "Eligibility check completed: eligible (CA).",
    created_at: daysAgo(30),
  },
  {
    id: "evt_m_013",
    type: "compliance",
    description: "Identity verification approved (ComplyCube).",
    created_at: daysAgo(9),
  },
];

// Deep detail records — only the most-likely-viewed recommendations get one.
// Detail page falls back to the shallow Recommendation when missing.
const recommendationDetails: Record<string, RecommendationDetail> = {
  rec_m_001: {
    id: "rec_m_001",
    account_id: "acct_maya_001",
    title: "Reallocate toward growth-tilted index exposure (QQQ)",
    recommendation_type: "buy",
    status: "delivered",
    generated_at: hoursAgo(2),
    expires_at: hoursFromNow(46),
    advisory_context: {
      profile_version: "profile-2026.05.1",
      strategy_version: "strategy-2026.05.1",
      model_version: "signal-1.4.0",
      disclosure_version_set: "disclosures-2026.04",
      execution_policy_version: "exec-pol-2026.05.1",
    },
    recommendation: {
      symbol: "QQQ",
      name: "Invesco QQQ Trust",
      side: "buy",
      quantity: 6,
      notional_usd: 3_294.0,
      order_type: "market",
      time_in_force: "day",
    },
    explanation: {
      summary:
        "Add 6 shares of QQQ to bring growth-equity exposure to your target band.",
      why_now:
        "Your strategy targets 60% equities with a growth tilt; current allocation sits 4.2 points below band after the recent rebalance.",
      why_this_fits_profile:
        "Profile: long-term growth, 5–10 year horizon, moderate risk tolerance. QQQ is on your strategy's eligible-asset list and stays within per-position cap.",
      portfolio_impact:
        "Increases QQQ weighting from 11.7% to 15.6% of equities. Total equity allocation moves from 56.1% to 58.4% (target 60%). No other position changes triggered.",
      risk_notes: [
        "QQQ concentrated in technology; correlates with existing AAPL/MSFT/NVDA exposure.",
        "Beta to S&P 500: 1.12 over trailing 3 years.",
      ],
      cost_notes: [
        "Estimated broker commission: $0.00 (Alpaca commission-free for US equities).",
        "Expense ratio: 0.20% (already reflected in market price).",
      ],
      tax_notes: [
        "Purchase establishes new tax lot — no immediate tax consequence.",
        "Held >12 months qualifies for long-term capital gains treatment on future disposition.",
      ],
    },
    model_factors: [
      {
        name: "Relative momentum (90d)",
        direction: "positive",
        weight: 0.32,
        explanation:
          "QQQ has outperformed VOO by 4.1% over the trailing 90 days, consistent with growth-regime signal.",
      },
      {
        name: "Allocation drift",
        direction: "positive",
        weight: 0.28,
        explanation:
          "Current allocation 4.2pp below target band — triggers rebalance candidate.",
      },
      {
        name: "Correlation overlap",
        direction: "negative",
        weight: 0.18,
        explanation:
          "Holds top-weighted overlap with existing AAPL, MSFT, NVDA positions.",
      },
      {
        name: "Volatility regime",
        direction: "neutral",
        weight: 0.12,
        explanation:
          "VIX at 14.2 — neither tailwind nor headwind for the recommendation.",
      },
      {
        name: "Liquidity (ADV)",
        direction: "positive",
        weight: 0.1,
        explanation:
          "Average daily volume >$15B; order size well within market-impact tolerance.",
      },
    ],
    guardrails: [
      {
        code: "PER_POSITION_CAP",
        label: "Per-position cap",
        status: "pass",
        current_value: 0.156,
        limit_value: 0.2,
        message: "QQQ at 15.6% post-trade; cap is 20%.",
      },
      {
        code: "SECTOR_CONCENTRATION",
        label: "Sector concentration",
        status: "warn",
        current_value: 0.41,
        limit_value: 0.3,
        message:
          "Technology sector exposure already at 41% post-trade vs 30% target cap.",
      },
      {
        code: "DAILY_TURNOVER",
        label: "Daily turnover",
        status: "pass",
        current_value: 0.038,
        limit_value: 0.1,
        message: "Trade size is 3.8% of portfolio; cap is 10%.",
      },
      {
        code: "DISCLOSURE_REQUIRED",
        label: "Disclosure acknowledgment",
        status: "fail",
        message:
          "Form CRS, ADV Part 2A, and Investment Advisory Agreement acknowledgments required before Managed Execution.",
      },
    ],
    automation_eligibility: {
      status: "ALLOW",
      source: "mock",
      reasons: [],
      checked_at: minutesAgo(2),
      expires_at: hoursFromNow(1),
      policy_version: "pol-2026.05.1",
    },
    record: {
      record_id: "rec_record_m_001_v1",
      audit_hash:
        "0x8c4e9b1a2d6f7e3c5b8a9d0e2f4c6b8a1d3e5f7c9b2a4d6e8f0a2c4e6b8d0a2c",
      explorer_status: "pending_phase_3",
    },
  },
  rec_m_005: {
    id: "rec_m_005",
    account_id: "acct_maya_001",
    title: "Single-name momentum exposure (TSLA)",
    recommendation_type: "buy",
    status: "review",
    generated_at: hoursAgo(14),
    expires_at: hoursFromNow(34),
    advisory_context: {
      profile_version: "profile-2026.05.1",
      strategy_version: "strategy-2026.05.1",
      model_version: "signal-1.4.0",
      disclosure_version_set: "disclosures-2026.04",
      execution_policy_version: "exec-pol-2026.05.1",
    },
    recommendation: {
      symbol: "TSLA",
      name: "Tesla, Inc.",
      side: "buy",
      quantity: 4,
      notional_usd: 960.0,
      order_type: "limit",
      limit_price: 240.0,
      time_in_force: "day",
    },
    explanation: {
      summary: "Momentum signal triggered on TSLA; flagged for manual review.",
      why_now:
        "Trailing 30-day relative strength is in the top decile of the strategy's eligible universe.",
      why_this_fits_profile:
        "Single-name exposure sits at the edge of your concentration tolerance; the strategy normally favors index instruments — this is an exception path.",
      portfolio_impact:
        "Adds a 1.1% single-position allocation. Pushes single-name exposure (excluding indices) from 18.3% to 19.4%; cap is 20%.",
      risk_notes: [
        "Single-name idiosyncratic risk above strategy default.",
        "30-day realized volatility: 47% annualized.",
      ],
      cost_notes: ["Commission-free; standard exchange fees apply."],
      tax_notes: ["New tax lot."],
    },
    model_factors: [
      {
        name: "30d momentum decile",
        direction: "positive",
        weight: 0.41,
        explanation: "Top decile in eligible-universe momentum ranking.",
      },
      {
        name: "Concentration headroom",
        direction: "negative",
        weight: 0.34,
        explanation: "Single-name allocation approaches concentration cap.",
      },
      {
        name: "Realized volatility",
        direction: "negative",
        weight: 0.16,
        explanation: "47% annualized — well above strategy median (22%).",
      },
    ],
    guardrails: [
      {
        code: "PER_POSITION_CAP",
        label: "Per-position cap",
        status: "pass",
        current_value: 0.011,
        limit_value: 0.2,
        message: "TSLA at 1.1% post-trade.",
      },
      {
        code: "SINGLE_NAME_CONCENTRATION",
        label: "Single-name concentration",
        status: "warn",
        current_value: 0.194,
        limit_value: 0.2,
        message: "Single-name (non-index) exposure 19.4% vs 20% cap.",
      },
      {
        code: "VOLATILITY_BAND",
        label: "Volatility band",
        status: "warn",
        current_value: 0.47,
        limit_value: 0.35,
        message:
          "Realized vol 47% exceeds strategy band (35%) — manual review triggered.",
      },
    ],
    automation_eligibility: {
      status: "REVIEW",
      source: "mock",
      reasons: [
        {
          code: "REVIEW_CONCENTRATION",
          message:
            "Single-name exposure within 1pp of cap requires manual review.",
        },
        {
          code: "VOLATILITY_BAND_EXCEEDED",
          message: "Realized volatility above strategy band.",
        },
      ],
      checked_at: minutesAgo(8),
      expires_at: hoursFromNow(1),
      policy_version: "pol-2026.05.1",
    },
    record: {
      record_id: "rec_record_m_005_v1",
      audit_hash:
        "0xd2f4e6c8b0a2d4e6f8c0b2a4d6e8f0a2c4e6b8d0a2c4e6f8b0a2d4e6c8b0a2d4",
      explorer_status: "pending_phase_3",
    },
  },
};

const profile: AdvisoryProfileResponse = {
  account_id: "acct_maya_001",
  goal: "Long-term growth",
  timeHorizon: "5–10 years",
  incomeBand: "$100,000–$250,000",
  liquidNetWorth: "$200,000–$500,000",
  riskTolerance: "Moderate",
  investmentExperience: "Some",
  accountPurpose: "Personal",
  updated_at: daysAgo(11),
};

const strategy: StrategyDescriptor = {
  strategyName: "ReFi Signal — Balanced Growth",
  rationale:
    "Allocation tilts toward broad index exposure with a growth bias consistent with your stated horizon and risk tolerance.",
  targetAllocation:
    "60% equities (broad index + growth tilt), 30% fixed income, 10% cash",
  assetUniverse: "US-listed equities and ETFs only",
  riskGuardrails:
    "Per-position cap 8%; daily turnover cap 10%; sector concentration cap 30%",
  expectedTurnover: "Moderate — 15–25% annual",
  exclusions: "No leverage, options, crypto, or non-US securities",
  costsAndFees:
    "Advisory: 0.50% AUM annual. Broker execution fees pass-through.",
  modelVersion: "signal-1.4.0",
};

// Disclosures intentionally false — Maya hits the canonical SEC-blocked state.
const activation: AccountActivationStatus = {
  eligibility: true,
  wallet: true,
  kyc: true,
  profile: true,
  broker: true,
  disclosures: false,
};

// Maya is the canonical Managed-tier persona. ExecutionPolicy is active, no
// exceptions are pending. Under 203A-2(e), Maya does NOT see Accept buttons
// on individual recommendations — the platform auto-executes eligible intents
// within the guardrails she signed at activation.
const executionPolicy: ExecutionPolicy = {
  execution_policy_id: "epol_maya_001",
  execution_policy_version: "v2026.05.1",
  status: "active",
  strategy_id: "strat_balanced_growth_v3",
  broker_connection_id: "bconn_alpaca_maya",
  investor_profile_version: "profile-2026.05.1",
  disclosure_version_set: "disclosures-2026.04",
  advisory_agreement_version: "iaa-2026.04",
  activated_at: daysAgo(11),
  signed_at_hash:
    "0x3f6c9b1a2d6f7e3c5b8a9d0e2f4c6b8a1d3e5f7c9b2a4d6e8f0a2c4e6b8d0a2c",
  automation_scope:
    "Managed Execution authorized for ReFi Signal — Balanced Growth strategy across US-listed equities and ETFs only. No leverage, no options, no crypto.",
  risk_guardrails:
    "Per-position cap 8%; daily turnover cap 10%; sector concentration cap 30%; broker freshness threshold 60 min (auto-pause on breach).",
  pause_rules:
    "Pause on broker-data freshness > 60 min; pause on Compliance Adapter unavailable > 5 min; pause on user-initiated halt.",
};

const pendingExceptions: Exception[] = [];

// ── Daniel-canonical lineage chain (P2.5R-04) ─────────────────────────────
//
// Single full chain for rec_m_001 (QQQ buy). Every entry shares the same
// correlation_id `corr_maya_001` so the lineage join works end-to-end.
//
// Chain: AccountIntent → RiskSnapshot (approved) → ExecutionPlan → OrderRow
// → OrderEvents → BrokerOrderAttempts → Fills → ExecutionSagas
// Spanned tables Daniel will eventually source from listed in inline comments.

const CORR_MAYA_001 = "corr_maya_a4f7b9e2c8d1f3a5b7c9e1d3f5a7b9c1";

const accountIntents: AccountIntent[] = [
  {
    // Spanner: AccountIntents (`docs/IOs/account_intent_builder_IO_details.md:114-154`)
    intent_id: "aint_maya_001",
    action_id: "act_pf_2026_05_19_001",
    intent_kind: "rebalance",
    template_id: "tmpl_balanced_growth_v3",
    template_version: "v2026.05.1",
    account_id: "acct_maya_001",
    ts: hoursAgo(2),
    base_currency: "USD",
    notional_summary: {
      gross_delta_notional: "3294.00",
      net_delta_notional: "3294.00",
      legs_dropped: 0,
      drop_reasons: [],
    },
    status: "ready",
    legs_hash:
      "0xa4f7b9e2c8d1f3a5b7c9e1d3f5a7b9c1d3e5f7a9b1c3d5e7f9a1b3c5d7e9f1a3",
    correlation_id: CORR_MAYA_001,
    legs: [
      {
        asset_id: "us_eq_QQQ",
        symbol: "QQQ",
        target_weight: "0.156",
        direction: "increase",
        target_notional: "3294.00",
        current_notional_est: "9882.00",
        delta_notional: "3294.00",
        delta_qty_est: "6.0",
        side: "buy",
        price_est: "549.00",
        rounding: { lot: "1", min_qty: "1" },
        constraints_hint: { per_position_cap: "0.20" },
        reason_codes: ["template_target_diff", "drift_above_threshold"],
      },
    ],
  },
];

const riskSnapshots: RiskSnapshot[] = [
  {
    // Spanner: RiskSnapshots (`docs/IOs/risk-engine_IO_details.md:174-193`)
    decision: "approved",
    intent_id: "aint_maya_001",
    account_id: "acct_maya_001",
    correlation_id: CORR_MAYA_001,
    ts: hoursAgo(2),
    snapshot_hash:
      "0x8c4e9b1a2d6f7e3c5b8a9d0e2f4c6b8a1d3e5f7c9b2a4d6e8f0a2c4e6b8d0a2c",
    constraints: [
      "per_position_cap_0.20",
      "sector_concentration_cap_0.30",
      "daily_turnover_cap_0.10",
    ],
    reasons: [],
    metrics: {
      equity: "84312.41",
      positions_age_ms: 38,
      prices_age_ms_max: 42,
    },
  },
];

const executionPlans: ExecutionPlan[] = [
  {
    // Spanner: ExecutionPlans (`docs/IOs/exec-gateway_IO_details.md:91-145`)
    plan_id: "plan_maya_001",
    intent_id: "aint_maya_001",
    account_id: "acct_maya_001",
    status: "reconciled",
    driver: "snaptrade",
    created_at: hoursAgo(2),
    meta: { correlation_id: CORR_MAYA_001 },
  },
];

const orderRows: OrderRow[] = [
  {
    // Spanner: Orders (`docs/IOs/exec-gateway_IO_details.md:74`)
    order_id: "ord_maya_lineage_001",
    plan_id: "plan_maya_001",
    client_order_id: "cli_maya_001",
    account_id: "acct_maya_001",
    intent_id: "aint_maya_001",
    asset: "us_eq_QQQ",
    symbol: "QQQ",
    side: "buy",
    qty: "6.0",
    order_type: "market",
    tif: "day",
    venue: "alpaca",
    split_idx: 0,
    status: "filled",
    filled_qty: "6.0",
    avg_fill_price: "549.12",
    updated_at: hoursAgo(2),
    meta: { correlation_id: CORR_MAYA_001 },
  },
];

const orderEvents: OrderEvent[] = [
  {
    event_id: "oevt_maya_001_a",
    order_id: "ord_maya_lineage_001",
    event_type: "submit",
    prev_status: "pending_submit",
    new_status: "submitted",
    ts: hoursAgo(2),
  },
  {
    event_id: "oevt_maya_001_b",
    order_id: "ord_maya_lineage_001",
    event_type: "ack",
    prev_status: "submitted",
    new_status: "acknowledged",
    ts: hoursAgo(2),
  },
  {
    event_id: "oevt_maya_001_c",
    order_id: "ord_maya_lineage_001",
    event_type: "fill",
    prev_status: "working",
    new_status: "filled",
    ts: hoursAgo(2),
  },
];

const brokerOrderAttempts: BrokerOrderAttempt[] = [
  {
    // Spanner: BrokerOrderAttempts (`trade_lifecycle_contract.md:91`)
    attempt_id: "att_maya_001_a",
    order_id: "ord_maya_lineage_001",
    action: "submit",
    broker_order_id: "alpaca_ord_abc123",
    ts: hoursAgo(2),
    latency_ms: 142,
    http_status: 200,
  },
  {
    attempt_id: "att_maya_001_b",
    order_id: "ord_maya_lineage_001",
    action: "poll",
    broker_order_id: "alpaca_ord_abc123",
    ts: hoursAgo(2),
    latency_ms: 88,
    http_status: 200,
  },
];

const fills: Fill[] = [
  {
    fill_id: "fill_maya_001",
    order_id: "ord_maya_lineage_001",
    broker_execution_id: "alpaca_exec_xyz789",
    qty: "6.0",
    price: "549.12",
    ts: hoursAgo(2),
    fees: { commission: "0.00", regulatory: "0.04" },
  },
];

const executionSagas: ExecutionSagaMilestone[] = [
  {
    saga_id: "saga_maya_001",
    plan_id: "plan_maya_001",
    milestone: "plan_created",
    ts: hoursAgo(2),
  },
  {
    saga_id: "saga_maya_001",
    plan_id: "plan_maya_001",
    milestone: "orders_submitted",
    ts: hoursAgo(2),
  },
  {
    saga_id: "saga_maya_001",
    plan_id: "plan_maya_001",
    milestone: "fills_received",
    ts: hoursAgo(2),
  },
  {
    saga_id: "saga_maya_001",
    plan_id: "plan_maya_001",
    milestone: "reconciled",
    ts: hoursAgo(2),
  },
];

// Daniel-canonical Position wire shape (mirrors the UI positions array with
// string decimals + asset_id keyed). Two-way mapping happens at the BFF /
// adapter boundary in P2.5R-21 fixture rework.
const brokerPositions: BrokerPosition[] = [
  {
    asset_id: "us_eq_AAPL",
    symbol: "AAPL",
    qty: "40",
    avg_price: "200.00",
    notional: "8644.00",
    side: "long",
  },
  {
    asset_id: "us_eq_MSFT",
    symbol: "MSFT",
    qty: "22",
    avg_price: "372.73",
    notional: "9416.66",
    side: "long",
  },
  {
    asset_id: "us_eq_VOO",
    symbol: "VOO",
    qty: "30",
    avg_price: "540.00",
    notional: "16512.00",
    side: "long",
  },
  {
    asset_id: "us_eq_QQQ",
    symbol: "QQQ",
    qty: "18",
    avg_price: "485.00",
    notional: "9882.00",
    side: "long",
  },
  {
    asset_id: "us_eq_NVDA",
    symbol: "NVDA",
    qty: "12",
    avg_price: "910.00",
    notional: "14280.00",
    side: "long",
  },
  {
    asset_id: "us_eq_GOOGL",
    symbol: "GOOGL",
    qty: "25",
    avg_price: "180.00",
    notional: "4625.00",
    side: "long",
  },
  {
    asset_id: "us_eq_VTI",
    symbol: "VTI",
    qty: "35",
    avg_price: "268.57",
    notional: "9870.00",
    side: "long",
  },
  {
    asset_id: "us_eq_BND",
    symbol: "BND",
    qty: "60",
    avg_price: "75.00",
    notional: "4368.00",
    side: "long",
  },
  {
    asset_id: "us_eq_JNJ",
    symbol: "JNJ",
    qty: "14",
    avg_price: "160.00",
    notional: "2184.00",
    side: "long",
  },
  {
    asset_id: "us_eq_BRK.B",
    symbol: "BRK.B",
    qty: "5",
    avg_price: "430.00",
    notional: "2325.66",
    side: "long",
  },
];

const controlState: TradingControlState = {
  state: "active",
  scope: "account",
  scope_id: "acct_maya_001",
  set_at: daysAgo(11),
};

export const mayaThompson: PersonaPackage = {
  id: "maya",
  displayName: "Maya Thompson",
  oneLiner: "California — Managed Execution active, Alpaca connected",
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
