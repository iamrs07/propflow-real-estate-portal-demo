-- =============================================================================
-- PropFlow 0008 — tenant settings are updated through a column grant, not the
-- whole table.
--
-- Why this file exists:
--   0005 fixed a real bug: `tenants` had a SELECT grant and no UPDATE policy, so
--   updateAgencySettings() — which writes through the caller's own session client
--   so RLS applies — could only ever fail. 0005 added `grant update on table
--   public.tenants to authenticated` together with a same-tenant admin policy and
--   a trigger pinning id / slug / created_at.
--
--   A table-wide UPDATE grant is wider than the form needs. It lets any admin of
--   the brokerage attempt to write public_site_enabled, which is an operational
--   switch: flipping it takes the whole public site offline, and it is not
--   something a settings form should be able to reach. The trigger protects id,
--   slug and created_at, but it cannot protect a column that simply was not
--   intended to be writable.
--
--   This migration narrows the grant to the eleven columns the settings form
--   actually edits. Postgres has no "revoke a column from a table grant" — the
--   table-level grant has to go first, then the individual columns are re-granted.
--
--   The RLS policy from 0005 is deliberately left in place: it is still the thing
--   that decides *which rows* and *which callers* may write. The grant only
--   decides *which columns* are writable at all. Both are required.
--
-- This is an additive migration and does not rewrite 0005.
--
-- Apply with:  supabase db push        (or paste into the SQL editor)
-- =============================================================================

-- Drop the blanket grant first; the column grants below are independent of it.
revoke update on table public.tenants from authenticated;

-- The exact set the agency settings form writes, in the same order as the form:
-- name, tagline, about, phone, whatsapp, email, office_address,
-- privacy_contact_email, privacy_notes, map_link, service_areas.
grant update (
  name,
  tagline,
  about,
  phone,
  whatsapp,
  email,
  office_address,
  privacy_contact_email,
  privacy_notes,
  map_link,
  service_areas
) on table public.tenants to authenticated;

-- Deliberately NOT granted, so a client UPDATE naming them fails with
-- "permission denied for table tenants" before RLS or any trigger is consulted:
--   id                  identity, and the composite foreign-key target
--   slug                public URL segment; renamed only by an operator
--   public_site_enabled takes the entire public site offline
--   created_at          audit
--   updated_at          written by the set_updated_at trigger, never by a client

comment on table public.tenants is
  'One row per brokerage. Staff read their own row and may update only the '
  'branding/contact columns granted in 0008; tenants_admin_update (0005) '
  'restricts that to an admin of the same tenant and '
  'tenants_guard_privileged_fields (0005) pins id, slug and created_at.';

-- -----------------------------------------------------------------------------
-- The RLS policy is unchanged from 0005 and is restated here only as a guard: if
-- a future migration ever dropped it, the column grant alone would still be
-- tenant-agnostic. Failing loudly at migration time beats discovering it later.
-- -----------------------------------------------------------------------------
do $$
declare
  policy_count integer;
begin
  select count(*) into policy_count
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'tenants'
     and pol.polcmd = 'w'
     and pol.polname = 'tenants_admin_update';

  if policy_count <> 1 then
    raise exception
      'expected the tenants_admin_update policy from 0005 to exist, found %', policy_count;
  end if;
end;
$$;