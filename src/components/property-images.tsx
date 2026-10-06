"use client";

import { useActionState, useId } from "react";
import type { FormState } from "@/lib/validation";
import type { PublicImage } from "@/lib/data/types";
import {
  deletePropertyImage,
  movePropertyImage,
  setPropertyAvailability,
  setPropertyStatus,
  uploadPropertyImage,
} from "@/server/actions/properties";
import { PROPERTY_STATUSES, PROPERTY_STATUS_LABELS, type PropertyStatus } from "@/lib/domain";
import { PropertyThumb } from "@/components/property-photo";
import { Alert, Button, Field, Input, Labeled, Select } from "@/components/ui";

const INITIAL: FormState = { ok: false };

export function PropertyStatusControl({
  propertyId,
  status,
}: {
  propertyId: string;
  status: PropertyStatus;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    setPropertyStatus,
    INITIAL,
  );
  const id = useId();

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="property_id" value={propertyId} />
      <Field label="Visibility" htmlFor={`${id}-status`} required error={state.fieldErrors?.status}>
        <Select id={`${id}-status`} name="status" defaultValue={status}>
          {PROPERTY_STATUSES.map((value) => (
            <option key={value} value={value}>
              {PROPERTY_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Apply"}
        </Button>
        {state.formError ? (
          <span className="text-xs text-critical-700">{state.formError}</span>
        ) : null}
        {state.success ? <span className="text-xs text-positive-600">Saved.</span> : null}
      </div>
      <p className="text-xs leading-relaxed text-sand-600">
        Only <strong>published</strong> and available listings appear on the public site. Archiving
        keeps the record and its enquiries.
      </p>
    </form>
  );
}

export function AvailabilityControl({
  propertyId,
  isAvailable,
}: {
  propertyId: string;
  isAvailable: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    setPropertyAvailability,
    INITIAL,
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="property_id" value={propertyId} />
      <input type="hidden" name="is_available" value={isAvailable ? "false" : "true"} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending
          ? "Saving…"
          : isAvailable
            ? "Mark unavailable"
            : "Mark available again"}
      </Button>
      <p className="text-xs leading-relaxed text-sand-600">
        Keep a listing published but flip it unavailable when the home goes under offer — it
        disappears from the public feed without losing its place in your records.
      </p>
      {state.formError ? (
        <p className="text-xs text-critical-700">{state.formError}</p>
      ) : null}
    </form>
  );
}

export function ImageManager({
  propertyId,
  images,
  demoMode,
}: {
  propertyId: string;
  images: PublicImage[];
  demoMode: boolean;
}) {
  const [uploadState, uploadAction, uploadPending] = useActionState<FormState, FormData>(
    uploadPropertyImage,
    INITIAL,
  );
  const [removeState, removeAction, removePending] = useActionState<FormState, FormData>(
    deletePropertyImage,
    INITIAL,
  );
  const [moveState, moveAction, movePending] = useActionState<FormState, FormData>(
    movePropertyImage,
    INITIAL,
  );
  const id = useId();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg text-navy-900">Photographs</h2>
        <p className="mt-1 text-sm text-sand-600">
          JPEG, PNG, WebP or AVIF up to 8 MB. The first photograph is used on cards and in search
          results.
        </p>
      </div>

      {images.length === 0 ? (
        <p className="rounded-md border border-dashed border-sand-400 bg-sand-50 px-4 py-6 text-center text-sm text-sand-600">
          No photographs yet. A listing without photographs still works, but it reads as unfinished.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {images.map((image, index) => (
            <li key={image.path} className="rounded-lg border border-sand-300 bg-white p-3">
              <div className="flex gap-3">
                <PropertyThumb
                  path={image.path}
                  alt={image.alt}
                  className="h-20 w-24 shrink-0 rounded-md"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-sand-600">
                    {index === 0 ? "Cover photograph" : `Photograph ${index + 1}`}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-navy-900">
                    {image.alt || "No alt text"}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <form action={moveAction}>
                  <input type="hidden" name="property_id" value={propertyId} />
                  <input type="hidden" name="image_id" value={image.path} />
                  <input type="hidden" name="direction" value="up" />
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={movePending || index === 0}
                  >
                    Move up
                  </Button>
                </form>
                <form action={moveAction}>
                  <input type="hidden" name="property_id" value={propertyId} />
                  <input type="hidden" name="image_id" value={image.path} />
                  <input type="hidden" name="direction" value="down" />
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={movePending || index === images.length - 1}
                  >
                    Move down
                  </Button>
                </form>
                <form action={removeAction}>
                  <input type="hidden" name="property_id" value={propertyId} />
                  <input type="hidden" name="image_id" value={image.path} />
                  <Button
                    type="submit"
                    size="sm"
                    variant="danger"
                    disabled={removePending}
                  >
                    Remove
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {moveState.formError ? (
        <p className="text-xs text-critical-700">{moveState.formError}</p>
      ) : null}
      {removeState.formError ? (
        <p className="text-xs text-critical-700">{removeState.formError}</p>
      ) : null}

      <form action={uploadAction} className="space-y-3 rounded-lg border border-sand-300 bg-sand-50 p-4">
        <input type="hidden" name="property_id" value={propertyId} />
        <Labeled label="Choose a photograph" htmlFor={`${id}-file`} required>
          <input
            id={`${id}-file`}
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            required
            className="w-full rounded-md border border-sand-400 bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-sm file:text-white"
          />
        </Labeled>
        <Field
          label="Alt text"
          htmlFor={`${id}-alt`}
          hint="Describe the photograph for someone who cannot see it."
        >
          <Input
            id={`${id}-alt`}
            name="alt_text"
            maxLength={200}
            placeholder="Living room with west-facing windows"
          />
        </Field>
        <Button type="submit" size="sm" disabled={uploadPending}>
          {uploadPending ? "Uploading…" : "Upload photograph"}
        </Button>

        {uploadState.formError ? (
          <Alert tone="critical" className="mt-2">
            {uploadState.formError}
          </Alert>
        ) : null}
        {uploadState.success ? (
          <Alert tone="positive" className="mt-2">
            Photograph added.
            {demoMode
              ? " Demo mode generated a placeholder rather than storing the file."
              : ""}
          </Alert>
        ) : null}
      </form>
    </div>
  );
}