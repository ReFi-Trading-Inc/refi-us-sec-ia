import type { Metadata } from "next";
import { NavSidebar } from "./_components/NavSidebar";

export const metadata: Metadata = {
  title: "App",
};

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-charcoal-950 text-charcoal-100 font-sans">
      <NavSidebar />
      <main className="flex-1 min-w-0 p-8">
        <div className="mb-6 flex justify-end"></div>
        {children}
      </main>
    </div>
  );
}
