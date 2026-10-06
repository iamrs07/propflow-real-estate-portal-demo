import type { NextRequest } from "next/server";
import { refreshSession } from "@/lib/supabase/middleware";

/**
 * Next 16 renamed the root request hook from `middleware.ts` to `proxy.ts`.
 * It still runs before every server component, so the session cookie is
 * refreshed before any CRM page reads it.
 */
export default async function proxy(request: NextRequest) {
  return refreshSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. Kept broad because the
     * session cookie must be refreshed before any CRM server component runs.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|webmanifest)$).*)",
  ],
};