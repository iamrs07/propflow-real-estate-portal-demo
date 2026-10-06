import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicProperty } from "@/lib/data/public";
import {
  FURNISHING_LABELS,
  LISTING_TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
} from "@/lib/domain";
import { formatArea, formatDate, formatPrice, pricePeriodSuffix } from "@/lib/format";
import { EnquiryForm } from "@/components/enquiry-form";
import { PropertyGallery } from "@/components/property-gallery";
import { Badge, Card, DetailRow } from "@/components/ui";

export const dynamic = "force-dynamic";

type Params = { reference: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { reference } = await params;
  const property = await getPublicProperty(reference);
  if (!property) return { title: "Listing not available" };
  return {
    title: property.title,
    description:
      property.headline ??
      `${LISTING_TYPE_LABELS[property.listing_type]} listing in ${property.locality}, ${property.city}.`,
  };
}

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { reference } = await params;
  const property = await getPublicProperty(reference);

  // A draft, archived or unavailable listing is indistinguishable from one that
  // never existed — the public RPC does not return it — but the status code is a
  // real 404 so caches and search engines stop treating the reference as live.
  if (!property) notFound();

  const facts: Array<{ label: string; value: string }> = [
    {
      label: "Listing type",
      value: LISTING_TYPE_LABELS[property.listing_type],
    },
    { label: "Property type", value: PROPERTY_TYPE_LABELS[property.property_type] },
    { label: "Locality", value: `${property.locality}, ${property.city}` },
  ];

  if (property.bedrooms !== null) {
    facts.push({
      label: "Bedrooms",
      value: property.bedrooms === 0 ? "Plot — no bedrooms" : String(property.bedrooms),
    });
  }
  if (property.bathrooms !== null) {
    facts.push({ label: "Bathrooms", value: String(property.bathrooms) });
  }
  const area = formatArea(property.area_value, property.area_unit);
  if (area) facts.push({ label: "Built-up area", value: area });
  if (property.furnishing) {
    facts.push({ label: "Furnishing", value: FURNISHING_LABELS[property.furnishing] });
  }
  if (property.year_built) {
    facts.push({ label: "Year built", value: String(property.year_built) });
  }
  facts.push({
    label: "Availability",
    value: property.is_available ? "Available now" : "Unavailable",
  });
  facts.push({ label: "Listed on", value: formatDate(property.published_at) });
  facts.push({ label: "Reference", value: property.reference_code });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm">
        <Link href="/properties" className="text-sand-600 underline-offset-4 hover:text-navy-900 hover:underline">
          All homes
        </Link>
        <span aria-hidden="true" className="mx-2 text-sand-400">
          /
        </span>
        <span className="text-navy-900">{property.title}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[1.35fr_1fr]">
        <div>
          <PropertyGallery
            images={property.images}
            title={property.title}
            reference={property.reference_code}
          />

          <div className="mt-8">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={property.listing_type === "rent" ? "info" : "gold"}>
                {LISTING_TYPE_LABELS[property.listing_type]}
              </Badge>
              <Badge tone="navy">{PROPERTY_TYPE_LABELS[property.property_type]}</Badge>
              {property.negotiable ? <Badge tone="neutral">Price negotiable</Badge> : null}
            </div>

            <h1 className="mt-4 font-display text-3xl leading-tight text-navy-900 sm:text-4xl">
              {property.title}
            </h1>
            <p className="mt-2 text-[15px] text-sand-600">
              {property.locality}, {property.city}
            </p>

            <p className="mt-6 font-display text-3xl text-navy-900">
              {formatPrice(property.price, property.currency)}
              <span className="ml-2 text-base font-sans font-normal text-sand-600">
                {pricePeriodSuffix(property.price_period)}
              </span>
            </p>

            {property.headline ? (
              <p className="mt-5 border-l-2 border-gold-500 pl-4 text-lg leading-relaxed text-navy-800 italic">
                {property.headline}
              </p>
            ) : null}

            {property.description ? (
              <div className="mt-7 space-y-4 text-[15px] leading-relaxed text-sand-700">
                {property.description.split("\n\n").map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            ) : null}

            {property.amenities.length ? (
              <section className="mt-9">
                <h2 className="font-display text-xl text-navy-900">What it has</h2>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {property.amenities.map((amenity) => (
                    <li
                      key={amenity}
                      className="rounded-full border border-sand-300 bg-white px-3 py-1.5 text-sm text-navy-800"
                    >
                      {amenity}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {property.map_link ? (
              <section className="mt-9">
                <h2 className="font-display text-xl text-navy-900">Area</h2>
                <p className="mt-2 text-sm leading-relaxed text-sand-700">
                  The exact address is shared once a viewing is arranged, so the home is not
                  walked past by people who are not looking.
                </p>
                <a
                  href={property.map_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex rounded-md border border-navy-300 bg-white px-4 py-2.5 text-sm font-medium text-navy-900 transition-colors hover:border-navy-500"
                >
                  Open area map
                </a>
              </section>
            ) : null}
          </div>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-6">
            <EnquiryForm
              variant="property"
              propertyReference={property.reference_code}
              propertyTitle={property.title}
            />
          </Card>

          <Card className="p-6">
            <h2 className="font-display text-lg text-navy-900">Details</h2>
            <dl className="mt-2 divide-y divide-sand-200">
              {facts.map((fact) => (
                <DetailRow key={fact.label} label={fact.label}>
                  {fact.value}
                </DetailRow>
              ))}
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}