-- =============================================================================
-- PropFlow 0005 — admin write paths that 0003 blocked by omission.
--
-- Why this file exists:
--   0003 granted SELECT but no UPDATE on `tenants`, and created no UPDATE
--   policy. updateAgencySettings() writes through the caller's own session
--   client so RLS applies, so in a real deployment the agency settings form
--   could only ever fail. Demo mode short-circuits before the database, which
--   is why the gap was not visible locally.
--
--   0003's `visits_insert_scoped` also required agent_id = auth.uid(), so an
--   administrator could not book a site visit on behalf of another agent even
--   though the UI offers exactly that and `visits_guard_privileged_fields`
--   already permits admin reassignment on UPDATE.
--
--   `can_access_visit(uuid)` was defined and granted in 0001/0003 but never
--   referenced by a policy. It is wired in below so the visit scoping rules
--   have a single definition.
--
-- Every change here is additive or semantics-preserving. No policy is widened
-- beyond what the corresponding server action already does for an admin.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Identity fields of a tenant are immutable. An admin edits branding and
-- contact details; an admin must not be able to move the row to another
-- tenant, rewrite the public URL slug, or backdate it.
-- -----------------------------------------------------------------------------
create or replace function public.tenants_guard_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'tenant id is immutable' using errcode = '42501';
  end if;
  if new.slug is distinct from old.slug then
    raise exception 'tenant slug is immutable; it is part of the public URL' using errcode = '42501';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'created_at is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger tenants_guard_privileged_fields
  before update on public.tenants
  for each row execute function public.tenants_guard_privileged_fields();

-- -----------------------------------------------------------------------------
-- tenants — an admin of this brokerage may edit its own row and no other.
--   `using`  selects the row; `with check` re-pins the id so an update cannot
--   relocate the row even before the trigger fires.
-- -----------------------------------------------------------------------------
create policy tenants_admin_update
  on public.tenants for update to authenticated
  using (id = public.current_tenant_id() and public.is_tenant_admin())
  with check (id = public.current_tenant_id());

-- There is still no INSERT or DELETE policy: a brokerage is provisioned, never
-- self-registered, and removing one is an operator task via the service role.

grant update on table public.tenants to authenticated;

revoke execute on function public.tenants_guard_privileged_fields() from public;

-- -----------------------------------------------------------------------------
-- visits — scoping through a tuple-based helper.
--
-- Why not can_access_visit(uuid) here? That helper answers "may I see this
-- row" by looking the id up in public.visits. For SELECT, UPDATE and DELETE the
-- row is already in the table, so the lookup is fine. For INSERT it is not:
-- the new tuple has not been written yet, so the lookup returns false. Any
-- INSERT ... RETURNING (which PostgREST issues for .insert().select("id"))
-- re-checks the new tuple against the SELECT policy and fails with
-- "new row violates row-level security policy" — so the whole create path
-- breaks while SELECT keeps looking perfectly correct.
--
-- can_access_lead(lead_id) is not affected by this: it looks the *lead* up in
-- public.leads, a table that already exists when the note or visit is written.
--
-- So the row-scoped rule is expressed over the row's own columns, and
-- can_access_visit(uuid) is kept as the id-keyed wrapper for callers that hold
-- an id rather than a tuple.
-- -----------------------------------------------------------------------------
create or replace function public.can_access_visit_row(
  p_tenant_id uuid,
  p_agent_id  uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_tenant_id = public.current_tenant_id()
    and (public.is_tenant_admin() or p_agent_id = auth.uid());
$$;

create or replace function public.can_access_visit(p_visit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_access_visit_row(v.tenant_id, v.agent_id)
    from public.visits v
   where v.id = p_visit_id;
$$;

grant execute on function public.can_access_visit_row(uuid, uuid)
  to anon, authenticated, service_role;

drop policy if exists visits_select_scoped on public.visits;

create policy visits_select_scoped
  on public.visits for select to authenticated
  using (public.can_access_visit_row(tenant_id, agent_id));

drop policy if exists visits_update_scoped on public.visits;

create policy visits_update_scoped
  on public.visits for update to authenticated
  using (public.can_access_visit_row(tenant_id, agent_id))
  with check (public.can_access_visit_row(tenant_id, agent_id));

drop policy if exists visits_admin_delete on public.visits;

-- Delete stays admin-only. The row helper alone would also admit an agent
-- deleting their own visit, which is a wider grant than before, so the admin
-- check is kept explicit.
create policy visits_admin_delete
  on public.visits for delete to authenticated
  using (public.can_access_visit_row(tenant_id, agent_id) and public.is_tenant_admin());

-- -----------------------------------------------------------------------------
-- visits INSERT — two paths, one per role.
--
--   agent       : books for themselves, exactly as 0003 allowed.
--   admin       : books for any colleague in the brokerage. The composite
--                 foreign key (tenant_id, agent_id) -> profiles (tenant_id, id)
--                 already rejects an agent from another tenant, so this widens
--                 the policy to colleagues only.
--
--   Both paths still require can_access_lead(lead_id), so an agent cannot book
--   a visit against a lead that is not theirs, and both require
--   created_by = auth.uid() so an admin cannot forge the audit trail.
-- -----------------------------------------------------------------------------
drop policy if exists visits_insert_scoped on public.visits;

create policy visits_insert_scoped
  on public.visits for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and created_by = auth.uid()
    and (agent_id = auth.uid() or public.is_tenant_admin())
    and public.can_access_lead(lead_id)
  );