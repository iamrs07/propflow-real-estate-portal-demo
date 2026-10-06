import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Request-scoped client bound to the signed-in staff member's cookies.
 *
 * This is the client every CRM query must use. It carries the user's JWT, so
 * RLS, the `profiles`-derived tenant and role, and the audit triggers all
 * operate exactly as they would for a direct API caller.
 */
export async function serverClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The middleware already refreshed the session for this request.
        }
      },
    },
  });
}