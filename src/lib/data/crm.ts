import "server-only";
import type { SessionProfile } from "@/lib/auth";
import { isAdmin } from "@/lib/auth";
import type {
  DashboardCounts,
  Lead,
  LeadNote,
  LeadStatusEvent,
  LeadWithContext,
  Profile,
  PublicImage,
  StaffProperty,
  Visit,
  VisitWithContext,
} from "@/lib/data/types";
import { OPEN_LEAD_STATUSES } from "@/lib/domain";
import { isDemoMode } from "@/lib/env";
import { demoState, newDemoId } from "@/lib/data/demo/store";
import { serverClient } from "@/lib/supabase/server";

/**
 * CRM read path.
 *
 * Every function here runs with the signed-in staff member's own JWT, so RLS
 * is what decides the rows: an agent receives only leads assigned to them and
 * visits where they are the agent. Nothing in this file filters by tenant in
 * application code — that is the database's job, derived from `profiles`.
 */

const STAFF_PROPERTY_COLUMNS = `
  id, tenant_id, reference_code, title, headline, description, listing_type,
  property_type, status, is_available, price, currency, price_period, negotiable,
  city, locality, private_address, internal_notes, owner_name, bedrooms, bathrooms,
  area_value, area_unit, furnishing, amenities, map_link, year_built, published_at,
  created_at, updated_at
`;

const LEAD_COLUMNS = `
  id, tenant_id, property_id, assigned_to, full_name, phone, email, message, source,
  status, preferred_contact, preferred_visit_at, consent_at, created_at, updated_at
`;

const VISIT_COLUMNS = `
  id, tenant_id, lead_id, property_id, agent_id, scheduled_start, scheduled_end,
  status, outcome, internal_notes, created_by, created_at, updated_at
`;

function num<T>(value: T | string | null): T | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return (Number.isNaN(parsed) ? null : parsed) as T | null;
}

function toStaffProperty(row: Record<string, unknown>): StaffProperty {
  return {
    ...(row as unknown as StaffProperty),
    price: Number(row.price ?? 0),
    area_value: num<number>(row.area_value as number | string | null),
    bedrooms: num<number>(row.bedrooms as number | string | null),
    bathrooms: num<number>(row.bathrooms as number | string | null),
    year_built: num<number>(row.year_built as number | string | null),
    amenities: Array.isArray(row.amenities) ? (row.amenities as string[]) : [],
    images: [],
  };
}

function toLead(row: Record<string, unknown>): Lead {
  return { ...(row as unknown as Lead) };
}

function toVisit(row: Record<string, unknown>): Visit {
  return { ...(row as unknown as Visit) };
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

async function attachImages(properties: StaffProperty[]): Promise<void> {
  if (properties.length === 0) return;

  if (isDemoMode()) {
    const state = demoState();
    for (const property of properties) {
      const found = state.properties.find((p) => p.id === property.id);
      property.images = found?.images ?? [];
    }
    return;
  }

  const supabase = await serverClient();
  const { data } = await supabase
    .from("property_images")
    .select("property_id, storage_path, alt_text, sort_order")
    .in(
      "property_id",
      properties.map((p) => p.id),
    )
    .order("sort_order", { ascending: true });

  const byProperty = new Map<string, PublicImage[]>();
  for (const row of data ?? []) {
    const list = byProperty.get(row.property_id) ?? [];
    list.push({ path: row.storage_path, alt: row.alt_text ?? "" });
    byProperty.set(row.property_id, list);
  }
  for (const property of properties) {
    property.images = byProperty.get(property.id) ?? [];
  }
}

async function attachLeadContext(leads: Lead[]): Promise<LeadWithContext[]> {
  if (leads.length === 0) return [];

  const propertyIds = [...new Set(leads.map((l) => l.property_id).filter(Boolean))] as string[];
  const agentIds = [...new Set(leads.map((l) => l.assigned_to).filter(Boolean))] as string[];

  if (isDemoMode()) {
    const state = demoState();
    const propertyMap = new Map(
      state.properties.map((p) => [
        p.id,
        {
          id: p.id,
          reference_code: p.reference_code,
          title: p.title,
          locality: p.locality,
          city: p.city,
        },
      ]),
    );
    const agentMap = new Map(
      state.profiles.map((p) => [p.id, { id: p.id, full_name: p.full_name }]),
    );
    return leads.map((lead) => ({
      ...lead,
      property: lead.property_id ? (propertyMap.get(lead.property_id) ?? null) : null,
      assignee: lead.assigned_to ? (agentMap.get(lead.assigned_to) ?? null) : null,
    }));
  }

  const supabase = await serverClient();
  const [propertiesResult, agentsResult] = await Promise.all([
    propertyIds.length
      ? supabase
          .from("properties")
          .select("id, reference_code, title, locality, city")
          .in("id", propertyIds)
      : Promise.resolve({ data: [] }),
    agentIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", agentIds)
      : Promise.resolve({ data: [] }),
  ]);

  const propertyMap = new Map((propertiesResult.data ?? []).map((p) => [p.id, p]));
  const agentMap = new Map((agentsResult.data ?? []).map((p) => [p.id, p]));

  return leads.map((lead) => ({
    ...lead,
    property: lead.property_id ? (propertyMap.get(lead.property_id) ?? null) : null,
    assignee: lead.assigned_to ? (agentMap.get(lead.assigned_to) ?? null) : null,
  }));
}

async function attachVisitContext(visits: Visit[]): Promise<VisitWithContext[]> {
  if (visits.length === 0) return [];
  const state = demoState();

  const leadIds = [...new Set(visits.map((v) => v.lead_id))];
  const propertyIds = [...new Set(visits.map((v) => v.property_id).filter(Boolean))] as string[];
  const agentIds = [...new Set(visits.map((v) => v.agent_id))];

  if (isDemoMode()) {
    return visits.map((visit) => {
      const lead = state.leads.find((l) => l.id === visit.lead_id);
      const property = state.properties.find((p) => p.id === visit.property_id);
      const agent = state.profiles.find((p) => p.id === visit.agent_id);
      return {
        ...visit,
        lead: lead
          ? { id: lead.id, full_name: lead.full_name, phone: lead.phone, status: lead.status }
          : null,
        property: property
          ? { id: property.id, reference_code: property.reference_code, title: property.title }
          : null,
        agent: agent ? { id: agent.id, full_name: agent.full_name } : null,
      };
    });
  }

  const supabase = await serverClient();
  const [leadsResult, propertiesResult, agentsResult] = await Promise.all([
    supabase.from("leads").select("id, full_name, phone, status").in("id", leadIds),
    propertyIds.length
      ? supabase.from("properties").select("id, reference_code, title").in("id", propertyIds)
      : Promise.resolve({ data: [] }),
    supabase.from("profiles").select("id, full_name").in("id", agentIds),
  ]);

  const leadMap = new Map((leadsResult.data ?? []).map((l) => [l.id, l]));
  const propertyMap = new Map((propertiesResult.data ?? []).map((p) => [p.id, p]));
  const agentMap = new Map((agentsResult.data ?? []).map((p) => [p.id, p]));

  return visits.map((visit) => ({
    ...visit,
    lead: leadMap.get(visit.lead_id) ?? null,
    property: visit.property_id ? (propertyMap.get(visit.property_id) ?? null) : null,
    agent: agentMap.get(visit.agent_id) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

/**
 * Whether a profile may be handed a site visit: active, agent role, same tenant.
 *
 * Mirrors public.can_assign_visit_agent() from migration 0009. Called by
 * scheduleVisit so a bad assignee produces a readable form error instead of an
 * RLS failure; the policy is still the boundary that actually enforces it.
 */
export async function isAssignableAgent(
  tenantId: string,
  profileId: string,
): Promise<boolean> {
  if (isDemoMode()) {
    const member = demoState().profiles.find((p) => p.id === profileId);
    return member?.tenant_id === tenantId && member.is_active === true && member.role === "agent";
  }

  const supabase = await serverClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", profileId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .eq("role", "agent")
    .maybeSingle();

  return !error && data !== null;
}

/**
 * Staff who can be handed work: active, agent-role profiles in this brokerage
 * only.
 *
 * This is deliberately narrower than listTeam(). An assignee list that offered
 * departed colleagues or other admins would produce visits nobody works, and the
 * visits INSERT policy in 0009 rejects those targets anyway — so the UI is
 * narrowed to match the database rather than the other way round.
 */
export async function listAssignableAgents(): Promise<Profile[]> {
  if (isDemoMode()) {
    return demoState()
      .profiles.filter((p) => p.is_active && p.role === "agent")
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }

  const supabase = await serverClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("is_active", true)
    .eq("role", "agent")
    .order("full_name", { ascending: true });

  if (error) {
    console.error("[propflow] assignee query failed", error.code ?? "unknown");
    return [];
  }
  return (data ?? []) as Profile[];
}

export async function listTeam(): Promise<Profile[]> {
  if (isDemoMode()) {
    return demoState()
      .profiles.filter((p) => p.is_active)
      .sort((a, b) => (a.role === b.role ? a.full_name.localeCompare(b.full_name) : a.role === "admin" ? -1 : 1));
  }

  const supabase = await serverClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("full_name", { ascending: true });

  if (error) {
    console.error("[propflow] team query failed", error.code ?? "unknown");
    return [];
  }
  return (data ?? []) as Profile[];
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

export async function listStaffProperties(
  profile: SessionProfile,
  status?: string | null,
): Promise<StaffProperty[]> {
  if (isDemoMode()) {
    const state = demoState();
    const visible = state.properties.filter(
      (p) => p.tenant_id === profile.tenantId && (!status || p.status === status),
    );
    return visible.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }

  const supabase = await serverClient();
  let query = supabase
    .from("properties")
    .select(STAFF_PROPERTY_COLUMNS)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status as StaffProperty["status"]);

  const { data, error } = await query;
  if (error) {
    console.error("[propflow] property list failed", error.code ?? "unknown");
    return [];
  }

  const rows = (data ?? []).map((row) => toStaffProperty(row as Record<string, unknown>));
  await attachImages(rows);
  return rows;
}

export async function getStaffProperty(
  profile: SessionProfile,
  id: string,
): Promise<StaffProperty | null> {
  if (isDemoMode()) {
    const found = demoState().properties.find(
      (p) => p.id === id && p.tenant_id === profile.tenantId,
    );
    return found ?? null;
  }

  const supabase = await serverClient();
  const { data, error } = await supabase
    .from("properties")
    .select(STAFF_PROPERTY_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  const row = toStaffProperty(data as Record<string, unknown>);
  await attachImages([row]);
  return row;
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export interface LeadListOptions {
  search?: string;
  status?: string | null;
  assignedTo?: string | null;
}

export async function listLeads(
  profile: SessionProfile,
  options: LeadListOptions = {},
): Promise<LeadWithContext[]> {
  if (isDemoMode()) {
    const state = demoState();
    let rows = state.leads.filter((lead) => lead.tenant_id === profile.tenantId);
    // Mirrors RLS: an agent only ever sees their own leads.
    if (!isAdmin(profile)) rows = rows.filter((lead) => lead.assigned_to === profile.id);

    if (options.status) rows = rows.filter((lead) => lead.status === options.status);
    if (options.assignedTo) rows = rows.filter((lead) => lead.assigned_to === options.assignedTo);
    const search = options.search?.trim().toLowerCase();
    if (search) {
      rows = rows.filter(
        (lead) =>
          lead.full_name.toLowerCase().includes(search) || lead.phone.includes(search),
      );
    }

    rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return attachLeadContext(rows);
  }

  const supabase = await serverClient();
  let query = supabase.from("leads").select(LEAD_COLUMNS);

  if (options.status) query = query.eq("status", options.status as Lead["status"]);
  if (options.assignedTo === "unassigned") {
    query = query.is("assigned_to", null);
  } else if (options.assignedTo) {
    query = query.eq("assigned_to", options.assignedTo);
  }

  const search = options.search?.trim();
  if (search) {
    const safe = search.replace(/[%_,()]/g, " ").slice(0, 80);
    query = query.or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%`);
  }

  query = query.order("created_at", { ascending: false }).limit(200);

  const { data, error } = await query;
  if (error) {
    console.error("[propflow] lead list failed", error.code ?? "unknown");
    return [];
  }

  return attachLeadContext((data ?? []).map((row) => toLead(row as Record<string, unknown>)));
}

export async function getLead(
  profile: SessionProfile,
  id: string,
): Promise<LeadWithContext | null> {
  const rows = await listLeads(profile);
  return rows.find((lead) => lead.id === id) ?? null;
}

export async function listLeadNotes(
  profile: SessionProfile,
  leadId: string,
): Promise<LeadNote[]> {
  const state = demoState();
  if (isDemoMode()) {
    const allowed = state.leads
      .filter((lead) => lead.tenant_id === profile.tenantId)
      .filter((lead) => isAdmin(profile) || lead.assigned_to === profile.id)
      .map((lead) => lead.id);
    if (!allowed.includes(leadId)) return [];
    return state.notes
      .filter((note) => note.lead_id === leadId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((note) => ({
        ...note,
        author:
          state.profiles.find((p) => p.id === note.author_id) !== undefined
            ? {
                id: note.author_id,
                full_name:
                  (state.profiles.find((p) => p.id === note.author_id) as Profile).full_name,
              }
            : null,
      }));
  }

  const supabase = await serverClient();
  const { data, error } = await supabase
    .from("lead_notes")
    .select("id, lead_id, author_id, body, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  if (error) return [];

  const notes = (data ?? []) as Omit<LeadNote, "author">[];
  const authorIds = [...new Set(notes.map((n) => n.author_id))];
  const people = await profileDirectory(authorIds);
  return notes.map((note) => ({
    ...note,
    author: people.get(note.author_id) ?? null,
  }));
}

export async function listLeadEvents(
  profile: SessionProfile,
  leadId: string,
): Promise<LeadStatusEvent[]> {
  const state = demoState();
  if (isDemoMode()) {
    const allowed = state.leads
      .filter((lead) => lead.tenant_id === profile.tenantId)
      .filter((lead) => isAdmin(profile) || lead.assigned_to === profile.id)
      .map((lead) => lead.id);
    if (!allowed.includes(leadId)) return [];
    return state.events
      .filter((event) => event.lead_id === leadId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((event) => ({
        ...event,
        actor: state.profiles.find((p) => p.id === event.actor_id)
          ? {
              id: event.actor_id as string,
              full_name: (state.profiles.find((p) => p.id === event.actor_id) as Profile)
                .full_name,
            }
          : null,
      }));
  }

  const supabase = await serverClient();
  const { data, error } = await supabase
    .from("lead_status_events")
    .select("id, lead_id, actor_id, from_status, to_status, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });

  if (error) return [];

  const events = (data ?? []) as Omit<LeadStatusEvent, "actor">[];
  const actorIds = [...new Set(events.map((e) => e.actor_id).filter(Boolean))] as string[];
  const people = await profileDirectory(actorIds);
  return events.map((event) => ({
    ...event,
    actor: event.actor_id ? (people.get(event.actor_id) ?? null) : null,
  }));
}

async function profileDirectory(ids: string[]): Promise<Map<string, { id: string; full_name: string }>> {
  if (ids.length === 0) return new Map();
  if (isDemoMode()) {
    const state = demoState();
    return new Map(
      state.profiles
        .filter((p) => ids.includes(p.id))
        .map((p) => [p.id, { id: p.id, full_name: p.full_name }]),
    );
  }
  const supabase = await serverClient();
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  return new Map((data ?? []).map((p) => [p.id, p]));
}

// ---------------------------------------------------------------------------
// Visits
// ---------------------------------------------------------------------------

export async function listVisits(
  profile: SessionProfile,
  options: { upcomingOnly?: boolean; leadId?: string } = {},
): Promise<VisitWithContext[]> {
  if (isDemoMode()) {
    const state = demoState();
    let rows = state.visits.filter((visit) => visit.tenant_id === profile.tenantId);
    if (!isAdmin(profile)) rows = rows.filter((visit) => visit.agent_id === profile.id);
    if (options.leadId) rows = rows.filter((visit) => visit.lead_id === options.leadId);
    if (options.upcomingOnly) {
      rows = rows.filter(
        (visit) => visit.status === "scheduled" && new Date(visit.scheduled_start) >= new Date(),
      );
    }
    rows.sort(
      (a, b) =>
        new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime(),
    );
    return attachVisitContext(rows);
  }

  const supabase = await serverClient();
  let query = supabase.from("visits").select(VISIT_COLUMNS);

  if (options.leadId) query = query.eq("lead_id", options.leadId);
  if (options.upcomingOnly) {
    query = query.eq("status", "scheduled").gte("scheduled_start", new Date().toISOString());
  }

  const { data, error } = await query.order("scheduled_start", { ascending: true }).limit(300);
  if (error) {
    console.error("[propflow] visit list failed", error.code ?? "unknown");
    return [];
  }

  return attachVisitContext((data ?? []).map((row) => toVisit(row as Record<string, unknown>)));
}

export async function getVisit(
  profile: SessionProfile,
  id: string,
): Promise<VisitWithContext | null> {
  if (isDemoMode()) {
    const rows = await listVisits(profile);
    return rows.find((visit) => visit.id === id) ?? null;
  }

  const supabase = await serverClient();
  const { data, error } = await supabase
    .from("visits")
    .select(VISIT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  const rows = await attachVisitContext([toVisit(data as Record<string, unknown>)]);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardData {
  counts: DashboardCounts;
  recentLeads: LeadWithContext[];
  upcomingVisits: VisitWithContext[];
  unassignedCount: number;
  scope: "brokerage" | "assigned";
}

export async function getDashboard(profile: SessionProfile): Promise<DashboardData> {
  const [leads, visits, properties] = await Promise.all([
    listLeads(profile),
    listVisits(profile, { upcomingOnly: true }),
    listStaffProperties(profile, "published"),
  ]);

  const counts: DashboardCounts = {
    newLeads: leads.filter((lead) => lead.status === "new").length,
    openLeads: leads.filter((lead) => OPEN_LEAD_STATUSES.includes(lead.status)).length,
    scheduledVisits: visits.length,
    publishedListings: properties.length,
  };

  return {
    counts,
    recentLeads: leads.slice(0, 6),
    upcomingVisits: visits.slice(0, 6),
    unassignedCount: leads.filter((lead) => !lead.assigned_to).length,
    scope: isAdmin(profile) ? "brokerage" : "assigned",
  };
}

// ---------------------------------------------------------------------------
// Agency settings (admin only callers)
// ---------------------------------------------------------------------------

export interface AgencySettings {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  about: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  office_address: string | null;
  service_areas: string[];
  privacy_contact_email: string | null;
  privacy_notes: string | null;
  map_link: string | null;
  public_site_enabled: boolean;
}

export async function getAgencySettings(profile: SessionProfile): Promise<AgencySettings | null> {
  if (isDemoMode()) {
    const agency = demoState().agency;
    return {
      id: profile.tenantId,
      slug: agency.slug,
      name: agency.name,
      tagline: agency.tagline,
      about: agency.about,
      phone: agency.phone,
      whatsapp: agency.whatsapp,
      email: agency.email,
      office_address: agency.office_address,
      service_areas: agency.service_areas,
      privacy_contact_email: agency.privacy_contact_email,
      privacy_notes: agency.privacy_notes,
      map_link: agency.map_link,
      public_site_enabled: true,
    };
  }

  const supabase = await serverClient();
  const { data, error } = await supabase.from("tenants").select("*").maybeSingle();
  if (error || !data) return null;

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    tagline: data.tagline,
    about: data.about,
    phone: data.phone,
    whatsapp: data.whatsapp,
    email: data.email,
    office_address: data.office_address,
    service_areas: data.service_areas ?? [],
    privacy_contact_email: data.privacy_contact_email,
    privacy_notes: data.privacy_notes,
    map_link: data.map_link,
    public_site_enabled: data.public_site_enabled,
  };
}

/** Unassigned count for the admin assignment queue. */
export async function countUnassignedLeads(): Promise<number> {
  if (isDemoMode()) return demoState().leads.filter((lead) => !lead.assigned_to).length;
  const supabase = await serverClient();
  const { count } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .is("assigned_to", null);
  return count ?? 0;
}

/** Used by the demo-mode property create/edit actions. */
export function demoNewPropertyId(): string {
  return newDemoId("33333333-3333-4333-8333-33333333");
}