import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardContent, Logo, StatusBanner } from "@ui/components";
import { appCopy } from "../_content/app-copy";
import { disclosureDocuments } from "../_content/disclosures";
import { usBrand } from "../_content/brand";

export const metadata: Metadata = { title: "Disclosures" };

const { documents: C } = appCopy;

export default function DisclosuresPage() {
  return (
    <div className="min-h-screen bg-charcoal-950 text-charcoal-100 font-sans">
      <header className="border-b border-charcoal-800 px-8 py-4 flex items-center justify-between">
        <Link href="/us" aria-label="Back to ReFi.Trading USA">
          <Logo
            size={22}
            wordmarkSuffix="USA"
            className="text-sm text-charcoal-200"
          />
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-8 py-16">
        <h1 className="text-2xl font-semibold text-charcoal-50 mb-2">
          {C.bannerTitle}
        </h1>
        <p className="text-sm text-charcoal-400 mb-4">
          {usBrand.regulatoryStatus}. Required disclosures for clients of{" "}
          {usBrand.legalEntityPlaceholder}.
        </p>

        <StatusBanner variant="info" className="mb-8">
          {C.bannerBody}
        </StatusBanner>

        <div className="flex flex-col gap-4">
          {disclosureDocuments.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="pt-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-sm font-medium text-charcoal-100">
                        {doc.name}
                      </p>
                      <Badge
                        variant={
                          doc.requiredForActivation ? "rejected" : "warning"
                        }
                      >
                        {doc.requiredForActivation
                          ? C.requiredLabel
                          : C.recommendedLabel}
                      </Badge>
                      <Badge variant="neutral">{C.pendingStatus}</Badge>
                    </div>
                    <p className="text-xs text-charcoal-400">
                      {doc.description}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      disabled
                      className="text-xs px-3 py-1.5 rounded border border-charcoal-700 text-charcoal-600 cursor-not-allowed"
                      title={C.pendingNote}
                    >
                      {C.view}
                    </button>
                    <button
                      disabled
                      className="text-xs px-3 py-1.5 rounded border border-charcoal-700 text-charcoal-600 cursor-not-allowed"
                      title={C.pendingNote}
                    >
                      {C.download}
                    </button>
                  </div>
                </div>

                <dl className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs font-mono text-charcoal-500 border-t border-charcoal-800 pt-3">
                  <dt>{C.version}</dt>
                  <dd className="text-charcoal-300 col-span-2">
                    {doc.version ?? C.pendingVersion}
                  </dd>
                  <dt>{C.effectiveDate}</dt>
                  <dd className="text-charcoal-300 col-span-2">
                    {doc.effectiveDate
                      ? new Date(doc.effectiveDate).toLocaleDateString()
                      : C.pendingDate}
                  </dd>
                  <dt>{C.hash}</dt>
                  <dd className="text-charcoal-300 col-span-2 break-all">
                    {doc.hash ?? C.pendingHash}
                  </dd>
                </dl>

                <p className="text-xs text-charcoal-400">{doc.customerNote}</p>
                <p className="text-[10px] font-mono uppercase tracking-wider text-charcoal-600">
                  {C.unlockCondition[doc.unlockCondition]}
                </p>
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
