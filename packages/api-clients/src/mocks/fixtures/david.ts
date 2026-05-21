// David Kim — New York resident (waitlist state), no broker connected,
// no positions, no recommendations yet.
import type {
  ActivityEvent,
  AuthSession,
  BrokerConnection,
  KycStatus,
  Order,
  Position,
  Recommendation,
} from "../../compat";

export const davidSession: AuthSession = {
  status: "authenticated",
  account_id: "acct_david_002",
  wallet_id: "wallet_0xDAVID",
  roles: ["client"],
  kyc_status: "incomplete",
};

export const davidKyc: KycStatus = {
  status: "incomplete",
  provider: "ComplyCube",
};

export const davidBrokerConnection: BrokerConnection | null = null;

export const davidPositions: Position[] = [];
export const davidOrders: Order[] = [];
export const davidRecommendations: Recommendation[] = [];

export const davidActivity: ActivityEvent[] = [
  {
    id: "evt_d_001",
    type: "eligibility",
    description: "Eligibility check completed: waitlist (NY).",
    created_at: "2026-05-16T18:42:00Z",
  },
];
