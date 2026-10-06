-- =============================================================================
-- PropFlow 0007 — the public listing filter becomes a Rent / Buy facet.
--
-- Why this file exists:
--   0002's api_public_properties() took a single p_listing_type. The stored enum
--   has three members — rent, sale, resale — so the public filter had three
--   buttons, and "Buy" matched only `sale`. A visitor looking to buy a home was
--   shown a "Resale" button beside "Buy", which reads as though resale were a
--   different market, and homes bought from a previous owner were one click away
--   from being missed.
--
--   The stored types are kept, because staff and reporting still distinguish a
--   developer sale from a resale. Only the public choice changes: "Buy" now covers
--   both purchase subtypes.
--
-- This is an additive migration. It does not edit 0001-0006, so an installation
-- that already applied them can run this file on its own.
--
-- Apply with:  supabase db push        (or paste into the SQL editor)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- The new signature takes an array. Postgres identifies a function by its
-- argument types, so this is a different function from the 0002 one and the old
-- signature is dropped explicitly rather than left behind as a second overload
-- that would still quietly accept a single subtype.
--
-- Everything else about the function — the approved column list, the
-- publication predicate, the ordering, the limits — is reproduced verbatim from
-- 0002 so this migration changes the filter and nothing else.
--
-- Dropping the old signature is safe because the only caller is
-- src/lib/data/public.ts, updated in the same change to send p_listing_types.
-- Anything still calling the old signature fails loudly at call time rather than
-- silently returning the wrong rows.
-- -----------------------------------------------------------------------------
drop function if exists public.api_public_properties(
  p_reference text, p_search text, p_listing_type public.listing_type,
  p_property_type public.property_type, p_locality text, p_city text,
  p_bedrooms_min integer, p_price_min numeric, p_price_max numeric,
  p_sort text, p_limit integer, p_offset integer
);

create function public.api_public_properties(
  p_reference      text default null,
  p_search         text default null,
  p_listing_types  public.listing_type[] default null,
  p_property_type  public.property_type default null,
  p_locality       text default null,
  p_city           text default null,
  p_bedrooms_min   integer default null,
  p_price_min      numeric default null,
  p_price_max      numeric default null,
  p_sort           text default 'newest',
  p_limit          integer default 24,
  p_offset         integer default 0
)
returns table (
  id               uuid,
  reference_code   text,
  title            text,
  headline         text,
  description      text,
  listing_type     public.listing_type,
  property_type    public.property_type,
  price            numeric,
  currency         text,
  price_period     text,
  negotiable       boolean,
  city             text,
  locality         text,
  bedrooms         integer,
  bathrooms        integer,
  area_value       numeric,
  area_unit        text,
  furnishing       text,
  amenities        text[],
  map_link         text,
  year_built       integer,
  is_available     boolean,
  published_at     timestamptz,
  images           jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pr.id,
    pr.reference_code,
    pr.title,
    pr.headline,
    pr.description,
    pr.listing_type,
    pr.property_type,
    pr.price,
    pr.currency,
    pr.price_period,
    pr.negotiable,
    pr.city,
    pr.locality,
    pr.bedrooms,
    pr.bathrooms,
    pr.area_value,
    pr.area_unit,
    pr.furnishing,
    pr.amenities,
    pr.map_link,
    pr.year_built,
    pr.is_available,
    pr.published_at,
    coalesce(img.images, '[]'::jsonb) as images
  from public.properties pr
  join public.tenants t
    on t.id = pr.tenant_id
   and t.public_site_enabled
  left join lateral (
    select jsonb_agg(
              jsonb_build_object('path', pi.storage_path, 'alt', pi.alt_text)
              order by pi.sort_order, pi.created_at
            ) as images
    from public.property_images pi
    where pi.property_id = pr.id
      and pi.tenant_id = pr.tenant_id
  ) img on true
  where pr.status = 'published'
    and pr.is_available
    and (p_reference is null or pr.reference_code = upper(btrim(p_reference)))
    and (p_search is null
         or pr.search_blob like '%' || lower(btrim(p_search)) || '%')
    /*
     * The facet filter. NULL or an empty array means "no listing-type filter",
     * which is what the application sends when no facet is selected. A NULL member
     * inside the array never matches, because `= any()` is strict, so a malformed
     * array narrows the result rather than widening it.
     */
    and (
      p_listing_types is null
      or cardinality(p_listing_types) = 0
      or pr.listing_type = any (p_listing_types)
    )
    and (p_property_type is null or pr.property_type = p_property_type)
    and (p_locality is null or lower(pr.locality) = lower(btrim(p_locality)))
    and (p_city is null or lower(pr.city) = lower(btrim(p_city)))
    and (p_bedrooms_min is null or coalesce(pr.bedrooms, 0) >= p_bedrooms_min)
    and (p_price_min is null or pr.price >= p_price_min)
    and (p_price_max is null or pr.price <= p_price_max)
  order by
    case when p_sort = 'price_asc' then pr.price end asc nulls last,
    case when p_sort = 'price_desc' then pr.price end desc nulls last,
    case when p_sort = 'locality' then pr.locality end asc nulls last,
    pr.published_at desc nulls last,
    pr.reference_code asc
  limit least(greatest(coalesce(p_limit, 24), 1), 60)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

comment on function public.api_public_properties(
  p_reference text, p_search text, p_listing_types public.listing_type[],
  p_property_type public.property_type, p_locality text, p_city text,
  p_bedrooms_min integer, p_price_min numeric, p_price_max numeric,
  p_sort text, p_limit integer, p_offset integer
) is
  'Approved public listing fields for published + available listings only. '
  'Never returns private_address, internal_notes, owner_name or tenant_id. '
  'p_listing_types is the public Rent/Buy facet expanded to stored subtypes: '
  'ARRAY[''rent''] for Rent, ARRAY[''sale'',''resale''] for Buy, NULL for all.';

-- -----------------------------------------------------------------------------
-- Grants follow the new signature. Both steps are required: CREATE FUNCTION
-- grants EXECUTE to PUBLIC by default, so the revoke has to come first or anon
-- would inherit access to a function nobody intended to expose.
-- -----------------------------------------------------------------------------
revoke execute on function public.api_public_properties(
  p_reference text, p_search text, p_listing_types public.listing_type[],
  p_property_type public.property_type, p_locality text, p_city text,
  p_bedrooms_min integer, p_price_min numeric, p_price_max numeric,
  p_sort text, p_limit integer, p_offset integer
) from public;

grant execute on function public.api_public_properties(
  p_reference text, p_search text, p_listing_types public.listing_type[],
  p_property_type public.property_type, p_locality text, p_city text,
  p_bedrooms_min integer, p_price_min numeric, p_price_max numeric,
  p_sort text, p_limit integer, p_offset integer
) to anon, authenticated, service_role;