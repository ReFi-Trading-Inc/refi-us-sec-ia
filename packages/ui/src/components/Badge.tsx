import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border",
  {
    variants: {
      variant: {
        active:
          "bg-status-active/15 text-status-active border-status-active/30",
        approved:
          "bg-status-approved/15 text-status-approved border-status-approved/30",
        rejected:
          "bg-status-rejected/15 text-status-rejected border-status-rejected/30",
        warning:
          "bg-status-warning/15 text-status-warning border-status-warning/30",
        expired:
          "bg-status-expired/15 text-status-expired border-status-expired/30",
        system:
          "bg-status-system/15 text-status-system border-status-system/30",
        neutral: "bg-charcoal-700/50 text-charcoal-300 border-charcoal-600",
        mint: "bg-mint-400/15 text-mint-300 border-mint-400/30",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Required when meaning is conveyed by color alone */
  "aria-label"?: string;
}

function Badge({ className, variant, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
