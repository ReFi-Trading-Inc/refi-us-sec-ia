"use client";

// The visible edge of the real/mock boundary (docs/mock-boundary-map.md).
// Renders only when the browser data adapter is MSW-mocked — i.e. in dev and
// in Vercel Preview deployments, never in production builds (prod sets
// NEXT_PUBLIC_REFI_ENV=prod, which also disables MSW init entirely).
// Everything this banner names is served by the mock worker, not real infra.
const MOCK_MODE =
  process.env["NEXT_PUBLIC_REFI_ENV"] !== "prod" &&
  (process.env["NEXT_PUBLIC_REFI_DATA_ADAPTER"] ?? "mock") === "mock";

export function MockModeBanner() {
  if (!MOCK_MODE) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-50 border-b border-status-warning/40 bg-status-warning/15 px-4 py-1.5 text-center text-xs font-medium text-status-warning"
    >
      Demo preview — sign-in, KYC, broker, and portfolio data are simulated
      (MSW). Real/mock boundary: docs/mock-boundary-map.md
    </div>
  );
}
