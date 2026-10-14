import Link from "next/link";
import { Suspense } from "react";
import { getAgency, getFeaturedProperties, listPublicProperties } from "@/lib/data/public";
import { isDemoMode } from "@/lib/env";
import { telHref, whatsappHref } from "@/lib/format";
import { LISTING_FACETS, LISTING_FACET_LABELS, BEDROOM_CHOICES, MUMBAI_LOCALITIES } from "@/lib/domain";
import { PropertyCard } from "@/components/property-card";
import { EnquiryForm } from "@/components/enquiry-form";
import ListingSkeleton from "@/components/listing-skeleton";
import { Button, LinkButton, SectionHeading } from "@/components/ui";

export const dynamic = "force-dynamic";

/*
 * The hero search sits on the `bg-navy-900` band, so its controls must be
 * *darker* than the band with a lighter border. Painting them the band's own
 * colour made them invisible — the same trap the sign-in page fell into.
 */
const HERO_CONTROL =
  "w-full rounded-md border border-navy-500 bg-navy-950 px-3 py-2.5 text-[15px] text-white " +
  "placeholder:text-navy-300 focus:border-gold-500 focus:outline-none";

/*
 * The skeleton is mounted here rather than in `(site)/loading.tsx`: a segment
 * loading file would wrap every public page in a Suspense boundary and stop
 * `property/[reference]` from returning a real 404 for an unavailable listing.
 */
export default function HomePage() {
  return (
    <Suspense fallback={<ListingSkeleton />}>
      <Home />
    </Suspense>
  );
}

async function Home() {
  const [agency, featured, allListings] = await Promise.all([
    getAgency(),
    getFeaturedProperties(3),
    listPublicProperties({ limit: 60 }),
  ]);

  if (!agency) return null;

  const listingCount = allListings.length;
  const phone = telHref(agency.phone, { inert: isDemoMode() });
  const whatsapp = whatsappHref(agency.whatsapp, { inert: isDemoMode() });

  // Mumbai neighbourhoods from our demo listings (subset for quick display)
  const demoLocalities = [...new Set(allListings.map((p) => p.locality))].sort();

  return (
    <>
      {/* ---------------------------------------------------------------- hero */}
      <section className="border-b border-navy-700 bg-navy-900">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-gold-500 uppercase">
              {agency.name} — Mumbai
            </p>
            <h1 className="mt-4 font-display text-4xl leading-[1.1] text-white sm:text-5xl">
              Mumbai homes listed by our team.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-navy-200">
              {agency.tagline ??
                "Rental, resale and new-build homes in Mumbai City & Suburban, handled by a small team with a short written record of every agreement."}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <LinkButton href="/properties" size="lg">
                Browse {listingCount === 1 ? "the home" : `all ${listingCount} Mumbai homes`}
              </LinkButton>
              {phone ? (
                <a
                  href={phone}
                  className="inline-flex items-center rounded-md border border-navy-600 px-5 py-3 text-base text-white transition-colors hover:border-gold-500 hover:text-gold-400"
                >
                  Call {agency.phone}
                </a>
              ) : null}
              {whatsapp ? (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-md border border-transparent px-2 py-3 text-sm text-navy-200 underline underline-offset-4 transition-colors hover:text-gold-400"
                >
                  Message on WhatsApp
                </a>
              ) : null}
            </div>
          </div>

          {/* ---------------------------------------------------- search entry */}
          <div className="rounded-lg border border-navy-700 bg-navy-950/60 p-6">
            <h2 className="font-display text-xl text-white">Start your Mumbai search</h2>
            <p className="mt-2 text-sm leading-relaxed text-navy-200">
              Tell us what you need — Bandra to Borivali, Dadar to Dahisar — and we will show only the homes that match.
            </p>

            <form action="/properties" method="get" className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="home-search"
                  className="mb-1.5 block text-xs font-medium tracking-wide text-navy-200 uppercase"
                >
                  Keyword
                </label>
                <input
                  id="home-search"
                  name="search"
                  type="search"
                  maxLength={80}
                  placeholder="Locality, building or reference (e.g. Bandra West, Juhu, Khar)"
                  className={HERO_CONTROL}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="home-listing"
                    className="mb-1.5 block text-xs font-medium tracking-wide text-navy-200 uppercase"
                  >
                    Listing type
                  </label>
                  <select
                    id="home-listing"
                    name="listingType"
                    defaultValue=""
                    className={HERO_CONTROL}
                  >
                    <option value="">Rent or buy</option>
                    {LISTING_FACETS.map((facet) => (
                      <option key={facet} value={facet}>
                        {LISTING_FACET_LABELS[facet]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="home-beds"
                    className="mb-1.5 block text-xs font-medium tracking-wide text-navy-200 uppercase"
                  >
                    Bedrooms
                  </label>
                  <select
                    id="home-beds"
                    name="bedroomsMin"
                    defaultValue=""
                    className={HERO_CONTROL}
                  >
                    <option value="">Any</option>
                    {BEDROOM_CHOICES.map((count) => (
                      <option key={count} value={count}>
                        {count}+ bedrooms
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <Button type="submit" size="lg" className="w-full">
                Search Mumbai homes
              </Button>

              <p className="mt-4 text-xs text-navy-300">
                Cannot see the right home?{" "}
                <Link href="/about" className="text-gold-400 underline underline-offset-4">
                  Tell us what you are looking for
                </Link>
                .
              </p>
            </form>

            {/* Demo localities quick links */}
            {demoLocalities.length > 0 && (
              <div className="mt-6 pt-4 border-t border-navy-800">
                <p className="text-xs font-medium tracking-wide text-navy-300 uppercase mb-3">
                  Quick jump to demo localities
                </p>
                <div className="flex flex-wrap gap-2">
                  {demoLocalities.slice(0, 8).map((locality) => (
                    <Link
                      key={locality}
                      href={`/properties?locality=${encodeURIComponent(locality)}`}
                      className="rounded-full border border-navy-600 bg-navy-950 px-3 py-1 text-xs text-navy-200 hover:border-gold-500 hover:text-gold-400 transition-colors"
                    >
                      {locality}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- featured */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <SectionHeading
          eyebrow="Newest listings"
          title="Mumbai homes on the site right now"
          description="Every listing below is published and located in Mumbai City or Mumbai Suburban."
          action={
            <Link
              href="/properties"
              className="text-sm font-medium text-navy-800 underline underline-offset-4 hover:text-gold-700"
            >
              See all Mumbai listings
            </Link>
          }
        />

        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((property, index) => (
            <PropertyCard key={property.id} property={property} priority={index < 3} />
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------- service areas */}
      <section className="border-y border-sand-300 bg-sand-50">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div>
            <SectionHeading
              eyebrow="Where we work"
              title="Mumbai City & Mumbai Suburban — Western, Central & Harbour lines"
              description="We keep a short list of homes in each neighbourhood rather than spreading across the whole metro. That way we can tell you which buildings are worth your time."
            />
            <div className="mt-6 flex flex-wrap gap-2">
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
          </div>

          <div className="rounded-lg border border-sand-300 bg-white p-7 shadow-card">
            <h3 className="font-display text-xl text-navy-900">What you get from us</h3>
            <dl className="mt-5 space-y-4 text-sm leading-relaxed">
              <div>
                <dt className="font-medium text-navy-900">Explore demo homes across Mumbai</dt>
                <dd className="mt-1 text-sand-700">
                  We aim to visit before we publish, and we remove a listing when it is no longer
                  available.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-navy-900">One agent, start to finish</dt>
                <dd className="mt-1 text-sand-700">
                  The person who shows you the home is the person you deal with.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-navy-900">Everything written down</dt>
                <dd className="mt-1 text-sand-700">
                  Offers, deposits and handover dates are recorded in writing before anything is
                  signed.
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- CTA */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <SectionHeading
              eyebrow="Get in touch"
              title="Tell us what you are looking for in Mumbai"
              description="Send your requirement and we will come back with homes that actually fit — including ones that are not on the site yet."
            />
            <dl className="mt-8 space-y-4">
              {phone ? (
                <div>
                  <dt className="text-xs font-medium tracking-wide text-sand-600 uppercase">
                    Phone
                  </dt>
                  <dd className="mt-1">
                    <a
                      href={phone}
                      className="font-display text-xl text-navy-900 underline-offset-4 hover:underline"
                    >
                      {agency.phone}
                    </a>
                  </dd>
                </div>
              ) : null}
              {whatsapp ? (
                <div>
                  <dt className="text-xs font-medium tracking-wide text-sand-600 uppercase">
                    WhatsApp
                  </dt>
                  <dd className="mt-1">
                    <a
                      href={whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-display text-xl text-navy-900 underline-offset-4 hover:underline"
                    >
                      {agency.whatsapp}
                    </a>
                  </dd>
                </div>
              ) : null}
              {agency.email ? (
                <div>
                  <dt className="text-xs font-medium tracking-wide text-sand-600 uppercase">
                    Email
                  </dt>
                  <dd className="mt-1">
                    <a
                      href={`mailto:${agency.email}`}
                      className="text-navy-900 underline underline-offset-4"
                    >
                      {agency.email}
                    </a>
                  </dd>
                </div>
              ) : null}
              {agency.office_address ? (
                <div>
                  <dt className="text-xs font-medium tracking-wide text-sand-600 uppercase">
                    Office
                  </dt>
                  <dd className="mt-1 leading-relaxed text-sand-700">{agency.office_address}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs font-medium tracking-wide text-sand-600 uppercase">
                  Service boundary
                </dt>
                <dd className="mt-1 leading-relaxed text-sand-700">
                  Mumbai City (Colaba to Mahim) · Mumbai Suburban Western (Bandra to Dahisar) ·
                  Mumbai Suburban Central (Dadar to Mulund) · Mumbai Suburban Harbour (Chembur to Trombay).
                  Adjacent MMR locations (Mira Road, Bhayandar, Thane, Kalyan, Panvel, Navi Mumbai) are not part of our core
                  service area.
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-sand-300 bg-white p-6 shadow-card sm:p-8">
            <EnquiryForm variant="contact" />
          </div>
        </div>
      </section>
    </>
  );
}