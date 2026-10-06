import type { Metadata } from "next";
import Link from "next/link";
import { isAdmin, requireSessionProfile } from "@/lib/auth";
import { listStaffProperties } from "@/lib/data/crm";
import {
  LISTING_TYPE_LABELS,
  PROPERTY_STATUSES,
  PROPERTY_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
} from "@/lib/domain";
import { propertyStatusTone } from "@/lib/status-tone";
import { formatDate, formatPrice } from "@/lib/format";
import { Badge, Card, EmptyState, LinkButton, cx } from "@/components/ui";
import { PropertyThumb } from "@/components/property-photo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Listings" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await requireSessionProfile();
  const admin = isAdmin(profile);
  const params = await searchParams;

  const rawStatus = Array.isArray(params.status) ? params.status[0] : params.status;
  const status =
    rawStatus && PROPERTY_STATUSES.includes(rawStatus as (typeof PROPERTY_STATUSES)[number])
      ? rawStatus
      : null;

  const properties = await listStaffProperties(profile, status);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-navy-900">Listings</h1>
          <p className="mt-2 text-[15px] text-sand-700">
            Draft and archived listings never appear on the public site.
          </p>
        </div>
        {admin ? <LinkButton href="/crm/properties/new">New listing</LinkButton> : null}
      </header>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        <FilterLink href="/crm/properties" active={!status}>
          All ({properties.length})
        </FilterLink>
        {PROPERTY_STATUSES.map((value) => (
          <FilterLink
            key={value}
            href={`/crm/properties?status=${value}`}
            active={status === value}
          >
            {PROPERTY_STATUS_LABELS[value]}
          </FilterLink>
        ))}
      </nav>

      {properties.length === 0 ? (
        <EmptyState
          title="No listings here"
          description={
            admin
              ? "Create a listing, add photographs, then publish it to put it on the public site."
              : "No listings to show."
          }
          action={
            admin ? <LinkButton href="/crm/properties/new">Create the first listing</LinkButton> : undefined
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {properties.map((property) => (
            <li key={property.id}>
              <Card
                className={cx(
                  "flex h-full gap-4 p-4 transition-colors hover:border-navy-300",
                  property.status === "draft" && "border-l-2 border-l-gold-500",
                  property.status === "archived" && "opacity-75",
                )}
              >
                <PropertyThumb
                  path={property.images[0]?.path}
                  alt={property.title}
                  className="h-24 w-24 shrink-0 rounded-md"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={propertyStatusTone(property.status)}>
                      {PROPERTY_STATUS_LABELS[property.status]}
                    </Badge>
                    {!property.is_available ? <Badge tone="neutral">Unavailable</Badge> : null}
                    <span className="text-xs text-sand-600">{property.reference_code}</span>
                  </div>

                  <h2 className="mt-2 font-display text-lg leading-snug text-navy-900">
                    <Link
                      href={`/crm/properties/${property.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {property.title}
                    </Link>
                  </h2>

                  <p className="mt-1 text-sm text-sand-600">
                    {PROPERTY_TYPE_LABELS[property.property_type]} ·{" "}
                    {LISTING_TYPE_LABELS[property.listing_type]} · {property.locality},{" "}
                    {property.city}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-navy-900">
                      {formatPrice(property.price, property.currency)}
                    </p>
                    <p className="text-xs text-sand-600">
                      {property.status === "published"
                        ? `Published ${formatDate(property.published_at)}`
                        : `Created ${formatDate(property.created_at)}`}
                    </p>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "rounded-full border px-4 py-1.5 text-sm transition-colors",
        active
          ? "border-navy-900 bg-navy-900 text-white"
          : "border-sand-300 bg-white text-navy-800 hover:border-navy-400",
      )}
    >
      {children}
    </Link>
  );
}