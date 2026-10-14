import type { Metadata } from "next";
import { Suspense } from "react";
import { getFilterOptions, listPublicProperties } from "@/lib/data/public";
import type { PropertyFilters } from "@/lib/data/types";
import { listingFacetFromQuery } from "@/lib/validation";
import { PropertyCard } from "@/components/property-card";
import { PropertyFilters as Filters } from "@/components/property-filters";
import ListingSkeleton from "@/components/listing-skeleton";
import { EmptyState, LinkButton } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Homes for rent and sale",
  description: "Published and available listings from our brokerage, with filters for area, type and price.",
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** Query-string values are attacker-controlled; everything is range-checked here. */
function text(value: string | null, max: number): string | null {
  const trimmed = (value ?? "").trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : null;
}

/** Whole numbers only, and only inside a plausible band. */
function integer(value: string | null, max: number): number | null {
  return value && /^\d{1,9}$/.test(value) ? Math.min(Number(value), max) : null;
}

function parseFilters(params: SearchParams): PropertyFilters {
  const sort = first(params.sort);

  return {
    search: text(first(params.search), 80),
    // "rent" | "buy", with legacy "sale"/"resale" folded into "buy".
    listingFacet: listingFacetFromQuery(params.listingType),
    propertyType: text(first(params.propertyType), 40),
    locality: text(first(params.locality), 120),
    city: text(first(params.city), 80),
    bedroomsMin: integer(first(params.bedroomsMin), 20),
    priceMax: integer(first(params.priceMax), 999_999_999),
    priceMin: integer(first(params.priceMin), 999_999_999),
    sort: ["newest", "price_asc", "price_desc", "locality"].includes(sort ?? "")
      ? (sort as string)
      : "newest",
    limit: 60,
  };
}

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <Suspense fallback={<ListingSkeleton />}>
      <Results searchParams={searchParams} />
    </Suspense>
  );
}

async function Results({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const filters = parseFilters(params);

  const [properties, options] = await Promise.all([
    listPublicProperties(filters),
    getFilterOptions(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="max-w-2xl">
        <p className="text-xs font-semibold tracking-[0.2em] text-gold-600 uppercase">
          Listings
        </p>
        <h1 className="mt-3 font-display text-3xl text-navy-900 sm:text-4xl">
          Homes for rent and sale
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-sand-700">
          Only published, currently available homes in Mumbai appear here. Draft and archived
          listings never leave the office.
        </p>
      </header>

      <div className="mt-8">
        <Filters filters={filters} options={options} resultCount={properties.length} />
      </div>

      <div className="mt-10">
        {properties.length === 0 ? (
          <EmptyState
            title="No Mumbai homes match those filters"
            description="Try widening the price range, choosing a different Mumbai locality, or clearing the keyword. All demo listings are in Mumbai City and Mumbai Suburban."
            action={<LinkButton href="/properties">Clear all filters</LinkButton>}
          />
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((property, index) => (
              <li key={property.id}>
                <PropertyCard property={property} priority={index < 3} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}