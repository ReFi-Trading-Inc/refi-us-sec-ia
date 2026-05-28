"use client";

import { useState } from "react";
import { Button, Select, StatusBanner } from "@ui/components";
import type { SelectOption } from "@ui/components";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@refi/api-clients";
import {
  supportBoundaryCopy,
  blockedPromptPatterns,
} from "../../_content/support-boundary";
import { appCopy } from "../../_content/app-copy";

const { support } = appCopy;

const categoryOptions: SelectOption[] = supportBoundaryCopy.categories.map(
  (c) => ({
    value: c,
    label: c,
  }),
);

type SupportTicket = {
  subject: string;
  category: string;
  message: string;
};

export default function SupportPage() {
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");
  const [blocked, setBlocked] = useState(false);

  const submit = useMutation({
    mutationFn: (body: SupportTicket) =>
      apiFetch<{ ok: boolean; ticket_id: string }>("/v1/support/ticket", {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      setCategory("");
      setMessage("");
      setBlocked(false);
    },
  });

  function handleMessageChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setMessage(val);
    setBlocked(blockedPromptPatterns.some((p) => p.test(val)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    submit.mutate({
      subject: category,
      category,
      message: message.trim(),
    });
  }

  const canSubmit =
    category !== "" && message.trim() !== "" && !blocked && !submit.isPending;

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
          Submission failed. Please try again or email support directly.
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
            onChange={(e) => {
              setCategory(e.target.value);
            }}
            required
          />

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-charcoal-200">
              {support.messageLabel}
            </label>
            <textarea
              className="rounded-md border border-charcoal-700 bg-charcoal-800 px-3 py-2 text-sm text-charcoal-100 placeholder:text-charcoal-600 focus:outline-none focus:ring-2 focus:ring-mint-400 min-h-[120px] resize-y"
              placeholder={support.placeholder}
              value={message}
              onChange={handleMessageChange}
              required
              disabled={submit.isPending}
              aria-describedby={blocked ? "support-blocked" : undefined}
              aria-invalid={blocked ? true : undefined}
            />
          </div>

          {blocked && (
            <StatusBanner variant="warning" id="support-blocked">
              {supportBoundaryCopy.blockedPromptMessage}
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
