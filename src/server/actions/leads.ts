"use server";

import { revalidatePath } from "next/cache";
import { isAdmin, requireSessionProfile, type SessionProfile } from "@/lib/auth";
import type { Lead } from "@/lib/data/types";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/domain";
import { isDemoMode } from "@/lib/env";
import { demoState } from "@/lib/data/demo/store";
import { isAssignableAgent } from "@/lib/data/crm";
import { serverClient } from "@/lib/supabase/server";
import {
  type FormState,
  clean,
  fail,
  formValues,
  isoDateTime,
  oneOfRequired,
  text,
  toFailure,
} from "@/lib/validation";

/**
 * Lead actions.
 *
 * Writes run through the signed-in user's own client, so RLS decides what may
 * change: an agent cannot touch a lead assigned to someone else, and cannot
 * reassign, re-source or re-consent a lead even on their own record — the
 * database trigger rejects those field changes for non-admins.
 */

export async function updateLeadStatus(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  try {
    const profile = await requireSessionProfile();
    const leadId = clean(formData.get("lead_id")).slice(0, 64);
    if (!leadId) fail("lead_id", "Missing lead reference.");

    const status = oneOfRequired<LeadStatus>(formData.get("status"), LEAD_STATUSES, "status");

    if (isDemoMode()) {
      const state = demoState();
      const lead = state.leads.find((entry) => entry.id === leadId);
      if (!lead || lead.tenant_id !== profile.tenantId) {
        return { ok: false, formError: "That lead is not available to you.", values };
      }
      if (!isAdmin(profile) && lead.assigned_to !== profile.id) {
        return { ok: false, formError: "That lead is not assigned to you.", values };
      }
      if (lead.status !== status) {
        state.events.push({
          id: `demo-event-${Date.now()}`,
          lead_id: lead.id,
          actor_id: profile.id,
          from_status: lead.status,
          to_status: status,
          created_at: new Date().toISOString(),
          actor: null,
        });
        lead.status = status;
        lead.updated_at = new Date().toISOString();
      }
    } else {
      const supabase = await serverClient();
      // Deliberately no tenant filter: RLS already scopes this, and an
      // out-of-scope id simply matches zero rows.
      const { data, error } = await supabase
        .from("leads")
        .update({ status })
        .eq("id", leadId)
        .select("id")
        .maybeSingle();

      if (error) {
        console.error("[propflow] status update failed", error.code ?? "unknown");
        return { ok: false, formError: "We could not update that lead. Try again.", values };
      }
      if (!data) {
        return { ok: false, formError: "That lead is not available to you.", values };
      }
    }

    revalidatePath(`/crm/leads/${leadId}`);
    revalidatePath("/crm/leads");
    revalidatePath("/crm");
    return { ok: true, success: true, values: { status } };
  } catch (error) {
    return toFailure(error, values);
  }
}

export async function assignLead(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  try {
    const profile = await requireSessionProfile();
    if (!isAdmin(profile)) {
      return {
        ok: false,
        formError: "Only an administrator can change who a lead is assigned to.",
        values,
      };
    }

    const leadId = clean(formData.get("lead_id")).slice(0, 64);
    if (!leadId) fail("lead_id", "Missing lead reference.");

    const rawAgent = clean(formData.get("assigned_to"));
    const assignedTo = rawAgent === "" ? null : rawAgent.slice(0, 64);

    if (assignedTo) {
      const target = demoState().profiles.find((entry) => entry.id === assignedTo);
      if (!isDemoMode()) {
        const supabase = await serverClient();
        const { data } = await supabase
          .from("profiles")
          .select("id, is_active")
          .eq("id", assignedTo)
          .maybeSingle();
        if (!data || !data.is_active) {
          return { ok: false, formError: "That team member is not available.", values };
        }
      } else if (!target || !target.is_active) {
        return { ok: false, formError: "That team member is not available.", values };
      }
    }

    if (isDemoMode()) {
      const state = demoState();
      const lead = state.leads.find((entry) => entry.id === leadId);
      if (!lead || lead.tenant_id !== profile.tenantId) {
        return { ok: false, formError: "That lead is not available.", values };
      }
      lead.assigned_to = assignedTo;
      lead.updated_at = new Date().toISOString();
    } else {
      const supabase = await serverClient();
      const { data, error } = await supabase
        .from("leads")
        .update({ assigned_to: assignedTo })
        .eq("id", leadId)
        .select("id")
        .maybeSingle();
      if (error) {
        console.error("[propflow] assignment failed", error.code ?? "unknown");
        return { ok: false, formError: "We could not save that assignment.", values };
      }
      if (!data) return { ok: false, formError: "That lead is not available.", values };
    }

    revalidatePath(`/crm/leads/${leadId}`);
    revalidatePath("/crm/leads");
    revalidatePath("/crm");
    return { ok: true, success: true, values: {} };
  } catch (error) {
    return toFailure(error, values);
  }
}

export async function addLeadNote(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  try {
    const profile = await requireSessionProfile();
    const leadId = clean(formData.get("lead_id")).slice(0, 64);
    if (!leadId) fail("lead_id", "Missing lead reference.");

    const body = text(formData.get("body"), "body", {
      min: 1,
      max: 4000,
      label: "Note",
    });

    if (isDemoMode()) {
      const state = demoState();
      const lead = state.leads.find((entry) => entry.id === leadId);
      if (!lead || lead.tenant_id !== profile.tenantId) {
        return { ok: false, formError: "That lead is not available to you.", values };
      }
      if (!isAdmin(profile) && lead.assigned_to !== profile.id) {
        return { ok: false, formError: "That lead is not assigned to you.", values };
      }
      state.notes.unshift({
        id: `demo-note-${Date.now()}`,
        lead_id: leadId,
        author_id: profile.id,
        body,
        created_at: new Date().toISOString(),
        author: null,
      });
    } else {
      const supabase = await serverClient();
      // author_id and tenant_id are taken from the session, not the form.
      const { data, error } = await supabase
        .from("lead_notes")
        .insert({
          tenant_id: profile.tenantId,
          lead_id: leadId,
          author_id: profile.id,
          body,
        })
        .select("id")
        .maybeSingle();

      if (error) {
        console.error("[propflow] note insert failed", error.code ?? "unknown");
        return {
          ok: false,
          formError: "We could not save that note. It may belong to a lead you cannot see.",
          values,
        };
      }
      if (!data) return { ok: false, formError: "That lead is not available to you.", values };
    }

    revalidatePath(`/crm/leads/${leadId}`);
    return { ok: true, success: true, values: {} };
  } catch (error) {
    return toFailure(error, values);
  }
}

export async function updateLeadContact(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  try {
    const profile = await requireSessionProfile();
    const leadId = clean(formData.get("lead_id")).slice(0, 64);
    if (!leadId) fail("lead_id", "Missing lead reference.");

    const status = clean(formData.get("status")) as Lead["status"] | "";
    const message = clean(formData.get("message")).slice(0, 4000) || null;

    if (isDemoMode()) {
      const state = demoState();
      const lead = state.leads.find((entry) => entry.id === leadId);
      if (!lead || lead.tenant_id !== profile.tenantId) {
        return { ok: false, formError: "That lead is not available to you.", values };
      }
      if (!isAdmin(profile) && lead.assigned_to !== profile.id) {
        return { ok: false, formError: "That lead is not assigned to you.", values };
      }
      if (status && LEAD_STATUSES.includes(status as LeadStatus) && status !== lead.status) {
        state.events.push({
          id: `demo-event-${Date.now()}`,
          lead_id: lead.id,
          actor_id: profile.id,
          from_status: lead.status,
          to_status: status as LeadStatus,
          created_at: new Date().toISOString(),
          actor: null,
        });
        lead.status = status as LeadStatus;
      }
      lead.message = message;
      lead.updated_at = new Date().toISOString();
    } else {
      const supabase = await serverClient();
      const patch: Record<string, unknown> = { message };
      if (status && LEAD_STATUSES.includes(status as LeadStatus)) patch.status = status;

      const { data, error } = await supabase
        .from("leads")
        .update(patch)
        .eq("id", leadId)
        .select("id")
        .maybeSingle();
      if (error) {
        console.error("[propflow] lead update failed", error.code ?? "unknown");
        return { ok: false, formError: "We could not update that lead.", values };
      }
      if (!data) return { ok: false, formError: "That lead is not available to you.", values };
    }

    revalidatePath(`/crm/leads/${leadId}`);
    revalidatePath("/crm/leads");
    revalidatePath("/crm");
    return { ok: true, success: true, values: {} };
  } catch (error) {
    return toFailure(error, values);
  }
}

/** Admin only: removes a lead and everything hanging off it. */
export async function deleteLead(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  try {
    const profile = await requireSessionProfile();
    if (!isAdmin(profile)) {
      return { ok: false, formError: "Only an administrator can delete a lead.", values };
    }
    const leadId = clean(formData.get("lead_id")).slice(0, 64);
    if (clean(formData.get("confirm")) !== "DELETE") {
      return { ok: false, formError: "Type DELETE to confirm.", values };
    }

    if (isDemoMode()) {
      const state = demoState();
      state.leads = state.leads.filter((entry) => entry.id !== leadId);
      state.notes = state.notes.filter((entry) => entry.lead_id !== leadId);
      state.visits = state.visits.filter((entry) => entry.lead_id !== leadId);
    } else {
      const supabase = await serverClient();
      const { data, error } = await supabase
        .from("leads")
        .delete()
        .eq("id", leadId)
        .select("id")
        .maybeSingle();
      if (error) {
        console.error("[propflow] lead delete failed", error.code ?? "unknown");
        return { ok: false, formError: "We could not delete that lead.", values };
      }
      if (!data) return { ok: false, formError: "That lead is not available.", values };
    }

    revalidatePath("/crm/leads");
    revalidatePath("/crm");
    return { ok: true, success: true, values: {} };
  } catch (error) {
    return toFailure(error, values);
  }
}

export async function scheduleVisit(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  try {
    const profile: SessionProfile = await requireSessionProfile();
    const leadId = clean(formData.get("lead_id")).slice(0, 64);
    if (!leadId) fail("lead_id", "Missing lead reference.");

    const start = isoDateTime(formData.get("scheduled_start"), "scheduled_start");
    const end = isoDateTime(formData.get("scheduled_end"), "scheduled_end");
    if (new Date(end ?? 0) <= new Date(start ?? 0)) {
      fail("scheduled_end", "The end time must be after the start time.");
    }

    // An agent may only book themselves; an admin may book for a colleague.
    const requestedAgent = clean(formData.get("agent_id")).slice(0, 64);
    const agentId = isAdmin(profile) && requestedAgent ? requestedAgent : profile.id;

    /*
     * Validate the assignee before the write, in application code as well as in
     * the database. The RLS policy in migration 0009 is the real boundary — this
     * check exists so an admin who submits a stale or tampered form gets a clear
     * message instead of a generic RLS failure, and so demo mode enforces the
     * same rule the configured database does.
     *
     * "Assignable" means an active agent in this brokerage. That excludes the
     * admin themselves, since an admin is not an agent.
     */
    if (agentId !== profile.id) {
      const assignable = await isAssignableAgent(profile.tenantId, agentId);
      if (!assignable) {
        return {
          ok: false,
          formError: "Choose an active agent from the list to run that visit.",
          values,
        };
      }
    }

    const internalNotes =
      clean(formData.get("internal_notes")).slice(0, 4000) || null;

    let visitId: string | null = null;

    if (isDemoMode()) {
      const state = demoState();
      const lead = state.leads.find((entry) => entry.id === leadId);
      if (!lead || lead.tenant_id !== profile.tenantId) {
        return { ok: false, formError: "That lead is not available to you.", values };
      }
      if (!isAdmin(profile) && lead.assigned_to !== profile.id) {
        return { ok: false, formError: "That lead is not assigned to you.", values };
      }
      visitId = `demo-visit-${Date.now()}`;
      state.visits.push({
        id: visitId,
        tenant_id: profile.tenantId,
        lead_id: leadId,
        property_id: lead.property_id,
        agent_id: agentId,
        scheduled_start: start ?? "",
        scheduled_end: end ?? "",
        status: "scheduled",
        outcome: null,
        internal_notes: internalNotes,
        created_by: profile.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (lead.status === "new" || lead.status === "contacted" || lead.status === "qualified") {
        state.events.push({
          id: `demo-event-${Date.now()}`,
          lead_id: lead.id,
          actor_id: profile.id,
          from_status: lead.status,
          to_status: "visit_scheduled",
          created_at: new Date().toISOString(),
          actor: null,
        });
        lead.status = "visit_scheduled";
      }
    } else {
      const supabase = await serverClient();
      // created_by and agent_id come from the session unless an admin chose an agent.
      const { data, error } = await supabase
        .from("visits")
        .insert({
          tenant_id: profile.tenantId,
          lead_id: leadId,
          property_id: null,
          agent_id: agentId,
          scheduled_start: start,
          scheduled_end: end,
          status: "scheduled",
          internal_notes: internalNotes,
          created_by: profile.id,
        })
        .select("id")
        .maybeSingle();

      if (error) {
        console.error("[propflow] visit insert failed", error.code ?? "unknown");
        return {
          ok: false,
          formError:
            "We could not schedule that visit. It may belong to a lead you cannot see.",
          values,
        };
      }
      if (!data) return { ok: false, formError: "That lead is not available to you.", values };
      visitId = data.id;
    }

    revalidatePath(`/crm/leads/${leadId}`);
    revalidatePath("/crm/visits");
    revalidatePath("/crm");
    if (visitId) revalidatePath(`/crm/visits/${visitId}`);
    return { ok: true, success: true, values: {} };
  } catch (error) {
    return toFailure(error, values);
  }
}