import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from "../icons";

const bannerVariants = cva(
  "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
  {
    variants: {
      variant: {
        info: "border-status-system/30 bg-status-system/10 text-status-system",
        success:
          "border-status-active/30 bg-status-active/10 text-status-active",
        warning:
          "border-status-warning/30 bg-status-warning/10 text-status-warning",
        error:
          "border-status-rejected/30 bg-status-rejected/10 text-status-rejected-text",
      },
    },
    defaultVariants: { variant: "info" },
  },
);

const icons = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertCircle,
};

export interface StatusBannerProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof bannerVariants> {
  title?: string;
  onDismiss?: () => void;
}

function StatusBanner({
  className,
  variant = "info",
  title,
  children,
  onDismiss,
  ...props
}: StatusBannerProps) {
  const Icon = icons[variant ?? "info"];

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(bannerVariants({ variant }), className)}
      {...props}
    >
      <Icon className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        {title && <p className="font-medium">{title}</p>}
        {children && (
          <div className={cn("text-sm opacity-90", title && "mt-0.5")}>
            {children}
          </div>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current rounded"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export { StatusBanner };
