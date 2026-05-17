import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, SkeletonCard, Badge } from "@ui/components";
import { appCopy } from "../../_content/app-copy";

export const metadata: Metadata = { title: "Home" };

const { home } = appCopy;

export default function HomePage() {
  return (
    <div className="flex flex-col gap-8 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-charcoal-50">
          {home.heading}
        </h1>
        <Badge variant="warning" aria-label="Data mode: simulated">
          Simulated data
        </Badge>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: home.portfolioValue, value: "—" },
          { label: home.todayChange, value: "—" },
          { label: home.unrealizedPnl, value: "—" },
          { label: home.openPositions, value: "—" },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="pt-4">
              <p className="text-xs text-charcoal-500 mb-1">{kpi.label}</p>
              <p className="text-2xl font-mono tabular-nums text-charcoal-100">
                {kpi.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Skeleton — live data wired in MIG-P1-07 */}
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
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </div>
  );
}
