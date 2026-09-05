// Maya Thompson — California resident, eligible, Alpaca connected,
// three positions, one pending recommendation, recent activity.
import type {
  AuthSession,
  BrokerAccount,
  BrokerConnection,
  BrokerInfo,
  Order,
  Position,
} from "../../compat";

export const mayaSession: AuthSession = {
  status: "authenticated",
  account_id: "acct_maya_001",
  wallet_id: "wallet_0xMAYA",
  roles: ["client"],
  kyc_status: "approved",
};

export const supportedBrokers: BrokerInfo[] = [
  { id: "alpaca", name: "Alpaca", supported: true, regions: ["US"] },
  { id: "ibkr", name: "Interactive Brokers", supported: true, regions: ["US"] },
];

export const mayaBrokerConnection: BrokerConnection = {
  broker_id: "alpaca",
  broker_name: "Alpaca",
  status: "connected",
  connected_at: "2026-04-22T09:11:00Z",
};

export const mayaBrokerAccount: BrokerAccount = {
  account_number: "APX-7741920",
  equity: 51_847.22,
  buying_power: 14_204.18,
  cash: 7_102.09,
  currency: "USD",
};

export const mayaPositions: Position[] = [
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
    market_value: 9_416.6,
    unrealized_pl: 1_216.6,
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
];

export const mayaOrders: Order[] = [
  {
    id: "ord_001",
    symbol: "AAPL",
    qty: 10,
    side: "buy",
    type: "market",
    status: "filled",
    filled_qty: 10,
    filled_avg_price: 214.8,
    created_at: "2026-05-15T15:32:00Z",
  },
  {
    id: "ord_002",
    symbol: "VOO",
    qty: 5,
    side: "buy",
    type: "limit",
    status: "accepted",
    limit_price: 545.0,
    created_at: "2026-05-17T13:11:00Z",
  },
];
