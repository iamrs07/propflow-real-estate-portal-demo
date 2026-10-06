-- =============================================================================
-- PropFlow 0002 — public read RPCs, public enquiry RPC, storage bucket
--
-- The `properties` table holds the private address, owner name and internal
-- notes, so it is never granted to `anon`. Anonymous visitors read listings
-- through api_public_properties(), which is SECURITY DEFINER and therefore
-- deliberately bypasses RLS — which is exactly why it is written to select an
-- explicit, approved column list and to filter on
--     status = 'published' AND is_available AND tenant.public_site_enabled
-- and nothing else.
--
-- Verified against PostgreSQL 15+ semantics: these are plain functions, not a
-- view, so no `security_invoker` / view-owner RLS interaction applies. RLS on
-- `properties` still governs every staff session.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Public agency branding (safe fields only; never exposes tenant id or slugs of
-- other brokerages — the partial unique index guarantees a single public site).
-- -----------------------------------------------------------------------------
create or replace function public.api_public_agency()
returns table (
  slug                 text,
  name                 text,
  tagline              text,
  about                text,
  phone                text,
  whatsapp             text,
  email                text,
  office_address       text,
  service_areas        text[],
  map_link             text,
  privacy_contact_email text,
  privacy_notes        text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.slug, t.name, t.tagline, t.about, t.phone, t.whatsapp, t.email,
    t.office_address, t.service_areas, t.map_link,
    t.privacy_contact_email, t.privacy_notes
  from public.tenants t
  where t.public_site_enabled
  limit 1
$$;

comment on function public.api_public_agency() is
  'Public branding subset for the single brokerage that serves the public site.';

-- -----------------------------------------------------------------------------
-- Public listings. Returns only published + available listings of the brokerage
-- with public_site_enabled = true, with an aggregated image array.
-- -----------------------------------------------------------------------------
create or replace function public.api_public_properties(
  p_reference      text default null,
  p_search         text default null,
  p_listing_type   public.listing_type default null,
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
    and (p_listing_type is null or pr.listing_type = p_listing_type)
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
  p_reference text, p_search text, p_listing_type public.listing_type,
  p_property_type public.property_type, p_locality text, p_city text,
  p_bedrooms_min integer, p_price_min numeric, p_price_max numeric,
  p_sort text, p_limit integer, p_offset integer
) is
  'Approved public listing fields for published + available listings only. '
  'Never returns private_address, internal_notes, owner_name or tenant_id.';

-- -----------------------------------------------------------------------------
-- Public enquiry / visit request.
--
-- Security properties, enforced inside the function:
--   * tenant is resolved server-side from the public site, never from a
--     client-supplied tenant id;
--   * `assigned_to`, `status` and `source` are not parameters — assignment and
--     status can only be set later by authenticated staff;
--   * `status` is hard-coded to 'new';
--   * the optional property must belong to that tenant and be publicly
--     published and available;
--   * per-fingerprint hourly throttle plus a form freshness window;
--   * returns only the new row id, which the server action discards.
-- -----------------------------------------------------------------------------
create or replace function public.submit_public_enquiry(
  p_tenant_slug          text,
  p_property_reference   text,
  p_full_name            text,
  p_phone                text,
  p_email                text,
  p_message              text,
  p_preferred_contact    public.contact_preference,
  p_preferred_visit_at   timestamptz,
  p_source               public.lead_source,
  p_fingerprint          text,
  p_signed_at            timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant   public.tenants;
  v_property public.properties;
  v_lead_id  uuid;
  v_seen     integer;
begin
  if p_source is null
     or p_source not in ('property_form'::public.lead_source, 'contact_form'::public.lead_source) then
    raise exception 'unsupported enquiry source' using errcode = '22023';
  end if;

  if p_fingerprint is null or char_length(p_fingerprint) < 16 or char_length(p_fingerprint) > 128 then
    raise exception 'invalid rate-limit fingerprint' using errcode = '22023';
  end if;

  select * into v_tenant
  from public.tenants
  where slug = btrim(p_tenant_slug)
    and public_site_enabled;

  if not found then
    raise exception 'agency unavailable' using errcode = '22023';
  end if;

  -- Freshness window: rejects replayed or machine-forged submissions.
  if p_signed_at is null
     or p_signed_at > now() + interval '5 minutes'
     or p_signed_at < now() - interval '2 hours' then
    raise exception 'stale form submission' using errcode = '22023';
  end if;

  select count(*) into v_seen
  from public.enquiry_throttles t
  where t.tenant_id = v_tenant.id
    and t.fingerprint = p_fingerprint
    and t.created_at > now() - interval '1 hour';

  if v_seen >= 5 then
    raise exception 'too many submissions from this device' using errcode = '57014';
  end if;

  if p_property_reference is not null and btrim(p_property_reference) <> '' then
    select * into v_property
    from public.properties
    where tenant_id = v_tenant.id
      and reference_code = upper(btrim(p_property_reference))
      and status = 'published'
      and is_available;

    if not found then
      raise exception 'listing unavailable' using errcode = '22023';
    end if;
  end if;

  insert into public.leads (
    tenant_id, property_id, full_name, phone, email, message,
    source, status, preferred_contact, preferred_visit_at, consent_at
  ) values (
    v_tenant.id,
    v_property.id,
    btrim(p_full_name),
    btrim(p_phone),
    nullif(btrim(coalesce(p_email, '')), ''),
    nullif(btrim(coalesce(p_message, '')), ''),
    p_source,
    'new',
    coalesce(p_preferred_contact, 'phone'::public.contact_preference),
    p_preferred_visit_at,
    now()
  ) returning id into v_lead_id;

  insert into public.enquiry_throttles (tenant_id, fingerprint)
  values (v_tenant.id, p_fingerprint);

  -- Cheap opportunistic pruning; keeps the throttle table small without a
  -- scheduled job.
  if random() < 0.05 then
    delete from public.enquiry_throttles
    where created_at < now() - interval '2 days';
  end if;

  return v_lead_id;
end;
$$;

comment on function public.submit_public_enquiry(
  p_tenant_slug text, p_property_reference text, p_full_name text,
  p_phone text, p_email text, p_message text,
  p_preferred_contact public.contact_preference,
  p_preferred_visit_at timestamptz, p_source public.lead_source,
  p_fingerprint text, p_signed_at timestamptz
) is
  'Server-controlled public enquiry intake. Binds tenant server-side, forces '
  'status=new, and exposes no assignment input.';

-- =============================================================================
-- Storage: one private bucket for listing photography.
--
-- The bucket is private: 0002 originally created it public, which left draft and
-- sold listings fetchable by anyone who could name the object. 0005 drops that
-- flag; the `false` below means a fresh database is correct from the start.
-- Images reach a browser only through the server-authorized /listing-image
-- route, which re-checks publication state per request.
--
-- Writes require an authenticated admin of the tenant that owns the first path
-- segment: "<tenant_id>/<property_id>/<uuid>.<ext>". No anonymous read policy
-- exists, and because the bucket is private, Supabase Storage's own public URL
-- endpoint serves nothing to anon.
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property-images', 'property-images', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy property_images_storage_read
  on storage.objects for select to authenticated
  using (
    bucket_id = 'property-images'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

create policy property_images_admin_write
  on storage.objects for all to authenticated
  using (
    bucket_id = 'property-images'
    and public.is_tenant_admin()
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  )
  with check (
    bucket_id = 'property-images'
    and public.is_tenant_admin()
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

create policy property_images_admin_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'property-images'
    and public.is_tenant_admin()
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );