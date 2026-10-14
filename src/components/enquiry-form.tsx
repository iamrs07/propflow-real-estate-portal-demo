"use client";

import { useActionState, useId } from "react";
import { submitEnquiry } from "@/server/actions/public";
import { CONTACT_PREFERENCES, CONTACT_PREFERENCE_LABELS, type ContactPreference } from "@/lib/domain";
import type { FormState } from "@/lib/validation";
import { Alert, Button, Field, Input, Labeled, Select, Textarea, cx } from "@/components/ui";

const INITIAL: FormState = { ok: false };

/**
 * Public enquiry and visit-request form.
 *
 * All text arrives here as a plain string and is rendered by React as text —
 * there is no dangerouslySetInnerHTML anywhere in this project, so submitted
 * content can never execute as markup.
 */
export function EnquiryForm({
  propertyReference,
  propertyTitle,
  variant = "property",
}: {
  propertyReference?: string;
  propertyTitle?: string;
  variant?: "property" | "contact";
}) {
  const [state, formAction, pending] = useActionState(submitEnquiry, INITIAL);
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;

  if (state.success) {
    if (state.notice === "demo") {
      return (
        <div className="rounded-lg border border-caution-700/30 bg-caution-100 px-5 py-6">
          <p className="font-display text-xl text-caution-700">Demo only</p>
          <p className="mt-2 text-sm leading-relaxed text-navy-800">
            This enquiry was not sent to the agency, and no one will contact you. Please do not
            enter real contact details — this is a demonstration installation.
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-lg border border-positive-600/30 bg-positive-100 px-5 py-6">
        <p className="font-display text-xl text-positive-600">Enquiry received</p>
        <p className="mt-2 text-sm leading-relaxed text-navy-800">
          Thank you. Your enquiry has been recorded and a member of the team will contact you
          using the method you chose.
        </p>
        {variant === "property" ? (
          <p className="mt-3 text-sm text-navy-700">
            In a live installation, an agent would now call or message you to arrange the visit.
          </p>
        ) : null}
      </div>
    );
  }

  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {/* Rendered once when the page is generated; bounds replayed submissions. */}
      <input type="hidden" name="signed_at" value={new Date().toISOString()} />
      {propertyReference ? (
        <input type="hidden" name="property_reference" value={propertyReference} />
      ) : null}

      {/*
        Honeypot. Hidden from people and from assistive technology, skipped by
        tab order, and ignored by password managers. A filled field means a bot:
        the action answers "success" without writing anything.
      */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor={id("company")}>Company website</label>
        <input
          id={id("company")}
          name="company_website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>

      {propertyTitle ? (
        <div className="rounded-md border border-sand-300 bg-sand-50 px-4 py-3">
          <p className="text-xs font-medium tracking-wide text-sand-600 uppercase">
            Enquiring about
          </p>
          <p className="mt-0.5 text-sm font-medium text-navy-900">{propertyTitle}</p>
        </div>
      ) : null}

      {state.formError ? <Alert tone="critical">{state.formError}</Alert> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Labeled label="Your name" htmlFor={id("name")} required error={errors.full_name}>
          <Input
            id={id("name")}
            name="full_name"
            autoComplete="name"
            maxLength={120}
            required
            defaultValue={state.values?.full_name ?? ""}
            aria-invalid={Boolean(errors.full_name)}
          />
        </Labeled>

        <Labeled label="Phone number" htmlFor={id("phone")} required error={errors.phone}>
          <Input
            id={id("phone")}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={24}
            required
            defaultValue={state.values?.phone ?? ""}
            aria-invalid={Boolean(errors.phone)}
          />
        </Labeled>
      </div>

      <Labeled
        label="Email address"
        htmlFor={id("email")}
        hint="Only if you would prefer we write to you."
        error={errors.email}
      >
        <Input
          id={id("email")}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={254}
          defaultValue={state.values?.email ?? ""}
          aria-invalid={Boolean(errors.email)}
        />
      </Labeled>

      <Labeled label="Your message" htmlFor={id("message")} error={errors.message}>
        <Textarea
          id={id("message")}
          name="message"
          rows={4}
          maxLength={4000}
          placeholder="What would you like to know about this home?"
          defaultValue={state.values?.message ?? ""}
          aria-invalid={Boolean(errors.message)}
        />
      </Labeled>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="How should we contact you?"
          htmlFor={id("contact")}
          required
          error={errors.preferred_contact}
        >
          <Select
            id={id("contact")}
            name="preferred_contact"
            defaultValue={(state.values?.preferred_contact ?? "phone") as ContactPreference}
          >
            {CONTACT_PREFERENCES.map((option) => (
              <option key={option} value={option}>
                {CONTACT_PREFERENCE_LABELS[option]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Preferred visit time"
          htmlFor={id("visit")}
          hint="We will confirm the exact slot with you."
          error={errors.preferred_visit_at}
        >
          <Input
            id={id("visit")}
            name="preferred_visit_at"
            type="datetime-local"
            defaultValue={state.values?.preferred_visit_at ?? ""}
            aria-invalid={Boolean(errors.preferred_visit_at)}
          />
        </Field>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={id("consent")} className="flex cursor-pointer items-start gap-3 text-sm text-navy-900">
          <input
            id={id("consent")}
            name="consent"
            type="checkbox"
            value="yes"
            required
            defaultChecked={state.values?.consent === "yes"}
            aria-invalid={Boolean(errors.consent)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-sand-400 accent-navy-900"
          />
          <span className="leading-relaxed">
            I am happy for {""}
            <span className="font-medium">the agency</span> to contact me about this enquiry. We
            record the date and time of this consent.
          </span>
        </label>
        {errors.consent ? (
          <p className="text-xs font-medium text-critical-700">{errors.consent}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Sending…" : "Send enquiry"}
        </Button>
        <p className={cx("text-xs text-sand-600", pending ? "opacity-70" : undefined)}>
          We never sell or share your details.
        </p>
      </div>
    </form>
  );
}