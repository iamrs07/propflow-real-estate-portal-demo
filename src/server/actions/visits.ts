"use server";

import { revalidatePath } from "next/cache";
import { isAdmin, requireSessionProfile } from "@/lib/auth";
import {
  VISIT_OUTCOMES,
  VISIT_STATUSES,
  type VisitOutcome,
  type VisitStatus,
} from "@/lib/domain";
import { isDemoMode } from "@/lib/env";
import { demoState } from "@/lib/data/demo/store";
import { serverClient } from "@/lib/supabase/server";
import {
  type FormState,
  clean,
  fail,
  formValues,
  isoDateTime,
  oneOfRequired,
  toFailure,
} from "@/lib/validation";

/** Visit actions. RLS scopes an agent to their own visits; the trigger stops
 *  them reassigning someone else's. */

export async function updateVisit(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  try {
    const profile = await requireSessionProfile();
    const visitId = clean(formData.get("visit_id")).slice(0, 64);
    if (!visitId) fail("visit_id", "Missing visit reference.");

    const status = oneOfRequired<VisitStatus>(formData.get("status"), VISIT_STATUSES, "status");
    const rawOutcome = clean(formData.get("outcome"));
    const outcome = rawOutcome ? oneOfRequired<VisitOutcome>(rawOutcome, VISIT_OUTCOMES, "outcome") : null;
    const internalNotes = clean(formData.get("internal_notes")).slice(0, 4000) || null;

    // A finished visit must record what came of it; the same rule is a CHECK
    // constraint in the database.
    if ((status === "completed" || status === "no_show") && !outcome) {
      fail("outcome", "Record what happened on this visit.");
    }
    if (status !== "completed" && status !== "no_show" && outcome) {
      fail("outcome", "An outcome only applies to a completed or no-show visit.");
    }

    const start = isoDateTime(formData.get("scheduled_start"), "scheduled_start");
    const end = isoDateTime(formData.get("scheduled_end"), "scheduled_end");
    if (new Date(end ?? 0) <= new Date(start ?? 0)) {
      fail("scheduled_end", "The end time must be after the start time.");
    }

    const requestedAgent = clean(formData.get("agent_id")).slice(0, 64);
    const agentId =
      isAdmin(profile) && requestedAgent ? requestedAgent : undefined;

    if (isDemoMode()) {
      const state = demoState();
      const visit = state.visits.find((entry) => entry.id === visitId);
      if (!visit || visit.tenant_id !== profile.tenantId) {
        return { ok: false, formError: "That visit is not available to you.", values };
      }
      if (!isAdmin(profile) && visit.agent_id !== profile.id) {
        return { ok: false, formError: "That visit is not assigned to you.", values };
      }
      visit.status = status;
      visit.outcome = outcome;
      visit.internal_notes = internalNotes;
      visit.scheduled_start = start ?? visit.scheduled_start;
      visit.scheduled_end = end ?? visit.scheduled_end;
      if (agentId) visit.agent_id = agentId;
      visit.updated_at = new Date().toISOString();
    } else {
      const supabase = await serverClient();
      const patch: Record<string, unknown> = {
        status,
        outcome,
        internal_notes: internalNotes,
        scheduled_start: start,
        scheduled_end: end,
      };
      if (agentId) patch.agent_id = agentId;

      const { data, error } = await supabase
        .from("visits")
        .update(patch)
        .eq("id", visitId)
        .select("id")
        .maybeSingle();

      if (error) {
        console.error("[propflow] visit update failed", error.code ?? "unknown");
        return { ok: false, formError: "We could not update that visit.", values };
      }
      if (!data) return { ok: false, formError: "That visit is not available to you.", values };
    }

    revalidatePath(`/crm/visits/${visitId}`);
    revalidatePath("/crm/visits");
    revalidatePath("/crm");
    return { ok: true, success: true, values: {} };
  } catch (error) {
    return toFailure(error, values);
  }
}

export async function deleteVisit(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  try {
    const profile = await requireSessionProfile();
    if (!isAdmin(profile)) {
      return { ok: false, formError: "Only an administrator can delete a visit.", values };
    }
    const visitId = clean(formData.get("visit_id")).slice(0, 64);
    if (clean(formData.get("confirm")) !== "DELETE") {
      return { ok: false, formError: "Type DELETE to confirm.", values };
    }

    if (isDemoMode()) {
      const state = demoState();
      state.visits = state.visits.filter((entry) => entry.id !== visitId);
    } else {
      const supabase = await serverClient();
      const { data, error } = await supabase
        .from("visits")
        .delete()
        .eq("id", visitId)
        .select("id")
        .maybeSingle();
      if (error) {
        console.error("[propflow] visit delete failed", error.code ?? "unknown");
        return { ok: false, formError: "We could not delete that visit.", values };
      }
      if (!data) return { ok: false, formError: "That visit is not available.", values };
    }

    revalidatePath("/crm/visits");
    revalidatePath("/crm");
    return { ok: true, success: true, values: {} };
  } catch (error) {
    return toFailure(error, values);
  }
}