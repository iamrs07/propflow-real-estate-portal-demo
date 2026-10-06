import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin, requireSessionProfile } from "@/lib/auth";
import { getStaffProperty, listLeads } from "@/lib/data/crm";
import {
  LISTING_TYPE_LABELS,
  PROPERTY_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
} from "@/lib/domain";
import { propertyStatusTone } from "@/lib/status-tone";
import { formatArea, formatDate, formatPrice, pricePeriodSuffix } from "@/lib/format";
import { isDemoMode } from "@/lib/env";
import { updateProperty } from "@/server/actions/properties";
import { Badge, Card, DetailRow, EmptyState } from "@/components/ui";
import { PropertyForm } from "@/components/property-form";
import {
  AvailabilityControl,
  ImageManager,
  PropertyStatusControl,
} from "@/components/property-images";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Listing" };

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireSessionProfile();
  const admin = isAdmin(profile);

  const property = await getStaffProperty(profile, id);
  if (!property) notFound();

  const linkedLeads = await listLeads(profile);

  return (
    <div className="space-y-8">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link
          href="/crm/properties"
          className="text-sand-600 underline-offset-4 hover:text-navy-900 hover:underline"
        >
          Listings
        </Link>
        <span aria-hidden="true" className="mx-2 text-sand-400">
          /
        </span>
        <span className="text-navy-900">{property.reference_code}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl text-navy-900">{property.title}</h1>
            <Badge tone={propertyStatusTone(property.status)}>
              {PROPERTY_STATUS_LABELS[property.status]}
            </Badge>
            {!property.is_available ? <Badge tone="neutral">Unavailable</Badge> : null}
          </div>
          <p className="mt-2 text-sm text-sand-600">
            {property.reference_code} ·{" "}
            {formatPrice(property.price, property.currency)}
            {pricePeriodSuffix(property.price_period)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {property.status === "published" && property.is_available ? (
            <Link
              href={`/property/${property.reference_code}`}
              className="rounded-md border border-navy-300 bg-white px-4 py-2 text-sm font-medium text-navy-900 transition-colors hover:border-navy-500"
            >
              View public page
            </Link>
          ) : (
            <span className="rounded-md border border-sand-300 bg-sand-100 px-4 py-2 text-sm text-sand-600">
              Not visible on the public site
            </span>
          )}
        </div>
      </header>

      {property.status === "draft" ? (
        <EmptyState
          title="This listing is a draft"
          description="Only published, available listings appear on the public site. Publish it when the photographs are in and the details are final."
        />
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1.45fr_1fr]">
        <div className="space-y-8">
          <section aria-labelledby="edit-heading">
            <h2 id="edit-heading" className="font-display text-xl text-navy-900">
              {admin ? "Edit listing" : "Listing details"}
            </h2>
            {admin ? (
              <div className="mt-5">
                <PropertyForm action={updateProperty} property={property} />
              </div>
            ) : (
              <Card className="mt-5 p-6">
                <dl className="divide-y divide-sand-200">
                  <DetailRow label="Headline">{property.headline ?? "—"}</DetailRow>
                  <DetailRow label="Type">
                    {PROPERTY_TYPE_LABELS[property.property_type]} ·{" "}
                    {LISTING_TYPE_LABELS[property.listing_type]}
                  </DetailRow>
                  <DetailRow label="Location">
                    {property.locality}, {property.city}
                  </DetailRow>
                  <DetailRow label="Private address">
                    {property.private_address ?? "—"}
                  </DetailRow>
                  <DetailRow label="Area">
                    {formatArea(property.area_value, property.area_unit) ?? "—"}
                  </DetailRow>
                </dl>
                <p className="mt-4 text-xs text-sand-600">
                  Agents can read listings but only an administrator can change them.
                </p>
              </Card>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          {admin ? (
            <Card className="p-5">
              <h2 className="font-display text-lg text-navy-900">Visibility</h2>
              <div className="mt-3 space-y-5">
                <PropertyStatusControl propertyId={property.id} status={property.status} />
                <div className="border-t border-sand-200 pt-4">
                  <AvailabilityControl
                    propertyId={property.id}
                    isAvailable={property.is_available}
                  />
                </div>
              </div>
            </Card>
          ) : null}

          <Card className="p-5">
            <h2 className="font-display text-lg text-navy-900">Internal record</h2>
            <dl className="mt-2 divide-y divide-sand-200">
              <DetailRow label="Owner">{property.owner_name ?? "—"}</DetailRow>
              <DetailRow label="Private address">{property.private_address ?? "—"}</DetailRow>
              <DetailRow label="Created">{formatDate(property.created_at)}</DetailRow>
              <DetailRow label="Updated">{formatDate(property.updated_at)}</DetailRow>
              <DetailRow label="Published">
                {property.published_at ? formatDate(property.published_at) : "Not yet"}
              </DetailRow>
            </dl>
            {property.internal_notes ? (
              <div className="mt-4 rounded-md bg-sand-100 px-3 py-3">
                <p className="text-xs font-medium tracking-wide text-sand-600 uppercase">
                  Internal notes
                </p>
                <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-sand-700">
                  {property.internal_notes}
                </p>
              </div>
            ) : null}
          </Card>

          {admin ? (
            <Card className="p-5">
              <ImageManager
                propertyId={property.id}
                images={property.images}
                demoMode={isDemoMode()}
              />
            </Card>
          ) : null}

          <Card className="p-5">
            <h2 className="font-display text-lg text-navy-900">Enquiries</h2>
            {linkedLeads.filter((lead) => lead.property_id === property.id).length === 0 ? (
              <p className="mt-2 text-sm text-sand-600">No enquiries for this listing yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {linkedLeads
                  .filter((lead) => lead.property_id === property.id)
                  .map((lead) => (
                    <li key={lead.id}>
                      <Link
                        href={`/crm/leads/${lead.id}`}
                        className="text-sm text-navy-800 underline underline-offset-4"
                      >
                        {lead.full_name}
                      </Link>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}