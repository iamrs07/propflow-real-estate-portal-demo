import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Browser client. Only ever holds the anon/publishable key, so anything the
 * browser does is subject to RLS. There is deliberately no service-role
 * variant of this file.
 */
export function browserClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}