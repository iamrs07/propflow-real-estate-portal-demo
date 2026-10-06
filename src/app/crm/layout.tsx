import type { Metadata } from "next";
import type { ReactNode } from "react";
import { isAdmin, requireSessionProfile } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { signOut } from "@/server/actions/auth";
import { CrmNav, type CrmNavItem } from "@/components/crm-nav";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Workspace", template: "%s · PropFlow CRM" },
  // The private workspace must never be indexed.
  robots: { index: false, follow: false, nocache: true },
};

/*
 * There is deliberately no `loading.tsx` at this level.
 *
 * A loading file installs a Suspense boundary, which lets Next flush the
 * navigation shell before the page resolves. An agent who requests an
 * admin-only page would then receive HTTP 200 plus a shell that hangs forever
 * without JavaScript, because the `redirect()` inside the page can no longer
 * change the status code. With no boundary above it, the admin check resolves
 * first and the refusal is a real redirect. Pages that benefit from streaming
 * declare their own Suspense boundary.
 */

export default async function CrmLayout({ children }: { children: ReactNode }) {
  // Tenant and role are resolved from `profiles` on every request.
  const profile = await requireSessionProfile();
  const admin = isAdmin(profile);

  const items: CrmNavItem[] = [
    { href: "/crm", label: "Dashboard" },
    { href: "/crm/leads", label: "Leads", nested: true },
    { href: "/crm/visits", label: "Visits", nested: true },
    { href: "/crm/properties", label: "Listings", nested: true },
    ...(admin
      ? [
          { href: "/crm/team", label: "Team" } satisfies CrmNavItem,
          { href: "/crm/settings", label: "Agency settings" } satisfies CrmNavItem,
        ]
      : []),
  ];

  return (
    <>
      <CrmNav
        items={items}
        role={profile.role}
        fullName={profile.fullName}
        isDemo={isDemoMode()}
        signOutAction={signOut}
      />
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
      <footer className="border-t border-sand-300 bg-sand-50">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-sand-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            Signed in as {profile.fullName} ({profile.role}). Records shown are limited to this
            brokerage{admin ? " and to all its staff." : " and to leads assigned to you."}
          </p>
          <form action={signOut}>
            <button
              type="submit"
              className="underline underline-offset-4 hover:text-navy-900"
            >
              Sign out
            </button>
          </form>
        </div>
      </footer>
    </>
  );
}