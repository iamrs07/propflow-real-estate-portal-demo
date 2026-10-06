import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionProfile, safeRedirect } from "@/lib/auth";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/data/demo/fixtures";
import { DEMO_UNSAFE_REASON, demoSessionIsSafe } from "@/lib/demo-session";
import { isDemoMode } from "@/lib/env";
import { signIn } from "@/server/actions/auth";
import { SignInForm } from "@/components/sign-in-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Staff sign-in",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const redirectTo = safeRedirect(next ?? null);

  /*
   * Demo mode is one flag, but a usable demo sign-in is two conditions: the mode
   * has to be on, and a signing secret has to exist. A production build with the
   * mode on and no PROPFLOW_DEMO_SECRET refuses every session, so listing the
   * accounts and the password there would be advertising a sign-in that cannot
   * succeed. The same reason is returned by the action on submit; saying it up
   * front is the difference between a clear refusal and a dead end.
   */
  const demo = isDemoMode();
  const demoSignInWorks = demo && demoSessionIsSafe();

  // Already signed in? Skip the form.
  const existing = await getSessionProfile();
  if (existing) redirect(redirectTo);

  return (
    <>
      <div className="rounded-lg border border-sand-300 bg-white p-7 shadow-card">
        <h1 className="font-display text-2xl text-navy-900">Staff sign-in</h1>
        <p className="mt-2 text-sm leading-relaxed text-sand-700">
          Leads, visits and listings are private to the brokerage team.
        </p>
        <div className="mt-6">
          <SignInForm
            action={signIn}
            redirectTo={redirectTo}
            defaultEmail={demoSignInWorks ? DEMO_ACCOUNTS[0]?.email : ""}
          />
        </div>
      </div>

      {demo ? (
        <div className="mt-6 rounded-lg border border-gold-500/50 bg-gold-100 p-5">
          <p className="text-xs font-semibold tracking-[0.18em] text-gold-500 uppercase">
            Demo mode
          </p>
          {demoSignInWorks ? (
            <>
              <p className="mt-2 text-sm text-sand-700">
                No Supabase project is connected. Sign in with any of these fictional accounts;
                every account uses the password{" "}
                <code className="rounded bg-navy-900 px-1.5 py-0.5 text-gold-400">
                  {DEMO_PASSWORD}
                </code>
                .
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                {DEMO_ACCOUNTS.map((account) => (
                  <div key={account.email} className="flex flex-wrap justify-between gap-2">
                    <dt className="text-navy-100">{account.label}</dt>
                    <dd className="text-gold-400">{account.email}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <p className="mt-2 text-sm text-sand-700">{DEMO_UNSAFE_REASON}</p>
          )}
        </div>
      ) : null}
    </>
  );
}