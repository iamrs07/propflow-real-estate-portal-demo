import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin, requireSessionProfile } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import {
  getLead,
  listLeadEvents,
  listLeadNotes,
  listAssignableAgents,
  listVisits,
} from "@/lib/data/crm";
import {
  CONTACT_PREFERENCE_LABELS,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  VISIT_OUTCOME_LABELS,
  VISIT_STATUS_LABELS,
} from "@/lib/domain";
import { leadTone, visitTone } from "@/lib/status-tone";
import {
  formatDateTime,
  formatDuration,
  formatRelative,
  formatVisitSlot,
  telHref,
  whatsappHref,
} from "@/lib/format";
import { Badge, Card, DetailRow, EmptyState } from "@/components/ui";
import {
  AssignForm,
  NoteForm,
  ScheduleVisitForm,
  StatusForm,
} from "@/components/crm-forms";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Lead" };

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireSessionProfile();
  const admin = isAdmin(profile);

  const lead = await getLead(profile, id);

  // A lead outside this agent's assignment is indistinguishable from a missing
  // one: RLS simply does not return the row.
  if (!lead) notFound();

  const [notes, events, visits, assignableAgents] = await Promise.all([
    listLeadNotes(profile, lead.id),
    listLeadEvents(profile, lead.id),
    listVisits(profile, { leadId: lead.id }),
    listAssignableAgents(),
  ]);

  // Only active agents can be assigned work, so only active agents are offered.
  const agents = assignableAgents.map((member) => ({
    id: member.id,
    full_name: member.full_name,
    role: member.role,
  }));

  const nextVisit = visits.find(
    (visit) => visit.status === "scheduled" && new Date(visit.scheduled_start) >= new Date(),
  );

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link
          href="/crm/leads"
          className="text-sand-600 underline-offset-4 hover:text-navy-900 hover:underline"
        >
          Leads
        </Link>
        <span aria-hidden="true" className="mx-2 text-sand-400">
          /
        </span>
        <span className="text-navy-900">{lead.full_name}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl text-navy-900">{lead.full_name}</h1>
            <Badge tone={leadTone(lead.status)}>{LEAD_STATUS_LABELS[lead.status]}</Badge>
            {!lead.assigned_to ? <Badge tone="caution">Unassigned</Badge> : null}
          </div>
          <p className="mt-2 text-sm text-sand-600">
            Enquiry received {formatDateTime(lead.created_at)} ·{" "}
            {LEAD_SOURCE_LABELS[lead.source]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {telHref(lead.phone, { inert: isDemoMode() }) ? (
            <a
              href={telHref(lead.phone, { inert: isDemoMode() }) ?? "#"}
              className="rounded-md bg-gold-500 px-4 py-2 text-sm font-medium text-navy-950 transition-colors hover:bg-gold-400"
            >
              Call
            </a>
          ) : null}
          {whatsappHref(lead.phone, { inert: isDemoMode() }) ? (
            <a
              href={whatsappHref(lead.phone, { inert: isDemoMode() }) ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-navy-300 bg-white px-4 py-2 text-sm font-medium text-navy-900 transition-colors hover:border-navy-500"
            >
              WhatsApp
            </a>
          ) : null}
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          {/* ------------------------------------------------------ timeline */}
          <section aria-labelledby="timeline">
            <h2 id="timeline" className="font-display text-xl text-navy-900">
              Timeline
            </h2>

            <ol className="mt-4 space-y-0 border-l border-sand-300 pl-5">
              {events.map((event) => (
                <li key={event.id} className="relative pb-5">
                  <span
                    aria-hidden="true"
                    className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-gold-500"
                  />
                  <p className="text-sm text-navy-900">
                    Status moved from{" "}
                    <span className="font-medium">{LEAD_STATUS_LABELS[event.from_status]}</span> to{" "}
                    <span className="font-medium">{LEAD_STATUS_LABELS[event.to_status]}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-sand-600">
                    {event.actor?.full_name ?? "System"} · {formatDateTime(event.created_at)}
                  </p>
                </li>
              ))}

              {notes.map((note) => (
                <li key={note.id} className="relative pb-5">
                  <span
                    aria-hidden="true"
                    className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-navy-300"
                  />
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-navy-900">
                    {note.body}
                  </p>
                  <p className="mt-0.5 text-xs text-sand-600">
                    Note by {note.author?.full_name ?? "Former staff member"} ·{" "}
                    {formatDateTime(note.created_at)}
                  </p>
                </li>
              ))}

              <li className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-navy-200"
                />
                <p className="text-sm text-navy-900">Enquiry received</p>
                <p className="mt-0.5 text-xs text-sand-600">
                  {formatDateTime(lead.created_at)} · consent recorded at the same moment
                </p>
              </li>
            </ol>

            {events.length === 0 && notes.length === 0 ? (
              <p className="mt-3 text-sm text-sand-600">
                No activity recorded yet. Change the status or add a note to start the history.
              </p>
            ) : null}
          </section>

          {/* --------------------------------------------------------- visits */}
          <section aria-labelledby="visits">
            <h2 id="visits" className="font-display text-xl text-navy-900">
              Site visits
            </h2>

            <div className="mt-4 space-y-3">
              {visits.length === 0 ? (
                <EmptyState
                  title="No visits booked"
                  description="Use the panel to book the first site visit for this lead."
                />
              ) : (
                visits.map((visit) => (
                  <Card key={visit.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-navy-900">
                          {formatVisitSlot(visit.scheduled_start, visit.scheduled_end)}
                        </p>
                        <p className="mt-1 text-sm text-sand-600">
                          {formatDuration(visit.scheduled_start, visit.scheduled_end)} · Agent:{" "}
                          {visit.agent?.full_name ?? "Unassigned"}
                        </p>
                        {visit.property ? (
                          <p className="mt-1 text-sm text-sand-600">
                            {visit.property.reference_code} · {visit.property.title}
                          </p>
                        ) : null}
                        {visit.internal_notes ? (
                          <p className="mt-2 rounded-md bg-sand-100 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap text-sand-700">
                            {visit.internal_notes}
                          </p>
                        ) : null}
                        {visit.outcome ? (
                          <p className="mt-2 text-sm text-sand-700">
                            Outcome: <span className="font-medium">{VISIT_OUTCOME_LABELS[visit.outcome]}</span>
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge tone={visitTone(visit.status)}>
                          {VISIT_STATUS_LABELS[visit.status]}
                        </Badge>
                        <Link
                          href={`/crm/visits/${visit.id}`}
                          className="text-sm text-navy-800 underline underline-offset-4 hover:text-gold-700"
                        >
                          Open visit
                        </Link>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </section>

          {/* ---------------------------------------------------------- notes */}
          <section aria-labelledby="add-note">
            <h2 id="add-note" className="font-display text-xl text-navy-900">
              Add a note
            </h2>
            <Card className="mt-4 p-5">
              <NoteForm leadId={lead.id} />
            </Card>
          </section>
        </div>

        {/* --------------------------------------------------------- sidebar */}
        <aside className="space-y-6">
          <Card className="p-5">
            <h2 className="font-display text-lg text-navy-900">Contact</h2>
            <dl className="mt-2 divide-y divide-sand-200">
              <DetailRow label="Phone">
                {telHref(lead.phone, { inert: isDemoMode() }) ? (
                  <a href={telHref(lead.phone, { inert: isDemoMode() }) ?? "#"} className="tabular-nums underline underline-offset-4">
                    {lead.phone}
                  </a>
                ) : (
                  lead.phone
                )}
              </DetailRow>
              <DetailRow label="Email">
                {lead.email ? (
                  <a href={`mailto:${lead.email}`} className="underline underline-offset-4">
                    {lead.email}
                  </a>
                ) : (
                  "Not given"
                )}
              </DetailRow>
              <DetailRow label="Prefers">{CONTACT_PREFERENCE_LABELS[lead.preferred_contact]}</DetailRow>
              <DetailRow label="Preferred visit">
                {lead.preferred_visit_at ? formatDateTime(lead.preferred_visit_at) : "No preference given"}
              </DetailRow>
              <DetailRow label="Consent recorded">{formatDateTime(lead.consent_at)}</DetailRow>
            </dl>
          </Card>

          {lead.message ? (
            <Card className="p-5">
              <h2 className="font-display text-lg text-navy-900">Their message</h2>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-sand-700">
                {lead.message}
              </p>
            </Card>
          ) : null}

          <Card className="p-5">
            <h2 className="font-display text-lg text-navy-900">Listing</h2>
            {lead.property ? (
              <div className="mt-2">
                <p className="font-medium text-navy-900">{lead.property.title}</p>
                <p className="mt-1 text-sm text-sand-600">
                  {lead.property.reference_code} · {lead.property.locality}, {lead.property.city}
                </p>
                <Link
                  href={`/crm/properties/${lead.property.id}`}
                  className="mt-3 inline-block text-sm text-navy-800 underline underline-offset-4 hover:text-gold-700"
                >
                  Open listing
                </Link>
              </div>
            ) : (
              <p className="mt-2 text-sm text-sand-600">
                This enquiry is not attached to a listing.
              </p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-lg text-navy-900">Move this lead</h2>
            <div className="mt-3 space-y-5">
              <StatusForm leadId={lead.id} current={lead.status} />
              <div className="border-t border-sand-200 pt-4">
                <AssignForm
                  leadId={lead.id}
                  current={lead.assigned_to}
                  agents={agents}
                  disabledReason={
                    admin
                      ? undefined
                      : "Only an administrator can change who a lead is assigned to."
                  }
                />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-lg text-navy-900">Schedule a visit</h2>
            <p className="mt-1 text-sm text-sand-600">
              {nextVisit
                ? `Next visit: ${formatVisitSlot(nextVisit.scheduled_start, nextVisit.scheduled_end)}.`
                : "Book the site visit and confirm the slot with the client."}
            </p>
            <div className="mt-4">
              <ScheduleVisitForm
                leadId={lead.id}
                defaultStart={nextVisit?.scheduled_start ?? null}
                agents={agents.map((agent) => ({ id: agent.id, full_name: agent.full_name }))}
                admin={admin}
              />
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-lg text-navy-900">Record</h2>
            <dl className="mt-2 divide-y divide-sand-200">
              <DetailRow label="Created">{formatRelative(lead.created_at)}</DetailRow>
              <DetailRow label="Last update">{formatRelative(lead.updated_at)}</DetailRow>
              <DetailRow label="Notes">{notes.length}</DetailRow>
              <DetailRow label="Visits">{visits.length}</DetailRow>
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}