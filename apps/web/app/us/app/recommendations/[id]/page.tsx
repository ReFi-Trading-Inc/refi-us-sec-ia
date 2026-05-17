import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, StatusBanner } from "@ui/components";
import { appCopy } from "../../../_content/app-copy";

export const metadata: Metadata = { title: "Recommendation" };

const { recommendations } = appCopy;

// Next.js 16: params is a Promise
export default async function RecommendationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link
          href="/us/app/recommendations"
          className="text-sm text-charcoal-400 hover:text-charcoal-200"
        >
          ← Recommendations
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-charcoal-50 mb-1">
          Recommendation
        </h1>
        <p className="text-xs font-mono text-charcoal-500">{id}</p>
      </div>

      <StatusBanner variant="info">
        Recommendation detail loads from the API in MIG-P1-06.
      </StatusBanner>

      <Card>
        <CardContent className="pt-5 flex flex-col gap-4">
          {[
            recommendations.detail.rationale,
            recommendations.detail.riskFactors,
            recommendations.detail.executionPolicy,
            recommendations.detail.complianceStatus,
          ].map((label) => (
            <div key={label} className="flex flex-col gap-1">
              <p className="text-xs font-medium uppercase tracking-wider text-charcoal-500">
                {label}
              </p>
              <p className="text-sm text-charcoal-400">—</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
