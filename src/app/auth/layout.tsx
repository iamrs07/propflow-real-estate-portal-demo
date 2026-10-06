import type { ReactNode } from "react";
import Link from "next/link";
import { isDemoMode } from "@/lib/env";
import { getAgency } from "@/lib/data/public";
import { DEMO_ACCOUNTS } from "@/lib/data/demo/fixtures";
import { demoSessionIsSafe } from "@/lib/demo-session";

/**
 * Chrome for the sign-in and password screens.
 *
 * Deliberately a *light* surface with a different wordmark from the CRM. The
 * workspace navigation is a navy bar reading "PropFlow CRM" with a "P" mark; an
 * earlier version of this screen reused that same navy-and-gold bar, so the two
 * were indistinguishable and visitors could not tell a sign-in page from the
 * private dashboard. Off-white here also means the form controls sit on the same
 * light palette as the rest of the public site and cannot disappear into the
 * background.
 *
 * There is no public navigation here, so there is nothing to wander into while
 * unauthenticated.
 */
export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  // The brokerage's own name, so this screen belongs to them rather than to the
  // PropFlow brand. Falls back to the product name before a project is seeded.
  const agency = await getAgency();
  const name = agency?.name ?? "PropFlow";

  return (
    <div className="flex min-h-dvh flex-col bg-sand-100">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <header className="border-b border-sand-300 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-sm bg-navy-900 font-display text-base text-gold-400"
            >
              N
            </span>
            <span className="flex flex-col leading-tight">
              <span className="font-display text-lg text-navy-900">{name}</span>
              <span className="text-[11px] tracking-[0.18em] text-gold-700 uppercase">
                Staff access
              </span>
            </span>
          </Link>
          <Link
            href="/"
            className="text-sm text-navy-800 underline underline-offset-4 hover:text-gold-700"
          >
            Back to the listings
          </Link>
        </div>
      </header>

      <main
        id="main"
        className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12 sm:px-6"
      >
        {children}
      </main>

      <footer className="border-t border-sand-300 bg-white px-4 py-5 text-center text-xs text-sand-600 sm:px-6">
        Staff accounts are created by an administrator. There is no public sign-up.
        {/*
         * The same two conditions as the sign-in screen: naming the demo accounts
         * is only truthful when a demo session can actually be issued. On a
         * production build with the mode on and no PROPFLOW_DEMO_SECRET every
         * attempt is refused, so the addresses would be a dead end. The sign-in
         * screen states the reason; here it is enough to stay silent.
         */}
        {isDemoMode() && demoSessionIsSafe() ? (
          <p className="mt-2">
            Demo mode — sign in with{" "}
            {DEMO_ACCOUNTS.map((account, index) => (
              <span key={account.email}>
                {index > 0 ? " or " : ""}
                <span className="text-navy-800">{account.email}</span>
              </span>
            ))}
          </p>
        ) : null}
      </footer>
    </div>
  );
}