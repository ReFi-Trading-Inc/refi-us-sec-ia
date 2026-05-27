"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo, StatusBanner } from "@ui/components";
import { cn } from "@ui/lib/utils";
import {
  onboardingSimulatedBanner,
  onboardingSteps,
} from "../_content/onboarding";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const currentIndex = onboardingSteps.findIndex((s) =>
    pathname.startsWith(s.path),
  );

  return (
    <div className="min-h-screen bg-charcoal-950 text-charcoal-100 font-sans">
      <header className="border-b border-charcoal-800 px-8 py-4 flex items-center justify-between">
        <Link href="/us" aria-label="Back to ReFi.Trading USA">
          <Logo
            size={22}
            wordmarkSuffix="USA"
            className="text-sm text-charcoal-200"
          />
        </Link>
        <nav aria-label="Onboarding steps" className="flex items-center gap-6">
          {onboardingSteps.map((step, i) => {
            const done = i < currentIndex;
            const active = i === currentIndex;
            return (
              <span
                key={step.key}
                className={cn(
                  "text-xs font-medium",
                  active && "text-mint-400",
                  done && "text-charcoal-400",
                  !active && !done && "text-charcoal-600",
                )}
                aria-current={active ? "step" : undefined}
              >
                {i + 1}. {step.label}
              </span>
            );
          })}
        </nav>
      </header>
      <main className="max-w-2xl mx-auto px-8 py-12 flex flex-col gap-6">
        <OnboardingSimulatedBanner />
        {children}
      </main>
    </div>
  );
}

function OnboardingSimulatedBanner() {
  const env = process.env["NEXT_PUBLIC_REFI_ENV"];
  if (env === "prod" || env === "production") return null;
  return (
    <StatusBanner variant="warning" title={onboardingSimulatedBanner.title}>
      {onboardingSimulatedBanner.body}
    </StatusBanner>
  );
}
