"use client";

import { useActionState, useId } from "react";
import type { FormState } from "@/lib/validation";
import {
  AMENITY_CHOICES,
  AREA_UNITS,
  AREA_UNIT_LABELS,
  FURNISHING,
  FURNISHING_LABELS,
  LISTING_TYPES,
  LISTING_TYPE_LABELS,
  PROPERTY_STATUSES,
  PROPERTY_STATUS_LABELS,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  type ListingType,
} from "@/lib/domain";
import type { StaffProperty } from "@/lib/data/types";
import { Alert, Button, Field, Input, Labeled, Select, Textarea } from "@/components/ui";

const INITIAL: FormState = { ok: false };

export type PropertyAction = (
  state: FormState,
  formData: FormData,
) => Promise<FormState>;

const PUBLIC_FIELDS = [
  "Title",
  "Headline",
  "Description",
  "Price",
  "City",
  "Locality",
  "Map link",
  "Photos",
] as const;

const PRIVATE_FIELDS = [
  "Reference code",
  "Private address",
  "Owner name",
  "Internal notes",
] as const;

/**
 * Create / edit form. Fields are grouped into what the public sees and what
 * stays internal, so an administrator publishing a listing is explicit about
 * which side of the line each value sits on.
 */
export function PropertyForm({
  action,
  property,
}: {
  action: PropertyAction;
  property?: StaffProperty;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, INITIAL);
  const id = useId();
  const errors = state.fieldErrors ?? {};
  const isEdit = Boolean(property);

  return (
    <form action={formAction} className="space-y-8" noValidate>
      {property ? <input type="hidden" name="property_id" value={property.id} /> : null}

      {state.formError ? <Alert tone="critical">{state.formError}</Alert> : null}

      {state.success ? <Alert tone="positive">Saved.</Alert> : null}

      <fieldset className="space-y-5">
        <legend className="font-display text-xl text-navy-900">
          {isEdit ? "Listing details" : "Create a listing"}
        </legend>

        <div className="grid gap-5 sm:grid-cols-2">
          <Labeled
            label="Reference code"
            htmlFor={`${id}-ref`}
            required
            error={errors.reference_code}
            hint="Shown on internal paperwork. Must be unique to the brokerage."
          >
            <Input
              id={`${id}-ref`}
              name="reference_code"
              defaultValue={property?.reference_code ?? ""}
              maxLength={40}
              required
              placeholder="NSR-R-1008"
              aria-invalid={Boolean(errors.reference_code)}
            />
          </Labeled>

          <Labeled label="Status" htmlFor={`${id}-status`} required error={errors.status}>
            <Select id={`${id}-status`} name="status" defaultValue={property?.status ?? "draft"}>
              {PROPERTY_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {PROPERTY_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          </Labeled>
        </div>

        <Labeled label="Title" htmlFor={`${id}-title`} required error={errors.title}>
          <Input
            id={`${id}-title`}
            name="title"
            defaultValue={property?.title ?? ""}
            maxLength={160}
            required
            placeholder="Two-bedroom apartment in Koregaon Park"
            aria-invalid={Boolean(errors.title)}
          />
        </Labeled>

        <Labeled label="Headline" htmlFor={`${id}-headline`} error={errors.headline}>
          <Input
            id={`${id}-headline`}
            name="headline"
            defaultValue={property?.headline ?? ""}
            maxLength={240}
            placeholder="One line that appears under the title on the site."
          />
        </Labeled>

        <Labeled
          label="Description"
          htmlFor={`${id}-description`}
          error={errors.description}
          hint="Leave a blank line between paragraphs."
        >
          <Textarea
            id={`${id}-description`}
            name="description"
            rows={7}
            defaultValue={property?.description ?? ""}
            maxLength={8000}
          />
        </Labeled>

        <div className="grid gap-5 sm:grid-cols-3">
          <Labeled label="Listing type" htmlFor={`${id}-listing`} required error={errors.listing_type}>
            <Select
              id={`${id}-listing`}
              name="listing_type"
              defaultValue={property?.listing_type ?? "rent"}
            >
              {LISTING_TYPES.map((value: ListingType) => (
                <option key={value} value={value}>
                  {LISTING_TYPE_LABELS[value]}
                </option>
              ))}
            </Select>
          </Labeled>

          <Labeled label="Property type" htmlFor={`${id}-type`} required error={errors.property_type}>
            <Select
              id={`${id}-type`}
              name="property_type"
              defaultValue={property?.property_type ?? "apartment"}
            >
              {PROPERTY_TYPES.map((value) => (
                <option key={value} value={value}>
                  {PROPERTY_TYPE_LABELS[value]}
                </option>
              ))}
            </Select>
          </Labeled>

          <Labeled label="Rent period" htmlFor={`${id}-period`} error={errors.price_period}>
            <Select
              id={`${id}-period`}
              name="price_period"
              defaultValue={property?.price_period ?? "month"}
            >
              <option value="month">Per month</option>
              <option value="year">Per year</option>
              <option value="one_time">One-time price</option>
            </Select>
          </Labeled>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <Labeled label="Price" htmlFor={`${id}-price`} required error={errors.price}>
            <Input
              id={`${id}-price`}
              name="price"
              type="number"
              min={0}
              step={500}
              defaultValue={property?.price ?? ""}
              required
              aria-invalid={Boolean(errors.price)}
            />
          </Labeled>

          <Labeled label="City" htmlFor={`${id}-city`} required error={errors.city}>
            <Input
              id={`${id}-city`}
              name="city"
              defaultValue={property?.city ?? ""}
              maxLength={80}
              required
            />
          </Labeled>

          <Labeled label="Locality" htmlFor={`${id}-locality`} required error={errors.locality}>
            <Input
              id={`${id}-locality`}
              name="locality"
              defaultValue={property?.locality ?? ""}
              maxLength={120}
              required
            />
          </Labeled>
        </div>

        <Labeled
          label="Map link"
          htmlFor={`${id}-map`}
          error={errors.map_link}
          hint="An agency-provided area link. Must start with http or https."
        >
          <Input
            id={`${id}-map`}
            name="map_link"
            type="url"
            defaultValue={property?.map_link ?? ""}
            maxLength={500}
            placeholder="https://www.openstreetmap.org/search?query=..."
          />
        </Labeled>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="font-display text-xl text-navy-900">Physical details</legend>

        <div className="grid gap-5 sm:grid-cols-3">
          <Labeled label="Bedrooms" htmlFor={`${id}-beds`} error={errors.bedrooms}>
            <Input
              id={`${id}-beds`}
              name="bedrooms"
              type="number"
              min={0}
              max={30}
              defaultValue={property?.bedrooms ?? ""}
            />
          </Labeled>

          <Labeled label="Bathrooms" htmlFor={`${id}-baths`} error={errors.bathrooms}>
            <Input
              id={`${id}-baths`}
              name="bathrooms"
              type="number"
              min={0}
              max={30}
              defaultValue={property?.bathrooms ?? ""}
            />
          </Labeled>

          <Labeled label="Year built" htmlFor={`${id}-year`} error={errors.year_built}>
            <Input
              id={`${id}-year`}
              name="year_built"
              type="number"
              min={1900}
              max={2100}
              defaultValue={property?.year_built ?? ""}
            />
          </Labeled>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <Labeled label="Area" htmlFor={`${id}-area`} error={errors.area_value}>
            <Input
              id={`${id}-area`}
              name="area_value"
              type="number"
              min={0}
              step={1}
              defaultValue={property?.area_value ?? ""}
            />
          </Labeled>

          <Labeled label="Area unit" htmlFor={`${id}-unit`} error={errors.area_unit}>
            <Select id={`${id}-unit`} name="area_unit" defaultValue={property?.area_unit ?? "sqft"}>
              {AREA_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {AREA_UNIT_LABELS[unit]}
                </option>
              ))}
            </Select>
          </Labeled>

          <Labeled label="Furnishing" htmlFor={`${id}-furn`} error={errors.furnishing}>
            <Select
              id={`${id}-furn`}
              name="furnishing"
              defaultValue={property?.furnishing ?? "unfurnished"}
            >
              {FURNISHING.map((value) => (
                <option key={value} value={value}>
                  {FURNISHING_LABELS[value]}
                </option>
              ))}
            </Select>
          </Labeled>
        </div>

        <Field
          label="Amenities"
          htmlFor={`${id}-amenities`}
          error={errors.amenities}
          hint="Separate with commas. Only these values are offered in the picker."
        >
          <Input
            id={`${id}-amenities`}
            name="amenities"
            defaultValue={property?.amenities.join(", ") ?? ""}
            placeholder={AMENITY_CHOICES.slice(0, 4).join(", ")}
          />
        </Field>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2.5 text-sm text-navy-900">
            <input
              type="checkbox"
              name="is_available"
              value="true"
              defaultChecked={property?.is_available ?? true}
              className="h-4 w-4 rounded border-sand-400 accent-navy-900"
            />
            Currently available
          </label>
          <label className="flex items-center gap-2.5 text-sm text-navy-900">
            <input
              type="checkbox"
              name="negotiable"
              value="true"
              defaultChecked={property?.negotiable ?? false}
              className="h-4 w-4 rounded border-sand-400 accent-navy-900"
            />
            Price is negotiable
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-5 rounded-lg border border-caution-700/30 bg-caution-100/40 p-5">
        <legend className="font-display text-lg text-navy-900">
          Internal only — never shown on the public site
        </legend>
        <p className="text-sm text-sand-700">
          These values stay in the CRM. The public listing query has no column for them.
        </p>

        <Labeled label="Private address" htmlFor={`${id}-address`} error={errors.private_address}>
          <Input
            id={`${id}-address`}
            name="private_address"
            defaultValue={property?.private_address ?? ""}
            maxLength={400}
          />
        </Labeled>

        <Labeled label="Owner or seller" htmlFor={`${id}-owner`} error={errors.owner_name}>
          <Input
            id={`${id}-owner`}
            name="owner_name"
            defaultValue={property?.owner_name ?? ""}
            maxLength={120}
          />
        </Labeled>

        <Labeled label="Internal notes" htmlFor={`${id}-notes`} error={errors.internal_notes}>
          <Textarea
            id={`${id}-notes`}
            name="internal_notes"
            rows={4}
            defaultValue={property?.internal_notes ?? ""}
            maxLength={4000}
            placeholder="Owner is flexible on notice. Do not discount below X."
          />
        </Labeled>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-sand-300 pt-5">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : isEdit ? "Save listing" : "Create listing"}
        </Button>
        <p className="text-xs text-sand-600">
          {isEdit
            ? "Public fields: "
            : "When published, visible fields: "}
          {PUBLIC_FIELDS.join(", ")}. Internal: {PRIVATE_FIELDS.join(", ")}.
        </p>
      </div>
    </form>
  );
}