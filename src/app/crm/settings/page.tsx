import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin, requireSessionProfile } from "@/lib/auth";
import { getAgencySettings } from "@/lib/data/crm";
import { isDemoMode } from "@/lib/env";
import { Card, DetailRow } from "@/components/ui";
import { AgencySettingsForm } from "@/components/agency-settings-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Agency settings" };

export default async function SettingsPage() {
  await requireAdmin();
  const profile = await requireSessionProfile();

  const settings = await getAgencySettings(profile);

  return (
    <div className="space-y-8">
      <header className="max-w-2xl">
        <h1 className="font-display text-3xl text-navy-900">Agency settings</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-sand-700">
          These values are the public identity of the brokerage — the name in the header, the
          numbers people call, and the wording on the privacy page.
        </p>
      </header>

      {isDemoMode() ? (
        <Card className="border-l-2 border-l-gold-500 p-5">
          <p className="text-sm text-sand-700">
            <strong className="font-medium text-navy-900">Demo mode.</strong> Changes are held in
            memory and reset when the server restarts. Connect a Supabase project to make them
            permanent.
          </p>
        </Card>
      ) : null}

      {settings ? (
        <>
          <Card className="p-6">
            <h2 className="font-display text-lg text-navy-900">Account</h2>
            <dl className="mt-2 divide-y divide-sand-200">
              <DetailRow label="Public site slug">{settings.slug}</DetailRow>
              <DetailRow label="Brokerage id">{settings.id}</DetailRow>
              <DetailRow label="Public site">
                {settings.public_site_enabled ? "Enabled" : "Disabled"}
              </DetailRow>
              <DetailRow label="Your role">Admin</DetailRow>
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-sand-600">
              Only one brokerage may serve the public site; the database enforces it with a partial
              unique index. The slug is read on the server to bind every enquiry to this brokerage
              — it is never sent from the browser.
            </p>
          </Card>

          <AgencySettingsForm settings={settings} />

          <Card className="p-6">
            <h2 className="font-display text-lg text-navy-900">Check the public pages</h2>
            <p className="mt-1 text-sm text-sand-600">
              Everything you save above shows up on these pages immediately.
            </p>
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              <Link href="/" className="text-navy-800 underline underline-offset-4">
                Home
              </Link>
              <Link href="/about" className="text-navy-800 underline underline-offset-4">
                About &amp; contact
              </Link>
              <Link href="/privacy" className="text-navy-800 underline underline-offset-4">
                Privacy
              </Link>
              <Link href="/properties" className="text-navy-800 underline underline-offset-4">
                Listings
              </Link>
            </div>
          </Card>
        </>
      ) : (
        <Card className="p-6">
          <p className="text-sm text-sand-600">
            We could not load the brokerage record. Check that the migrations have been applied.
          </p>
        </Card>
      )}
    </div>
  );
}