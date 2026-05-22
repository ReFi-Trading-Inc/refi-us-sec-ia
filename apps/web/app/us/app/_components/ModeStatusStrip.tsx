"use client";

import { Card, CardContent, ModeBadge } from "@ui/components";
import { useSubscriptionMode } from "@refi/api-clients";
import { modeCopy } from "../../_content/app-copy";

/**
 * Read-only mode status strip surfaced on /us/app/home. Phase 2 surface 1.
 * Does not switch modes; the activation flow ships with surface 3.
 */
export function ModeStatusStrip() {
  const { data, isLoading } = useSubscriptionMode();
  const mode = data?.mode ?? null;
  const value: "signal" | "managed" | "unset" =
    mode === "signal" ? "signal" : mode === "managed" ? "managed" : "unset";
  const copy = modeCopy[value];

  return (
    <Card data-testid="mode-status-strip" data-mode={value}>
      <CardContent className="pt-4 pb-4 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <ModeBadge mode={value} data-testid="mode-status-strip-badge" />
          {isLoading && (
            <span className="text-xs text-charcoal-500">Loading…</span>
          )}
        </div>
        <p className="text-sm font-medium text-charcoal-100">
          {copy.homeStrip.title}
        </p>
        <p className="text-sm text-charcoal-400">{copy.homeStrip.body}</p>
      </CardContent>
    </Card>
  );
}
