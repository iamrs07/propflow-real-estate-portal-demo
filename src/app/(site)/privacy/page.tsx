import type { Metadata } from "next";
import Link from "next/link";
import { getAgency } from "@/lib/data/public";
import { formatDateTime } from "@/lib/format";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What we record when you send an enquiry, why we record it, and how to ask us to correct or delete it.",
};

export default async function PrivacyPage() {
  const agency = await getAgency();
  if (!agency) return null;

  const contactEmail = agency.privacy_contact_email ?? agency.email;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <header>
        <p className="text-xs font-semibold tracking-[0.2em] text-gold-600 uppercase">Privacy</p>
        <h1 className="mt-3 font-display text-3xl text-navy-900 sm:text-4xl">
          What we record, and what we do with it
        </h1>
        <p className="mt-3 text-sm text-sand-600">Last reviewed: {formatDateTime(new Date())}</p>
      </header>

      {/*
        Copy is editable by the agency from CRM → Agency settings, so this page
        reflects what the brokerage has actually configured.
      */}
      {agency.privacy_notes ? (
        <div className="mt-8 rounded-lg border border-gold-400/50 bg-gold-100/50 px-5 py-5">
          <p className="text-xs font-semibold tracking-[0.18em] text-gold-700 uppercase">
            Notice from {agency.name}
          </p>
          <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-navy-800">
            {agency.privacy_notes.split("\n\n").map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-10 space-y-10">
        <section>
          <h2 className="font-display text-2xl text-navy-900">When you send an enquiry</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-sand-700">
            Our enquiry forms ask for your name, a phone number, and optionally an email address, a
            message, a preferred way to be contacted and a preferred time for a visit. We store
            that information together with the date and time you submitted the form and the
            listing you asked about.
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-sand-700">
            We use it for one purpose: to contact you about the home you asked about. The tick box
            on the form records that you agreed to be contacted, and when.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-navy-900">What we do not do</h2>
          <ul className="mt-3 space-y-2.5">
            {[
              "We do not sell your details, and we do not pass them to advertisers.",
              "We do not use paid messaging or marketing services.",
              "We do not embed third-party trackers, chat widgets or map SDKs on this site.",
            ].map((item) => (
              <li key={item} className="flex gap-3 text-[15px] leading-relaxed text-sand-700">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="font-display text-2xl text-navy-900">Where it is stored</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-sand-700">
            Enquiries are stored in our own database and are visible only to the staff of this
            brokerage. Public visitors cannot read them: the pages that take enquiries do not
            expose any way to retrieve stored records. An agent sees only the leads assigned to
            them.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-navy-900">How long we keep it</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-sand-700">
            We keep an enquiry while the home is still available and for a reasonable period
            afterwards so we can answer a follow-up. Once the enquiry is closed we remove or
            anonymise the contact details. Tell us and we will do it sooner.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-navy-900">Correct it or delete it</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-sand-700">
            You can ask us to correct anything we hold about you, or to delete it. We will action
            both requests once a human has reviewed them.
          </p>
          <Card className="mt-5 p-5">
            <p className="text-xs font-medium tracking-wide text-sand-600 uppercase">
              Corrections and deletion requests
            </p>
            {contactEmail ? (
              <p className="mt-2 text-[15px] text-navy-900">
                <a
                  href={`mailto:${contactEmail}`}
                  className="font-medium underline underline-offset-4"
                >
                  {contactEmail}
                </a>
              </p>
            ) : null}
            {agency.phone ? (
              <p className="mt-1 text-sm text-sand-700">Or call us on {agency.phone}.</p>
            ) : null}
            {agency.office_address ? (
              <p className="mt-3 text-sm leading-relaxed text-sand-700">{agency.office_address}</p>
            ) : null}
          </Card>
        </section>

        <section>
          <h2 className="font-display text-2xl text-navy-900">Listing photographs</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-sand-700">
            Property photographs are published on this site with the owner&apos;s or seller&apos;s
            agreement, and are used only to advertise that home.
          </p>
        </section>
      </div>

      <p className="mt-12 border-t border-sand-300 pt-6 text-sm text-sand-600">
        Questions about anything on this page?{" "}
        <Link href="/about" className="underline underline-offset-4">
          Contact {agency.name}
        </Link>
        .
      </p>
    </div>
  );
}