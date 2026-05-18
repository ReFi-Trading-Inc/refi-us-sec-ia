"use client";

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Card,
  CardContent,
} from "@ui/components";
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

const { portfolio } = appCopy;

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

export default function PortfolioPage() {
  const { positions, portfolioMetrics, history } = useSimulation();
  const { totalValue, dayPl, dayPlPct, totalPl, totalPlPct } = portfolioMetrics;

  const cards = [
    { label: "Total value", value: formatCurrency(totalValue) },
    {
      label: "Day P&L",
      value: `${formatCurrency(dayPl)} (${formatPct(dayPlPct)})`,
      tone: dayPl >= 0 ? "text-mint-400" : "text-rose-400",
    },
    {
      label: "Total P&L",
      value: `${formatCurrency(totalPl)} (${formatPct(totalPlPct)})`,
      tone: totalPl >= 0 ? "text-mint-400" : "text-rose-400",
    },
    {
      label: portfolio.allPositions,
      value: positions.length.toString(),
    },
  ];

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-charcoal-50">
          {portfolio.heading}
        </h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-4">
              <p className="text-xs text-charcoal-500 mb-1">{c.label}</p>
              <p
                className={`text-xl font-mono tabular-nums ${
                  c.tone ?? "text-charcoal-100"
                }`}
              >
                {c.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-4">
          <p className="text-xs text-charcoal-500 mb-3">Portfolio value</p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={history}
                margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="pfArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="t" hide />
                <YAxis domain={["auto", "auto"]} hide />
                <Tooltip
                  cursor={{ stroke: "#52525b" }}
                  contentStyle={{
                    background: "#0a0a0a",
                    border: "1px solid #27272a",
                    fontSize: 12,
                  }}
                  formatter={(value) => formatCurrency(Number(value))}
                  labelFormatter={() => ""}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#34d399"
                  fill="url(#pfArea)"
                  strokeWidth={2}
                  animationDuration={300}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{portfolio.symbol}</TableHead>
            <TableHead>{portfolio.quantity}</TableHead>
            <TableHead>{portfolio.avgCost}</TableHead>
            <TableHead>{portfolio.marketValue}</TableHead>
            <TableHead>{portfolio.unrealizedPnl}</TableHead>
            <TableHead>{portfolio.pnlPct}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((p) => (
            <TableRow key={p.symbol}>
              <TableCell className="font-medium">{p.symbol}</TableCell>
              <TableCell className="font-mono tabular-nums">{p.qty}</TableCell>
              <TableCell className="font-mono tabular-nums">
                {formatCurrency(p.avg_entry_price)}
              </TableCell>
              <TableCell className="font-mono tabular-nums">
                {formatCurrency(p.market_value)}
              </TableCell>
              <TableCell
                className={`font-mono tabular-nums ${
                  p.unrealized_pl >= 0 ? "text-mint-400" : "text-rose-400"
                }`}
              >
                {formatCurrency(p.unrealized_pl)}
              </TableCell>
              <TableCell
                className={`font-mono tabular-nums ${
                  p.unrealized_plpc >= 0 ? "text-mint-400" : "text-rose-400"
                }`}
              >
                {formatPct(p.unrealized_plpc)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
