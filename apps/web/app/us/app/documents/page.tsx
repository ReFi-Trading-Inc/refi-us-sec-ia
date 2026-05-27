"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, CardContent, StatusBanner } from "@ui/components";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@refi/api-clients";
import {
  disclosureDocuments,
  REQUIRED_FOR_ACTIVATION_IDS,
  type DisclosureDocumentId,
} from "../../_content/disclosures";
import { appCopy } from "../../_content/app-copy";
import { useDocumentAcks } from "../../_lib/document-acks";

const { documents: C } = appCopy;

// Internal counsel note rendering — env-gated, never reaches end users.
function isDevEnv(): boolean {
  const env = process.env["NEXT_PUBLIC_REFI_ENV"];
  return env !== "prod" && env !== "production";
}

export default function DocumentsPage() {
  const acks = useDocumentAcks();
  const [selected, setSelected] = useState<Set<DisclosureDocumentId>>(
    () => new Set(),
  );
  const [error, setError] = useState<string | null>(null);

  const acknowledge = useMutation({
    mutationFn: (doc_ids: string[]) =>
      apiFetch<{ ok: boolean }>("/v1/documents/acknowledge", {
        method: "POST",
        body: { doc_ids },
      }),
    onSuccess: (_, variables) => {
      acks.acknowledge(variables as DisclosureDocumentId[]);
      setSelected(new Set());
      setError(null);
    },
    onError: () => setError("Could not record acknowledgment. Try again."),
  });

  const showInternal = isDevEnv();
  const requiredAckText = C.progressTemplate
    .replace("{ack}", String(acks.requiredAckedCount))
    .replace("{total}", String(acks.requiredTotal));

  const selectableDocs = useMemo(
    () =>
      disclosureDocuments.filter(
        (d) => !acks.status[d.id]?.acked && acks.status[d.id]?.canAck,
      ),
    [acks.status],
  );

  function toggle(id: DisclosureDocumentId) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function submit() {
    if (selected.size === 0) return;
    acknowledge.mutate(Array.from(selected));
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-charcoal-50 mb-1">
          {C.heading}
        </h1>
        <p className="text-sm text-charcoal-400">{C.subheading}</p>
      </div>

      <StatusBanner variant="info" title={C.bannerTitle}>
        {C.bannerBody}
      </StatusBanner>

      <div className="rounded-md border border-charcoal-800 bg-charcoal-900 px-4 py-3">
        <p className="text-sm text-charcoal-100">{requiredAckText}</p>
        <p className="text-xs text-charcoal-500 mt-1">{C.activationGate}</p>
      </div>

      <div className="flex flex-col gap-3">
        {disclosureDocuments.map((doc) => {
          const ack = acks.status[doc.id];
          const isSelected = selected.has(doc.id as DisclosureDocumentId);
          const ackedAt = ack?.ackedAt;
          return (
            <Card key={doc.id}>
              <CardContent className="pt-4 flex flex-col gap-3">
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
                      {ack?.acked ? (
                        <Badge variant="approved">{C.acknowledged}</Badge>
                      ) : (
                        <Badge variant="neutral">{C.pendingStatus}</Badge>
                      )}
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

                {ack && !ack.acked ? (
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-charcoal-300">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(doc.id as DisclosureDocumentId)}
                      disabled={!ack.canAck}
                      className="h-4 w-4 rounded border border-charcoal-600 bg-charcoal-800 text-mint-400 focus:ring-mint-400 focus:ring-offset-charcoal-900 disabled:opacity-40"
                    />
                    <span>
                      {C.acknowledge}{" "}
                      {!ack.canAck ? `· ${C.pendingNote}` : null}
                    </span>
                  </label>
                ) : ack?.acked && ackedAt ? (
                  <p className="text-xs font-mono text-charcoal-500">
                    {C.acknowledged}: {new Date(ackedAt).toLocaleString()}
                  </p>
                ) : null}

                {showInternal ? (
                  <p className="text-[10px] font-mono text-amber-300/80 border-t border-amber-500/20 pt-2 mt-1">
                    {C.internalNoteLabel}: {doc.internalNote}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {error ? <StatusBanner variant="error">{error}</StatusBanner> : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-charcoal-500">
          {selected.size > 0
            ? `${selected.size} selected`
            : selectableDocs.length === 0
              ? acks.allRequiredAcked
                ? "All required documents acknowledged."
                : ""
              : C.devCanAckNote}
        </p>
        <div className="flex gap-2">
          <Link
            href="/us/onboarding/activation"
            className="text-xs text-mint-400 hover:text-mint-300 self-center"
          >
            Activation →
          </Link>
          <Button
            size="sm"
            disabled={selected.size === 0 || acknowledge.isPending}
            onClick={submit}
          >
            {acknowledge.isPending ? "…" : C.acknowledgeSelected}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Used to expose the required-ids constant for tests; not consumed by the page.
export const _requiredIds = REQUIRED_FOR_ACTIVATION_IDS;
