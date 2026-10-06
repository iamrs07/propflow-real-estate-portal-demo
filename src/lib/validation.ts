/**
 * Server-side input validation.
 *
 * Every value that reaches the database passes through here first. These are
 * deliberately conservative: length caps mirror the CHECK constraints in
 * supabase/migrations/0001_schema.sql so the database never rejects a request
 * the UI believed was valid.
 */

import {
  LISTING_FACET_ALIASES,
  LISTING_FACET_TYPES,
  type ListingFacet,
} from "@/lib/domain";

export interface FormState {
  ok: boolean;
  /** Message safe to render to the visitor. Never contains SQL or internals. */
  formError?: string;
  /** Field name → safe message. */
  fieldErrors?: Record<string, string>;
  /** Values to repopulate the form after a failure. */
  values?: Record<string, string>;
  /** Set once on success so the UI can swap to a confirmation state. */
  success?: boolean;
  /** A success-path detail worth showing (e.g. a generated reset link). */
  notice?: string;
}

export const FORM_LIMITS = {
  fullName: 120,
  phone: 24,
  email: 254,
  message: 4000,
  title: 160,
  headline: 240,
  description: 8000,
  referenceCode: 40,
  locality: 120,
  city: 80,
  privateAddress: 400,
  internalNotes: 4000,
  ownerName: 120,
  noteBody: 4000,
  mapLink: 500,
  altText: 200,
} as const;

const PHONE_ALLOWED = /^[0-9+()\-\s.]{6,24}$/;
const EMAIL_ALLOWED = /^[^\s@,;:<>()[\]\\]+@[^\s@,;:<>()[\]\\.]+\.[^\s@,;:<>()[\]\\]{2,}$/;
const REFERENCE_ALLOWED = /^[A-Za-z0-9][A-Za-z0-9\-/]{1,39}$/;

/**
 * Parse the public `listingType` query parameter into a Rent/Buy facet.
 *
 * This is the only place an attacker-influenced string becomes a listing filter,
 * and it deliberately returns values from a fixed allow-list rather than passing
 * anything through. Legacy `sale` and `resale` values map onto the Buy facet (see
 * LISTING_FACET_ALIASES), so an old bookmark still shows purchase listings instead
 * of silently returning nothing. Anything unrecognised — including the bare facet
 * names we do not publish, empty strings and junk — becomes "no filter".
 */
export function listingFacetFromQuery(
  value: string | string[] | null | undefined,
): ListingFacet | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;

  const key = raw.trim().toLowerCase().slice(0, 20);
  return Object.hasOwn(LISTING_FACET_ALIASES, key) ? LISTING_FACET_ALIASES[key] ?? null : null;
}

/**
 * Stored listing types a facet matches, as a mutable array suitable for a query
 * parameter. Always derived from LISTING_FACET_TYPES so the enum values sent to
 * Postgres can only ever be valid members of the listing_type enum.
 */
export function listingTypesForFacet(facet: ListingFacet | null | undefined): string[] {
  return facet ? [...LISTING_FACET_TYPES[facet]] : [];
}

/** Collapse runs of whitespace and hard-limit length. Never returns HTML. */
export function clean(value: FormDataEntryValue | null | undefined): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
}

/** Same as clean() but keeps internal newlines for long-form text. */
export function cleanMultiline(value: FormDataEntryValue | null | undefined): string {
  return clean(value).slice(0, FORM_LIMITS.message);
}

export class FieldError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = "FieldError";
    this.field = field;
  }
}

export function fail(field: string, message: string): never {
  throw new FieldError(field, message);
}

export function text(
  value: FormDataEntryValue | null | undefined,
  field: string,
  { min = 1, max = 255, label = field }: { min?: number; max?: number; label?: string } = {},
): string {
  const out = clean(value);
  if (out.length < min) fail(field, `${label} is required.`);
  if (out.length > max) fail(field, `${label} must be ${max} characters or fewer.`);
  return out;
}

export function optionalText(
  value: FormDataEntryValue | null | undefined,
  field: string,
  { max = 255, label = field }: { max?: number; label?: string } = {},
): string | null {
  const out = clean(value);
  if (out === "") return null;
  if (out.length > max) fail(field, `${label} must be ${max} characters or fewer.`);
  return out;
}

export function phone(
  value: FormDataEntryValue | null | undefined,
  field = "phone",
): string {
  const out = clean(value);
  if (!PHONE_ALLOWED.test(out)) {
    fail(field, "Enter a phone number with 6 to 24 digits, spaces or + only.");
  }
  const digits = out.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 15) {
    fail(field, "Enter a phone number with 6 to 15 digits.");
  }
  return out;
}

export function email(
  value: FormDataEntryValue | null | undefined,
  field = "email",
  { required = false }: { required?: boolean } = {},
): string | null {
  const out = clean(value).toLowerCase();
  if (out === "") {
    if (required) fail(field, "Email address is required.");
    return null;
  }
  if (out.length > FORM_LIMITS.email) {
    fail(field, "Email address is too long.");
  }
  if (!EMAIL_ALLOWED.test(out)) fail(field, "Enter a valid email address.");
  return out;
}

export function oneOf<T extends string>(
  value: FormDataEntryValue | null | undefined,
  allowed: readonly T[],
  field: string,
  { required = true }: { required?: boolean } = {},
): T | null {
  const out = clean(value);
  if (out === "") {
    if (required) fail(field, "This choice is required.");
    return null;
  }
  if (!allowed.includes(out as T)) fail(field, "Choose one of the available options.");
  return out as T;
}

/**
 * `oneOf` with the required branch locked on, so the return type is `T` rather
 * than `T | null`. `fail()` throws, so the empty-value path never returns.
 */
export function oneOfRequired<T extends string>(
  value: FormDataEntryValue | null | undefined,
  allowed: readonly T[],
  field: string,
): T {
  return oneOf(value, allowed, field, { required: true }) as T;
}

export function boolean(
  value: FormDataEntryValue | null | undefined,
): boolean {
  return clean(value) === "true" || clean(value) === "on" || clean(value) === "1";
}

export function integer(
  value: FormDataEntryValue | null | undefined,
  field: string,
  { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, required = true } = {},
): number | null {
  const out = clean(value);
  if (out === "") {
    if (required) fail(field, "This field is required.");
    return null;
  }
  if (!/^-?\d+$/.test(out)) fail(field, "Enter a whole number.");
  const parsed = Number.parseInt(out, 10);
  if (parsed < min || parsed > max) {
    fail(field, `Enter a number between ${min} and ${max}.`);
  }
  return parsed;
}

export function decimal(
  value: FormDataEntryValue | null | undefined,
  field: string,
  { min = 0, max = 1_000_000_000, required = true } = {},
): number | null {
  const out = clean(value).replace(/,/g, "");
  if (out === "") {
    if (required) fail(field, "This field is required.");
    return null;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(out)) fail(field, "Enter an amount with up to two decimals.");
  const parsed = Number(out);
  if (parsed < min || parsed > max) fail(field, "That amount is out of range.");
  return parsed;
}

export function referenceCode(value: FormDataEntryValue | null | undefined): string {
  const out = text(value, "reference_code", {
    min: 2,
    max: FORM_LIMITS.referenceCode,
    label: "Reference code",
  }).toUpperCase();
  if (!REFERENCE_ALLOWED.test(out)) {
    fail("reference_code", "Use letters, digits and hyphens only (max 40 characters).");
  }
  return out;
}

/**
 * A datetime-local input value ("2026-03-12T14:30") converted to an ISO
 * instant. Rejects anything that is not a real date.
 */
export function isoDateTime(
  value: FormDataEntryValue | null | undefined,
  field: string,
  { required = true }: { required?: boolean } = {},
): string | null {
  const out = clean(value);
  if (out === "") {
    if (required) fail(field, "Choose a date and time.");
    return null;
  }
  const parsed = new Date(out);
  if (Number.isNaN(parsed.getTime())) fail(field, "Choose a valid date and time.");
  return parsed.toISOString();
}

/** Only allow http(s) links — blocks javascript:, data: and other schemes. */
export function url(
  value: FormDataEntryValue | null | undefined,
  field: string,
  { required = false, label = "Link" }: { required?: boolean; label?: string } = {},
): string | null {
  const out = clean(value);
  if (out === "") {
    if (required) fail(field, `${label} is required.`);
    return null;
  }
  if (out.length > 500) fail(field, `${label} is too long.`);
  let parsed: URL;
  try {
    parsed = new URL(out);
  } catch {
    fail(field, `${label} must be a full URL starting with https://`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    fail(field, `${label} must be an http or https address.`);
  }
  return parsed.toString();
}

export function stringList(
  value: FormDataEntryValue | null | undefined,
  { max = 20, maxLength = 60 }: { max?: number; maxLength?: number } = {},
): string[] {
  const out = clean(value);
  if (out === "") return [];
  return out
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry.length <= maxLength)
    .slice(0, max);
}

export function booleanList(
  value: FormDataEntryValue | null | undefined,
  allowed: readonly string[],
): string[] {
  if (!value || typeof value !== "string") return [];
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry): entry is string => allowed.includes(entry));
}

/** An ISO instant or null, tolerant of empty input. */
export function optionalIso(
  value: FormDataEntryValue | null | undefined,
  field: string,
): string | null {
  return isoDateTime(value, field, { required: false });
}

/**
 * Converts a thrown FieldError into the shared FormState shape. Any other error
 * is treated as an unexpected internal failure and reported generically, so a
 * database message can never reach a visitor.
 */
export function toFailure(error: unknown, values: Record<string, string> = {}): FormState {
  if (error instanceof FieldError) {
    return {
      ok: false,
      fieldErrors: { [error.field]: error.message },
      formError: "Please check the highlighted field and try again.",
      values,
    };
  }
  return {
    ok: false,
    formError: "Something went wrong on our side. Please try again.",
    values,
  };
}

export const formValues = (formData: FormData): Record<string, string> => {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") values[key] = value.slice(0, 4000);
  }
  return values;
};