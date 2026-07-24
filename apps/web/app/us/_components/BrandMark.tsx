import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";

/**
 * The ReFi.Trading brand lockup: the mint mark plus the wordmark, matching the
 * marketing site's header (refi.trading). The link is labelled for assistive
 * tech; the image is decorative (empty alt) since the wordmark carries the name.
 */
export function BrandMark({
  href = "/us",
  className = "",
}: {
  href?: Route;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label="ReFi.Trading home"
      className={`flex flex-shrink-0 items-center gap-2 ${className}`}
    >
      <Image
        src="/refi-logo.png"
        alt=""
        width={28}
        height={28}
        className="h-7 w-7"
        priority
      />
      <span className="text-lg font-semibold tracking-tight">
        <span className="text-mint-400">ReFi</span>
        <span className="text-charcoal-100">.Trading</span>
      </span>
    </Link>
  );
}
