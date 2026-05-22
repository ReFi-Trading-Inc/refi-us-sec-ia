import { cn } from "../lib/utils";

export type ModeBadgeValue = "signal" | "managed" | "unset";

export interface ModeBadgeProps {
  mode: ModeBadgeValue;
  className?: string;
  "data-testid"?: string;
}

const labels: Record<ModeBadgeValue, string> = {
  signal: "ReFi Signal",
  managed: "ReFi Managed",
  unset: "Mode not set",
};

const styles: Record<ModeBadgeValue, string> = {
  signal: "bg-status-system/15 text-status-system border-status-system/30",
  managed: "bg-mint-400/15 text-mint-300 border-mint-400/30",
  unset: "bg-charcoal-700/50 text-charcoal-300 border-charcoal-600",
};

export function ModeBadge({
  mode,
  className,
  "data-testid": testId,
}: ModeBadgeProps) {
  return (
    <span
      data-testid={testId ?? "mode-badge"}
      data-mode={mode}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border",
        styles[mode],
        className,
      )}
    >
      {labels[mode]}
    </span>
  );
}
