import { forwardRef, useId } from "react";
import { cn } from "../lib/utils";

export interface RadioOption {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

export interface RadioGroupProps {
  name: string;
  label?: string;
  options: RadioOption[];
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
  className?: string;
}

function RadioGroup({
  name,
  label,
  options,
  value,
  onChange,
  error,
  className,
}: RadioGroupProps) {
  const groupId = useId();
  const errorId = `${groupId}-error`;

  return (
    <fieldset
      className={cn("flex flex-col gap-2", className)}
      aria-describedby={error ? errorId : undefined}
    >
      {label && (
        <legend className="text-sm font-medium text-charcoal-200 mb-1">
          {label}
        </legend>
      )}
      {options.map((option) => (
        <RadioOption
          key={option.value}
          name={name}
          option={option}
          checked={value === option.value}
          onChange={onChange}
        />
      ))}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-xs text-status-rejected mt-1"
        >
          {error}
        </p>
      )}
    </fieldset>
  );
}

interface RadioOptionProps {
  name: string;
  option: RadioOption;
  checked: boolean;
  onChange?: (value: string) => void;
}

const RadioOption = forwardRef<HTMLInputElement, RadioOptionProps>(
  ({ name, option, checked, onChange }, ref) => {
    const id = useId();

    return (
      <div className="flex items-start gap-3">
        <input
          ref={ref}
          type="radio"
          id={id}
          name={name}
          value={option.value}
          checked={checked}
          disabled={option.disabled}
          onChange={() => onChange?.(option.value)}
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 rounded-full border border-charcoal-600 bg-charcoal-800",
            "checked:border-mint-400",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-400 focus-visible:ring-offset-2 focus-visible:ring-offset-charcoal-900",
            "disabled:cursor-not-allowed disabled:opacity-40",
            "cursor-pointer",
          )}
        />
        <div>
          <label
            htmlFor={id}
            className="text-sm text-charcoal-200 leading-5 cursor-pointer"
          >
            {option.label}
          </label>
          {option.hint && (
            <p className="text-xs text-charcoal-400 mt-0.5">{option.hint}</p>
          )}
        </div>
      </div>
    );
  },
);

RadioOption.displayName = "RadioOption";

export { RadioGroup };
