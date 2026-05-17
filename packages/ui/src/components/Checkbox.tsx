import { forwardRef, useId } from "react";
import { cn } from "../lib/utils";

export interface CheckboxProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  label: string;
  error?: string;
  hint?: string;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, error, hint, id: externalId, ...props }, ref) => {
    const generatedId = useId();
    const id = externalId ?? generatedId;
    const errorId = `${id}-error`;
    const hintId = `${id}-hint`;

    const describedBy = [error ? errorId : null, hint ? hintId : null]
      .filter(Boolean)
      .join(" ");

    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-start gap-3">
          <input
            ref={ref}
            type="checkbox"
            id={id}
            aria-describedby={describedBy || undefined}
            aria-invalid={error ? true : undefined}
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0 rounded border border-charcoal-600 bg-charcoal-800",
              "checked:bg-mint-400 checked:border-mint-400",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-400 focus-visible:ring-offset-2 focus-visible:ring-offset-charcoal-900",
              "disabled:cursor-not-allowed disabled:opacity-40",
              "cursor-pointer",
              className,
            )}
            {...props}
          />
          <label
            htmlFor={id}
            className="text-sm text-charcoal-200 leading-5 cursor-pointer"
          >
            {label}
          </label>
        </div>
        {error && (
          <p
            id={errorId}
            role="alert"
            className="pl-7 text-xs text-status-rejected"
          >
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="pl-7 text-xs text-charcoal-400">
            {hint}
          </p>
        )}
      </div>
    );
  },
);

Checkbox.displayName = "Checkbox";

export { Checkbox };
