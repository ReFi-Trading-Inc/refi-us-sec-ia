"use client";

import { useMemo, useState } from "react";
import { Button, Select, StatusBanner } from "@ui/components";
import type { SelectOption } from "@ui/components";
import { useMutation } from "@tanstack/react-query";
import { apiFetch, getCorrelationId } from "@refi/api-clients";
import {
  CATEGORY_LABELS,
  SELECTABLE_CATEGORIES,
  classify,
  type Classification,
  type SelectableSupportCategory,
} from "../../_lib/support-boundary";
import { supportBoundaryCopy } from "../../_content/support-boundary";
import { appCopy } from "../../_content/app-copy";

const { support } = appCopy;

const categoryOptions: SelectOption[] = SELECTABLE_CATEGORIES.map((c) => ({
  value: c,
  label: CATEGORY_LABELS[c],
}));

// Server-bound payload. Only fields here ever reach the network; the
// classifier's matched_patterns + boundary_rule_id travel through, but the
// raw message also goes (categorized intake needs the text). Analytics
// strips message text — see the onSuccess handler.
type SupportTicketPayload = {
  subject: string;
  category: Classification["category"];
  message: string;
  classification: {
    confidence: number;
    matched_patterns: string[];
  };
  blocked: boolean;
  boundary_rule_id: string | null;
  correlation_id: string;
};

export default function SupportPage() {
  const [category, setCategory] = useState<SelectableSupportCategory | "">("");
  const [message, setMessage] = useState("");

  const classification: Classification = useMemo(
    () => classify(category, message),
    [category, message],
  );

  const submit = useMutation({
    mutationFn: (body: SupportTicketPayload) =>
      apiFetch<{ ok: boolean; ticket_id: string }>("/v1/support/ticket", {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      // Analytics never receives the prompt text — only category +
      // boundary_rule_id per the MIG-P2.5-23 contract.
      // (Wire to PostHog: track('support_ticket_submitted', { category, blocked, boundary_rule_id }))
      setCategory("");
      setMessage("");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    submit.mutate({
      subject: category || "complaint",
      category: classification.category,
      message: message.trim(),
      classification: {
        confidence: classification.confidence,
        matched_patterns: classification.matched_patterns,
      },
      blocked: classification.blocked,
      boundary_rule_id: classification.boundary_rule_id,
      correlation_id: getCorrelationId(),
    });
  }

  const canSubmit =
    category !== "" &&
    message.trim().length >= 10 &&
    !classification.blocked &&
    !submit.isPending;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-charcoal-50 mb-1">
          {support.heading}
        </h1>
        <p className="text-sm text-charcoal-400">{support.subheading}</p>
      </div>

      <StatusBanner variant="info" title={supportBoundaryCopy.bannerTitle}>
        {supportBoundaryCopy.bannerBody}
      </StatusBanner>

      {submit.isSuccess && (
        <StatusBanner variant="success" title="Request submitted">
          Your support request has been received. We typically respond within
          one to two business days.
        </StatusBanner>
      )}

      {submit.isError && (
        <StatusBanner variant="error">
          Submission failed. Try again or open another ticket.
        </StatusBanner>
      )}

      {!submit.isSuccess && (
        <form
          className="flex flex-col gap-4"
          onSubmit={handleSubmit}
          noValidate
        >
          <Select
            label={support.categoryLabel}
            placeholder="Select…"
            options={categoryOptions}
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as SelectableSupportCategory | "")
            }
            required
          />

          <div className="flex flex-col gap-1">
            <label
              htmlFor="support-message"
              className="text-sm font-medium text-charcoal-200"
            >
              {support.messageLabel}
            </label>
            <textarea
              id="support-message"
              className="rounded-md border border-charcoal-700 bg-charcoal-800 px-3 py-2 text-sm text-charcoal-100 placeholder:text-charcoal-600 focus:outline-none focus:ring-2 focus:ring-mint-400 min-h-[120px] resize-y"
              placeholder={support.placeholder}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              disabled={submit.isPending}
              aria-describedby={
                classification.blocked ? "support-blocked" : undefined
              }
              aria-invalid={classification.blocked ? true : undefined}
            />
          </div>

          {classification.blocked && (
            <StatusBanner variant="warning" id="support-blocked">
              {supportBoundaryCopy.blockedPromptMessage}
              {classification.boundary_rule_id ? (
                <span className="block mt-1 text-[10px] font-mono opacity-70">
                  rule: {classification.boundary_rule_id}
                </span>
              ) : null}
            </StatusBanner>
          )}

          <Button type="submit" disabled={!canSubmit}>
            {submit.isPending ? "Submitting…" : support.submitLabel}
          </Button>
        </form>
      )}
    </div>
  );
}
