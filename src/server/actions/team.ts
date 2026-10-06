"use server";

import { revalidatePath } from "next/cache";
import { isAdmin, requireSessionProfile } from "@/lib/auth";
import { APP_ROLES, type AppRole } from "@/lib/domain";
import { isDemoMode } from "@/lib/env";
import { demoState, newDemoId } from "@/lib/data/demo/store";
import { adminClient } from "@/lib/supabase/admin";
import { serverClient } from "@/lib/supabase/server";
import {
  type FormState,
  clean,
  email as validateEmail,
  fail,
  formValues,
  oneOfRequired,
  phone as validatePhone,
  text,
  toFailure,
} from "@/lib/validation";

/**
 * Team management.
 *
 * There is no public registration. Accounts are created here by an
 * administrator, which is the only place auth.admin.createUser() is called.
 */

const TEMP_PASSWORD_MIN = 12;

export async function createTeamMember(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  try {
    const profile = await requireSessionProfile();
    if (!isAdmin(profile)) {
      return {
        ok: false,
        formError: "Only an administrator can add a team member.",
        values,
      };
    }

    const fullName = text(formData.get("full_name"), "full_name", {
      min: 2,
      max: 120,
      label: "Full name",
    });
    const email = validateEmail(formData.get("email"), "email", { required: true });
    const role = oneOfRequired<AppRole>(formData.get("role"), APP_ROLES, "role");
    const title = clean(formData.get("title")).slice(0, 120) || null;
    const phone = clean(formData.get("phone")) ? validatePhone(formData.get("phone")) : null;
    const password = clean(formData.get("password"));

    if (!email) fail("email", "Email address is required.");
    if (password.length < TEMP_PASSWORD_MIN) {
      fail("password", "Set a starting password of at least 12 characters.");
    }

    if (isDemoMode()) {
      const state = demoState();
      state.profiles.push({
        id: newDemoId("22222222-2222-4222-8222-2222222222"),
        tenant_id: profile.tenantId,
        full_name: fullName,
        role: role ?? "agent",
        is_active: true,
        phone,
        title,
        created_at: new Date().toISOString(),
      });
      revalidatePath("/crm/team");
      return {
        ok: true,
        success: true,
        values: {},
        notice: `${fullName} was added to the team (demo mode).`,
      };
    }

    // The service role is used only to create the auth user. The profile row is
    // written by the admin's own session client so RLS scopes it to their
    // brokerage and the transaction is theirs.
    const { data: created, error: createError } = await adminClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError) {
      console.error("[propflow] staff account creation failed", createError.status ?? "unknown");
      const duplicate = /already|registered|exists/i.test(createError.message);
      return {
        ok: false,
        fieldErrors: {
          email: duplicate
            ? "An account already exists for that address."
            : "We could not create that account. Check the address and try again.",
        },
        values,
      };
    }
    if (!created.user) {
      return { ok: false, formError: "We could not create that account.", values };
    }

    const supabase = await serverClient();
    const { error: profileError } = await supabase.from("profiles").insert({
      id: created.user.id,
      tenant_id: profile.tenantId,
      full_name: fullName,
      role: role ?? "agent",
      is_active: true,
      phone,
      title,
    });

    if (profileError) {
      // Never leave an orphan auth user behind.
      await adminClient().auth.admin.deleteUser(created.user.id);
      console.error("[propflow] profile insert failed", profileError.code ?? "unknown");
      return {
        ok: false,
        formError: "We could not add that team member. Nothing was saved.",
        values,
      };
    }

    revalidatePath("/crm/team");
    return { ok: true, success: true, values: {} };
  } catch (error) {
    return toFailure(error, values);
  }
}

export async function updateTeamMember(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  try {
    const profile = await requireSessionProfile();
    if (!isAdmin(profile)) {
      return {
        ok: false,
        formError: "Only an administrator can change a team member.",
        values,
      };
    }

    const memberId = clean(formData.get("member_id")).slice(0, 64);
    if (!memberId) fail("member_id", "Missing team member reference.");
    if (memberId === profile.id && clean(formData.get("is_active")) !== "true") {
      return {
        ok: false,
        formError: "You cannot deactivate your own account.",
        values,
      };
    }

    const fullName = text(formData.get("full_name"), "full_name", {
      min: 2,
      max: 120,
      label: "Full name",
    });
    const role = oneOfRequired<AppRole>(formData.get("role"), APP_ROLES, "role");
    const title = clean(formData.get("title")).slice(0, 120) || null;
    const isActive = clean(formData.get("is_active")) === "true";

    if (isDemoMode()) {
      const state = demoState();
      const member = state.profiles.find((entry) => entry.id === memberId);
      if (!member || member.tenant_id !== profile.tenantId) {
        return { ok: false, formError: "That team member is not available.", values };
      }
      member.full_name = fullName;
      member.role = role ?? "agent";
      member.title = title;
      member.is_active = isActive;
      revalidatePath("/crm/team");
      return { ok: true, success: true, values: {} };
    }

    const supabase = await serverClient();
    const { data, error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, role, title, is_active: isActive })
      .eq("id", memberId)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[propflow] profile update failed", error.code ?? "unknown");
      return { ok: false, formError: "We could not update that team member.", values };
    }
    if (!data) return { ok: false, formError: "That team member is not available.", values };

    if (!isActive) {
      // Keep the login itself disabled so a deactivated account cannot return.
      await adminClient().auth.admin.updateUserById(memberId, {
        ban_duration: "876000h",
      });
    }

    revalidatePath("/crm/team");
    return { ok: true, success: true, values: {} };
  } catch (error) {
    return toFailure(error, values);
  }
}

/** Clears the ban after a temporary deactivation. */
export async function reactivateTeamMember(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  try {
    const profile = await requireSessionProfile();
    if (!isAdmin(profile)) {
      return { ok: false, formError: "Only an administrator can reactivate an account.", values };
    }
    const memberId = clean(formData.get("member_id")).slice(0, 64);
    if (!memberId) fail("member_id", "Missing team member reference.");

    if (isDemoMode()) {
      const member = demoState().profiles.find((entry) => entry.id === memberId);
      if (!member) return { ok: false, formError: "That team member is not available.", values };
      member.is_active = true;
    } else {
      const supabase = await serverClient();
      const { data, error } = await supabase
        .from("profiles")
        .update({ is_active: true })
        .eq("id", memberId)
        .select("id")
        .maybeSingle();
      if (error || !data) {
        return { ok: false, formError: "We could not reactivate that account.", values };
      }
      await adminClient().auth.admin.updateUserById(memberId, { ban_duration: "none" });
    }

    revalidatePath("/crm/team");
    return { ok: true, success: true, values: {} };
  } catch (error) {
    return toFailure(error, values);
  }
}

/** Sends a Supabase password reset link to a member's registered address. */
export async function sendMemberReset(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  try {
    const profile = await requireSessionProfile();
    if (!isAdmin(profile)) {
      return { ok: false, formError: "Only an administrator can send a reset link.", values };
    }
    const memberId = clean(formData.get("member_id")).slice(0, 64);
    if (!memberId) fail("member_id", "Missing team member reference.");
    if (isDemoMode()) {
      return {
        ok: false,
        formError: "Demo mode has no mail delivery. Use the demo accounts on the sign-in page.",
        values,
      };
    }

    const supabase = await serverClient();
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", memberId)
      .maybeSingle();
    if (!data) return { ok: false, formError: "That team member is not available.", values };

    const admin = adminClient();
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(memberId);
    if (userError || !userData?.user?.email) {
      console.error("[propflow] member lookup failed", userError?.status ?? "unknown");
      return { ok: false, formError: "We could not look up that account.", values };
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    // generateLink produces a single-use link without sending mail, so an
    // internal reset does not depend on the project's SMTP configuration.
    const { data: link, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: userData.user.email,
      options: { redirectTo: `${siteUrl}/auth/reset-password` },
    });

    if (error || !link) {
      console.error("[propflow] reset link failed", error?.status ?? "unknown");
      return {
        ok: false,
        formError: "We could not create a reset link for that account.",
        values,
      };
    }

    return {
      ok: true,
      success: true,
      values: {},
      notice: `Single-use reset link for ${userData.user.email}: ${link.properties.action_link}`,
    };
  } catch (error) {
    return toFailure(error, values);
  }
}