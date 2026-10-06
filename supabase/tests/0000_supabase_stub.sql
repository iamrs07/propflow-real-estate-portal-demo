-- =============================================================================
-- PropFlow test harness — simulates the Supabase-managed parts of the database
-- so the real migrations can be executed and asserted against a real Postgres
-- engine (PGlite). This file is NOT part of a Supabase project: `auth`,
-- `storage` and the `anon`/`authenticated`/`service_role` roles are created by
-- the Supabase platform and are reproduced here only for offline verification.
-- =============================================================================

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now()
);

grant usage on schema auth to anon, authenticated, service_role;

-- Mirrors the Supabase definition: reads the JWT `sub` claim from the session
-- GUC that PostgREST sets from the verified access token.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;

-- Minimal stand-ins for the storage schema.
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  name text not null,
  owner uuid,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select case
    when strpos(name, '/') = 0 then array[]::text[]
    else (string_to_array(name, '/'))[1:(array_length(string_to_array(name, '/'), 1) - 1)]
  end
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;

-- Supabase enables RLS on storage.objects out of the box; the stub must match or
-- the bucket policies would appear to pass.
alter table storage.objects enable row level security;