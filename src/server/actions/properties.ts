"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin, requireSessionProfile } from "@/lib/auth";
import {
  AREA_UNITS,
  FURNISHING,
  LISTING_TYPES,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  type AreaUnit,
  type Furnishing,
  type ListingType,
  type PricePeriod,
  type PropertyStatus,
  type PropertyType,
} from "@/lib/domain";
import { isDemoMode } from "@/lib/env";
import { IMAGE_BUCKET } from "@/lib/images";
import { demoState, newDemoId } from "@/lib/data/demo/store";
import { serverClient } from "@/lib/supabase/server";
import {
  type FormState,
  boolean,
  clean,
  decimal,
  fail,
  FORM_LIMITS,
  formValues,
  integer,
  oneOf,
  oneOfRequired,
  optionalText,
  referenceCode,
  stringList,
  text,
  toFailure,
  url,
} from "@/lib/validation";

/**
 * Listing actions.
 *
 * Only an administrator of the owning tenant may write. Tenant id is taken from
 * the session profile, never from the form, and RLS rejects any write that is
 * not scoped to the caller's own tenant.
 */

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

function parsePropertyForm(formData: FormData) {
  const listingType = oneOfRequired<ListingType>(
    formData.get("listing_type"),
    LISTING_TYPES,
    "listing_type",
  );

  const propertyType = oneOfRequired<PropertyType>(
    formData.get("property_type"),
    PROPERTY_TYPES,
    "property_type",
  );

  const status = oneOfRequired<PropertyStatus>(
    formData.get("status"),
    PROPERTY_STATUSES,
    "status",
  );

  const pricePeriod: PricePeriod =
    listingType === "rent"
      ? oneOf<PricePeriod>(formData.get("price_period"), ["month", "year"], "price_period") ?? "month"
      : "one_time";

  return {
    reference_code: referenceCode(formData.get("reference_code")),
    title: text(formData.get("title"), "title", {
      min: 3,
      max: FORM_LIMITS.title,
      label: "Title",
    }),
    headline: optionalText(formData.get("headline"), "headline", {
      max: FORM_LIMITS.headline,
      label: "Headline",
    }),
    description: optionalText(formData.get("description"), "description", {
      max: FORM_LIMITS.description,
      label: "Description",
    }),
    listing_type: listingType,
    property_type: propertyType,
    status,
    is_available: boolean(formData.get("is_available")),
    price: decimal(formData.get("price"), "price", { min: 0, max: 999_999_999 }) ?? 0,
    price_period: pricePeriod,
    negotiable: boolean(formData.get("negotiable")),
    city: text(formData.get("city"), "city", { min: 1, max: FORM_LIMITS.city, label: "City" }),
    locality: text(formData.get("locality"), "locality", {
      min: 1,
      max: FORM_LIMITS.locality,
      label: "Locality",
    }),
    private_address: optionalText(formData.get("private_address"), "private_address", {
      max: FORM_LIMITS.privateAddress,
      label: "Private address",
    }),
    internal_notes: optionalText(formData.get("internal_notes"), "internal_notes", {
      max: FORM_LIMITS.internalNotes,
      label: "Internal notes",
    }),
    owner_name: optionalText(formData.get("owner_name"), "owner_name", {
      max: FORM_LIMITS.ownerName,
      label: "Owner",
    }),
    bedrooms: integer(formData.get("bedrooms"), "bedrooms", {
      min: 0,
      max: 30,
      required: false,
    }),
    bathrooms: integer(formData.get("bathrooms"), "bathrooms", {
      min: 0,
      max: 30,
      required: false,
    }),
    area_value: decimal(formData.get("area_value"), "area_value", {
      min: 0,
      max: 10_000_000,
      required: false,
    }),
    area_unit: oneOf<AreaUnit>(formData.get("area_unit"), AREA_UNITS, "area_unit", {
      required: false,
    }),
    furnishing: oneOf<Furnishing>(formData.get("furnishing"), FURNISHING, "furnishing", {
      required: false,
    }),
    amenities: stringList(formData.get("amenities"), { max: 20, maxLength: 60 }),
    map_link: url(formData.get("map_link"), "map_link", { label: "Map link" }),
    year_built: integer(formData.get("year_built"), "year_built", {
      min: 1900,
      max: 2100,
      required: false,
    }),
  };
}

export async function createProperty(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  try {
    const profile = await requireSessionProfile();
    if (!isAdmin(profile)) {
      return {
        ok: false,
        formError: "Only an administrator can create a listing.",
        values,
      };
    }

    const parsed = parsePropertyForm(formData);
    let propertyId = "";

    if (isDemoMode()) {
      const state = demoState();
      if (
        state.properties.some(
          (entry) =>
            entry.tenant_id === profile.tenantId &&
            entry.reference_code === parsed.reference_code,
        )
      ) {
        return {
          ok: false,
          fieldErrors: {
            reference_code: "That reference code is already used by this brokerage.",
          },
          values,
        };
      }
      propertyId = newDemoId("33333333-3333-4333-8333-33333333");
      const now = new Date().toISOString();
      state.properties.unshift({
        id: propertyId,
        tenant_id: profile.tenantId,
        ...parsed,
        currency: "INR",
        published_at: parsed.status === "published" ? now : null,
        images: [],
        created_at: now,
        updated_at: now,
      });
    } else {
      const supabase = await serverClient();
      const { data, error } = await supabase
        .from("properties")
        .insert({
          tenant_id: profile.tenantId,
          ...parsed,
          currency: "INR",
          published_at: parsed.status === "published" ? new Date().toISOString() : null,
        })
        .select("id")
        .maybeSingle();

      if (error) {
        // The unique index on (tenant_id, reference_code) is the real guard.
        console.error("[propflow] property insert failed", error.code ?? "unknown");
        return {
          ok: false,
          fieldErrors: { reference_code: "That reference code is already in use." },
          values,
        };
      }
      if (!data) {
        return { ok: false, formError: "We could not create that listing.", values };
      }
      propertyId = data.id;
    }

    revalidatePath("/crm/properties");
    revalidatePath("/properties");
    redirect(`/crm/properties/${propertyId}`);
  } catch (error) {
    return toFailure(error, values);
  }
}

export async function updateProperty(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  try {
    const profile = await requireSessionProfile();
    if (!isAdmin(profile)) {
      return { ok: false, formError: "Only an administrator can edit a listing.", values };
    }

    const propertyId = clean(formData.get("property_id")).slice(0, 64);
    if (!propertyId) fail("property_id", "Missing listing reference.");

    const parsed = parsePropertyForm(formData);

    if (isDemoMode()) {
      const state = demoState();
      const property = state.properties.find((entry) => entry.id === propertyId);
      if (!property || property.tenant_id !== profile.tenantId) {
        return { ok: false, formError: "That listing is not available.", values };
      }
      const wasDraft = property.status !== "published";
      Object.assign(property, parsed, {
        updated_at: new Date().toISOString(),
      });
      if (wasDraft && parsed.status === "published") {
        property.published_at = new Date().toISOString();
      }
    } else {
      const supabase = await serverClient();
      const { data, error } = await supabase
        .from("properties")
        .update(parsed)
        .eq("id", propertyId)
        .select("id")
        .maybeSingle();
      if (error) {
        console.error("[propflow] property update failed", error.code ?? "unknown");
        return { ok: false, formError: "We could not save that listing.", values };
      }
      if (!data) return { ok: false, formError: "That listing is not available.", values };
    }

    revalidatePath(`/crm/properties/${propertyId}`);
    revalidatePath("/crm/properties");
    revalidatePath("/properties");
    return { ok: true, success: true, values: {} };
  } catch (error) {
    return toFailure(error, values);
  }
}

/** Publish / unpublish / archive in one control. */
export async function setPropertyStatus(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  try {
    const profile = await requireSessionProfile();
    if (!isAdmin(profile)) {
      return { ok: false, formError: "Only an administrator can change listing status.", values };
    }
    const propertyId = clean(formData.get("property_id")).slice(0, 64);
    const status = oneOfRequired<PropertyStatus>(
      formData.get("status"),
      PROPERTY_STATUSES,
      "status",
    );

    if (isDemoMode()) {
      const state = demoState();
      const property = state.properties.find((entry) => entry.id === propertyId);
      if (!property || property.tenant_id !== profile.tenantId) {
        return { ok: false, formError: "That listing is not available.", values };
      }
      property.status = status;
      property.updated_at = new Date().toISOString();
      if (status === "published" && !property.published_at) {
        property.published_at = new Date().toISOString();
      }
    } else {
      const supabase = await serverClient();
      const { data, error } = await supabase
        .from("properties")
        .update({
          status,
          ...(status === "published"
            ? { published_at: new Date().toISOString() }
            : {}),
        })
        .eq("id", propertyId)
        .select("id")
        .maybeSingle();
      if (error) {
        console.error("[propflow] status change failed", error.code ?? "unknown");
        return { ok: false, formError: "We could not change that listing.", values };
      }
      if (!data) return { ok: false, formError: "That listing is not available.", values };
    }

    revalidatePath(`/crm/properties/${propertyId}`);
    revalidatePath("/crm/properties");
    revalidatePath("/properties");
    if (propertyId) revalidatePath(`/crm/properties/${propertyId}`);
    return { ok: true, success: true, values: { status } };
  } catch (error) {
    return toFailure(error, values);
  }
}

export async function deleteProperty(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  try {
    const profile = await requireSessionProfile();
    if (!isAdmin(profile)) {
      return { ok: false, formError: "Only an administrator can delete a listing.", values };
    }
    const propertyId = clean(formData.get("property_id")).slice(0, 64);
    if (clean(formData.get("confirm")) !== "DELETE") {
      return { ok: false, formError: "Type DELETE to confirm.", values };
    }

    if (isDemoMode()) {
      const state = demoState();
      state.properties = state.properties.filter((entry) => entry.id !== propertyId);
      state.leads = state.leads.map((lead) =>
        lead.property_id === propertyId ? { ...lead, property_id: null } : lead,
      );
    } else {
      const supabase = await serverClient();
      // Storage objects are removed first so no orphan file is left public.
      const { data: images } = await supabase
        .from("property_images")
        .select("storage_path")
        .eq("property_id", propertyId);

      if (images && images.length > 0) {
        await supabase.storage
          .from(IMAGE_BUCKET)
          .remove(images.map((image) => image.storage_path));
      }

      const { data, error } = await supabase
        .from("properties")
        .delete()
        .eq("id", propertyId)
        .select("id")
        .maybeSingle();
      if (error) {
        console.error("[propflow] property delete failed", error.code ?? "unknown");
        return { ok: false, formError: "We could not delete that listing.", values };
      }
      if (!data) return { ok: false, formError: "That listing is not available.", values };
    }

    revalidatePath("/crm/properties");
    revalidatePath("/properties");
    redirect("/crm/properties");
  } catch (error) {
    return toFailure(error, values);
  }
}

/* --------------------------------------------------------------------------
 * Images
 * ------------------------------------------------------------------------ */

export async function uploadPropertyImage(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  try {
    const profile = await requireSessionProfile();
    if (!isAdmin(profile)) {
      return { ok: false, formError: "Only an administrator can upload photographs.", values };
    }

    const propertyId = clean(formData.get("property_id")).slice(0, 64);
    if (!propertyId) fail("property_id", "Missing listing reference.");

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, formError: "Choose a photograph to upload.", values };
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      return {
        ok: false,
        formError: "Upload a JPEG, PNG, WebP or AVIF photograph. Other formats are not accepted.",
        values,
      };
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return {
        ok: false,
        formError: "Photographs must be 8 MB or smaller.",
        values,
      };
    }

    const altText = clean(formData.get("alt_text")).slice(0, FORM_LIMITS.altText);

    if (isDemoMode()) {
      const state = demoState();
      const property = state.properties.find((entry) => entry.id === propertyId);
      if (!property || property.tenant_id !== profile.tenantId) {
        return { ok: false, formError: "That listing is not available.", values };
      }
      property.images.push({
        path: `/demo/${newDemoId("upload-")}.svg`,
        alt: altText,
      });
      revalidatePath(`/crm/properties/${propertyId}`);
      return { ok: true, success: true, values: {} };
    }

    const supabase = await serverClient();
    const { data: existing } = await supabase
      .from("property_images")
      .select("id")
      .eq("property_id", propertyId)
      .limit(1);
    if (!existing || existing.length === 0) {
      return { ok: false, formError: "That listing is not available.", values };
    }

    // Safe, unpredictable path scoped to the owning tenant. The Storage policy
    // requires the first segment to be the caller's tenant id.
    const extension = EXTENSION_BY_TYPE[file.type] ?? "jpg";
    const storagePath = `${profile.tenantId}/${propertyId}/${randomUUID()}.${extension}`;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(storagePath, bytes, { contentType: file.type, upsert: false });

    if (uploadError) {
      console.error("[propflow] image upload failed", uploadError.statusCode ?? "unknown");
      return { ok: false, formError: "We could not upload that photograph.", values };
    }

    const { count: existingImages } = await supabase
      .from("property_images")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId);

    const { error: insertError } = await supabase.from("property_images").insert({
      tenant_id: profile.tenantId,
      property_id: propertyId,
      storage_path: storagePath,
      alt_text: altText,
      sort_order: (existingImages ?? 0) + 1,
      byte_size: file.size,
    });

    if (insertError) {
      await supabase.storage.from(IMAGE_BUCKET).remove([storagePath]);
      console.error("[propflow] image record failed", insertError.code ?? "unknown");
      return { ok: false, formError: "We could not attach that photograph.", values };
    }

    revalidatePath(`/crm/properties/${propertyId}`);
    return { ok: true, success: true, values: {} };
  } catch (error) {
    return toFailure(error, values);
  }
}

export async function deletePropertyImage(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  try {
    const profile = await requireSessionProfile();
    if (!isAdmin(profile)) {
      return { ok: false, formError: "Only an administrator can remove photographs.", values };
    }
    const imageId = clean(formData.get("image_id")).slice(0, 64);
    const propertyId = clean(formData.get("property_id")).slice(0, 64);

    if (isDemoMode()) {
      const state = demoState();
      const property = state.properties.find((entry) => entry.id === propertyId);
      if (!property) return { ok: false, formError: "That listing is not available.", values };
      property.images = property.images.filter((image) => image.path !== imageId);
      revalidatePath(`/crm/properties/${propertyId}`);
      return { ok: true, success: true, values: {} };
    }

    const supabase = await serverClient();
    const { data: image } = await supabase
      .from("property_images")
      .select("storage_path, property_id")
      .eq("id", imageId)
      .maybeSingle();

    if (!image || image.property_id !== propertyId) {
      return { ok: false, formError: "That photograph is not available.", values };
    }

    await supabase.storage.from(IMAGE_BUCKET).remove([image.storage_path]);
    const { error } = await supabase.from("property_images").delete().eq("id", imageId);
    if (error) {
      console.error("[propflow] image delete failed", error.code ?? "unknown");
      return { ok: false, formError: "We could not remove that photograph.", values };
    }

    revalidatePath(`/crm/properties/${propertyId}`);
    return { ok: true, success: true, values: {} };
  } catch (error) {
    return toFailure(error, values);
  }
}

/** Moves a photograph one place left or right in the public gallery order. */
export async function movePropertyImage(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  try {
    const profile = await requireSessionProfile();
    if (!isAdmin(profile)) {
      return { ok: false, formError: "Only an administrator can reorder photographs.", values };
    }
    const propertyId = clean(formData.get("property_id")).slice(0, 64);
    const imageId = clean(formData.get("image_id")).slice(0, 64);
    const direction = clean(formData.get("direction")) === "up" ? -1 : 1;

    if (isDemoMode()) {
      const state = demoState();
      const property = state.properties.find((entry) => entry.id === propertyId);
      if (!property) return { ok: false, formError: "That listing is not available.", values };
      const index = property.images.findIndex((image) => image.path === imageId);
      const target = index + direction;
      if (index >= 0 && target >= 0 && target < property.images.length) {
        const current = property.images[index];
        const swap = property.images[target];
        if (current && swap) {
          property.images[index] = swap;
          property.images[target] = current;
        }
      }
      revalidatePath(`/crm/properties/${propertyId}`);
      return { ok: true, success: true, values: {} };
    }

    const supabase = await serverClient();
    const { data: images } = await supabase
      .from("property_images")
      .select("id, sort_order")
      .eq("property_id", propertyId)
      .order("sort_order", { ascending: true });

    const list = images ?? [];
    const index = list.findIndex((image) => image.id === imageId);
    const neighbour = list[index + direction];
    const current = list[index];

    if (index < 0 || !neighbour || !current) {
      return { ok: false, formError: "That photograph is not available.", values };
    }

    const { error } = await supabase
      .from("property_images")
      .update({ sort_order: neighbour.sort_order })
      .eq("id", current.id);
    if (error) {
      console.error("[propflow] reorder failed", error.code ?? "unknown");
      return { ok: false, formError: "We could not reorder that photograph.", values };
    }
    await supabase
      .from("property_images")
      .update({ sort_order: current.sort_order })
      .eq("id", neighbour.id);

    revalidatePath(`/crm/properties/${propertyId}`);
    return { ok: true, success: true, values: {} };
  } catch (error) {
    return toFailure(error, values);
  }
}

export async function setPropertyAvailability(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  try {
    const profile = await requireSessionProfile();
    if (!isAdmin(profile)) {
      return { ok: false, formError: "Only an administrator can change availability.", values };
    }
    const propertyId = clean(formData.get("property_id")).slice(0, 64);
    const available = boolean(formData.get("is_available"));

    if (isDemoMode()) {
      const property = demoState().properties.find((entry) => entry.id === propertyId);
      if (!property) return { ok: false, formError: "That listing is not available.", values };
      property.is_available = available;
      property.updated_at = new Date().toISOString();
    } else {
      const supabase = await serverClient();
      const { data, error } = await supabase
        .from("properties")
        .update({ is_available: available })
        .eq("id", propertyId)
        .select("id")
        .maybeSingle();
      if (error) {
        console.error("[propflow] availability change failed", error.code ?? "unknown");
        return { ok: false, formError: "We could not change availability.", values };
      }
      if (!data) return { ok: false, formError: "That listing is not available.", values };
    }

    revalidatePath(`/crm/properties/${propertyId}`);
    revalidatePath("/crm/properties");
    revalidatePath("/properties");
    return { ok: true, success: true, values: {} };
  } catch (error) {
    return toFailure(error, values);
  }
}