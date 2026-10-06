import Link from "next/link";
import type { PropertyFilters } from "@/lib/data/types";
import {
  BEDROOM_CHOICES,
  LISTING_FACETS,
  LISTING_FACET_LABELS,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  SORT_OPTIONS,
} from "@/lib/domain";
import type { FilterOptions } from "@/lib/data/public";
import { Button, Input, Labeled, Select, cx } from "@/components/ui";

/**
 * Listing filters.
 *
 * A plain GET form: it works with JavaScript disabled, is keyboard
 * navigable end to end, and keeps the current filter state in the URL so a
 * search can be shared or bookmarked.
 */
export function PropertyFilters({
  filters,
  options,
  resultCount,
}: {
  filters: PropertyFilters;
  options: FilterOptions;
  resultCount: number;
}) {
  const hasFilters = Boolean(
    filters.search ||
      filters.listingFacet ||
      filters.propertyType ||
      filters.locality ||
      filters.city ||
      filters.bedroomsMin ||
      filters.priceMin ||
      filters.priceMax,
  );

  return (
    <form
      action="/properties"
      method="get"
      className="rounded-lg border border-sand-300 bg-white p-5 shadow-card"
      aria-label="Filter listings"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Labeled label="Keyword" htmlFor="f-search" className="lg:col-span-2">
          <Input
            id="f-search"
            name="search"
            type="search"
            placeholder="Locality, building or reference code"
            defaultValue={filters.search ?? ""}
            maxLength={80}
          />
        </Labeled>

        <Labeled label="Listing type" htmlFor="f-listing">
          <Select id="f-listing" name="listingType" defaultValue={filters.listingFacet ?? ""}>
            <option value="">Rent or buy</option>
            {LISTING_FACETS.map((facet) => (
              <option key={facet} value={facet}>
                {LISTING_FACET_LABELS[facet]}
              </option>
            ))}
          </Select>
        </Labeled>

        <Labeled label="Property type" htmlFor="f-type">
          <Select id="f-type" name="propertyType" defaultValue={filters.propertyType ?? ""}>
            <option value="">Any type</option>
            {PROPERTY_TYPES.map((type) => (
              <option key={type} value={type}>
                {PROPERTY_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Labeled>

        <Labeled label="City" htmlFor="f-city">
          <Select id="f-city" name="city" defaultValue={filters.city ?? ""}>
            <option value="">All cities</option>
            {options.cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </Select>
        </Labeled>

        <Labeled label="Locality" htmlFor="f-locality">
          <Select id="f-locality" name="locality" defaultValue={filters.locality ?? ""}>
            <option value="">All localities</option>
            {options.localities.map((locality) => (
              <option key={locality} value={locality}>
                {locality}
              </option>
            ))}
          </Select>
        </Labeled>

        <Labeled label="Bedrooms" htmlFor="f-beds">
          <Select
            id="f-beds"
            name="bedroomsMin"
            defaultValue={filters.bedroomsMin ? String(filters.bedroomsMin) : ""}
          >
            <option value="">Any</option>
            {BEDROOM_CHOICES.map((count) => (
              <option key={count} value={count}>
                {count}+ bedrooms
              </option>
            ))}
          </Select>
        </Labeled>

        <Labeled label="Maximum price" htmlFor="f-price">
          <Input
            id="f-price"
            name="priceMax"
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            placeholder="No maximum"
            defaultValue={filters.priceMax ?? ""}
          />
        </Labeled>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-sand-200 pt-4">
        <div className="flex flex-wrap items-end gap-3">
          <Labeled label="Sort by" htmlFor="f-sort" className="w-56">
            <Select id="f-sort" name="sort" defaultValue={filters.sort ?? "newest"}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Labeled>
          <p className={cx("pb-2.5 text-sm text-sand-600", "tabular-nums")}>
            {resultCount === 1 ? "1 home" : `${resultCount} homes`}
          </p>
        </div>

        <div className="flex items-center gap-2 pb-0.5">
          {hasFilters ? (
            <Link
              href="/properties"
              className="rounded-md px-3 py-2 text-sm text-sand-700 transition-colors hover:bg-sand-200 hover:text-navy-900"
            >
              Clear filters
            </Link>
          ) : null}
          <Button type="submit" size="md">
            Apply filters
          </Button>
        </div>
      </div>
    </form>
  );
}