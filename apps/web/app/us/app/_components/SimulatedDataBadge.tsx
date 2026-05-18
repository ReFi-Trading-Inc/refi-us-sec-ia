// Small persistent badge marking screens that render synthetic portfolio data.
// Used in the /us/app layout while live broker data is gated by KYC.
export function SimulatedDataBadge() {
  return (
    <span
      role="status"
      aria-label="Data mode: simulated"
      className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300"
    >
      <span
        aria-hidden="true"
        className="inline-block h-2 w-2 rounded-full bg-amber-400 motion-safe:animate-pulse"
      />
      Simulated Data
    </span>
  );
}
