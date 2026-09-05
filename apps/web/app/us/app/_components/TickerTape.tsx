"use client";

/**
 * Ticker tape of the account's positions: symbol, backend reference price,
 * and the change since the previous backend refresh. Prices are the
 * reconciled projection's `reference_price` (decimal strings); the change is
 * the difference between two backend snapshots, never a client-side walk.
 */
import { useEffect, useRef, useState } from "react";
import type { PositionView } from "@lib/investor-api/portfolio";

interface Tick {
  symbol: string;
  price: string;
  delta: number | null;
}

export function TickerTape({ positions }: { positions: PositionView[] }) {
  const previous = useRef<Map<string, number>>(new Map());
  const [ticks, setTicks] = useState<Tick[]>([]);

  useEffect(() => {
    const next: Tick[] = positions.map((p) => {
      const price = Number(p.referencePrice);
      const prev = previous.current.get(p.symbol);
      return {
        symbol: p.symbol,
        price: p.referencePrice,
        delta: prev === undefined ? null : price - prev,
      };
    });
    const map = new Map<string, number>();
    for (const p of positions) map.set(p.symbol, Number(p.referencePrice));
    previous.current = map;
    setTicks(next);
  }, [positions]);

  if (ticks.length === 0) return null;
  // Duplicate the row so the marquee loops seamlessly.
  const row = [...ticks, ...ticks];
  return (
    <div
      className="relative overflow-hidden border-y border-charcoal-700 bg-charcoal-900 py-1.5"
      data-testid="ticker-tape"
      aria-label="Positions ticker"
    >
      <div className="flex w-max gap-8 whitespace-nowrap font-mono text-xs tabular-nums motion-safe:animate-[ticker_60s_linear_infinite] motion-reduce:animate-none">
        {row.map((t, i) => (
          <span
            key={`${t.symbol}-${String(i)}`}
            className="flex items-center gap-2"
            data-testid={i < ticks.length ? "ticker-item" : undefined}
          >
            <span className="text-charcoal-100">{t.symbol}</span>
            <span className="text-charcoal-300">
              {Number(t.price).toFixed(2)}
            </span>
            {t.delta !== null && t.delta !== 0 && (
              <span
                className={
                  t.delta > 0 ? "text-mint-400" : "text-status-rejected-text"
                }
              >
                {t.delta > 0 ? "▲" : "▼"} {Math.abs(t.delta).toFixed(2)}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
