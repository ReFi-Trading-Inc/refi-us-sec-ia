import type { Metadata } from "next";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Badge,
} from "@ui/components";
import { appCopy } from "../../_content/app-copy";

export const metadata: Metadata = { title: "Portfolio" };

const { portfolio } = appCopy;

export default function PortfolioPage() {
  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-charcoal-50">
          {portfolio.heading}
        </h1>
        <Badge variant="warning" aria-label="Data mode: simulated">
          Simulated data
        </Badge>
      </div>

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
          <TableRow>
            <TableCell
              colSpan={6}
              className="text-center text-charcoal-500 py-12 text-sm"
            >
              {portfolio.emptyState}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
