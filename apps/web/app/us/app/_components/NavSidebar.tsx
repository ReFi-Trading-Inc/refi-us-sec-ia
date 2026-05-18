"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@ui/lib/utils";
import { navItems } from "../../_content/app-copy";
import { usBrand } from "../../_content/brand";
import { WalletButton } from "./WalletButton";

export function NavSidebar() {
  const pathname = usePathname();

  return (
    <nav
      className="flex flex-col w-56 shrink-0 border-r border-charcoal-700 bg-charcoal-900 min-h-screen p-4 gap-1"
      aria-label="Main navigation"
    >
      <div className="mb-6 px-2">
        <span className="text-sm font-semibold text-charcoal-100 tracking-tight">
          {usBrand.productSurface}
        </span>
      </div>

      {navItems.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-md px-3 py-2 text-sm transition-colors",
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

      <div className="mt-auto pt-4 border-t border-charcoal-800">
        <WalletButton />
      </div>
    </nav>
  );
}
