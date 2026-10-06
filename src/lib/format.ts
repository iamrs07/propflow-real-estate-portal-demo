import { AREA_UNIT_LABELS, type AreaUnit } from "@/lib/domain";

/**
 * Display formatting. Dates are always rendered in Asia/Kolkata so a server
 * render and any later client render produce byte-identical strings.
 */
const TIME_ZONE = "Asia/Kolkata";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: TIME_ZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: TIME_ZONE,
});

const timeFormatter = new Intl.DateTimeFormat("en-IN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: TIME_ZONE,
});

const weekdayFormatter = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  timeZone: TIME_ZONE,
});

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? dateFormatter.format(date) : "—";
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? dateTimeFormatter.format(date) : "—";
}

export function formatTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? timeFormatter.format(date) : "—";
}

export function formatWeekday(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? weekdayFormatter.format(date) : "—";
}

/** "Today · 4:30 pm" / "Tomorrow · 11:00 am" / "12 Mar 2026 · 11:00 am" */
export function formatVisitSlot(
  start: string | Date | null | undefined,
  end?: string | Date | null,
): string {
  const from = toDate(start);
  if (!from) return "—";
  const base = `${formatWeekday(from)} · ${formatTime(from)}`;
  const to = toDate(end);
  if (!to) return base;
  return `${base} – ${formatTime(to)}`;
}

export function formatRelative(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  const deltaMs = Date.now() - date.getTime();
  const minutes = Math.round(deltaMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days <= 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(date);
}

export function formatPrice(
  value: number | string | null | undefined,
  currency = "INR",
): string {
  const amount = typeof value === "string" ? Number(value) : value;
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "Price on request";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString("en-IN")}`;
  }
}

export function formatArea(
  value: number | null | undefined,
  unit: AreaUnit | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  const rounded = Math.round(value).toLocaleString("en-IN");
  return `${rounded} ${unit ? AREA_UNIT_LABELS[unit] : "sq ft"}`;
}

/** Per-period suffix, e.g. "₹45,000 / month". */
export function pricePeriodSuffix(period: "month" | "year" | "one_time"): string {
  if (period === "month") return "/ month";
  if (period === "year") return "/ year";
  return "";
}
/**
 * Digits only, for tel: and wa.me links built from agency-supplied numbers.
 */
export function phoneDigits(value: string | null | undefined): string {
  if (!value) return "";

  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return hasPlus ? `+${digits}` : digits;
}

/**
 * Options shared by the two contact-link builders.
 *
 * `inert` is how demo mode stays genuinely non-actionable. The demo fixtures use
 * placeholder numbers, but a placeholder in a `tel:` href is still a dialable
 * link: the handler is the visitor's real phone app and the dialled string is
 * whatever the markup says. So in demo mode these return null and the number
 * renders as plain text. In a configured deployment they behave as before.
 */
export interface ContactLinkOptions {
  inert?: boolean;
}

export function telHref(
  value: string | null | undefined,
  { inert = false }: ContactLinkOptions = {},
): string | null {
  if (inert) return null;
  const digits = phoneDigits(value).replace(/\+/g, "");
  return digits.length >= 6 ? `tel:${digits}` : null;
}

export function whatsappHref(
  value: string | null | undefined,
  { inert = false }: ContactLinkOptions = {},
): string | null {
  if (inert) return null;
  const digits = phoneDigits(value).replace(/\D/g, "");
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
}

/** "2 hrs 30 min" from a start/end pair, for visit duration summaries. */
export function formatDuration(start: string, end: string): string {
  const from = toDate(start);
  const to = toDate(end);
  if (!from || !to) return "—";
  const minutes = Math.round((to.getTime() - from.getTime()) / 60000);
  if (minutes <= 0) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} hr`;
  return `${hours} hr ${rest} min`;
}

/** Everything except the last item reads "a, b and c". */
export function listSentence(items: string[]): string {
  const clean = items.filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0] ?? "";
  return `${clean.slice(0, -1).join(", ")} and ${clean[clean.length - 1]}`;
}

export function pluralise(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}