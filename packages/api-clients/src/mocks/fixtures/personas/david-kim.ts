// David Kim — New York (waitlist state per SEC IA rule overlay), KYC not
// started, no broker connected, no positions/orders/recommendations.
// Exercises the "blank slate / blocked" UI surfaces.

import type {
  AccountActivationStatus,
  ActivityEvent,
  AuthSession,
  KycStatus,
  TradingControlState,
} from "../../../generated/api";
import { daysAgo, type PersonaPackage } from "./types";

const session: AuthSession = {
  status: "authenticated",
  account_id: "acct_david_002",
  wallet_id: "wallet_0xDAVID",
  roles: ["client"],
  kyc_status: "not_started",
  tier: "signal",
};

const kyc: KycStatus = {
  status: "not_started",
  provider: "ComplyCube",
};

const activity: ActivityEvent[] = [
  {
    id: "evt_d_001",
    type: "eligibility",
    description:
      "Eligibility check completed: waitlist (NY — state not yet supported).",
    created_at: daysAgo(3),
  },
];

const activation: AccountActivationStatus = {
  eligibility: false,
  wallet: true,
  kyc: false,
  profile: false,
  broker: false,
  disclosures: false,
};

const controlState: TradingControlState = {
  state: "active",
  scope: "account",
  scope_id: "acct_david_002",
  set_at: daysAgo(3),
};

export const davidKim: PersonaPackage = {
  id: "david",
  displayName: "David Kim",
  oneLiner: "New York — Signal tier, waitlist, no broker",
  tier: "signal",
  session,
  kyc,
  brokerConnection: null,
  brokerAccount: null,
  positions: [],
  orders: [],
  recommendations: [],
  recommendationDetails: {},
  activity,
  profile: null,
  strategy: null,
  activation,
  executionPolicy: null,
  pendingExceptions: [],
  accountIntents: [],
  riskSnapshots: [],
  executionPlans: [],
  orderRows: [],
  orderEvents: [],
  brokerOrderAttempts: [],
  fills: [],
  executionSagas: [],
  brokerPositions: [],
  controlState,
};
