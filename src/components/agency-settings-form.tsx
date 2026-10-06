"use client";

import { useActionState, useId } from "react";
import type { FormState } from "@/lib/validation";
import type { AgencySettings } from "@/lib/data/crm";
import { updateAgencySettings } from "@/server/actions/settings";
import { Alert, Button, Input, Labeled, Textarea } from "@/components/ui";

const INITIAL: FormState = { ok: false };

/**
 * Agency settings. Everything here feeds the public site: the header, the
 * footer, the about page and the privacy notice all read these values.
 */
export function AgencySettingsForm({ settings }: { settings: AgencySettings }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    updateAgencySettings,
    INITIAL,
  );
  const id = useId();
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-8" noValidate>
      {state.formError ? <Alert tone="critical">{state.formError}</Alert> : null}
      {state.success ? (
        <Alert tone="positive">Saved. The public site reflects these values immediately.</Alert>
      ) : null}

      <fieldset className="space-y-5">
        <legend className="font-display text-xl text-navy-900">Identity</legend>

        <div className="grid gap-5 sm:grid-cols-2">
          <Labeled label="Agency name" htmlFor={`${id}-name`} required error={errors.name}>
            <Input
              id={`${id}-name`}
              name="name"
              defaultValue={settings.name}
              maxLength={120}
              required
              aria-invalid={Boolean(errors.name)}
            />
          </Labeled>

          <Labeled
            label="Tagline"
            htmlFor={`${id}-tagline`}
            error={errors.tagline}
            hint="Appears under the name in the header."
          >
            <Input
              id={`${id}-tagline`}
              name="tagline"
              defaultValue={settings.tagline ?? ""}
              maxLength={200}
            />
          </Labeled>
        </div>

        <Labeled
          label="About the agency"
          htmlFor={`${id}-about`}
          error={errors.about}
          hint="Blank line between paragraphs. Shown on the home and about pages."
        >
          <Textarea
            id={`${id}-about`}
            name="about"
            rows={6}
            defaultValue={settings.about ?? ""}
            maxLength={8000}
          />
        </Labeled>

        <Labeled
          label="Service areas"
          htmlFor={`${id}-areas`}
          required
          error={errors.service_areas}
          hint="Comma separated. Listed on the home page and in the footer."
        >
          <Input
            id={`${id}-areas`}
            name="service_areas"
            defaultValue={settings.service_areas.join(", ")}
            maxLength={600}
            required
            aria-invalid={Boolean(errors.service_areas)}
          />
        </Labeled>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="font-display text-xl text-navy-900">Contact</legend>
        <p className="text-sm text-sand-600">
          Use numbers your agency answers. Phone and WhatsApp become tap-to-call and wa.me links —
          no messaging API, no cost.
        </p>

        <div className="grid gap-5 sm:grid-cols-3">
          <Labeled label="Phone" htmlFor={`${id}-phone`} error={errors.phone}>
            <Input
              id={`${id}-phone`}
              name="phone"
              type="tel"
              defaultValue={settings.phone ?? ""}
              maxLength={24}
            />
          </Labeled>

          <Labeled
            label="WhatsApp"
            htmlFor={`${id}-whatsapp`}
            error={errors.whatsapp}
            hint="Include the country code."
          >
            <Input
              id={`${id}-whatsapp`}
              name="whatsapp"
              type="tel"
              defaultValue={settings.whatsapp ?? ""}
              maxLength={24}
            />
          </Labeled>

          <Labeled label="Email" htmlFor={`${id}-email`} error={errors.email}>
            <Input
              id={`${id}-email`}
              name="email"
              type="email"
              defaultValue={settings.email ?? ""}
              maxLength={254}
            />
          </Labeled>
        </div>

        <Labeled label="Office address" htmlFor={`${id}-office`} error={errors.office_address}>
          <Input
            id={`${id}-office`}
            name="office_address"
            defaultValue={settings.office_address ?? ""}
            maxLength={400}
          />
        </Labeled>

        <Labeled
          label="Area map link"
          htmlFor={`${id}-map`}
          error={errors.map_link}
          hint="An office or area link you control. Must start with http or https."
        >
          <Input
            id={`${id}-map`}
            name="map_link"
            type="url"
            defaultValue={settings.map_link ?? ""}
            maxLength={500}
          />
        </Labeled>
      </fieldset>

      <fieldset className="space-y-5 rounded-lg border border-info-700/25 bg-info-100/40 p-5">
        <legend className="font-display text-lg text-navy-900">Privacy notice</legend>
        <p className="text-sm text-sand-700">
          The privacy page is built from these two fields. Write them for a member of the public, not
          for a lawyer — and review them before you publish the site.
        </p>

        <Labeled
          label="Contact address for corrections and deletion"
          htmlFor={`${id}-privacy-email`}
          error={errors.privacy_contact_email}
          hint="Where someone can ask us to correct or delete what we hold about them."
        >
          <Input
            id={`${id}-privacy-email`}
            name="privacy_contact_email"
            type="email"
            defaultValue={settings.privacy_contact_email ?? ""}
            maxLength={254}
          />
        </Labeled>

        <Labeled label="Notice from the agency" htmlFor={`${id}-privacy-notes`} error={errors.privacy_notes}>
          <Textarea
            id={`${id}-privacy-notes`}
            name="privacy_notes"
            rows={6}
            defaultValue={settings.privacy_notes ?? ""}
            maxLength={8000}
          />
        </Labeled>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-sand-300 pt-5">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
        <p className="text-xs text-sand-600">
          Changes appear on the public site straight away. There is no cache to clear.
        </p>
      </div>
    </form>
  );
}