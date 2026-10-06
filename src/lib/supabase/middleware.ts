import "server-only";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseConfig, supabaseAnonKey, supabaseUrl } from "@/lib/env";

/*
 * `/auth` covers every staff auth page (login, forgot-password, reset-password),
 * so this list cannot drift out of step with the route tree the way the previous
 * hard-coded `/login` and `/reset-password` entries did.
 */
const SESSION_REFRESH_PATHS = ["/crm", "/auth"];

/**
 * Keeps the Supabase auth cookie fresh for the CRM area.
 *
 * This is the only place a session is trusted implicitly; the CRM pages still
 * call getUser() and read the tenant/role from `profiles` on every request.
 */
export async function refreshSession(request: NextRequest): Promise<NextResponse> {
  if (!hasSupabaseConfig()) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const isStaffArea = SESSION_REFRESH_PATHS.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  );

  if (!isStaffArea) return response;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return response;

  // getUser() has already refreshed the token in the cookie jar.
  return response;
}