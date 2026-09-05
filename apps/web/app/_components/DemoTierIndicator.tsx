"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Subtle, always-visible environment indicator for the demo tier. Reads the
 * runtime tier from `/api/demo/session` (404 everywhere except REFI_ENV=demo),
 * so a production build never shows it and the demo build cannot hide it.
 * The persona shown is a display label only — it carries no authority.
 */
export function DemoTierIndicator() {
  const pathname = usePathname();
  const [state, setState] = useState<{ persona: string | null } | null>(null);
  // Re-read on every client navigation so a persona change (sign-in on
  // /us/demo, then router.push) is reflected without a full reload.
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/demo/session", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) return;
        const body = (await r.json()) as { data: { persona: string | null } };
        if (!cancelled) setState({ persona: body.data.persona });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pathname]);
  if (!state) return null;
  return (
    <div
      role="status"
      data-testid="demo-tier-indicator"
      className="sticky top-0 z-50 flex items-center justify-between border-b border-mint-400/30 bg-charcoal-950 px-4 py-1 text-[11px] font-mono text-charcoal-300"
    >
      <span>
        <span className="text-mint-400">DEMO</span> · simulated data · no real
        KYC, admission, brokerage, or orders
      </span>
      <span>
        persona: {state.persona ?? "none"} ·{" "}
        <a className="text-mint-400 hover:underline" href="/us/demo">
          switch
        </a>
      </span>
    </div>
  );
}
