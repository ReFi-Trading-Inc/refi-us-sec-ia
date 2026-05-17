import type { Metadata } from "next";
import { Badge, Card, CardContent, StatusBanner } from "@ui/components";
import { disclosureDocuments } from "../../_content/disclosures";
import { appCopy } from "../../_content/app-copy";

export const metadata: Metadata = { title: "Documents" };

const { documents } = appCopy;

export default function DocumentsPage() {
  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-charcoal-50 mb-1">
          {documents.heading}
        </h1>
        <p className="text-sm text-charcoal-400">{documents.subheading}</p>
      </div>

      <StatusBanner variant="info">
        Documents are in preparation pending SEC registration. Document names
        are final.
      </StatusBanner>

      <div className="flex flex-col gap-3">
        {disclosureDocuments.map((doc) => (
          <Card key={doc.id}>
            <CardContent className="pt-4 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-charcoal-100">
                    {doc.name}
                  </p>
                  <Badge
                    variant="warning"
                    aria-label={`${doc.name}: ${documents.pendingStatus}`}
                  >
                    {documents.pendingStatus}
                  </Badge>
                </div>
                <p className="text-xs text-charcoal-400">{doc.description}</p>
                <p className="text-xs text-charcoal-600 mt-1">
                  {documents.effectiveDate}: Pending registration
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  disabled
                  className="text-xs px-3 py-1.5 rounded border border-charcoal-700 text-charcoal-600 cursor-not-allowed"
                  title={documents.pendingNote}
                >
                  {documents.view}
                </button>
                <button
                  disabled
                  className="text-xs px-3 py-1.5 rounded border border-charcoal-700 text-charcoal-600 cursor-not-allowed"
                  title={documents.pendingNote}
                >
                  {documents.download}
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
