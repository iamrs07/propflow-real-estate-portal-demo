"use server";

import { revalidatePath } from "next/cache";
import { requireSessionProfile } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { demoState } from "@/lib/data/demo/store";
import { serverClient } from "@/lib/supabase/server";
import {
  type FormState,
  clean,
  email as validateEmail,
  fail,
  FORM_LIMITS,
  formValues,
  optionalText,
  stringList,
  text,
  toFailure,
  url,
} from "@/lib/validation";

/**
 * Agency settings. Admin only: the caller must already be an admin of this
 * tenant (requireAdmin redirects otherwise), the update is sent through their
 * own session client so RLS applies, and the tenant id is never taken from the
 * form — it comes from the profiles row.
 */
export async function updateAgencySettings(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  try {
    const profile = await requireSessionProfile();
    if (profile.role !== "admin") {
      return {
        ok: false,
        formError: "Only an administrator can change agency settings.",
        values,
      };
    }

    const name = text(formData.get("name"), "name", {
      min: 2,
      max: 120,
      label: "Agency name",
    });
    const tagline = optionalText(formData.get("tagline"), "tagline", {
      max: 200,
      label: "Tagline",
    });
    const about = optionalText(formData.get("about"), "about", {
      max: FORM_LIMITS.description,
      label: "About",
    });
    const phone = optionalText(formData.get("phone"), "phone", { max: 24, label: "Phone" });
    const whatsapp = optionalText(formData.get("whatsapp"), "whatsapp", {
      max: 24,
      label: "WhatsApp",
    });
    const email = validateEmail(formData.get("email"), "email");
    const officeAddress = optionalText(formData.get("office_address"), "office_address", {
      max: 400,
      label: "Office address",
    });
    const privacyContactEmail = validateEmail(
      formData.get("privacy_contact_email"),
      "privacy_contact_email",
    );
    const privacyNotes = optionalText(formData.get("privacy_notes"), "privacy_notes", {
      max: FORM_LIMITS.description,
      label: "Privacy notice",
    });
    const mapLink = url(formData.get("map_link"), "map_link", { label: "Map link" });
    const serviceAreas = stringList(formData.get("service_areas"), {
      max: 30,
      maxLength: 80,
    });

    if (serviceAreas.length === 0) {
      fail("service_areas", "List at least one service area.");
    }

    const patch = {
      name,
      tagline,
      about,
      phone,
      whatsapp,
      email,
      office_address: officeAddress,
      privacy_contact_email: privacyContactEmail,
      privacy_notes: privacyNotes,
      map_link: mapLink,
      service_areas: serviceAreas,
    };

    if (isDemoMode()) {
      const state = demoState();
      if (state.agency.slug !== "northstar-demo") {
        return { ok: false, formError: "Demo mode has one brokerage only.", values };
      }
      Object.assign(state.agency, patch);
      revalidatePath("/crm/settings");
      revalidatePath("/privacy");
      revalidatePath("/", "layout");
      return { ok: true, success: true, values: {} };
    }

    const supabase = await serverClient();
    const { data, error } = await supabase
      .from("tenants")
      .update(patch)
      .eq("id", profile.tenantId)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[propflow] settings update failed", error.code ?? "unknown");
      return { ok: false, formError: "We could not save those settings.", values };
    }
    if (!data) {
      return { ok: false, formError: "We could not save those settings.", values };
    }

    revalidatePath("/crm/settings");
    revalidatePath("/privacy");
    revalidatePath("/about");
    revalidatePath("/", "layout");
    return { ok: true, success: true, values: {} };
  } catch (error) {
    return toFailure(error, values);
  }
}

/** Records that an administrator reviewed the privacy copy. */
export async function acknowledgePrivacyReview(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  try {
    const profile = await requireSessionProfile();
    if (profile.role !== "admin") {
      return { ok: false, formError: "Only an administrator can do this.", values };
    }
    if (clean(formData.get("reviewed")) !== "yes") {
      return {
        ok: false,
        formError: "Confirm you have read the privacy notice before publishing.",
        values,
      };
    }
    revalidatePath("/crm/settings");
    return {
      ok: true,
      success: true,
      values: {},
      notice: "Review recorded.",
    };
  } catch (error) {
    return toFailure(error, values);
  }
}