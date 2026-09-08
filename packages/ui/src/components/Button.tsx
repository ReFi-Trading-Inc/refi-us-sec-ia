import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";
import { Loader2 } from "../icons";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-400 focus-visible:ring-offset-2 focus-visible:ring-offset-charcoal-900 disabled:pointer-events-none disabled:opacity-40 select-none",
  {
    variants: {
      variant: {
        primary:
          "bg-mint-400 text-charcoal-950 hover:bg-mint-300 active:bg-mint-500",
        secondary:
          "border border-charcoal-600 bg-transparent text-charcoal-100 hover:bg-charcoal-800 hover:border-charcoal-500 active:bg-charcoal-700",
        tertiary:
          "bg-transparent text-mint-400 hover:text-mint-300 hover:bg-charcoal-800 active:bg-charcoal-700",
        danger:
          "bg-status-rejected text-white hover:bg-red-500 active:bg-red-700",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-sm",
        lg: "h-11 px-6 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, loading, disabled, children, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled ?? loading}
      aria-disabled={disabled ?? loading}
      aria-busy={loading}
      {...props}
    >
      {loading && (
        <Loader2
          className="h-4 w-4 motion-safe:animate-spin motion-reduce:opacity-60"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  ),
);

Button.displayName = "Button";

export { Button, buttonVariants };
