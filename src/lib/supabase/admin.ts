import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseServiceRoleKey, supabaseUrl } from "@/lib/env";

/**
 * Service-role client. Server-only by construction: importing `server-only`
 * makes this module throw if anything in the browser bundle ever reaches it.
 *
 * It bypasses RLS, so it is used only for the handful of operations that
 * cannot be done as an end user:
 *   - auth.admin.* (creating staff accounts, sending reset mail)
 *   - calling submit_public_enquiry(), which is itself server-validated and
 *     binds the tenant from configuration, never from the request
 *   - bootstrap/verification scripts
 *
 * Every CRM read and write goes through the *user's own* session client in
 * server.ts, so RLS is genuinely enforced rather than merely present.
 */
let cached: ReturnType<typeof createClient> | null = null;

export function adminClient() {
  cached ??= createClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-application-name": "propflow-server" } },
  });
  return cached;
}