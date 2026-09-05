"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ValuationPointView } from "@lib/investor-api/portfolio";

export function formatCurrency(value: string | number): string {
  return Number(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

/** Reconciled equity history from the backend; no client-side simulation. */
export function EquityChart({
  history,
  height,
  id,
}: {
  history: ValuationPointView[];
  height: number;
  id: string;
}) {
  const data = history.map((p) => ({ t: p.asOf, value: Number(p.equity) }));
  return (
    <div style={{ height }} className="w-full" data-testid="equity-chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0CD4A0" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#0CD4A0" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="t" hide />
          <YAxis domain={["auto", "auto"]} hide />
          <Tooltip
            cursor={{ stroke: "#3E6153" }}
            contentStyle={{
              background: "#08110D",
              border: "1px solid #24463A",
              fontSize: 12,
            }}
            formatter={(value) => formatCurrency(Number(value))}
            labelFormatter={(label) =>
              typeof label === "string" || typeof label === "number"
                ? new Date(label).toLocaleDateString("en-US", {
                    dateStyle: "medium",
                  })
                : ""
            }
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#0CD4A0"
            fill={`url(#${id})`}
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
