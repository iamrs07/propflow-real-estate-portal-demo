import "server-only";
import type { Agency, PropertyFilters, PublicProperty } from "@/lib/data/types";
import { isDemoMode } from "@/lib/env";
import { demoState } from "@/lib/data/demo/store";
import { toPublicProperty } from "@/lib/data/demo/fixtures";
import { listingTypesForFacet } from "@/lib/validation";
import { serverClient } from "@/lib/supabase/server";

/**
 * Public read path.
 *
 * Anonymous users only ever reach data through api_public_agency() and
 * api_public_properties(). The `properties` table itself is not readable by the
 * anon role, so there is no way to select `private_address`,
 * `internal_notes`, `owner_name` or `tenant_id` from the browser.
 */

/**
 * The RPCs are plain SQL functions, so the SDK cannot infer their return type.
 * These aliases name exactly the columns 0002_public_api_and_storage.sql emits —
 * if that migration changes, the compiler says so here.
 */
type AgencyRow = Agency;
type ListingRow = PublicProperty;

/** Postgres `numeric` arrives as a string over PostgREST. */
function normalise(row: Partial<ListingRow>): ListingRow {
  return {
    ...(row as ListingRow),
    price: Number(row.price ?? 0),
    area_value: row.area_value === null ? null : Number(row.area_value),
    bedrooms: row.bedrooms === null ? null : Number(row.bedrooms),
    bathrooms: row.bathrooms === null ? null : Number(row.bathrooms),
    year_built: row.year_built === null ? null : Number(row.year_built),
    amenities: Array.isArray(row.amenities) ? row.amenities : [],
    images: Array.isArray(row.images) ? row.images : [],
  };
}

export async function getAgency(): Promise<Agency | null> {
  if (isDemoMode()) return demoState().agency;

  const supabase = await serverClient();
  const { data, error } = await supabase.rpc("api_public_agency").maybeSingle();
  if (error || !data) return null;

  const row = data as AgencyRow;
  return {
    ...row,
    service_areas: Array.isArray(row.service_areas) ? row.service_areas : [],
  };
}

export async function listPublicProperties(
  filters: PropertyFilters = {},
): Promise<PublicProperty[]> {
  if (isDemoMode()) return demoList(filters);

  const supabase = await serverClient();
  // Only enum members taken from LISTING_FACET_TYPES ever reach Postgres: an
  // empty array means "no listing-type filter", never an empty-string cast.
  const listingTypes = listingTypesForFacet(filters.listingFacet);

  const { data, error } = await supabase.rpc("api_public_properties", {
    p_reference: filters.search ? undefined : null,
    p_search: filters.search || null,
    p_listing_types: listingTypes.length > 0 ? listingTypes : null,
    p_property_type: (filters.propertyType as never) ?? null,
    p_locality: filters.locality ?? null,
    p_city: filters.city ?? null,
    p_bedrooms_min: filters.bedroomsMin ?? null,
    p_price_min: filters.priceMin ?? null,
    p_price_max: filters.priceMax ?? null,
    p_sort: filters.sort ?? "newest",
    p_limit: filters.limit ?? 24,
    p_offset: filters.offset ?? 0,
  });

  if (error) {
    // Never surface the database message on a public page.
    console.error("[propflow] public listing query failed", error.code ?? "unknown");
    return [];
  }

  return ((data ?? []) as Partial<ListingRow>[]).map(normalise);
}

export async function getPublicProperty(
  reference: string,
): Promise<PublicProperty | null> {
  if (isDemoMode()) {
    const found = demoList({}).find((p) => p.reference_code === reference.toUpperCase());
    return found ?? null;
  }

  const supabase = await serverClient();
  const { data, error } = await supabase.rpc("api_public_properties", {
    p_reference: reference.toUpperCase(),
    p_limit: 1,
  });

  if (error || !data || data.length === 0) return null;
  return normalise(data[0] as Partial<ListingRow>);
}

export async function getFeaturedProperties(limit = 3): Promise<PublicProperty[]> {
  return listPublicProperties({ sort: "newest", limit });
}

export interface FilterOptions {
  localities: string[];
  cities: string[];
}

/**
 * Derived from the public listing set rather than a separate table, so the
 * dropdown can never offer a locality that has no visible listing.
 */
export async function getFilterOptions(): Promise<FilterOptions> {
  const listings = await listPublicProperties({ limit: 60 });
  const localities = new Set<string>();
  const cities = new Set<string>();
  for (const listing of listings) {
    localities.add(listing.locality);
    cities.add(listing.city);
  }
  return {
    localities: [...localities].sort((a, b) => a.localeCompare(b)),
    cities: [...cities].sort((a, b) => a.localeCompare(b)),
  };
}

function demoList(filters: PropertyFilters): PublicProperty[] {
  const state = demoState();
  const search = filters.search?.trim().toLowerCase();
  const bedroomMin = filters.bedroomsMin ?? null;
  const priceMin = filters.priceMin ?? null;
  const priceMax = filters.priceMax ?? null;
  // Same facet expansion the RPC performs, so demo and configured modes agree.
  const listingTypes = listingTypesForFacet(filters.listingFacet);

  const rows = state.properties
    // The same predicate the RPC enforces.
    .filter((p) => p.status === "published" && p.is_available)
    .map(toPublicProperty)
    .filter((p) => {
      if (listingTypes.length > 0 && !listingTypes.includes(p.listing_type)) return false;
      if (filters.propertyType && p.property_type !== filters.propertyType) return false;
      if (filters.locality && p.locality.toLowerCase() !== filters.locality.toLowerCase()) {
        return false;
      }
      if (filters.city && p.city.toLowerCase() !== filters.city.toLowerCase()) return false;
      if (bedroomMin !== null && (p.bedrooms ?? 0) < bedroomMin) return false;
      if (priceMin !== null && p.price < priceMin) return false;
      if (priceMax !== null && p.price > priceMax) return false;
      if (search) {
        const haystack = `${p.reference_code} ${p.title} ${p.headline ?? ""} ${p.locality} ${p.city}`;
        if (!haystack.toLowerCase().includes(search)) return false;
      }
      return true;
    });

  const sorted = [...rows];
  switch (filters.sort) {
    case "price_asc":
      sorted.sort((a, b) => a.price - b.price);
      break;
    case "price_desc":
      sorted.sort((a, b) => b.price - a.price);
      break;
    case "locality":
      sorted.sort((a, b) => a.locality.localeCompare(b.locality));
      break;
    default:
      sorted.sort(
        (a, b) =>
          new Date(b.published_at ?? 0).getTime() - new Date(a.published_at ?? 0).getTime(),
      );
  }

  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? 24;
  return sorted.slice(offset, offset + limit);
}