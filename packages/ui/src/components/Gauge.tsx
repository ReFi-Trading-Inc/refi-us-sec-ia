import { cn } from "../lib/utils";

export interface GaugeProps {
  /** 0–100 */
  value: number;
  /** Label shown below the bar */
  label?: string;
  className?: string;
}

function Gauge({ value, label, className }: GaugeProps) {
  const clamped = Math.min(100, Math.max(0, value));

  const zone =
    clamped >= 80
      ? "bg-status-rejected"
      : clamped >= 60
        ? "bg-status-warning"
        : "bg-status-active";

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div
        role="meter"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="relative h-24 w-4 rounded-full bg-charcoal-700 overflow-hidden flex flex-col-reverse"
      >
        <div
          className={cn(
            "w-full rounded-full transition-all duration-500 motion-reduce:transition-none",
            zone,
          )}
          style={{ height: `${String(clamped)}%` }}
        />
      </div>
      {label && (
        <span className="text-xs text-charcoal-400 tabular-nums">{label}</span>
      )}
    </div>
  );
}

export { Gauge };
