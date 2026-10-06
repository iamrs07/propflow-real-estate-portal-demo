"use client";

import { useActionState, useId } from "react";
import type { FormState } from "@/lib/validation";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  VISIT_OUTCOMES,
  VISIT_OUTCOME_LABELS,
  type LeadStatus,
  type VisitOutcome,
} from "@/lib/domain";
import {
  addLeadNote,
  assignLead,
  scheduleVisit,
  updateLeadStatus,
} from "@/server/actions/leads";
import { updateVisit } from "@/server/actions/visits";
import { Alert, Button, Field, Input, Labeled, Select, Textarea } from "@/components/ui";

const INITIAL: FormState = { ok: false };

type StatusAction = (
  state: FormState,
  formData: FormData,
) => Promise<FormState>;

/** Success message plus a form reset, shared by the small CRM forms. */
function Outcome({ state }: { state: FormState }) {
  if (state.formError) return <Alert tone="critical">{state.formError}</Alert>;
  if (state.notice) return <Alert tone="positive">{state.notice}</Alert>;
  return null;
}

export function StatusForm({ leadId, current }: { leadId: string; current: LeadStatus }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    updateLeadStatus,
    INITIAL,
  );
  const id = useId();

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="lead_id" value={leadId} />
      <Field label="Status" htmlFor={`${id}-status`} required error={state.fieldErrors?.status}>
        <Select id={`${id}-status`} name="status" defaultValue={current}>
          {LEAD_STATUSES.map((value) => (
            <option key={value} value={value}>
              {LEAD_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Update status"}
      </Button>
      <Outcome state={state} />
    </form>
  );
}

export function AssignForm({
  leadId,
  current,
  agents,
  disabledReason,
}: {
  leadId: string;
  current: string | null;
  agents: Array<{ id: string; full_name: string; role: string }>;
  disabledReason?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(assignLead, INITIAL);
  const id = useId();

  if (disabledReason) {
    return <p className="text-sm text-sand-600">{disabledReason}</p>;
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="lead_id" value={leadId} />
      <Field label="Assigned agent" htmlFor={`${id}-agent`} required>
        <Select id={`${id}-agent`} name="assigned_to" defaultValue={current ?? ""}>
          <option value="">Unassigned</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.full_name}
              {agent.role === "admin" ? " (admin)" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save assignment"}
      </Button>
      <Outcome state={state} />
    </form>
  );
}

export function NoteForm({ leadId }: { leadId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addLeadNote, INITIAL);
  const id = useId();

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="lead_id" value={leadId} />
      <Labeled
        label="Add a follow-up note"
        htmlFor={`${id}-note`}
        required
        error={state.fieldErrors?.body}
        hint="Internal only. Notes are permanent and cannot be edited or deleted."
      >
        <Textarea
          id={`${id}-note`}
          name="body"
          rows={3}
          maxLength={4000}
          placeholder="What happened on the call, what was agreed, what to do next."
          aria-invalid={Boolean(state.fieldErrors?.body)}
        />
      </Labeled>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Add note"}
      </Button>
      <Outcome state={state} />
    </form>
  );
}

/** Converts an ISO instant to the value a datetime-local input expects. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function ScheduleVisitForm({
  leadId,
  defaultStart,
  agents,
  admin,
}: {
  leadId: string;
  defaultStart?: string | null;
  agents: Array<{ id: string; full_name: string }>;
  admin: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    scheduleVisit,
    INITIAL,
  );
  const id = useId();

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="lead_id" value={leadId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Labeled label="Starts" htmlFor={`${id}-start`} required error={state.fieldErrors?.scheduled_start}>
          <Input
            id={`${id}-start`}
            name="scheduled_start"
            type="datetime-local"
            required
            defaultValue={toLocalInput(defaultStart)}
            aria-invalid={Boolean(state.fieldErrors?.scheduled_start)}
          />
        </Labeled>
        <Labeled label="Ends" htmlFor={`${id}-end`} required error={state.fieldErrors?.scheduled_end}>
          <Input
            id={`${id}-end`}
            name="scheduled_end"
            type="datetime-local"
            required
            defaultValue={toLocalInput(defaultStart)}
            aria-invalid={Boolean(state.fieldErrors?.scheduled_end)}
          />
        </Labeled>
      </div>

      {admin ? (
        /*
         * Only active agents, and never the admin themselves.
         *
         * This used to offer "Me (…)" as the first, default option, which
         * submitted an empty agent_id and fell back to the admin's own profile.
         * Migration 0009 rejects that: a visit may only be assigned to an active
         * agent, and an admin is not an agent. Offering it here would have left
         * the default selection permanently broken, so the list is the same set
         * the database accepts and the first agent is preselected.
         */
        <Labeled
          label="Agent"
          htmlFor={`${id}-agent`}
          hint={agents.length ? undefined : "No active agents to assign."}
        >
          <Select
            id={`${id}-agent`}
            name="agent_id"
            defaultValue={agents[0]?.id ?? ""}
            required={agents.length > 0}
          >
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.full_name}
              </option>
            ))}
          </Select>
        </Labeled>
      ) : null}

      <Labeled label="Internal note" htmlFor={`${id}-note`} error={state.fieldErrors?.internal_notes}>
        <Textarea
          id={`${id}-note`}
          name="internal_notes"
          rows={2}
          maxLength={4000}
          placeholder="Meeting point, who has the keys, what to check."
        />
      </Labeled>

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Scheduling…" : "Schedule visit"}
      </Button>
      <Outcome state={state} />
    </form>
  );
}

export function VisitUpdateForm({
  visitId,
  defaults,
  agentId,
}: {
  visitId: string;
  defaults: {
    status: "scheduled" | "completed" | "cancelled" | "no_show";
    outcome: VisitOutcome | null;
    internal_notes: string | null;
    scheduled_start: string;
    scheduled_end: string;
  };
  agentId: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    updateVisit as StatusAction,
    INITIAL,
  );
  const id = useId();

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="visit_id" value={visitId} />
      <input type="hidden" name="agent_id" value={agentId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Labeled label="Status" htmlFor={`${id}-status`} required error={state.fieldErrors?.status}>
          <Select id={`${id}-status`} name="status" defaultValue={defaults.status}>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="no_show">No show</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </Labeled>

        <Labeled
          label="Outcome"
          htmlFor={`${id}-outcome`}
          hint="Required for a completed or no-show visit."
          error={state.fieldErrors?.outcome}
        >
          <Select id={`${id}-outcome`} name="outcome" defaultValue={defaults.outcome ?? ""}>
            <option value="">Not recorded</option>
            {VISIT_OUTCOMES.map((value) => (
              <option key={value} value={value}>
                {VISIT_OUTCOME_LABELS[value]}
              </option>
            ))}
          </Select>
        </Labeled>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Labeled label="Starts" htmlFor={`${id}-start`} required error={state.fieldErrors?.scheduled_start}>
          <Input
            id={`${id}-start`}
            name="scheduled_start"
            type="datetime-local"
            required
            defaultValue={toLocalInput(defaults.scheduled_start)}
          />
        </Labeled>
        <Labeled label="Ends" htmlFor={`${id}-end`} required error={state.fieldErrors?.scheduled_end}>
          <Input
            id={`${id}-end`}
            name="scheduled_end"
            type="datetime-local"
            required
            defaultValue={toLocalInput(defaults.scheduled_end)}
          />
        </Labeled>
      </div>

      <Labeled label="Internal notes" htmlFor={`${id}-notes`} error={state.fieldErrors?.internal_notes}>
        <Textarea
          id={`${id}-notes`}
          name="internal_notes"
          rows={4}
          maxLength={4000}
          defaultValue={defaults.internal_notes ?? ""}
          placeholder="What the buyer asked, what the owner offered, what happens next."
        />
      </Labeled>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save visit"}
      </Button>
      <Outcome state={state} />
    </form>
  );
}