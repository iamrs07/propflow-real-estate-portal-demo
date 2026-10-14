import type { Metadata } from "next";
import { getAgency } from "@/lib/data/public";
import { isDemoMode } from "@/lib/env";
import { MUMBAI_LOCALITIES } from "@/lib/domain";
import { telHref, whatsappHref } from "@/lib/format";
import { EnquiryForm } from "@/components/enquiry-form";
import { Card, DetailRow, SectionHeading, Alert } from "@/components/ui";

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
  const demo = isDemoMode();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <header className="max-w-2xl">
        <p className="text-xs font-semibold tracking-[0.2em] text-gold-600 uppercase">
          About us
        </p>
        <h1 className="mt-3 font-display text-3xl text-navy-900 sm:text-4xl">
          {agency.name}
        </h1>
      </header>

      {demo && (
        <Alert tone="caution" className="mt-6" title="Demonstration content">
          <p className="mt-2 text-sm leading-relaxed">
            This installation is a demonstration. The agency name, agents, listings, photos,
            enquiries, and contact details are all fictional. No real property data, prices, or
            contact information are present. Replace this content with your verified business
            information before going live.
          </p>
        </Alert>
      )}

      <div className="mt-10 grid gap-12 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <section>
            <h2 className="font-display text-2xl text-navy-900">What we do</h2>
            <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-sand-700">
              <p>
                {agency.name} is a small Mumbai brokerage working a short list of homes across
                Mumbai City and Mumbai Suburban only.
              </p>
              <p>
                We keep our areas tight — Mumbai City (Colaba to Mahim), Mumbai Suburban Western
                (Bandra to Borivali), Mumbai Suburban Central (Dadar to Mulund), and Mumbai Suburban
                Harbour (Chembur to Trombay) — so we actually know the buildings, not just the
                brochures.
              </p>
              {demo && (
                <p className="text-caution-700">
                  This description is demonstration content. Replace it with your verified business
                  information before going live.
                </p>
              )}
            </div>
          </section>

          <section>
            <h2 className="font-display text-2xl text-navy-900">Service area</h2>
            <p className="mt-2 text-sm text-sand-600">
              We serve Mumbai City and Mumbai Suburban only. Adjacent Mumbai Metropolitan Region
              locations (Mira Road, Bhayandar, Thane, Kalyan, Panvel, Navi Mumbai, and others) are
              not part of our core service area.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {MUMBAI_LOCALITIES.filter(
                (area) =>
                  !["Mira Road", "Bhayandar", "Thane", "Thane West", "Thane East", "Dombivli", "Kalyan", "Panvel", "New Panvel", "Kharghar", "Kamothe", "Kalamboli", "Taloja", "Uran", "Navi Mumbai", "Vashi", "Sanpada", "Nerul", "CBD Belapur", "Airoli", "Ghansoli", "Koparkhairane", "Turbhe"].includes(
                    area,
                  ),
              )
                .slice(0, 24)
                .map((area) => (
                  <span
                    key={area}
                    className="rounded-full border border-sand-300 bg-white px-3.5 py-1.5 text-sm text-navy-800"
                  >
                    {area}
                  </span>
                ))}
              <span className="rounded-full border border-sand-300 bg-white px-3.5 py-1.5 text-sm text-navy-500">
                +{MUMBAI_LOCALITIES.filter(
                  (area) =>
                    !["Mira Road", "Bhayandar", "Thane", "Thane West", "Thane East", "Dombivli", "Kalyan", "Panvel", "New Panvel", "Kharghar", "Kamothe", "Kalamboli", "Taloja", "Uran", "Navi Mumbai", "Vashi", "Sanpada", "Nerul", "CBD Belapur", "Airoli", "Ghansoli", "Koparkhairane", "Turbhe"].includes(
                      area,
                    ),
                ).length - 24} more
              </span>
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