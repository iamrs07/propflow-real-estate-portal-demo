"use server";

import { headers } from "next/headers";
import {
  CONTACT_PREFERENCES,
  type ContactPreference,
} from "@/lib/domain";
import { isDemoMode, tenantSlug } from "@/lib/env";
import { demoState, newDemoId } from "@/lib/data/demo/store";
import { requestFingerprint } from "@/lib/fingerprint";
import { adminClient } from "@/lib/supabase/admin";
import {
  type FormState,
  FORM_LIMITS,
  clean,
  email as validateEmail,
  fail,
  formValues,
  isoDateTime,
  oneOfRequired,
  phone as validatePhone,
  text,
  toFailure,
} from "@/lib/validation";

/**
 * Public enquiry intake.
 *
 * Guarantees, in order:
 *   1. the honeypot is checked before anything else and answered with a normal
 *      success response so a bot cannot learn it was filtered;
 *   2. every field is validated here, not in the browser — the browser copy is
 *      a convenience only;
 *   3. the tenant comes from PROPFLOW_TENANT_SLUG on the server; the request
 *      cannot choose it;
 *   4. assignment, status and source are not accepted from this path at all —
 *      submit_public_enquiry() takes no such parameters and forces status='new';
 *   5. spam is bounded by the per-fingerprint hourly limit inside the database;
 *   6. the returned row id is discarded — the caller learns only success or a
 *      safe, plain-language failure.
 */

const HONEYPOT_FIELD = "company_website";

function mapFailure(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("too many submissions")) {
    return "You have sent several enquiries in the last hour. Please call us instead and we will pick it up straight away.";
  }
  if (text.includes("listing unavailable")) {
    return "That home is no longer accepting enquiries. Please try another listing or call us.";
  }
  if (text.includes("stale form submission")) {
    return "This page has been open a while. Please refresh the page and send it again.";
  }
  if (text.includes("agency unavailable")) {
    return "Enquiries are temporarily unavailable. Please call us instead.";
  }
  return "We could not record your enquiry just now. Please try again, or call us on the number at the top of the page.";
}

export async function submitEnquiry(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);

  try {
    // 1. Honeypot: answer as if it worked, insert nothing.
    if (clean(formData.get(HONEYPOT_FIELD)) !== "") {
      return {
        ok: true,
        success: true,
        values: {},
        notice: isDemoMode() ? "demo" : undefined,
      };
    }

    // 2. Validation.
    if (clean(formData.get("consent")) !== "yes") {
      fail("consent", "Please confirm you are happy for us to contact you about this enquiry.");
    }

    const fullName = text(formData.get("full_name"), "full_name", {
      min: 2,
      max: FORM_LIMITS.fullName,
      label: "Your name",
    });
    const phone = validatePhone(formData.get("phone"));
    const email = validateEmail(formData.get("email"));
    const preferredContact = oneOfRequired<ContactPreference>(
      formData.get("preferred_contact"),
      CONTACT_PREFERENCES,
      "preferred_contact",
    );
    const preferredVisitAt = isoDateTime(
      formData.get("preferred_visit_at"),
      "preferred_visit_at",
      { required: false },
    );

    const rawMessage = formData.get("message");
    const message =
      typeof rawMessage === "string" ? rawMessage.trim().slice(0, FORM_LIMITS.message) : "";
    if (message.length > FORM_LIMITS.message) {
      fail("message", `Message must be ${FORM_LIMITS.message} characters or fewer.`);
    }

    const rawReference = formData.get("property_reference");
    const propertyReference =
      typeof rawReference === "string" && rawReference.trim() !== ""
        ? rawReference.trim().toUpperCase().slice(0, 40)
        : null;

    const source = propertyReference ? "property_form" : "contact_form";
    const signedAt = clean(formData.get("signed_at"));

    // 3. Freshness: reject a submission whose form was rendered too long ago.
    const signedAtMs = signedAt ? Date.parse(signedAt) : Number.NaN;
    if (Number.isNaN(signedAtMs) || Date.now() - signedAtMs > 2 * 60 * 60 * 1000) {
      return {
        ok: false,
        formError:
          "This page has been open a while. Please refresh the page and send it again.",
        values,
      };
    }

    // 4. Demo mode: append to the in-memory fixture set.
    if (isDemoMode()) {
      const state = demoState();
      state.leads.unshift({
        id: newDemoId("44444444-4444-4444-8444-4444444444"),
        tenant_id: profileTenantId(state),
        property_id:
          state.properties.find((p) => p.reference_code === propertyReference)?.id ?? null,
        assigned_to: null,
        full_name: fullName,
        phone,
        email,
        message: message || null,
        source,
        status: "new",
        preferred_contact: preferredContact ?? "phone",
        preferred_visit_at: preferredVisitAt,
        consent_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      state.publicEnquiries += 1;
      return {
        ok: true,
        success: true,
        values: {},
        notice: "demo",
      };
    }

    // 5. Server-bound tenant + database-level rate limit.
    const headerList = await headers();
    const fingerprint = await requestFingerprint(headerList);

    /*
     * submit_public_enquiry() is the one write an anonymous visitor is allowed.
     * The argument names must match 0002_public_api_and_storage.sql exactly.
     */
    const { error } = await adminClient().rpc("submit_public_enquiry", {
      p_tenant_slug: tenantSlug(),
      p_property_reference: propertyReference,
      p_full_name: fullName,
      p_phone: phone,
      p_email: email,
      p_message: message || null,
      p_preferred_contact: preferredContact ?? "phone",
      p_preferred_visit_at: preferredVisitAt,
      p_source: source,
      p_fingerprint: fingerprint,
      p_signed_at: signedAt,
    } as never);

    if (error) {
      // Log the code only — never the payload, which contains personal data.
      console.error("[propflow] enquiry rejected", error.code ?? "unknown");
      return { ok: false, formError: mapFailure(error.message), values };
    }

    return { ok: true, success: true, values: {} };
  } catch (error) {
    return toFailure(error, values);
  }
}

function profileTenantId(state: ReturnType<typeof demoState>): string {
  const first = state.profiles[0];
  return first?.tenant_id ?? "11111111-1111-4111-8111-111111111111";
}