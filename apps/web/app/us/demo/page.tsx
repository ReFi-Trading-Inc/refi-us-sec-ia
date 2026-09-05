import { notFound } from "next/navigation";
import { getServerEnv } from "@lib/config/env";
import { DEMO_PERSONA_PROFILES } from "@lib/demo/personas";
import { DemoPersonaPicker } from "./_components/DemoPersonaPicker";

/**
 * /us/demo — demo-tier entry. Server-gated on the runtime tier (REFI_ENV),
 * not on a build constant, so the same production artifact answers 404 on
 * every non-demo tier and the E2E lanes can prove both behaviours.
 */
export const dynamic = "force-dynamic";

export default function DemoEntryPage() {
  if (getServerEnv().REFI_ENV !== "demo") notFound();
  const personas = Object.values(DEMO_PERSONA_PROFILES).map((p) => ({
    key: p.key,
    label: p.label,
    entryPath: p.entryPath,
  }));
  return (
    <main className="min-h-screen bg-charcoal-950 text-charcoal-100 font-sans flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg flex flex-col gap-6">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-mint-400 mb-2">
            Demonstration environment
          </p>
          <h1 className="text-2xl font-semibold text-charcoal-50">
            Choose a walkthrough persona
          </h1>
          <p className="text-sm text-charcoal-400 mt-2">
            This environment runs on simulated data. Nothing here is a real
            identity verification, a real admission decision, a live brokerage
            connection, or an executed order. The persona sets the starting
            point of the story; every state shown afterwards comes from the demo
            backend, never from this page.
          </p>
        </div>
        <DemoPersonaPicker personas={personas} />
      </div>
    </main>
  );
}
