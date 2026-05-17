import { cn } from "../lib/utils";

// 1500ms linear shimmer per design system spec.
// motion-reduce: removes animation entirely, preserving the placeholder shape.

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Width as a Tailwind class e.g. "w-32" or inline style */
  width?: string;
  /** Height as a Tailwind class e.g. "h-4" */
  height?: string;
  /** Render as a circle (for avatars / icons) */
  circle?: boolean;
}

function Skeleton({
  className,
  width,
  height,
  circle,
  ...props
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-md bg-charcoal-700",
        "motion-safe:after:absolute motion-safe:after:inset-0",
        "motion-safe:after:bg-gradient-to-r motion-safe:after:from-transparent motion-safe:after:via-charcoal-600/40 motion-safe:after:to-transparent",
        "motion-safe:after:animate-[shimmer_1.5s_linear_infinite]",
        circle && "rounded-full",
        width,
        height,
        className,
      )}
      {...props}
    />
  );
}

// Convenience wrappers for common skeleton shapes

function SkeletonText({
  lines = 1,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height="h-4"
          className={i === lines - 1 && lines > 1 ? "w-3/4" : "w-full"}
        />
      ))}
    </div>
  );
}

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-charcoal-700 bg-charcoal-800 p-6 flex flex-col gap-4",
        className,
      )}
      aria-hidden="true"
    >
      <div className="flex items-center gap-3">
        <Skeleton circle width="w-8" height="h-8" />
        <div className="flex-1 flex flex-col gap-2">
          <Skeleton height="h-4" width="w-1/3" />
          <Skeleton height="h-3" width="w-1/2" />
        </div>
      </div>
      <SkeletonText lines={3} />
    </div>
  );
}

export { Skeleton, SkeletonText, SkeletonCard };
