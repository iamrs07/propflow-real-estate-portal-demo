import type { Metadata } from "next";
import { getAgency } from "@/lib/data/public";
import { isDemoMode } from "@/lib/env";
import { telHref, whatsappHref } from "@/lib/format";
import { EnquiryForm } from "@/components/enquiry-form";
import { Card, DetailRow, SectionHeading } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "About and contact",
  description: "Who we are, the areas we cover, and how to reach us.",
};

export default async function AboutPage() {
  const agency = await getAgency();
  if (!agency) return null;

  const phone = telHref(agency.phone, { inert: isDemoMode() });
  const whatsapp = whatsappHref(agency.whatsapp, { inert: isDemoMode() });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <header className="max-w-2xl">
        <p className="text-xs font-semibold tracking-[0.2em] text-gold-600 uppercase">
          About us
        </p>
        <h1 className="mt-3 font-display text-3xl text-navy-900 sm:text-4xl">
          A small brokerage, deliberately
        </h1>
      </header>

      <div className="mt-10 grid gap-12 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          {agency.about ? (
            <div className="space-y-4 text-[15px] leading-relaxed text-sand-700">
              {agency.about.split("\n\n").map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          ) : null}

          <section>
            <h2 className="font-display text-2xl text-navy-900">How a viewing works</h2>
            <ol className="mt-5 space-y-5">
              {[
                {
                  title: "Send an enquiry",
                  body: "Use the form on any listing, or the contact form on this page. You choose how we contact you.",
                },
                {
                  title: "We call you back",
                  body: "An agent confirms the details, answers your questions, and checks the home is still available.",
                },
                {
                  title: "We arrange the visit",
                  body: "You pick a slot. We confirm it with the owner or seller and send you the address on the day.",
                },
                {
                  title: "You decide in writing",
                  body: "If you want to proceed, we put the terms in writing before anything is signed or paid.",
                },
              ].map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold-500/60 font-display text-sm text-gold-700"
                  >
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-medium text-navy-900">{step.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-sand-700">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h2 className="font-display text-2xl text-navy-900">Areas we cover</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {agency.service_areas.map((area) => (
                <span
                  key={area}
                  className="rounded-full border border-sand-300 bg-white px-3.5 py-1.5 text-sm text-navy-800"
                >
                  {area}
                </span>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-6">
            <h2 className="font-display text-lg text-navy-900">Contact</h2>
            <dl className="mt-2 divide-y divide-sand-200">
              {phone ? (
                <DetailRow label="Phone">
                  <a href={phone} className="underline underline-offset-4">
                    {agency.phone}
                  </a>
                </DetailRow>
              ) : null}
              {whatsapp ? (
                <DetailRow label="WhatsApp">
                  <a
                    href={whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4"
                  >
                    {agency.whatsapp}
                  </a>
                </DetailRow>
              ) : null}
              {agency.email ? (
                <DetailRow label="Email">
                  <a href={`mailto:${agency.email}`} className="underline underline-offset-4">
                    {agency.email}
                  </a>
                </DetailRow>
              ) : null}
              {agency.office_address ? (
                <DetailRow label="Office">
                  <span className="max-w-56 text-right leading-relaxed">
                    {agency.office_address}
                  </span>
                </DetailRow>
              ) : null}
            </dl>
          </Card>

          <Card className="p-6">
            <SectionHeading title="Send a requirement" />
            <div className="mt-5">
              <EnquiryForm variant="contact" />
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}