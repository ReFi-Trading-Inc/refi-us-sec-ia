import type { Metadata } from "next";
import { NavSidebar } from "./_components/NavSidebar";
import {
  LiveEventsProvider,
  LiveStatusStrip,
} from "./_components/LiveEventsProvider";

export const metadata: Metadata = {
  title: "App",
};

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Phones: nav is a sticky top bar and content stacks under it. From `md`
    // the nav is the fixed-width sidebar and content sits beside it.
    <div className="flex flex-col md:flex-row min-h-screen bg-charcoal-950 text-charcoal-100 font-sans">
      <NavSidebar />
      <LiveEventsProvider>
        <main className="flex-1 min-w-0 p-4 sm:p-6 md:p-8">
          <div className="mb-6">
            <LiveStatusStrip />
          </div>
          {children}
        </main>
      </LiveEventsProvider>
    </div>
  );
}
