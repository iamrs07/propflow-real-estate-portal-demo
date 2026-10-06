"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { DEMO_COOKIE, RESET_PASSWORD_PATH, SIGN_IN_PATH, safeRedirect } from "@/lib/auth";
import { DEMO_UNSAFE_REASON, demoSessionIsSafe, signDemoProfile } from "@/lib/demo-session";
import { DEMO_ACCOUNTS, DEMO_PROFILES } from "@/lib/data/demo/fixtures";
import { isDemoMode } from "@/lib/env";
import { clean, type FormState } from "@/lib/validation";
import { serverClient } from "@/lib/supabase/server";

/** Server actions for staff authentication. No public registration exists. */

const MAX_PASSWORD_LENGTH = 200;

export async function signIn(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = clean(formData.get("email")).toLowerCase().slice(0, 254);
  const password = clean(formData.get("password")).slice(0, MAX_PASSWORD_LENGTH);
  const next = safeRedirect(clean(formData.get("next")) || null);

  if (!email || !password) {
    return {
      ok: false,
      formError: "Enter your email address and password.",
      values: { email },
    };
  }

  if (isDemoMode()) {
    const account = DEMO_ACCOUNTS.find(
      (candidate) => candidate.email === email && candidate.password === password,
    );
    const profile = account
      ? DEMO_PROFILES.find((candidate) => candidate.id === account.profileId)
      : undefined;
    if (!account || !profile || !profile.is_active) {
      return {
        ok: false,
        formError: "Email or password is not correct.",
        values: { email },
      };
    }

    /*
     * Refuse to issue a session if the demo cookie cannot be signed. A production
     * build with no PROPFLOW_DEMO_SECRET would otherwise mint a cookie protected
     * only by a key committed to this repository.
     */
    if (!demoSessionIsSafe()) {
      return { ok: false, formError: DEMO_UNSAFE_REASON, values: { email } };
    }
    const signed = signDemoProfile(profile.id);
    if (!signed) {
      return { ok: false, formError: DEMO_UNSAFE_REASON, values: { email } };
    }

    const jar = await cookies();
    jar.set(DEMO_COOKIE, signed, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    redirect(next);
  }

  const supabase = await serverClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Deliberately identical for "no such user" and "wrong password".
    console.error("[propflow] sign-in rejected", error.status ?? "unknown");
    return { ok: false, formError: "Email or password is not correct.", values: { email } };
  }

  // The CRM layout re-checks the profile on every request, so an account with
  // no profile row simply lands on the login page again.
  revalidatePath("/crm");
  redirect(next);
}

export async function signOut(): Promise<void> {
  if (isDemoMode()) {
    const jar = await cookies();
    jar.delete(DEMO_COOKIE);
  } else {
    const supabase = await serverClient();
    await supabase.auth.signOut();
  }
  revalidatePath("/", "layout");
  redirect(SIGN_IN_PATH);
}

/*
 * Demo identities are synthetic local fixtures, not real mailboxes, and `.demo`
 * is not a reserved TLD — it is an ICANN "sponsored" TLD that can be registered.
 * So the guard below is not "demo mode, so nobody is listening" but "never send
 * mail to an address that came out of our own fixtures", which holds in every
 * mode. If a real Supabase project was seeded with the same addresses, a reset
 * request for them is refused here rather than delivered to whoever holds them.
 */
const DEMO_ACCOUNT_EMAILS = new Set<string>(DEMO_ACCOUNTS.map((account) => account.email));

export async function requestPasswordReset(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = clean(formData.get("email")).toLowerCase().slice(0, 254);
  if (!email) {
    return { ok: false, formError: "Enter your email address.", values: {} };
  }

  if (!isDemoMode() && !DEMO_ACCOUNT_EMAILS.has(email)) {
    const supabase = await serverClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}${RESET_PASSWORD_PATH}`,
    });
  }

  // The same response whether or not the address exists, so this cannot be used
  // to discover which staff addresses exist.
  return { ok: true, success: true, values: {} };
}

export async function updatePassword(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const password = clean(formData.get("password"));
  const confirm = clean(formData.get("confirm"));

  if (password.length < 12) {
    return {
      ok: false,
      fieldErrors: { password: "Use at least 12 characters." },
      values: {},
    };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return {
      ok: false,
      fieldErrors: { password: "That password is too long." },
      values: {},
    };
  }
  if (password !== confirm) {
    return {
      ok: false,
      fieldErrors: { confirm: "The two passwords do not match." },
      values: {},
    };
  }

  if (isDemoMode()) {
    return {
      ok: false,
      formError: "Demo mode has no real password store. Use the demo accounts listed on the sign-in page.",
      values: {},
    };
  }

  const supabase = await serverClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    console.error("[propflow] password update failed", error.status ?? "unknown");
    return {
      ok: false,
      formError:
        "We could not update your password. Request a fresh reset link and try again.",
      values: {},
    };
  }

  return { ok: true, success: true, values: {} };
}