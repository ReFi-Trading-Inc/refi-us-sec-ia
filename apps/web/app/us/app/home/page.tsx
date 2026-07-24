"use client";

import Link from "next/link";
import { Card, CardContent } from "@ui/components";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { appCopy } from "../../_content/app-copy";
import { useSimulation } from "../../../_hooks/useSimulation";
import { ModeStatusStrip } from "../_components/ModeStatusStrip";

const { home } = appCopy;

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export default function HomePage() {
  const { positions, portfolioMetrics, history } = useSimulation();
  const { totalValue, dayPl, dayPlPct, totalPl, totalPlPct } = portfolioMetrics;
  const dayPlClass = dayPl >= 0 ? "text-mint-400" : "text-status-rejected";
  const totalPlClass = totalPl >= 0 ? "text-mint-400" : "text-status-rejected";

  const kpis = [
    {
      label: home.portfolioValue,
      value: formatCurrency(totalValue),
      tone: "text-charcoal-100",
    },
    {
      label: home.todayChange,
      value: `${formatCurrency(dayPl)} (${formatPct(dayPlPct)})`,
      tone: dayPlClass,
    },
    {
      label: home.unrealizedPnl,
      value: `${formatCurrency(totalPl)} (${formatPct(totalPlPct)})`,
      tone: totalPlClass,
    },
    {
      label: home.openPositions,
      value: positions.length.toString(),
      tone: "text-charcoal-100",
    },
  ];

  return (
    <div className="flex flex-col gap-8 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-charcoal-50">
          {home.heading}
        </h1>
      </div>

      <ModeStatusStrip />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="pt-4">
              <p className="text-xs text-charcoal-500 mb-1">{kpi.label}</p>
              <p className={`text-2xl font-mono tabular-nums ${kpi.tone}`}>
                {kpi.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-4">
          <p className="text-xs text-charcoal-500 mb-3">
            {home.portfolioValue}
          </p>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={history}
                margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="homeArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0CD4A0" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#0CD4A0" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="t" hide />
                <YAxis domain={["auto", "auto"]} hide />
                <Tooltip
                  cursor={{ stroke: "#47566A" }}
                  contentStyle={{
                    background: "#0A0F14",
                    border: "1px solid #2D3A47",
                    fontSize: 12,
                  }}
                  formatter={(value) => formatCurrency(Number(value))}
                  labelFormatter={() => ""}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#0CD4A0"
                  fill="url(#homeArea)"
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-charcoal-300">
            {home.recentActivity}
          </h2>
          <Link
            href="/us/app/activity"
            className="text-xs text-mint-400 hover:text-mint-300"
          >
            {home.viewAll}
          </Link>
        </div>
        <div className="flex flex-col gap-3">
          {positions.slice(0, 5).map((p) => (
            <Card key={p.symbol}>
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-charcoal-100">
                    {p.symbol}
                  </p>
                  <p className="text-xs text-charcoal-500">
                    {p.qty} shares @ {formatCurrency(p.avg_entry_price)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono tabular-nums text-charcoal-100">
                    {formatCurrency(p.market_value)}
                  </p>
                  <p
                    className={`text-xs font-mono tabular-nums ${
                      p.unrealized_pl >= 0
                        ? "text-mint-400"
                        : "text-status-rejected"
                    }`}
                  >
                    {formatCurrency(p.unrealized_pl)} (
                    {formatPct(p.unrealized_plpc)})
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
