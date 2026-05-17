import type { Metadata } from "next";
import { appCopy } from "../../_content/app-copy";

export const metadata: Metadata = { title: "Recommendations" };

const { recommendations } = appCopy;

export default function RecommendationsPage() {
  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-charcoal-50 mb-1">
          {recommendations.heading}
        </h1>
        <p className="text-sm text-charcoal-400">
          {recommendations.subheading}
        </p>
      </div>

      <div className="flex flex-col items-center justify-center py-16 text-sm text-charcoal-500">
        {recommendations.emptyState}
      </div>
    </div>
  );
}
