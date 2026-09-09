"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@ui/lib/utils";
import { navItems } from "../../_content/app-copy";
import { usBrand } from "../../_content/brand";

export function NavSidebar() {
  const pathname = usePathname();

  return (
    <nav
      // Below `md`: a sticky top bar whose link row scrolls sideways inside
      // itself (seven links do not fit a phone). From `md`: the sidebar.
      className="sticky top-0 z-30 md:static flex flex-col w-full md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-charcoal-700 bg-charcoal-900 md:min-h-screen px-4 py-3 md:p-4 gap-2 md:gap-1"
      aria-label="Main navigation"
    >
      <div className="md:mb-6 px-0 md:px-2">
        <span className="text-sm font-semibold text-charcoal-100 tracking-tight">
          {usBrand.productSurface}
        </span>
      </div>

      <div className="flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible whitespace-nowrap -mx-4 px-4 md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {navItems.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm transition-colors shrink-0",
                active
                  ? "bg-charcoal-700 text-charcoal-50 font-medium"
                  : "text-charcoal-400 hover:bg-charcoal-800 hover:text-charcoal-200",
              )}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
