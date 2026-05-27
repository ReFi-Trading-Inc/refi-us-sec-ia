// MIG-P2.5-09: status-oriented home. The dashboard answers what the
// investor needs to know at a glance — account state, what needs attention,
// managed-execution status, the next action, and what data is current.
// Portfolio chart and P&L cards moved to /us/app/portfolio so the home
// screen reads as a status dashboard, not a fake-trading P&L surface.

import type { Metadata } from "next";
import { appCopy } from "../../_content/app-copy";
import { ModeStatusStrip } from "../_components/ModeStatusStrip";
import { BrokerStatusBanner } from "../_components/BrokerStatusBanner";
import { Dashboard, RecentActivity } from "./_components/dashboard";

const { home } = appCopy;

export const metadata: Metadata = { title: home.heading };

export default function HomePage() {
  return (
    <div className="flex flex-col gap-8 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-charcoal-50">
          {home.heading}
        </h1>
      </div>

      {/* Mode-aware status strip (Surface 1) — mode-branching.spec depends
          on its data-mode attribute; render ahead of the dashboard. */}
      <ModeStatusStrip />
      <BrokerStatusBanner />
      <Dashboard />
      <RecentActivity />
    </div>
  );
}
