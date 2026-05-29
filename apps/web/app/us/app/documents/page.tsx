"use client";

import { useState } from "react";
import { Badge, Button, Card, CardContent, StatusBanner } from "@ui/components";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@refi/api-clients";
import { disclosureDocuments } from "../../_content/disclosures";
import { appCopy } from "../../_content/app-copy";

const { documents } = appCopy;

const requiredIds = disclosureDocuments
  .filter((d) => d.required)
  .map((d) => d.id);

export default function DocumentsPage() {
  const [acknowledged, setAcknowledged] = useState(false);
  const [checked, setChecked] = useState(false);

  const acknowledge = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean }>("/v1/documents/acknowledge", {
        method: "POST",
      }),
    onSuccess: () => {
      setAcknowledged(true);
    },
  });

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
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="text-sm font-medium text-charcoal-100">
                    {doc.name}
                  </p>
                  {doc.required ? (
                    <Badge
                      variant="rejected"
                      aria-label={`${doc.name}: required document`}
                    >
                      Required
                    </Badge>
                  ) : (
                    <Badge
                      variant="warning"
                      aria-label={`${doc.name}: recommended document`}
                    >
                      Recommended
                    </Badge>
                  )}
                  <Badge
                    variant="neutral"
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

      <Card>
        <CardContent className="pt-5 pb-5 flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold text-charcoal-100 mb-1">
              Document acknowledgment
            </h2>
            <p className="text-xs text-charcoal-400">
              Once documents are published, you will need to acknowledge all{" "}
              {requiredIds.length} required documents before activating managed
              execution.
            </p>
          </div>

          {acknowledged ? (
            <StatusBanner variant="success" title="Acknowledged">
              You have confirmed receipt of all required documents. This will be
              enforced at account activation.
            </StatusBanner>
          ) : (
            <>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    setChecked(e.target.checked);
                  }}
                  className="mt-0.5 h-4 w-4 rounded border border-charcoal-600 bg-charcoal-800 text-mint-400 focus:ring-mint-400 focus:ring-offset-charcoal-900"
                />
                <span className="text-xs text-charcoal-300">
                  I have read and understood all required documents. I consent
                  to electronic delivery of all regulatory disclosures.
                </span>
              </label>

              {acknowledge.isError && (
                <StatusBanner variant="error">
                  Could not record acknowledgment. Please try again.
                </StatusBanner>
              )}

              <Button
                size="sm"
                disabled={!checked || acknowledge.isPending}
                onClick={() => {
                  acknowledge.mutate();
                }}
              >
                {acknowledge.isPending ? "Confirming…" : "Confirm"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
