import Link from "next/link";
import type { PublicProperty } from "@/lib/data/types";
import {
  formatArea,
  formatPrice,
  pricePeriodSuffix,
} from "@/lib/format";
import {
  LISTING_TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
} from "@/lib/domain";
import { Badge, cx } from "@/components/ui";
import { PropertyPhoto } from "@/components/property-photo";

/** Compact fact line: "2 bed · 2 bath · 950 sq ft". */
export function propertyFacts(property: PublicProperty): string[] {
  const facts: string[] = [];
  if (property.bedrooms !== null) {
    facts.push(property.bedrooms === 0 ? "Plot" : `${property.bedrooms} bed`);
  }
  if (property.bathrooms !== null && property.bathrooms > 0) {
    facts.push(`${property.bathrooms} bath`);
  }
  const area = formatArea(property.area_value, property.area_unit);
  if (area) facts.push(area);
  return facts;
}

export function PropertyCard({
  property,
  priority = false,
  className,
}: {
  property: PublicProperty;
  priority?: boolean;
  className?: string;
}) {
  const facts = propertyFacts(property);

  return (
    <article
      className={cx(
        "group relative flex flex-col overflow-hidden rounded-lg border border-sand-300 bg-white shadow-card transition-shadow hover:shadow-raised focus-within:shadow-raised",
        className,
      )}
    >
      <PropertyPhoto
        images={property.images}
        alt={property.title}
        priority={priority}
        className="aspect-[4/3]"
        rounded={false}
      />

      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={property.listing_type === "rent" ? "info" : "gold"}>
            {LISTING_TYPE_LABELS[property.listing_type]}
          </Badge>
          <span className="text-xs text-sand-600">
            {PROPERTY_TYPE_LABELS[property.property_type]}
          </span>
          {property.negotiable ? <Badge tone="neutral">Negotiable</Badge> : null}
          <Badge tone="navy" className="ml-auto">
            Demo listing
          </Badge>
        </div>

        <h3 className="mt-3 font-display text-lg leading-snug text-navy-900">
          <Link
            href={`/property/${property.reference_code}`}
            className="after:absolute after:inset-0 after:content-[''] hover:text-navy-700"
          >
            {property.title}
          </Link>
        </h3>

        <p className="mt-1.5 text-sm text-sand-600">
          {property.locality}, {property.city}
        </p>

        {property.headline ? (
          <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-sand-700">
            {property.headline}
          </p>
        ) : null}

        <div className="mt-5 flex items-end justify-between gap-3 border-t border-sand-200 pt-4">
          <p className="font-display text-xl text-navy-900">
            {formatPrice(property.price, property.currency)}
            <span className="ml-1 text-sm font-sans font-normal text-sand-600">
              {pricePeriodSuffix(property.price_period)}
            </span>
          </p>
          {facts.length ? (
            <p className="text-xs text-sand-600">{facts.join(" · ")}</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}