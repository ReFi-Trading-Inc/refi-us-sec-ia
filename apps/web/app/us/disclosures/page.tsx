import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardContent, StatusBanner } from "@ui/components";
import { disclosureDocuments } from "../_content/disclosures";
import { usBrand } from "../_content/brand";

export const metadata: Metadata = { title: "Disclosures" };

export default function DisclosuresPage() {
  return (
    <div className="min-h-screen bg-charcoal-950 text-charcoal-100 font-sans">
      <header className="border-b border-charcoal-800 px-8 py-4 flex items-center justify-between">
        <Link href="/us" className="text-sm font-semibold text-charcoal-200">
          {usBrand.productSurface}
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-8 py-16">
        <h1 className="text-2xl font-semibold text-charcoal-50 mb-2">
          Regulatory disclosures
        </h1>
        <p className="text-sm text-charcoal-400 mb-4">
          {usBrand.regulatoryStatus}. Required disclosures for clients of{" "}
          {usBrand.legalEntityPlaceholder}.
        </p>

        <StatusBanner variant="info" className="mb-8">
          Documents are in preparation pending SEC registration and counsel
          sign-off. Document names are final.
        </StatusBanner>

        <div className="flex flex-col gap-4">
          {disclosureDocuments.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="pt-5 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-charcoal-100">
                      {doc.name}
                    </p>
                    <Badge
                      variant="warning"
                      aria-label="Document status: in preparation"
                    >
                      Document in preparation
                    </Badge>
                  </div>
                  <p className="text-xs text-charcoal-400">{doc.description}</p>
                  <p className="text-xs text-charcoal-600 mt-1">
                    Effective date: Pending registration
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    disabled
                    className="text-xs px-3 py-1.5 rounded border border-charcoal-700 text-charcoal-600 cursor-not-allowed"
                    title="Available after registration"
                  >
                    View
                  </button>
                  <button
                    disabled
                    className="text-xs px-3 py-1.5 rounded border border-charcoal-700 text-charcoal-600 cursor-not-allowed"
                    title="Available after registration"
                  >
                    Download
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="mt-10 text-xs text-charcoal-600">
          Advisory personnel do not generate, modify, or expand client-specific
          investment advice outside the platform. All investment advisory
          services are software-generated and delivered exclusively through
          ReFi.Trading.
        </p>
      </main>
    </div>
  );
}
