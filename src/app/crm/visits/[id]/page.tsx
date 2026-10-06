import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin, requireSessionProfile } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { getVisit } from "@/lib/data/crm";
import { isPast } from "@/lib/clock";
import { LEAD_STATUS_LABELS, VISIT_OUTCOME_LABELS } from "@/lib/domain";
import { leadTone, visitTone } from "@/lib/status-tone";
import {
  formatDateTime,
  formatDuration,
  formatVisitSlot,
  telHref,
  whatsappHref,
} from "@/lib/format";
import { Badge, Card, DetailRow, EmptyState } from "@/components/ui";
import { VisitUpdateForm } from "@/components/crm-forms";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Visit" };

export default async function VisitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireSessionProfile();
  const visit = await getVisit(profile, id);

  if (!visit) notFound();

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link
          href="/crm/visits"
          className="text-sand-600 underline-offset-4 hover:text-navy-900 hover:underline"
        >
          Visits
        </Link>
        <span aria-hidden="true" className="mx-2 text-sand-400">
          /
        </span>
        <span className="text-navy-900">{visit.lead?.full_name ?? "Visit"}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl text-navy-900">
              {formatVisitSlot(visit.scheduled_start, visit.scheduled_end)}
            </h1>
            <Badge tone={visitTone(visit.status)}>
              {visit.status === "scheduled"
                ? "Scheduled"
                : visit.status === "no_show"
                  ? "No show"
                  : visit.status.charAt(0).toUpperCase() + visit.status.slice(1)}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-sand-600">
            {formatDuration(visit.scheduled_start, visit.scheduled_end)} · Agent:{" "}
            {visit.agent?.full_name ?? "Unassigned"}
          </p>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="font-display text-xl text-navy-900">Update this visit</h2>
            <p className="mt-1 text-sm text-sand-600">
              Move the times, record what happened, and keep the internal note current.
            </p>
            <div className="mt-5">
              <VisitUpdateForm
                visitId={visit.id}
                agentId={visit.agent_id}
                defaults={{
                  status: visit.status,
                  outcome: visit.outcome,
                  internal_notes: visit.internal_notes,
                  scheduled_start: visit.scheduled_start,
                  scheduled_end: visit.scheduled_end,
                }}
              />
            </div>
          </Card>

          {visit.internal_notes ? (
            <Card className="p-6">
              <h2 className="font-display text-xl text-navy-900">Current internal note</h2>
              <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-wrap text-sand-700">
                {visit.internal_notes}
              </p>
              <p className="mt-3 text-xs text-sand-600">
                Internal only. Notes are never shown on the public site.
              </p>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-6">
          <Card className="p-5">
            <h2 className="font-display text-lg text-navy-900">Lead</h2>
            {visit.lead ? (
              <div className="mt-2">
                <Link
                  href={`/crm/leads/${visit.lead.id}`}
                  className="font-medium text-navy-900 underline underline-offset-4"
                >
                  {visit.lead.full_name}
                </Link>
                <div className="mt-2">
                  <Badge tone={leadTone(visit.lead.status)}>
                    {LEAD_STATUS_LABELS[visit.lead.status]}
                  </Badge>
                </div>
                <dl className="mt-3 divide-y divide-sand-200">
                  <DetailRow label="Phone">
                    {telHref(visit.lead.phone, { inert: isDemoMode() }) ? (
                      <a href={telHref(visit.lead.phone, { inert: isDemoMode() }) ?? "#"} className="tabular-nums underline underline-offset-4">
                        {visit.lead.phone}
                      </a>
                    ) : (
                      visit.lead.phone
                    )}
                  </DetailRow>
                  {whatsappHref(visit.lead.phone, { inert: isDemoMode() }) ? (
                    <DetailRow label="WhatsApp">
                      <a
                        href={whatsappHref(visit.lead.phone, { inert: isDemoMode() }) ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-4"
                      >
                        Open chat
                      </a>
                    </DetailRow>
                  ) : null}
                </dl>
              </div>
            ) : (
              <p className="mt-2 text-sm text-sand-600">This lead was removed.</p>
            )}
          </Card>

          {visit.property ? (
            <Card className="p-5">
              <h2 className="font-display text-lg text-navy-900">Listing</h2>
              <p className="mt-2 font-medium text-navy-900">{visit.property.title}</p>
              <p className="mt-1 text-sm text-sand-600">{visit.property.reference_code}</p>
              <Link
                href={`/crm/properties/${visit.property.id}`}
                className="mt-3 inline-block text-sm text-navy-800 underline underline-offset-4"
              >
                Open listing
              </Link>
            </Card>
          ) : (
            <Card className="p-5">
              <h2 className="font-display text-lg text-navy-900">Listing</h2>
              <p className="mt-2 text-sm text-sand-600">
                No listing attached. The visit was booked from the lead&apos;s enquiry.
              </p>
            </Card>
          )}

          <Card className="p-5">
            <h2 className="font-display text-lg text-navy-900">Record</h2>
            <dl className="mt-2 divide-y divide-sand-200">
              <DetailRow label="Booked by">
                {isAdmin(profile) ? "Administrator or agent" : "Assigned agent"}
              </DetailRow>
              <DetailRow label="Booked at">{formatDateTime(visit.created_at)}</DetailRow>
              <DetailRow label="Last update">{formatDateTime(visit.updated_at)}</DetailRow>
              <DetailRow label="Outcome">
                {visit.outcome ? VISIT_OUTCOME_LABELS[visit.outcome] : "Not recorded"}
              </DetailRow>
            </dl>
          </Card>

          {visit.status === "scheduled" && isPast(visit.scheduled_start) ? (
            <EmptyState
              title="This visit is in the past"
              description="Mark it completed or a no-show and record the outcome so the record stays accurate."
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}