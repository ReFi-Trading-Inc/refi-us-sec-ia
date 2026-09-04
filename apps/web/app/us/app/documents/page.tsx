"use client";

import { useState } from "react";
import { Badge, Button, Card, CardContent, StatusBanner } from "@ui/components";
import { useMutation, useQuery } from "@tanstack/react-query";
import { disclosureDocuments } from "../../_content/disclosures";
import { appCopy } from "../../_content/app-copy";

const { documents } = appCopy;

const requiredIds = disclosureDocuments
  .filter((d) => d.required)
  .map((d) => d.id);

/**
 * Wire shapes of the same-origin BFF routes this page uses. The browser talks
 * ONLY to the ReFi BFF (`/api/v1/investor/disclosures[...]`); the BFF talks to
 * Daniel's Investor API through the frozen v1.1.0-alpha.2 client. The former
 * browser-direct acknowledge call to the legacy external API is gone (C1b-2
 * reclassification row 21).
 */
interface EffectiveDisclosure {
  disclosure_key: string;
  disclosure_version: number;
  content_hash: string;
  content_ref: string;
  effective_at: string;
  locale: string;
  status: "EFFECTIVE" | "RETIRED";
}

interface DisclosuresRead {
  data: {
    disclosures: EffectiveDisclosure[];
    hasMore: boolean;
    upstream: { state: string; reason?: string; code?: string };
  };
}

interface AckResponse {
  data?: { ok: boolean; reason?: string };
  error?: { message?: string };
}

async function readDisclosures(): Promise<DisclosuresRead["data"]> {
  const res = await fetch("/api/v1/investor/disclosures", {
    credentials: "include",
  });
  if (!res.ok)
    throw new Error(`disclosures read failed: ${String(res.status)}`);
  const body = (await res.json()) as DisclosuresRead;
  return body.data;
}

async function acknowledgeAll(items: EffectiveDisclosure[]): Promise<void> {
  // One consent per effective disclosure, each naming the EXACT version and
  // hash the backend listed. Sequential so a stale/refused item stops the
  // batch with a precise error instead of half-recorded consents.
  for (const d of items) {
    const res = await fetch(
      `/api/v1/investor/disclosures/${encodeURIComponent(d.disclosure_key)}/acknowledge`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          disclosure_version: d.disclosure_version,
          disclosure_hash: d.content_hash,
        }),
      },
    );
    const body = (await res.json()) as AckResponse;
    if (!(res.status === 201 && body.data?.ok === true)) {
      throw new Error(
        body.data?.reason ??
          body.error?.message ??
          `HTTP ${String(res.status)}`,
      );
    }
  }
}

export default function DocumentsPage() {
  const [acknowledged, setAcknowledged] = useState(false);
  const [checked, setChecked] = useState(false);

  const effective = useQuery({
    queryKey: ["investor", "disclosures", "effective"],
    queryFn: readDisclosures,
    staleTime: 0,
  });
  const effectiveItems =
    effective.data?.disclosures.filter((d) => d.status === "EFFECTIVE") ?? [];
  const upstreamState = effective.data?.upstream.state;

  const acknowledge = useMutation({
    mutationFn: () => acknowledgeAll(effectiveItems),
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
              {requiredIds.length} required documents. Effective disclosures are
              listed by ReFi&apos;s records system; your acknowledgment is
              recorded against the exact published version.
            </p>
          </div>

          <div
            data-testid="effective-disclosures"
            className="flex flex-col gap-1"
          >
            {effective.isPending && (
              <p className="text-xs text-charcoal-500">
                Checking effective disclosures…
              </p>
            )}
            {effective.isError && (
              <StatusBanner variant="error">
                Could not load effective disclosures.
              </StatusBanner>
            )}
            {effective.isSuccess && upstreamState !== "ok" && (
              <StatusBanner variant="warning">
                Effective disclosures are not available right now (
                {upstreamState}). Nothing has been recorded.
              </StatusBanner>
            )}
            {effective.isSuccess &&
              upstreamState === "ok" &&
              effectiveItems.length === 0 && (
                <p className="text-xs text-charcoal-500">
                  No disclosures are effective yet.
                </p>
              )}
            {effectiveItems.map((d) => (
              <p
                key={`${d.disclosure_key}-${String(d.disclosure_version)}`}
                data-testid={`effective-disclosure-${d.disclosure_key}`}
                className="text-xs text-charcoal-300"
              >
                {d.disclosure_key} · {documents.version} {d.disclosure_version}{" "}
                · {documents.effectiveDate} {d.effective_at.slice(0, 10)}
              </p>
            ))}
          </div>

          {acknowledged ? (
            <StatusBanner variant="success" title="Acknowledged">
              Your consent to the effective disclosures has been recorded.
            </StatusBanner>
          ) : (
            <>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  data-testid="disclosure-consent-checkbox"
                  checked={checked}
                  onChange={(e) => {
                    setChecked(e.target.checked);
                  }}
                  className="mt-0.5 h-4 w-4 rounded border border-charcoal-600 bg-charcoal-800 text-mint-400 focus:ring-mint-400 focus:ring-offset-charcoal-900"
                />
                <span className="text-xs text-charcoal-300">
                  I have read and understood the effective disclosures listed
                  above. I consent to electronic delivery of all regulatory
                  disclosures.
                </span>
              </label>

              {acknowledge.isError && (
                <StatusBanner variant="error">
                  Could not record acknowledgment (
                  {acknowledge.error instanceof Error
                    ? acknowledge.error.message
                    : "unknown"}
                  ). Nothing was recorded — please try again.
                </StatusBanner>
              )}

              <Button
                size="sm"
                data-testid="disclosure-consent-confirm"
                disabled={
                  !checked ||
                  acknowledge.isPending ||
                  upstreamState !== "ok" ||
                  effectiveItems.length === 0
                }
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
