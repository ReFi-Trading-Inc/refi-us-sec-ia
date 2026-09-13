/**
 * Investor-product primitives — the trading-application register.
 *
 * Source of truth: the "ReFi.Trading Design System" canvas,
 * `ui_kits/trading-app/app.css` (the dense workstation surface). These are
 * deliberately NOT in `@refi/ui`: that package also backs the marketing site,
 * the investor portal and admin, and several of its primitives predate the
 * current system (`Button` rounded-md/6px, `Input` rounded-md/6px, `Badge`
 * rounded-full, `Card` rounded-lg/8px + 24px padding). Converging those is a
 * separate, app-wide visual change; doing it inside this track would repaint
 * unrelated surfaces during the demo freeze.
 *
 * So these compose the shared TOKEN layer (which is already brand-correct)
 * at the canvas's application geometry:
 *
 *   radius   inputs/badges 2px · buttons 4px · cards/panels 6px
 *   spacing  4/8/12/16/20/24, 16px card padding, 16px field separation
 *   type     11/12/13/14/16/20/24, fixed — never fluid
 *   shadow   flat at rest; hover elevates a panel only where permitted
 *   motion   150ms state · 200ms panel, and prefers-reduced-motion honoured
 *
 * Every numeric financial value renders through `<Num>` (mono, tabular) so
 * columns align and no allocation percentage falls back to a proportional
 * face.
 *
 * Colour mapping note: the canvas kit names the card border `--g700 #374151`,
 * a stock grey. This repo deliberately replaced stock greys with the
 * brand-owned charcoal ladder (docs/shell-design-system-application.md), and
 * the canvas's own newer token file agrees that the neutral ramp is
 * brand-owned rather than a grey scale. So the card border is expressed as
 * `charcoal-400`, preserving the kit's relationship (border one step lighter
 * than the panel) inside this repo's palette.
 */
import { forwardRef, useId, type ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ─── Num — every money / qty / price / percent / timestamp ──────────────────

/**
 * A financial value.
 *
 * Mono + `tabular-nums` so digits align in a column and a changing value does
 * not reflow its neighbours. `unit` is rendered inside the same mono run so
 * "25" and "%" cannot drift apart across a line break.
 */
export function Num({
  value,
  unit,
  className,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & {
  value: string | number;
  unit?: string;
}) {
  const ariaLabel = rest["aria-label"];
  return (
    <span className={cx("font-mono tabular-nums", className)} {...rest}>
      {value}
      {unit ? (
        <span aria-hidden={ariaLabel ? "true" : undefined}>{unit}</span>
      ) : null}
    </span>
  );
}

// ─── Panel — the workstation card ──────────────────────────────────────────

/**
 * A panel. Flat at rest by design; `hoverable` brightens the BORDER rather
 * than adding a shadow, matching the kit (`.card.hoverable:hover`).
 */
export function Panel({
  children,
  className,
  hoverable = false,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { hoverable?: boolean }) {
  return (
    <div
      className={cx(
        "rounded-app-card border border-charcoal-400 bg-charcoal-500 p-4",
        hoverable &&
          "transition-colors duration-state hover:border-charcoal-300 hover:shadow-card",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Panel eyebrow: 12px, uppercase, tracked — the kit's `.card-title`. */
export function PanelTitle({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "text-app-caption font-semibold uppercase tracking-[0.04em] text-charcoal-200",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** 20px/700 screen section heading. */
export function SectionHeading({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h1
      className={cx("text-app-h1 font-bold text-charcoal-50", className)}
      {...rest}
    >
      {children}
    </h1>
  );
}

/** 16px/600 panel title, as a real heading element. */
export function PanelHeading({
  children,
  className,
  level = 2,
  ...rest
}: React.HTMLAttributes<HTMLHeadingElement> & { level?: 2 | 3 }) {
  const Tag = level === 2 ? "h2" : "h3";
  return (
    <Tag
      className={cx(
        level === 2 ? "text-app-h2" : "text-app-h3",
        "font-semibold text-charcoal-50",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

// ─── Button ────────────────────────────────────────────────────────────────

/**
 * Application button. 4px radius, 600/14px, 8px×20px — the kit's `.btn`.
 *
 * Variants map 1:1 onto the kit: `primary` (mint fill, charcoal text — the
 * single primary action in a state), `secondary` (mint outline + mint text),
 * `tertiary` (text-only, grey → mint on hover), `danger` (red outline, for
 * destructive actions such as disconnecting a brokerage account).
 *
 * There is deliberately no blue/black/white variant to reach for.
 *
 * Focus is a 2px mint OUTLINE with a 2px offset (the kit uses outline, not a
 * ring, so the indicator is never clipped by a parent's overflow).
 */
const APP_BUTTON_BASE = cx(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap",
  "rounded-app-btn border text-app-body font-semibold",
  "transition-colors duration-state",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-400",
  // Disabled resolves to a NEUTRAL fill, per the kit's `Btn` disabled state —
  // not a dimmed mint. A faded primary still reads as "the mint action", which
  // is exactly the wrong signal on a gated control like Confirm Subscription:
  // the button must look unavailable, not merely quiet. Contrast is kept above
  // the 3:1 non-text threshold so the control remains perceivable.
  "disabled:cursor-not-allowed disabled:border-transparent",
  "disabled:bg-charcoal-400 disabled:text-charcoal-100",
);

const APP_BUTTON_VARIANT = {
  primary: "border-transparent bg-mint-400 text-charcoal-900 hover:bg-mint-500",
  secondary:
    "border-mint-400 bg-transparent text-mint-400 hover:bg-mint-400/10",
  tertiary:
    "border-transparent bg-transparent font-medium text-charcoal-100 hover:text-mint-400",
  danger:
    "border-status-rejected bg-transparent text-status-rejected hover:bg-status-rejected/10",
} as const;

/** 8px/20px default; the compact row variant is 5px/12px at 13px. */
const APP_BUTTON_SIZE = {
  md: "px-5 py-2",
  sm: "px-3 py-[5px] text-app-body-sm",
} as const;

export type AppButtonVariant = keyof typeof APP_BUTTON_VARIANT;
export type AppButtonSize = keyof typeof APP_BUTTON_SIZE;

export interface AppButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AppButtonVariant;
  size?: AppButtonSize;
}

export const AppButton = forwardRef<HTMLButtonElement, AppButtonProps>(
  function AppButton(
    { className, variant = "primary", size = "md", ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={cx(
          APP_BUTTON_BASE,
          APP_BUTTON_VARIANT[variant],
          APP_BUTTON_SIZE[size],
          className,
        )}
        {...rest}
      />
    );
  },
);

// ─── Input ─────────────────────────────────────────────────────────────────

/**
 * Application input. 2px radius, charcoal ground, brand-owned border, white
 * text, mint focus border + 2px mint ring — the kit's `.input`.
 *
 * Never a bright white field, and never a 48-56px consumer control: the kit's
 * vertical rhythm is 8px/12px padding at 14px.
 *
 * `mono` switches the field to the financial face for numeric entry
 * (allocation), so the value the investor types matches how it is displayed
 * back to them.
 */
export interface AppInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Validation failure. Renders red only here, never across the page. */
  error?: string;
  /** Persistent helper text. Hidden while an error is shown. */
  hint?: string;
  /** Trailing unit rendered inside the field (e.g. "%"). */
  suffix?: string;
  /** Use the financial face — for money / quantity / percentage entry. */
  mono?: boolean;
}

export const AppInput = forwardRef<HTMLInputElement, AppInputProps>(
  function AppInput(
    { className, label, error, hint, suffix, mono, id: externalId, ...rest },
    ref,
  ) {
    const generatedId = useId();
    const id = externalId ?? generatedId;
    const errorId = `${id}-error`;
    const hintId = `${id}-hint`;
    const describedBy =
      [error ? errorId : null, hint && !error ? hintId : null]
        .filter(Boolean)
        .join(" ") || undefined;

    return (
      <div className="flex flex-col gap-2">
        <label
          htmlFor={id}
          className="text-app-h3 font-semibold text-charcoal-100"
        >
          {label}
        </label>
        <div className="relative">
          <input
            ref={ref}
            id={id}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            className={cx(
              "w-full rounded-app-input border bg-charcoal-900 px-3 py-2",
              "text-app-body text-charcoal-50 placeholder:text-charcoal-300",
              "transition-colors duration-state",
              "focus:outline-none focus:ring-2 focus:ring-mint-400/30",
              mono && "font-mono tabular-nums",
              suffix && "pr-9",
              error
                ? "border-status-rejected focus:border-status-rejected focus:ring-status-rejected/30"
                : "border-charcoal-400 focus:border-mint-400",
              "disabled:cursor-not-allowed disabled:opacity-50",
              className,
            )}
            {...rest}
          />
          {suffix && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-app-body text-charcoal-200"
            >
              {suffix}
            </span>
          )}
        </div>
        {error && (
          <p
            id={errorId}
            role="alert"
            className="text-app-caption text-status-rejected"
          >
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="text-app-caption text-charcoal-200">
            {hint}
          </p>
        )}
      </div>
    );
  },
);

// ─── Status badge ──────────────────────────────────────────────────────────

/**
 * Compact state badge — 12px, 2px radius, low-opacity ground, semantic border
 * and text (the kit's `.badge`).
 *
 * Accessibility: meaning is carried by the LABEL TEXT, never by colour alone.
 * The optional dot is redundant reinforcement, so it is `aria-hidden`; a
 * screen reader and a monochrome display both still read "CONNECTED".
 */
const STATE_BADGE_BASE = cx(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-app-input border",
  "px-2 py-0.5 text-app-caption font-medium uppercase tracking-[0.03em]",
);

const STATE_BADGE_TONE = {
  success:
    "border-status-approved/30 bg-status-approved/10 text-status-approved",
  warning: "border-status-warning/30 bg-status-warning/10 text-status-warning",
  error: "border-status-rejected/30 bg-status-rejected/10 text-status-rejected",
  /** Environment / operational state — informational, not a verdict. */
  info: "border-status-system/30 bg-status-system/10 text-status-system",
  /** Inert, unavailable, or not-yet-reached states. */
  neutral: "border-charcoal-400 bg-charcoal-600/60 text-charcoal-200",
} as const;

export type StateBadgeTone = keyof typeof STATE_BADGE_TONE;

export interface StateBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StateBadgeTone;
  /** Render the value in the financial face (environments, identifiers). */
  mono?: boolean;
  /** Redundant colour reinforcement; never the sole carrier of meaning. */
  dot?: boolean;
}

export function StateBadge({
  className,
  tone = "neutral",
  mono,
  dot,
  children,
  ...rest
}: StateBadgeProps) {
  return (
    <span
      className={cx(
        STATE_BADGE_BASE,
        STATE_BADGE_TONE[tone],
        mono && "font-mono",
        className,
      )}
      {...rest}
    >
      {dot && (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-current"
        />
      )}
      {children}
    </span>
  );
}

/**
 * The account environment, stated explicitly and legibly.
 *
 * PAPER must be obvious at a glance without becoming a consumer alarm banner:
 * it is rendered as operational data (mono, uppercase, informational tone)
 * rather than as a warning. A user should be able to glance at any brokerage,
 * account or subscription surface and know the environment without reading
 * prose.
 *
 * The label text alone is sufficient — no colour-only signalling.
 */
export function EnvironmentBadge({
  environment,
  className,
}: {
  environment: "paper" | "live";
  className?: string;
}) {
  return (
    <StateBadge
      tone={environment === "paper" ? "info" : "neutral"}
      mono
      dot
      className={className}
      data-testid="environment-badge"
      data-environment={environment}
    >
      {environment.toUpperCase()}
    </StateBadge>
  );
}

// ─── Status panel ──────────────────────────────────────────────────────────

/**
 * A concise workstation status panel.
 *
 * Used for operational states (retryable backend unavailability → `warning`),
 * confirmations (`success`) and hard failures (`error`). Deliberately a
 * bordered strip, not a full-bleed page treatment: ordinary transient backend
 * unavailability must not paint the screen red.
 */
const STATUS_PANEL_BASE =
  "flex flex-col gap-2 rounded-app-card border p-4 text-app-body-sm";

const STATUS_PANEL_TONE = {
  success:
    "border-status-approved/30 bg-status-approved/[0.07] text-charcoal-100",
  warning:
    "border-status-warning/30 bg-status-warning/[0.07] text-charcoal-100",
  error:
    "border-status-rejected/30 bg-status-rejected/[0.07] text-charcoal-100",
  info: "border-charcoal-400 bg-charcoal-600/40 text-charcoal-100",
} as const;

const STATUS_TITLE_TONE = {
  success: "text-status-approved",
  warning: "text-status-warning",
  error: "text-status-rejected",
  info: "text-charcoal-50",
} as const;

export function StatusPanel({
  tone = "info",
  title,
  children,
  actions,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  tone?: "success" | "warning" | "error" | "info";
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div
      className={cx(STATUS_PANEL_BASE, STATUS_PANEL_TONE[tone], className)}
      // Operational states are announced politely; they are not alerts that
      // should interrupt a screen reader mid-sentence.
      role="status"
      {...rest}
    >
      <p className={cx("text-app-h3 font-semibold", STATUS_TITLE_TONE[tone])}>
        {title}
      </p>
      {children && <div className="text-charcoal-100">{children}</div>}
      {actions && <div className="mt-1 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

// ─── Definition rows ───────────────────────────────────────────────────────

/**
 * Label → value rows: the institutional account-panel hierarchy
 * (Brokerage / Environment / Connection / Account).
 *
 * A real `<dl>`, so the label-value relationship survives into the
 * accessibility tree instead of being implied by layout.
 */
export function DefinitionList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <dl className={cx("flex flex-col gap-3", className)}>{children}</dl>;
}

export function DefinitionRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-app-caption font-semibold uppercase tracking-[0.04em] text-charcoal-200">
        {label}
      </dt>
      <dd className="text-app-body-sm text-charcoal-50">{children}</dd>
    </div>
  );
}
