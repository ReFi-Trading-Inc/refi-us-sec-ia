import { cn } from "../lib/utils";

export type LogoProps = {
  /** Pixel size of the mark. Default 24. */
  size?: number;
  /** Show the "ReFi.Trading" wordmark next to the mark. */
  showWordmark?: boolean;
  /** Wordmark suffix. Use "USA" inside the /us overlay. */
  wordmarkSuffix?: string;
  className?: string;
  /** Accessible label. Defaults to the wordmark text. */
  label?: string;
};

export function Logo({
  size = 24,
  showWordmark = true,
  wordmarkSuffix,
  className,
  label,
}: LogoProps) {
  const wordmark = wordmarkSuffix
    ? `ReFi.Trading ${wordmarkSuffix}`
    : "ReFi.Trading";
  const accessibleLabel = label ?? wordmark;

  return (
    <span
      className={cn("inline-flex items-center gap-2", className)}
      role="img"
      aria-label={accessibleLabel}
    >
      {/* The mark is served as a static asset; eslint-disable-next-line is */}
      {/* not needed because next/image would force a layout shift here.   */}
      <img
        src="/logo.svg"
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        className="shrink-0"
      />
      {showWordmark ? (
        <span className="font-semibold tracking-tight text-current">
          {wordmark}
        </span>
      ) : null}
    </span>
  );
}
