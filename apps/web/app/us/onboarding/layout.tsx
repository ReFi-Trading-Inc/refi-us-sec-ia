"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@ui/lib/utils";
import { onboardingSteps } from "../_content/onboarding";
import { usBrand } from "../_content/brand";

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
      {/* Stacks on phones; the step row scrolls inside itself so the page
          never scrolls sideways (five labels do not fit a 390px viewport). */}
      <header className="border-b border-charcoal-800 px-4 sm:px-8 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/us"
          className="text-sm font-semibold text-charcoal-200 shrink-0"
        >
          {usBrand.productSurface}
        </Link>
        <nav
          aria-label="Onboarding steps"
          className="flex items-center gap-4 sm:gap-6 overflow-x-auto whitespace-nowrap -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {onboardingSteps.map((step, i) => {
            const done = i < currentIndex;
            const active = i === currentIndex;
            return (
              <span
                key={step.key}
                className={cn(
                  "text-xs font-medium shrink-0",
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
      <main className="max-w-2xl mx-auto px-4 sm:px-8 py-8 sm:py-12">
        {children}
      </main>
    </div>
  );
}
