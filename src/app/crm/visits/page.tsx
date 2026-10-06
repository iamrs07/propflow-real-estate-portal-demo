import type { Metadata } from "next";
import Link from "next/link";
import { isAdmin, requireSessionProfile } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { listVisits } from "@/lib/data/crm";
import { nowMs } from "@/lib/clock";
import { VISIT_OUTCOME_LABELS, LEAD_STATUS_LABELS, VISIT_STATUS_LABELS } from "@/lib/domain";
import { leadTone, visitTone } from "@/lib/status-tone";
import {
  formatDateTime,
  formatDuration,
  formatVisitSlot,
  telHref,
} from "@/lib/format";
import { Badge, Card, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Visits" };

export default async function VisitsPage() {
  const profile = await requireSessionProfile();
  const admin = isAdmin(profile);

  const visits = await listVisits(profile);
  const now = nowMs();
  const upcoming = visits.filter(
    (visit) => visit.status === "scheduled" && new Date(visit.scheduled_start).getTime() >= now,
  );
  const past = visits.filter(
    (visit) => visit.status !== "scheduled" || new Date(visit.scheduled_start).getTime() < now,
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl text-navy-900">Site visits</h1>
        <p className="mt-2 text-[15px] text-sand-700">
          {admin
            ? "Every visit booked in the brokerage."
            : "Visits where you are the assigned agent."}
        </p>
      </header>

      <section aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading" className="font-display text-xl text-navy-900">
          Upcoming ({upcoming.length})
        </h2>
        <div className="mt-4 space-y-3">
          {upcoming.length === 0 ? (
            <EmptyState
              title="Nothing scheduled"
              description="Open a lead and book a visit to fill this list."
              action={
                <Link
                  href="/crm/leads"
                  className="rounded-md border border-navy-300 bg-white px-4 py-2 text-sm text-navy-900"
                >
                  Go to leads
                </Link>
              }
            />
          ) : (
            <VisitTable visits={upcoming} />
          )}
        </div>
      </section>

      <section aria-labelledby="past-heading">
        <h2 id="past-heading" className="font-display text-xl text-navy-900">
          Earlier and closed ({past.length})
        </h2>
        <div className="mt-4 space-y-3">
          {past.length === 0 ? (
            <EmptyState title="Nothing here yet" />
          ) : (
            <VisitTable visits={past} />
          )}
        </div>
      </section>
    </div>
  );
}

function VisitTable({
  visits,
}: {
  visits: Awaited<ReturnType<typeof listVisits>>;
}) {
  return (
    <ul className="space-y-3">
      {visits.map((visit) => (
        <li key={visit.id}>
          <Card className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/crm/visits/${visit.id}`}
                    className="font-display text-lg text-navy-900 underline-offset-4 hover:underline"
                  >
                    {visit.lead?.full_name ?? "Lead removed"}
                  </Link>
                  {visit.lead ? (
                    <Badge tone={leadTone(visit.lead.status)}>
                      {LEAD_STATUS_LABELS[visit.lead.status]}
                    </Badge>
                  ) : null}
                </div>

                <p className="mt-1 text-sm font-medium text-navy-800">
                  {formatVisitSlot(visit.scheduled_start, visit.scheduled_end)} ·{" "}
                  {formatDuration(visit.scheduled_start, visit.scheduled_end)}
                </p>

                <p className="mt-1 text-sm text-sand-600">
                  Agent: {visit.agent?.full_name ?? "Unassigned"}
                  {visit.property ? ` · ${visit.property.reference_code} · ${visit.property.title}` : ""}
                </p>

                {visit.lead?.phone ? (
                  <p className="mt-1 text-sm text-sand-600">
                    <a href={telHref(visit.lead.phone, { inert: isDemoMode() }) ?? "#"} className="tabular-nums hover:text-navy-900">
                      {visit.lead.phone}
                    </a>
                  </p>
                ) : null}

                {visit.outcome ? (
                  <p className="mt-2 text-sm text-sand-700">
                    Outcome: <span className="font-medium">{VISIT_OUTCOME_LABELS[visit.outcome]}</span>
                  </p>
                ) : null}

                {visit.internal_notes ? (
                  <p className="mt-2 line-clamp-2 max-w-3xl rounded-md bg-sand-100 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap text-sand-700">
                    {visit.internal_notes}
                  </p>
                ) : null}
              </div>

              <div className="text-right">
                <Badge tone={visitTone(visit.status)}>{VISIT_STATUS_LABELS[visit.status]}</Badge>
                <p className="mt-2 text-xs text-sand-600">
                  Booked {formatDateTime(visit.created_at)}
                </p>
                <Link
                  href={`/crm/visits/${visit.id}`}
                  className="mt-2 inline-block text-sm text-navy-800 underline underline-offset-4 hover:text-gold-700"
                >
                  Open
                </Link>
              </div>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}