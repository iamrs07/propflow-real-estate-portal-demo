-- =============================================================================
-- PropFlow 0001 — core schema
-- Single-brokerage installation with tenant_id on every brokerage-owned record.
-- All identifiers are UUIDs. All cross-table references are composite on
-- (tenant_id, id) so a child row can never point at another tenant's parent.
-- =============================================================================

-- gen_random_uuid() is core from PostgreSQL 13 onwards; Supabase provisions
-- pgcrypto in the `extensions` schema by default, so no extension is required
-- here and nothing needs to be installed on the target project.

-- -----------------------------------------------------------------------------
-- Enumerated vocabularies. These mirror src/lib/domain.ts exactly.
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'agent');
create type public.listing_type as enum ('rent', 'sale', 'resale');
create type public.property_type as enum (
  'apartment', 'villa', 'row_house', 'plot', 'office', 'shop', 'farmhouse'
);
create type public.property_status as enum ('draft', 'published', 'archived');
create type public.lead_status as enum (
  'new', 'contacted', 'qualified', 'visit_scheduled',
  'negotiation', 'closed_won', 'closed_lost'
);
create type public.lead_source as enum (
  'property_form', 'contact_form', 'phone', 'walk_in', 'referral'
);
create type public.contact_preference as enum ('phone', 'whatsapp', 'email');
create type public.visit_status as enum ('scheduled', 'completed', 'cancelled', 'no_show');
create type public.visit_outcome as enum (
  'interested', 'offer_made', 'not_interested', 'follow_up_needed', 'no_response'
);

-- -----------------------------------------------------------------------------
-- tenants — one row per brokerage. The public site is pinned to exactly one
-- brokerage by the partial unique index at the bottom of this file.
-- -----------------------------------------------------------------------------
create table public.tenants (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique
                          check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name                  text not null
                          check (char_length(name) between 2 and 120),
  tagline               text check (tagline is null or char_length(tagline) <= 200),
  about                 text check (about is null or char_length(about) <= 4000),
  phone                 text check (phone is null or char_length(phone) <= 24),
  whatsapp              text check (whatsapp is null or char_length(whatsapp) <= 24),
  email                 text check (email is null or char_length(email) <= 254),
  office_address        text check (office_address is null or char_length(office_address) <= 400),
  privacy_contact_email text check (privacy_contact_email is null or char_length(privacy_contact_email) <= 254),
  privacy_notes         text check (privacy_notes is null or char_length(privacy_notes) <= 4000),
  map_link              text check (map_link is null or char_length(map_link) <= 500),
  service_areas         text[] not null default '{}'::text[],
  public_site_enabled   boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Exactly one brokerage may serve the public site. This makes the public
-- read RPCs (which resolve "the" tenant) unambiguous and non-negotiable.
create unique index tenants_single_public_site
  on public.tenants ((true)) where public_site_enabled;

-- -----------------------------------------------------------------------------
-- profiles — one row per staff auth user. Role/tenant come from here and from
-- nowhere else; client-supplied tenant or role values are never trusted.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  full_name  text not null check (char_length(full_name) between 2 and 120),
  role       public.app_role not null default 'agent',
  is_active  boolean not null default true,
  phone      text check (phone is null or char_length(phone) <= 24),
  title      text check (title is null or char_length(title) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create index profiles_tenant_idx on public.profiles (tenant_id) where is_active;

-- -----------------------------------------------------------------------------
-- properties — mixes public listing copy with private/operational fields.
-- The public site never reads this table directly; only the SECURITY DEFINER
-- RPCs in 0002 (listing RPC since replaced by 0007's array-filtered version)
-- expose the approved column subset.
-- -----------------------------------------------------------------------------
create table public.properties (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  reference_code   text not null check (char_length(reference_code) between 2 and 40),
  title            text not null check (char_length(title) between 3 and 160),

  -- public copy -------------------------------------------------------------
  headline         text check (headline is null or char_length(headline) <= 240),
  description      text check (description is null or char_length(description) <= 8000),

  -- classification ----------------------------------------------------------
  listing_type     public.listing_type not null,
  property_type    public.property_type not null,
  status           public.property_status not null default 'draft',
  is_available     boolean not null default true,

  -- commercial --------------------------------------------------------------
  price            numeric(14, 2) not null check (price >= 0),
  currency         text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  price_period     text not null default 'one_time'
                     check (price_period in ('month', 'year', 'one_time')),
  negotiable       boolean not null default false,

  -- location ----------------------------------------------------------------
  city             text not null check (char_length(city) between 1 and 80),
  locality         text not null check (char_length(locality) between 1 and 120),

  -- PRIVATE / INTERNAL: never selectable by an anonymous session ------------
  private_address  text check (private_address is null or char_length(private_address) <= 400),
  internal_notes   text check (internal_notes is null or char_length(internal_notes) <= 4000),
  owner_name       text check (owner_name is null or char_length(owner_name) <= 120),

  -- public map link supplied by the agency (no paid map SDK required) -------
  map_link         text check (map_link is null or char_length(map_link) <= 500),

  -- physical ----------------------------------------------------------------
  bedrooms         integer check (bedrooms between 0 and 30),
  bathrooms        integer check (bathrooms between 0 and 30),
  area_value       numeric(12, 2) check (area_value > 0),
  area_unit        text check (area_unit in ('sqft', 'sqm', 'acre')),
  furnishing       text check (furnishing in ('unfurnished', 'semi_furnished', 'furnished')),
  amenities        text[] not null default '{}'::text[],
  year_built       integer check (year_built between 1900 and 2100),

  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Lowercased haystack for the public keyword search. Generated so it can
  -- never drift from the fields it is derived from.
  search_blob text generated always as (
    lower(
      coalesce(reference_code, '') || ' ' ||
      coalesce(title, '') || ' ' ||
      coalesce(headline, '') || ' ' ||
      coalesce(locality, '') || ' ' ||
      coalesce(city, '')
    )
  ) stored,

  unique (tenant_id, reference_code),
  unique (tenant_id, id)
);

-- `status` and `is_available` are deliberately independent: a live listing can
-- stay published while is_available = false (e.g. under offer). api_public_properties()
-- therefore filters on BOTH, and unpublishing or flipping availability both
-- remove a listing from the public feed.

create index properties_tenant_status_idx on public.properties (tenant_id, status);
create index properties_tenant_listing_idx on public.properties (tenant_id, listing_type, is_available);
create index properties_public_feed_idx
  on public.properties (tenant_id, published_at desc)
  where status = 'published' and is_available;
create index properties_locality_idx on public.properties (lower(locality));
create index properties_search_idx on public.properties (search_blob);

-- -----------------------------------------------------------------------------
-- property_images — storage_path is always
-- "<tenant_id>/<property_id>/<uuid>.<ext>" and is verified on upload.
-- -----------------------------------------------------------------------------
create table public.property_images (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  property_id uuid not null,
  storage_path text not null check (char_length(storage_path) between 8 and 512),
  alt_text    text not null default '' check (char_length(alt_text) <= 200),
  sort_order  integer not null default 0 check (sort_order between 0 and 999),
  byte_size   integer check (byte_size is null or byte_size between 1 and 10485760),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, property_id)
    references public.properties (tenant_id, id) on delete cascade
);

create index property_images_property_order_idx
  on public.property_images (property_id, sort_order);

-- -----------------------------------------------------------------------------
-- leads — created by the public form RPC (which binds tenant server-side) or by
-- an admin in the CRM. Assignment is never accepted from the public path.
-- -----------------------------------------------------------------------------
create table public.leads (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  property_id        uuid,
  assigned_to        uuid,
  full_name          text not null check (char_length(full_name) between 2 and 120),
  phone              text not null check (char_length(phone) between 6 and 24),
  email              text check (email is null or char_length(email) <= 254),
  message            text check (message is null or char_length(message) <= 4000),
  source             public.lead_source not null,
  status             public.lead_status not null default 'new',
  preferred_contact  public.contact_preference not null default 'phone',
  preferred_visit_at timestamptz,
  consent_at         timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, property_id)
    references public.properties (tenant_id, id) on delete set null,
  foreign key (tenant_id, assigned_to)
    references public.profiles (tenant_id, id) on delete set null
);

create index leads_tenant_status_idx on public.leads (tenant_id, status, created_at desc);
create index leads_tenant_assigned_idx on public.leads (tenant_id, assigned_to, created_at desc);
create index leads_property_idx on public.leads (property_id) where property_id is not null;
create index leads_name_search_idx on public.leads (tenant_id, lower(full_name));
create index leads_phone_search_idx on public.leads (tenant_id, phone);

-- -----------------------------------------------------------------------------
-- lead_notes — append-only internal timeline entries.
-- -----------------------------------------------------------------------------
create table public.lead_notes (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  lead_id    uuid not null,
  author_id  uuid not null,
  body       text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, lead_id)
    references public.leads (tenant_id, id) on delete cascade,
  foreign key (tenant_id, author_id)
    references public.profiles (tenant_id, id) on delete cascade
);

create index lead_notes_lead_idx on public.lead_notes (lead_id, created_at desc);

-- -----------------------------------------------------------------------------
-- visits — site visits scheduled against a lead.
-- -----------------------------------------------------------------------------
create table public.visits (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  lead_id          uuid not null,
  property_id      uuid,
  agent_id         uuid not null,
  scheduled_start  timestamptz not null,
  scheduled_end    timestamptz not null,
  status           public.visit_status not null default 'scheduled',
  outcome          public.visit_outcome,
  internal_notes   text check (internal_notes is null or char_length(internal_notes) <= 4000),
  created_by       uuid not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, id),
  check (scheduled_end > scheduled_start),
  -- A finished visit must say what came of it; an open one must not pre-judge.
  check (
    case
      when status in ('completed', 'no_show') then outcome is not null
      else outcome is null
    end
  ),
  foreign key (tenant_id, lead_id)
    references public.leads (tenant_id, id) on delete cascade,
  foreign key (tenant_id, property_id)
    references public.properties (tenant_id, id) on delete set null,
  foreign key (tenant_id, agent_id)
    references public.profiles (tenant_id, id) on delete restrict,
  foreign key (tenant_id, created_by)
    references public.profiles (tenant_id, id) on delete restrict
);

create index visits_tenant_start_idx on public.visits (tenant_id, scheduled_start desc);
create index visits_agent_start_idx on public.visits (tenant_id, agent_id, scheduled_start desc);
create index visits_lead_idx on public.visits (lead_id, scheduled_start desc);
create index visits_upcoming_idx
  on public.visits (tenant_id, scheduled_start) where status = 'scheduled';

-- -----------------------------------------------------------------------------
-- lead_status_events — immutable audit trail, written by trigger on lead
-- updates so the history cannot drift from the lead row.
-- -----------------------------------------------------------------------------
create table public.lead_status_events (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  lead_id     uuid not null,
  actor_id    uuid,
  from_status public.lead_status not null,
  to_status   public.lead_status not null,
  created_at  timestamptz not null default now(),
  foreign key (tenant_id, lead_id)
    references public.leads (tenant_id, id) on delete cascade,
  foreign key (tenant_id, actor_id)
    references public.profiles (tenant_id, id) on delete set null,
  check (from_status <> to_status)
);

create index lead_status_events_lead_idx on public.lead_status_events (lead_id, created_at desc);

-- -----------------------------------------------------------------------------
-- enquiry_throttles — anti-spam counters for the public form. Reachable only by
-- the service role (no grants, no policies) and pruned opportunistically.
-- -----------------------------------------------------------------------------
create table public.enquiry_throttles (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  fingerprint text not null check (char_length(fingerprint) between 16 and 128),
  created_at  timestamptz not null default now()
);

create index enquiry_throttles_lookup_idx
  on public.enquiry_throttles (fingerprint, created_at desc);

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'tenants', 'profiles', 'properties', 'property_images',
    'leads', 'visits'
  ] loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t, t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Identity helpers. SECURITY DEFINER + STABLE so that RLS policies on
-- profiles can be referenced from policies on leads/visits without recursing.
-- They read auth.uid() only — never a value supplied by the client.
-- -----------------------------------------------------------------------------
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.tenant_id
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active
$$;

create or replace function public.is_tenant_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'admin'::public.app_role, false)
$$;

-- Does the authenticated user own this lead (i.e. is it assigned to them)?
create or replace function public.can_access_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.leads l
    where l.id = p_lead_id
      and l.tenant_id = public.current_tenant_id()
      and (
        public.is_tenant_admin()
        or l.assigned_to = auth.uid()
      )
  )
$$;

create or replace function public.can_access_visit(p_visit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.visits v
    where v.id = p_visit_id
      and v.tenant_id = public.current_tenant_id()
      and (
        public.is_tenant_admin()
        or v.agent_id = auth.uid()
      )
  )
$$;

-- -----------------------------------------------------------------------------
-- Integrity triggers
-- -----------------------------------------------------------------------------

-- Assignment, tenant, source and consent are admin-managed fields. An agent
-- editing their own lead may move it through the workflow but may not
-- re-route it to a colleague, and nobody may move a record between tenants.
create or replace function public.leads_guard_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'tenant_id is immutable' using errcode = '42501';
  end if;
  if new.source is distinct from old.source and not public.is_tenant_admin() then
    raise exception 'only admins can change lead source' using errcode = '42501';
  end if;
  if new.consent_at is distinct from old.consent_at and not public.is_tenant_admin() then
    raise exception 'only admins can change consent timestamp' using errcode = '42501';
  end if;
  if new.assigned_to is distinct from old.assigned_to
     and not public.is_tenant_admin() then
    raise exception 'only admins can change lead assignment' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger leads_guard_privileged_fields
  before update on public.leads
  for each row execute function public.leads_guard_privileged_fields();

-- The author of a note is always the authenticated author.
create or replace function public.lead_notes_guard_author()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'tenant mismatch' using errcode = '42501';
  end if;
  if auth.uid() is not null and new.author_id is distinct from auth.uid() then
    raise exception 'note author must be the authenticated user' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger lead_notes_guard_author
  before insert on public.lead_notes
  for each row execute function public.lead_notes_guard_author();

-- An agent may log and re-time their own visits, but only an admin may
-- reassign a visit to a different agent.
create or replace function public.visits_guard_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'tenant_id is immutable' using errcode = '42501';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by is immutable' using errcode = '42501';
  end if;
  if new.agent_id is distinct from old.agent_id and not public.is_tenant_admin() then
    raise exception 'only admins can reassign a visit' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger visits_guard_privileged_fields
  before update on public.visits
  for each row execute function public.visits_guard_privileged_fields();

-- Automatic, tamper-resistant status history.
create or replace function public.leads_log_status_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.lead_status_events
      (tenant_id, lead_id, actor_id, from_status, to_status)
    values
      (new.tenant_id, new.id, auth.uid(), old.status, new.status);
  end if;
  return new;
end;
$$;

create trigger leads_log_status_event
  after update of status on public.leads
  for each row execute function public.leads_log_status_event();