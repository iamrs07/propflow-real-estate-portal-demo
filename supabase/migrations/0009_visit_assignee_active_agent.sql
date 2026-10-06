-- =============================================================================
-- PropFlow 0009 — a visit may only be assigned to an active agent.
--
-- Why this file exists:
--   0005 let an admin book a visit on a colleague's behalf, which the UI offers
--   and which the update policy already permitted. But "a colleague" was only
--   ever enforced by the (tenant_id, agent_id) foreign key, which proves the
--   target is a profile in the same brokerage and nothing more. An admin could
--   still assign a visit to a departed colleague (is_active = false) or to
--   another admin, and the visit would then sit in a queue nobody works. A
--   forged request bypassing the UI could do exactly the same.
--
--   So the target is now validated in the database, where the UI cannot be
--   bypassed: the assignee must be an active profile with role = 'agent' in the
--   caller's own tenant.
--
--   Two paths are kept, because they are genuinely different:
--     agent -> must be themselves;
--     admin -> may choose, but only an active agent in the same brokerage.
--
-- This is an additive migration and does not rewrite 0005.
--
-- Apply with:  supabase db push        (or paste into the SQL editor)
-- =============================================================================

create or replace function public.can_assign_visit_agent(p_agent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_agent_id
      and p.tenant_id = public.current_tenant_id()
      and p.role = 'agent'
      and p.is_active
  );
$$;

comment on function public.can_assign_visit_agent(uuid) is
  'True only for an active agent profile in the caller''s own brokerage. Used by '
  'the visits INSERT policy so a visit can never be queued for a departed '
  'colleague or for another admin, even from a forged request.';

grant execute on function public.can_assign_visit_agent(uuid)
  to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- INSERT. Recreated from 0005 with the assignee check added.
--
--   can_assign_visit_agent(agent_id)  assignee is an active agent here
--   agent_id = auth.uid() or is_tenant_admin()
--                                       agents book for themselves, admins may
--                                       choose, but only within the set above
--   can_access_lead(lead_id)           the lead must be visible to the caller
--   created_by = auth.uid()            the audit trail cannot be forged
--
-- Note that an admin cannot assign a visit to *themselves*: is_tenant_admin()
-- satisfies the second clause, but can_assign_visit_agent() still has to pass,
-- and an admin profile is not an agent. That is intentional — the queue belongs
-- to the agents who will do the visit.
--
-- The row-level predicates read the new tuple's own columns, never a lookup of it.
-- can_access_lead() is safe here because it reads `leads`, a table that already
-- exists at INSERT time; a helper that queried `visits` would be false for the
-- very row being written and would break INSERT ... RETURNING (see 0005).
-- -----------------------------------------------------------------------------
drop policy if exists visits_insert_scoped on public.visits;

create policy visits_insert_scoped
  on public.visits for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and created_by = auth.uid()
    and public.can_assign_visit_agent(agent_id)
    and (agent_id = auth.uid() or public.is_tenant_admin())
    and public.can_access_lead(lead_id)
  );

-- -----------------------------------------------------------------------------
-- Reassignment on UPDATE gets the same target check, with one deliberate
-- exception: when agent_id is unchanged the row is left alone.
--
-- Without that exception, deactivating an agent would make every one of their
-- existing visits impossible to edit — an admin could no longer mark a visit
-- completed after the agent left. Existing visits are therefore not invalidated
-- by a later deactivation; only *new* assignment and *actual* reassignment are
-- gated.
-- -----------------------------------------------------------------------------
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
  if new.agent_id is distinct from old.agent_id then
    if not public.is_tenant_admin() then
      raise exception 'only admins can reassign a visit' using errcode = '42501';
    end if;
    if not public.can_assign_visit_agent(new.agent_id) then
      raise exception
        'a visit can only be assigned to an active agent in this brokerage'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;