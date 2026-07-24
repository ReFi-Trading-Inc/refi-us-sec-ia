// Small persistent badge marking screens that render synthetic portfolio data.
// Used in the /us/app layout while live broker data is gated by KYC.
export function SimulatedDataBadge() {
  return (
    <span
      role="status"
      aria-label="Data mode: simulated"
      className="inline-flex items-center gap-2 rounded-full border border-status-warning/40 bg-status-warning/10 px-3 py-1 text-xs font-medium text-status-warning"
    >
      <span
        aria-hidden="true"
        className="inline-block h-2 w-2 rounded-full bg-status-warning motion-safe:animate-pulse"
      />
      Simulated Data
    </span>
  );
}
