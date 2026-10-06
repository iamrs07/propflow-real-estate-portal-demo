import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AppRole } from "@/lib/domain";
import { SIGN_IN_PATH } from "@/lib/auth-paths";
import { isDemoMode } from "@/lib/env";
import {
  DEMO_COOKIE,
  demoSessionIsSafe,
  verifyDemoProfile,
} from "@/lib/demo-session";
import { demoState } from "@/lib/data/demo/store";
import { serverClient } from "@/lib/supabase/server";

/**
 * Session resolution.
 *
 * The tenant and role always come from the `profiles` row of the *authenticated
 * user* — never from a cookie value the client could set, never from a query
 * parameter, never from a form field. In demo mode the equivalent is the fixed
 * fixture profile list, reached through a signed cookie (see demo-session.ts).
 */
export interface SessionProfile {
  id: string;
  tenantId: string;
  fullName: string;
  role: AppRole;
  email: string | null;
}

export { DEMO_COOKIE } from "@/lib/demo-session";

export async function getSessionProfile(): Promise<SessionProfile | null> {
  if (isDemoMode()) {
    /*
     * Fail closed, but as "anonymous" rather than as an error. A production build
     * with demo mode on and no PROPFLOW_DEMO_SECRET would otherwise protect the
     * demo workspace with nothing but a key committed to this repository. Returning
     * null keeps every staff page unreachable without turning the whole site into a
     * 500; the public pages still render, and sign-in explains why it is refusing.
     */
    if (!demoSessionIsSafe()) return null;

    const jar = await cookies();
    // The id inside the cookie is not trusted on its own: the signature must
    // verify first, so rewriting the cookie cannot select a different role.
    const id = verifyDemoProfile(jar.get(DEMO_COOKIE)?.value);
    if (!id) return null;
    const profile = demoState().profiles.find((p) => p.id === id);
    if (!profile || !profile.is_active) return null;
    return {
      id: profile.id,
      tenantId: profile.tenant_id,
      fullName: profile.full_name,
      role: profile.role,
      email: null,
    };
  }

  const supabase = await serverClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, tenant_id, full_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.is_active) return null;

  return {
    id: profile.id,
    tenantId: profile.tenant_id,
    fullName: profile.full_name,
    role: profile.role,
    email: user.email ?? null,
  };
}

/**
 * The staff sign-in page lives in `@/lib/auth-paths` so client components can
 * link to it without importing this server-only module. Re-exported here for the
 * server call sites that already import from here.
 */
export { SIGN_IN_PATH, FORGOT_PASSWORD_PATH, RESET_PASSWORD_PATH } from "@/lib/auth-paths";

export async function requireSessionProfile(next = "/crm"): Promise<SessionProfile> {
  const profile = await getSessionProfile();
  if (!profile) {
    // Same-origin only: `next` is a caller-supplied literal path, and safeRedirect
    // re-checks it before it is ever used.
    redirect(`${SIGN_IN_PATH}?next=${encodeURIComponent(safeRedirect(next, "/crm"))}`);
  }
  return profile;
}

export async function requireAdmin(): Promise<SessionProfile> {
  const profile = await requireSessionProfile();
  if (profile.role !== "admin") redirect("/crm");
  return profile;
}

/** True when the viewer may see every lead in the brokerage, not just their own. */
export function isAdmin(profile: SessionProfile): boolean {
  return profile.role === "admin";
}

/** Same-origin redirect guard: only allow paths inside this app. */
export function safeRedirect(target: string | null | undefined, fallback = "/crm"): string {
  if (!target) return fallback;
  if (!target.startsWith("/") || target.startsWith("//")) return fallback;
  return target;
}