// David Kim — New York resident (waitlist state), no broker connected,
// no positions, no recommendations yet.
import type {
  AuthSession,
  BrokerConnection,
  Order,
  Position,
} from "../../compat";

export const davidSession: AuthSession = {
  status: "authenticated",
  account_id: "acct_david_002",
  wallet_id: "wallet_0xDAVID",
  roles: ["client"],
  kyc_status: "incomplete",
};

export const davidBrokerConnection: BrokerConnection | null = null;

export const davidPositions: Position[] = [];
export const davidOrders: Order[] = [];
