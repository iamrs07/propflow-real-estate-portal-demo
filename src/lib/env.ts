/**
 * Environment access.
 *
 * Two rules:
 *   1. Only NEXT_PUBLIC_* values are ever readable by client components.
 *   2. Nothing throws at module scope, so `next build` succeeds even before the
 *      .env file is filled in. Failures surface when a feature is actually used.
 */

export function supabaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not set. Add it to .env.local, or set PROPFLOW_DEMO_MODE=1 to run on demo fixtures.",
    );
  }
  return value;
}

export function supabaseAnonKey(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Add it to .env.local, or set PROPFLOW_DEMO_MODE=1 to run on demo fixtures.",
    );
  }
  return value;
}

/** Server-only. Must never be imported by a client component. */
export function supabaseServiceRoleKey(): string {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set (server-only variable).");
  }
  return value;
}

/** Server-only slug of the brokerage that owns the public site. */
export function tenantSlug(): string {
  const value = process.env.PROPFLOW_TENANT_SLUG?.trim();
  if (!value) {
    throw new Error("PROPFLOW_TENANT_SLUG is not set (server-only variable).");
  }
  return value;
}

/**
 * True when it is safe to build Supabase clients. In demo mode there is no
 * project, so every data path short-circuits to fixtures.
 */
export function hasSupabaseConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Demo mode resolution:
 *   PROPFLOW_DEMO_MODE=1  -> on, even if a project is configured
 *   PROPFLOW_DEMO_MODE=0  -> off, even if a project is missing (and errors loudly)
 *   unset                 -> on when no project is configured, so `npm run dev`
 *                           works the moment the repository is cloned
 *
 * A production build with neither a project nor an explicit flag deliberately
 * turns demo mode OFF so a misconfigured deployment fails visibly instead of
 * quietly serving fictional data to real visitors.
 */
export function isDemoMode(): boolean {
  const flag = process.env.PROPFLOW_DEMO_MODE;
  if (flag === "1") return true;
  if (flag === "0") return false;
  if (process.env.NODE_ENV === "production") return false;
  return !hasSupabaseConfig();
}