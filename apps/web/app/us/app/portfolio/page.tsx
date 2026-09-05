"use client";

/**
 * Portfolio — reconciled positions and valuation history from the backend
 * through the BFF. Decimals are the backend's strings; nothing is computed
 * from browser data or simulated.
 */
import {
  Badge,
  Card,
  CardContent,
  StatusBanner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/components";
import { appCopy } from "../../_content/app-copy";
import { useInvestorPortfolio } from "../../../_hooks/useInvestorPortfolio";
import { EquityChart, formatCurrency } from "../_components/EquityChart";

const { portfolio } = appCopy;

export default function PortfolioPage() {
  const { data, isLoading } = useInvestorPortfolio();
  const p = data?.portfolio ?? null;
  const upstream = data?.upstream;

  return (
    <div className="flex flex-col gap-6 max-w-5xl" data-testid="portfolio-page">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-charcoal-50">
          {portfolio.heading}
        </h1>
        {p && (
          <Badge
            variant={p.valuation.freshness === "FRESH" ? "active" : "warning"}
          >
            {p.valuation.environment} · {p.valuation.freshness.toLowerCase()}
          </Badge>
        )}
      </div>

      {upstream && upstream.state !== "ok" && (
        <StatusBanner variant="warning" data-testid="portfolio-upstream-state">
          {portfolio.upstreamUnavailable}
        </StatusBanner>
      )}

      {p && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              [portfolio.totalValue, formatCurrency(p.valuation.equity)],
              [portfolio.cash, formatCurrency(p.valuation.cash)],
              [portfolio.buyingPower, formatCurrency(p.valuation.buyingPower)],
              [portfolio.openOrders, String(p.valuation.openOrderCount)],
            ].map(([label, value]) => (
              <Card key={label}>
                <CardContent className="pt-4">
                  <p className="text-xs text-charcoal-500 mb-1">{label}</p>
                  <p className="text-xl font-mono tabular-nums text-charcoal-100">
                    {value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-charcoal-500 mb-3">
                {portfolio.equityHistory}
              </p>
              <EquityChart history={p.history} height={256} id="pfArea" />
            </CardContent>
          </Card>
        </>
      )}

      <Table data-testid="positions-table">
        <TableHeader>
          <TableRow>
            <TableHead>{portfolio.symbol}</TableHead>
            <TableHead>{portfolio.name}</TableHead>
            <TableHead>{portfolio.quantity}</TableHead>
            <TableHead>{portfolio.avgCost}</TableHead>
            <TableHead>{portfolio.referencePrice}</TableHead>
            <TableHead>{portfolio.marketValue}</TableHead>
            <TableHead>{portfolio.unrealizedPnl}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="text-center text-charcoal-500 py-12 text-sm"
              >
                Loading…
              </TableCell>
            </TableRow>
          ) : !p || p.positions.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="text-center text-charcoal-500 py-12 text-sm"
                data-testid="positions-empty"
              >
                {portfolio.emptyState}
              </TableCell>
            </TableRow>
          ) : (
            p.positions.map((pos) => {
              const pnl =
                (Number(pos.referencePrice) - Number(pos.averagePrice)) *
                Number(pos.heldQty);
              return (
                <TableRow key={pos.securityId} data-testid="position-row">
                  <TableCell className="font-semibold text-charcoal-50">
                    {pos.symbol}
                  </TableCell>
                  <TableCell className="text-charcoal-300">
                    {pos.displayName}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {pos.heldQty}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {formatCurrency(pos.averagePrice)}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {formatCurrency(pos.referencePrice)}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {formatCurrency(pos.marketValue)}
                  </TableCell>
                  <TableCell
                    className={`font-mono tabular-nums ${pnl >= 0 ? "text-mint-400" : "text-status-rejected-text"}`}
                  >
                    {pnl >= 0 ? "+" : ""}
                    {formatCurrency(pnl)}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
