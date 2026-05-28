"use client";

// Synthetic portfolio simulation. Drives the /us/app/* dashboards while
// live broker data is gated by KYC + connection. Always returns
// `isSimulated: true` so UI can render the "Simulated Data" badge.
//
// Tick cadence: 5 seconds (setInterval in useEffect). Each tick walks every
// position's price by ±0.5%. Respects prefers-reduced-motion: data still
// updates, but consumers can decide whether to animate transitions.
import { useEffect, useReducer } from "react";
import type { Position } from "@refi/api-clients";

const TICK_MS = 5_000;
const MAX_HISTORY = 20;
const PRICE_WALK = 0.005; // ±0.5%

export type SimulatedTrade = {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  created_at: string;
};

export type PortfolioMetrics = {
  totalValue: number;
  dayPl: number;
  dayPlPct: number;
  totalPl: number;
  totalPlPct: number;
};

export type SimulationState = {
  positions: Position[];
  trades: SimulatedTrade[];
  history: { t: number; value: number }[];
  startValue: number;
  dayStartValue: number;
};

export type SimulationResult = SimulationState & {
  portfolioMetrics: PortfolioMetrics;
  isSimulated: true;
};

type Action = { type: "tick" } | { type: "addTrade"; trade: SimulatedTrade };

// Maya-like seed portfolio: ~$50k value across 5 positions.
const SEED_POSITIONS: Position[] = [
  {
    symbol: "AAPL",
    qty: 40,
    avg_entry_price: 200.0,
    current_price: 216.1,
    market_value: 40 * 216.1,
    unrealized_pl: 40 * (216.1 - 200.0),
    unrealized_plpc: (216.1 - 200.0) / 200.0,
    side: "long",
  },
  {
    symbol: "MSFT",
    qty: 22,
    avg_entry_price: 372.73,
    current_price: 428.03,
    market_value: 22 * 428.03,
    unrealized_pl: 22 * (428.03 - 372.73),
    unrealized_plpc: (428.03 - 372.73) / 372.73,
    side: "long",
  },
  {
    symbol: "VOO",
    qty: 30,
    avg_entry_price: 540.0,
    current_price: 550.4,
    market_value: 30 * 550.4,
    unrealized_pl: 30 * (550.4 - 540.0),
    unrealized_plpc: (550.4 - 540.0) / 540.0,
    side: "long",
  },
  {
    symbol: "QQQ",
    qty: 18,
    avg_entry_price: 470.0,
    current_price: 489.2,
    market_value: 18 * 489.2,
    unrealized_pl: 18 * (489.2 - 470.0),
    unrealized_plpc: (489.2 - 470.0) / 470.0,
    side: "long",
  },
  {
    symbol: "NVDA",
    qty: 14,
    avg_entry_price: 850.0,
    current_price: 905.5,
    market_value: 14 * 905.5,
    unrealized_pl: 14 * (905.5 - 850.0),
    unrealized_plpc: (905.5 - 850.0) / 850.0,
    side: "long",
  },
];

function portfolioValue(positions: Position[]): number {
  return positions.reduce((sum, p) => sum + p.market_value, 0);
}

function walkPositions(positions: Position[]): Position[] {
  return positions.map((p) => {
    const drift = (Math.random() * 2 - 1) * PRICE_WALK;
    const next = Math.max(0.01, p.current_price * (1 + drift));
    const market_value = next * p.qty;
    const unrealized_pl = (next - p.avg_entry_price) * p.qty;
    const unrealized_plpc = (next - p.avg_entry_price) / p.avg_entry_price;
    return {
      ...p,
      current_price: Number(next.toFixed(4)),
      market_value: Number(market_value.toFixed(2)),
      unrealized_pl: Number(unrealized_pl.toFixed(2)),
      unrealized_plpc: Number(unrealized_plpc.toFixed(6)),
    };
  });
}

function reducer(state: SimulationState, action: Action): SimulationState {
  switch (action.type) {
    case "tick": {
      const positions = walkPositions(state.positions);
      const value = portfolioValue(positions);
      const history = [
        ...state.history,
        { t: Date.now(), value: Number(value.toFixed(2)) },
      ].slice(-MAX_HISTORY);
      return { ...state, positions, history };
    }
    case "addTrade": {
      return { ...state, trades: [action.trade, ...state.trades].slice(0, 20) };
    }
    default:
      return state;
  }
}

function initialState(): SimulationState {
  const value = portfolioValue(SEED_POSITIONS);
  return {
    positions: SEED_POSITIONS,
    trades: [
      {
        id: "sim_t_001",
        symbol: "AAPL",
        side: "buy",
        qty: 10,
        price: 214.8,
        created_at: new Date(Date.now() - 1_000 * 60 * 60 * 6).toISOString(),
      },
      {
        id: "sim_t_002",
        symbol: "VOO",
        side: "buy",
        qty: 5,
        price: 545.0,
        created_at: new Date(Date.now() - 1_000 * 60 * 60 * 2).toISOString(),
      },
    ],
    history: [{ t: Date.now(), value: Number(value.toFixed(2)) }],
    startValue: value,
    dayStartValue: value,
  };
}

export function useSimulation(): SimulationResult {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  // `dispatch` from useReducer is stable across renders, so the interval
  // closure always sees the latest reducer without needing a ref. The
  // previous render-time `dispatchRef.current = dispatch` write triggered
  // react-hooks/refs; the simpler direct capture is behaviorally identical.
  useEffect(() => {
    const id = setInterval(() => {
      dispatch({ type: "tick" });
    }, TICK_MS);
    return () => {
      clearInterval(id);
    };
  }, [dispatch]);

  const totalValue = portfolioValue(state.positions);
  const dayPl = totalValue - state.dayStartValue;
  const dayPlPct = state.dayStartValue === 0 ? 0 : dayPl / state.dayStartValue;
  const totalPl = totalValue - state.startValue;
  const totalPlPct = state.startValue === 0 ? 0 : totalPl / state.startValue;

  return {
    ...state,
    portfolioMetrics: {
      totalValue: Number(totalValue.toFixed(2)),
      dayPl: Number(dayPl.toFixed(2)),
      dayPlPct: Number(dayPlPct.toFixed(6)),
      totalPl: Number(totalPl.toFixed(2)),
      totalPlPct: Number(totalPlPct.toFixed(6)),
    },
    isSimulated: true,
  };
}
