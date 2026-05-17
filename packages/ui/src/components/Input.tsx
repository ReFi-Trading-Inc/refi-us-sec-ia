import { forwardRef, useId } from "react";
import { cn } from "../lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id: externalId, ...props }, ref) => {
    const generatedId = useId();
    const id = externalId ?? generatedId;
    const errorId = `${id}-error`;
    const hintId = `${id}-hint`;

    const describedBy = [error ? errorId : null, hint ? hintId : null]
      .filter(Boolean)
      .join(" ");

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-charcoal-200">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          aria-describedby={describedBy || undefined}
          aria-invalid={error ? true : undefined}
          className={cn(
            "h-10 w-full rounded-md border bg-charcoal-800 px-3 text-sm text-charcoal-50 placeholder:text-charcoal-500 transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-charcoal-900",
            error
              ? "border-status-rejected focus:ring-status-rejected/50"
              : "border-charcoal-600 focus:border-mint-400 focus:ring-mint-400/30",
            "disabled:cursor-not-allowed disabled:opacity-40",
            className,
          )}
          {...props}
        />
        {error && (
          <p id={errorId} role="alert" className="text-xs text-status-rejected">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="text-xs text-charcoal-400">
            {hint}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";

export { Input };
