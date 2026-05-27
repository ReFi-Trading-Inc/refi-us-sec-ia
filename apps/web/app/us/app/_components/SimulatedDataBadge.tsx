// Honest labeling of mock/simulated data. The default `pill` variant lives
// in the /us/app shell header; `inline` sits next to a numeric value or
// status word; `card` annotates a card-level data section; `chart` overlays
// a chart caption.
//
// The accessible label calls out simulated *or* mock per the underlying
// source — `simulated` for random/scenario-driven price walks, `mock` for
// MSW-fixture data that mirrors a real backend shape.

import { cn } from "@ui/lib/utils";

export type SimulatedDataBadgeVariant = "pill" | "inline" | "card" | "chart";
export type SimulatedDataBadgeSource = "simulated" | "mock";

type Props = {
  variant?: SimulatedDataBadgeVariant;
  source?: SimulatedDataBadgeSource;
  /** Optional clarifying note shown next to the badge text. */
  note?: string;
  className?: string;
};

const SOURCE_LABEL: Record<SimulatedDataBadgeSource, string> = {
  simulated: "Simulated",
  mock: "Mock data",
};

const SOURCE_ARIA: Record<SimulatedDataBadgeSource, string> = {
  simulated: "Data mode: simulated",
  mock: "Data mode: mock",
};

export function SimulatedDataBadge({
  variant = "pill",
  source = "simulated",
  note,
  className,
}: Props) {
  const label = SOURCE_LABEL[source];
  const aria = SOURCE_ARIA[source];

  if (variant === "pill") {
    return (
      <span
        role="status"
        aria-label={aria}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300",
          className,
        )}
      >
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 rounded-full bg-amber-400 motion-safe:animate-pulse"
        />
        {label} Data
      </span>
    );
  }

  if (variant === "inline") {
    return (
      <span
        role="status"
        aria-label={aria}
        className={cn(
          "inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide text-amber-300",
          className,
        )}
      >
        {label}
        {note ? <span className="opacity-80">· {note}</span> : null}
      </span>
    );
  }

  if (variant === "card") {
    return (
      <div
        role="status"
        aria-label={aria}
        className={cn(
          "flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200",
          className,
        )}
      >
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 rounded-full bg-amber-400 motion-safe:animate-pulse shrink-0"
        />
        <span className="font-medium">{label} data</span>
        {note ? <span className="text-amber-200/80">— {note}</span> : null}
      </div>
    );
  }

  // chart — bottom-of-chart caption with subtle border-top
  return (
    <p
      role="status"
      aria-label={aria}
      className={cn(
        "text-[10px] font-mono uppercase tracking-wider text-amber-400/80 border-t border-amber-500/20 pt-1 mt-1",
        className,
      )}
    >
      {label} chart data{note ? ` · ${note}` : ""}
    </p>
  );
}
