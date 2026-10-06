import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/* ---------------------------------------------------------------------------
 * Primitives shared by the public site and the CRM.
 * Server-safe: no "use client", no hooks, no browser APIs.
 * ------------------------------------------------------------------------- */

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors " +
  "disabled:cursor-not-allowed disabled:opacity-55 whitespace-nowrap";

const BUTTON_VARIANTS = {
  primary:
    "bg-gold-500 text-navy-950 hover:bg-gold-400 focus-visible:outline-gold-600 shadow-[0_1px_0_rgb(0_0_0/0.05)]",
  secondary:
    "bg-navy-900 text-white hover:bg-navy-700 focus-visible:outline-navy-500",
  outline:
    "border border-navy-300 bg-white text-navy-900 hover:border-navy-500 hover:bg-sand-100",
  quiet: "text-navy-700 hover:bg-sand-200 hover:text-navy-900",
  danger: "border border-critical-700/40 bg-critical-100 text-critical-700 hover:bg-critical-100/70",
} as const;

const BUTTON_SIZES = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2.5 text-sm",
  lg: "px-6 py-3 text-base",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;
export type ButtonSize = keyof typeof BUTTON_SIZES;

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={cx(buttonBase, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    />
  );
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <Link
      className={cx(buttonBase, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------------- */

const TONES = {
  neutral: "bg-sand-200 text-sand-700 ring-sand-400/50",
  navy: "bg-navy-100 text-navy-800 ring-navy-300/50",
  gold: "bg-gold-100 text-gold-700 ring-gold-400/50",
  positive: "bg-positive-100 text-positive-600 ring-positive-600/25",
  caution: "bg-caution-100 text-caution-700 ring-caution-700/25",
  critical: "bg-critical-100 text-critical-700 ring-critical-700/25",
  info: "bg-info-100 text-info-700 ring-info-700/25",
} as const;

export type Tone = keyof typeof TONES;

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        "rounded-lg border border-sand-300 bg-white shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="max-w-2xl">
        {eyebrow ? (
          <p className="text-xs font-semibold tracking-[0.18em] text-gold-600 uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-2 text-2xl text-navy-900 sm:text-3xl">{title}</h2>
        {description ? (
          <p className="mt-2 text-[15px] leading-relaxed text-sand-700">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-sand-400 bg-sand-50 px-6 py-14 text-center">
      {icon ? <div className="mb-4 text-sand-400">{icon}</div> : null}
      <p className="font-display text-lg text-navy-900">{title}</p>
      {description ? (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-sand-600">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Extract<Tone, "info" | "critical" | "positive" | "caution">;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const border = {
    info: "border-info-700/25 bg-info-100 text-info-700",
    critical: "border-critical-700/30 bg-critical-100 text-critical-700",
    positive: "border-positive-600/25 bg-positive-100 text-positive-600",
    caution: "border-caution-700/25 bg-caution-100 text-caution-700",
  }[tone];

  return (
    <div
      className={cx("rounded-md border px-4 py-3 text-sm leading-relaxed", border, className)}
      role={tone === "critical" ? "alert" : "status"}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? "mt-1" : undefined}>{children}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "navy",
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: Tone;
}) {
  const accent = {
    navy: "text-navy-900",
    gold: "text-gold-700",
    positive: "text-positive-600",
    critical: "text-critical-700",
    info: "text-info-700",
  }[tone as "navy" | "gold" | "positive" | "critical" | "info"];

  return (
    <Card className="px-5 py-4">
      <p className="text-xs font-medium tracking-wide text-sand-600 uppercase">{label}</p>
      <p className={cx("mt-1.5 font-display text-3xl", accent)}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-sand-600">{hint}</p> : null}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-navy-900">
        {label}
        {required ? (
          <span className="ml-1 text-critical-700" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="ml-1 text-xs font-normal text-sand-600">(optional)</span>
        )}
      </label>
      {hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-sand-600">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs font-medium text-critical-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/*
 * Form controls have two complete palettes rather than one base plus overrides.
 *
 * Overriding `bg-white` with `bg-navy-900` from a `className` looks harmless but
 * leaves both utilities in the stylesheet, and which one wins is decided by
 * Tailwind's internal ordering, not by the order written here. That produced an
 * input painted in the page colour on the sign-in screen — an invisible field.
 * Selecting a palette keeps exactly one `bg-*` and one `text-*` class per
 * control, so the result can never depend on stylesheet order.
 *
 * On a dark surface the field must also be *darker* than the page and have a
 * *lighter* border, or it has no visible edge at all.
 */
const CONTROL_BASE =
  "w-full rounded-md border px-3 py-2.5 text-[15px] focus:outline-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-1";

const CONTROL_LIGHT = cx(
  CONTROL_BASE,
  "border-sand-400 bg-white text-navy-900 placeholder:text-sand-400",
  "focus:border-navy-600 focus-visible:outline-gold-600",
  "aria-[invalid=true]:border-critical-700",
);

/** For a control rendered on `bg-navy-900`. Pair with a light-ink label. */
export const CONTROL_DARK = cx(
  CONTROL_BASE,
  "border-navy-500 bg-navy-950 text-white placeholder:text-navy-300",
  "focus:border-gold-500 focus-visible:outline-gold-400",
  "aria-[invalid=true]:border-critical-100",
);

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(CONTROL_LIGHT, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(CONTROL_LIGHT, "min-h-28 resize-y", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(CONTROL_LIGHT, "appearance-none pr-9", className)} {...props} />;
}

export function Labeled({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Field
      label={label}
      htmlFor={htmlFor}
      error={error}
      hint={hint}
      required={required}
      className={className}
    >
      {children}
    </Field>
  );
}

/** Small definition-list row used across the CRM detail pages. */
export function DetailRow({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-wrap items-baseline justify-between gap-2 py-2", className)}>
      <dt className="text-xs font-medium tracking-wide text-sand-600 uppercase">{label}</dt>
      <dd className="text-sm text-navy-900">{children}</dd>
    </div>
  );
}