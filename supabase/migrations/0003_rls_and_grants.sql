-- =============================================================================
-- PropFlow 0003 — row level security and grants
--
-- Posture:
--   * anon has ZERO direct access to any CRM table, and no access at all to
--     `properties` (it carries the private address and internal notes).
--   * every policy resolves tenant and role from public.profiles via
--     auth.uid(); no policy reads a tenant or role value from the request.
--   * agents are scoped to leads/visits assigned to them.
--   * functions default to EXECUTE for PUBLIC, so each one is revoked from
--     PUBLIC and re-granted only to the roles that need it.
-- =============================================================================

alter table public.tenants           enable row level security;
alter table public.profiles          enable row level security;
alter table public.properties        enable row level security;
alter table public.property_images   enable row level security;
alter table public.leads             enable row level security;
alter table public.lead_notes        enable row level security;
alter table public.visits            enable row level security;
alter table public.lead_status_events enable row level security;
alter table public.enquiry_throttles enable row level security;

-- -----------------------------------------------------------------------------
-- tenants
--   Staff may read their own brokerage row. Anonymous users read the public
--   branding subset through api_public_agency() only.
-- -----------------------------------------------------------------------------
create policy tenants_select_own_tenant
  on public.tenants for select to authenticated
  using (id = public.current_tenant_id());

-- No INSERT or DELETE policy exists: a brokerage is provisioned by an operator,
-- never self-registered. UPDATE was likewise absent until 0004, which added
-- tenants_admin_update plus a trigger pinning id/slug/created_at — agency
-- settings are written through the caller's own session client, so without
-- 0004 the settings form could only ever fail.

-- -----------------------------------------------------------------------------
-- profiles
--   Staff can see colleagues in the same brokerage (needed to assign visits).
--   Only an admin of the matching active tenant may write.
-- -----------------------------------------------------------------------------
create policy profiles_select_own_tenant
  on public.profiles for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy profiles_admin_insert
  on public.profiles for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_tenant_admin());

create policy profiles_admin_update
  on public.profiles for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_tenant_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_tenant_admin());

create policy profiles_admin_delete
  on public.profiles for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_tenant_admin());

-- Nobody may promote themselves: an agent changing their own role row is
-- blocked by the policy above (is_tenant_admin() is false for them).

-- -----------------------------------------------------------------------------
-- properties / property_images
--   Staff of the tenant read everything (an agent needs the private address to
--   conduct a site visit). Writes are admin-only. Anonymous access is served
--   exclusively by api_public_properties().
-- -----------------------------------------------------------------------------
create policy properties_select_own_tenant
  on public.properties for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy properties_admin_insert
  on public.properties for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_tenant_admin());

create policy properties_admin_update
  on public.properties for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_tenant_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_tenant_admin());

create policy properties_admin_delete
  on public.properties for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_tenant_admin());

create policy property_images_select_own_tenant
  on public.property_images for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy property_images_admin_insert
  on public.property_images for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_tenant_admin());

create policy property_images_admin_update
  on public.property_images for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_tenant_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_tenant_admin());

create policy property_images_admin_delete
  on public.property_images for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_tenant_admin());

-- -----------------------------------------------------------------------------
-- leads
-- -----------------------------------------------------------------------------
create policy leads_select_assigned
  on public.leads for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_tenant_admin() or assigned_to = auth.uid())
  );

create policy leads_admin_insert
  on public.leads for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_tenant_admin());

create policy leads_update_assigned
  on public.leads for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_tenant_admin() or assigned_to = auth.uid())
  )
  with check (
    tenant_id = public.current_tenant_id()
    and (public.is_tenant_admin() or assigned_to = auth.uid())
  );

create policy leads_admin_delete
  on public.leads for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_tenant_admin());

-- Assignment / source / consent changes are additionally blocked for non-admins
-- by the leads_guard_privileged_fields trigger.

-- -----------------------------------------------------------------------------
-- lead_notes (append only)
-- -----------------------------------------------------------------------------
create policy lead_notes_select_scoped
  on public.lead_notes for select to authenticated
  using (public.can_access_lead(lead_id));

create policy lead_notes_insert_scoped
  on public.lead_notes for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and author_id = auth.uid()
    and public.can_access_lead(lead_id)
  );

-- Intentionally no update/delete policy: internal notes are an audit trail.

-- -----------------------------------------------------------------------------
-- visits
--
-- The policies below are superseded by 0004, which rewires the select/update/
-- delete rules through can_access_visit() and widens INSERT so an admin can
-- book a visit for a colleague. They are left here as applied; 0004 drops and
-- recreates them.
-- -----------------------------------------------------------------------------
create policy visits_select_scoped
  on public.visits for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_tenant_admin() or agent_id = auth.uid())
  );

create policy visits_insert_scoped
  on public.visits for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and agent_id = auth.uid()
    and created_by = auth.uid()
    and public.can_access_lead(lead_id)
  );

create policy visits_update_scoped
  on public.visits for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_tenant_admin() or agent_id = auth.uid())
  )
  with check (
    tenant_id = public.current_tenant_id()
    and (public.is_tenant_admin() or agent_id = auth.uid())
  );

create policy visits_admin_delete
  on public.visits for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_tenant_admin());

-- -----------------------------------------------------------------------------
-- lead_status_events — written only by the leads_log_status_event trigger.
-- -----------------------------------------------------------------------------
create policy lead_status_events_select_scoped
  on public.lead_status_events for select to authenticated
  using (public.can_access_lead(lead_id));

-- -----------------------------------------------------------------------------
-- enquiry_throttles — RLS on, no policies, no grants. Service role only.

-- =============================================================================
-- Grants
-- =============================================================================
grant usage on schema public to anon, authenticated, service_role;

revoke all on table public.tenants from anon;
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.properties from anon;
revoke all on table public.property_images from anon;
revoke all on table public.leads from anon;
revoke all on table public.lead_notes from anon;
revoke all on table public.visits from anon;
revoke all on table public.lead_status_events from anon;
revoke all on table public.enquiry_throttles from anon, authenticated;

grant select on table public.tenants to authenticated, service_role;

grant select on table public.profiles to authenticated, service_role;
grant insert, update, delete on table public.profiles to authenticated, service_role;

grant select, insert, update, delete
  on table public.properties to authenticated, service_role;
grant select, insert, update, delete
  on table public.property_images to authenticated, service_role;

grant select, insert, update, delete on table public.leads to authenticated, service_role;
grant select, insert on table public.lead_notes to authenticated, service_role;
grant select, insert, update, delete on table public.visits to authenticated, service_role;
grant select on table public.lead_status_events to authenticated, service_role;
grant select on table public.enquiry_throttles to service_role;
grant insert on table public.enquiry_throttles to service_role;

-- The public RPCs in 0002 are the only anonymous read/write path.
revoke execute on function public.api_public_agency() from public;
revoke execute on function public.api_public_properties(
  p_reference text, p_search text, p_listing_type public.listing_type,
  p_property_type public.property_type, p_locality text, p_city text,
  p_bedrooms_min integer, p_price_min numeric, p_price_max numeric,
  p_sort text, p_limit integer, p_offset integer
) from public;
revoke execute on function public.submit_public_enquiry(
  p_tenant_slug text, p_property_reference text, p_full_name text,
  p_phone text, p_email text, p_message text,
  p_preferred_contact public.contact_preference,
  p_preferred_visit_at timestamptz, p_source public.lead_source,
  p_fingerprint text, p_signed_at timestamptz
) from public;

-- Identity helpers are executed by RLS policies in the caller's context, so
-- they must be executable by the roles whose rows they filter.
--
-- They come in two shapes and the distinction matters when reasoning about what
-- an untrusted caller can learn from them:
--
--   current_tenant_id() / current_app_role() / is_tenant_admin() read only
--   auth.uid(). They cannot be pointed at another user, so they disclose
--   nothing about anybody but the caller.
--
--   can_access_lead(uuid) / can_access_visit(uuid) take a caller-supplied id,
--   so they answer "may I see this row" rather than "who am I". They stay
--   safe because the answer is already constrained by current_tenant_id(): a
--   caller can only ever get true for a row inside their own brokerage, and
--   false otherwise — never a row's contents. anon has no profiles row, so
--   current_tenant_id() is null and both always return false.
grant execute on function public.current_tenant_id()
  to anon, authenticated, service_role;
grant execute on function public.current_app_role()
  to anon, authenticated, service_role;
grant execute on function public.is_tenant_admin()
  to anon, authenticated, service_role;
grant execute on function public.can_access_lead(uuid)
  to anon, authenticated, service_role;
grant execute on function public.can_access_visit(uuid)
  to anon, authenticated, service_role;

-- Trigger functions are never called directly.
revoke execute on function public.set_updated_at() from public;
revoke execute on function public.leads_guard_privileged_fields() from public;
revoke execute on function public.lead_notes_guard_author() from public;
revoke execute on function public.visits_guard_privileged_fields() from public;
revoke execute on function public.leads_log_status_event() from public;

grant execute on function public.api_public_agency()
  to anon, authenticated, service_role;
grant execute on function public.api_public_properties(
  p_reference text, p_search text, p_listing_type public.listing_type,
  p_property_type public.property_type, p_locality text, p_city text,
  p_bedrooms_min integer, p_price_min numeric, p_price_max numeric,
  p_sort text, p_limit integer, p_offset integer
) to anon, authenticated, service_role;
grant execute on function public.submit_public_enquiry(
  p_tenant_slug text, p_property_reference text, p_full_name text,
  p_phone text, p_email text, p_message text,
  p_preferred_contact public.contact_preference,
  p_preferred_visit_at timestamptz, p_source public.lead_source,
  p_fingerprint text, p_signed_at timestamptz
) to service_role;