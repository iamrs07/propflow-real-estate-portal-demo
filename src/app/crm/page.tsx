import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { isAdmin, requireSessionProfile } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { getDashboard } from "@/lib/data/crm";
import {
  LEAD_STATUS_LABELS,
  LEAD_SOURCE_LABELS,
  VISIT_STATUS_LABELS,
} from "@/lib/domain";
import { leadTone, visitTone } from "@/lib/status-tone";
import { formatDateTime, formatRelative, formatVisitSlot, telHref } from "@/lib/format";
import { Alert, Badge, Card, EmptyState, StatCard } from "@/components/ui";
import CrmLoading from "@/components/crm-loading";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Dashboard" };

/*
 * The dashboard is the one CRM page worth streaming: it waits on several
 * counts and lists, and a skeleton keeps the workspace from feeling stuck. The
 * Suspense boundary sits here rather than in `crm/loading.tsx` so the admin-only
 * routes can still refuse an agent with a real redirect rather than a 200.
 */
export default function DashboardPage() {
  return (
    <Suspense fallback={<CrmLoading />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const profile = await requireSessionProfile();
  const admin = isAdmin(profile);
  const data = await getDashboard(profile);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-gold-600 uppercase">
            {admin ? "Brokerage overview" : "Your workload"}
          </p>
          <h1 className="mt-2 font-display text-3xl text-navy-900">
            Good to see you, {profile.fullName.split(" ")[0]}
          </h1>
          <p className="mt-2 text-[15px] text-sand-700">
            {admin
              ? "Every lead and visit in this brokerage."
              : "Only leads assigned to you, and the visits you are running."}
          </p>
        </div>
        {admin && data.unassignedCount > 0 ? (
          <Link
            href="/crm/leads?assignedTo=unassigned"
            className="rounded-md border border-gold-500/60 bg-gold-100 px-4 py-2.5 text-sm font-medium text-gold-700 transition-colors hover:bg-gold-200"
          >
            {data.unassignedCount} unassigned lead
            {data.unassignedCount === 1 ? "" : "s"}
          </Link>
        ) : null}
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="New leads" value={data.counts.newLeads} tone="gold" hint="Status: new" />
        <StatCard
          label="Open leads"
          value={data.counts.openLeads}
          hint="Not yet closed"
        />
        <StatCard
          label="Upcoming visits"
          value={data.counts.scheduledVisits}
          tone="info"
          hint="Scheduled from now"
        />
        <StatCard
          label="Published listings"
          value={data.counts.publishedListings}
          hint="Visible on the site"
        />
      </div>

      {admin && data.unassignedCount > 0 ? (
        <Alert tone="caution" title="Leads waiting for an owner">
          {data.unassignedCount === 1 ? "One lead has" : `${data.unassignedCount} leads have`} no
          agent yet. Assign one so somebody can pick it up.
        </Alert>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr]">
        <section aria-labelledby="recent-leads">
          <div className="flex items-end justify-between gap-3">
            <h2 id="recent-leads" className="font-display text-xl text-navy-900">
              Recent leads
            </h2>
            <Link
              href="/crm/leads"
              className="text-sm text-navy-800 underline underline-offset-4 hover:text-gold-700"
            >
              All leads
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {data.recentLeads.length === 0 ? (
              <EmptyState
                title="No leads yet"
                description={
                  admin
                    ? "Enquiries from the public site appear here the moment someone submits the form."
                    : "Once an administrator assigns a lead to you, it will show up here."
                }
              />
            ) : (
              data.recentLeads.map((lead) => {
                const phone = telHref(lead.phone, { inert: isDemoMode() });
                return (
                  <Card key={lead.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/crm/leads/${lead.id}`}
                          className="font-medium text-navy-900 underline-offset-4 hover:underline"
                        >
                          {lead.full_name}
                        </Link>
                        <p className="mt-1 text-sm text-sand-600">
                          {phone ? (
                            <a href={phone} className="tabular-nums hover:text-navy-900">
                              {lead.phone}
                            </a>
                          ) : (
                            lead.phone
                          )}
                          <span aria-hidden="true" className="mx-2 text-sand-400">
                            ·
                          </span>
                          {LEAD_SOURCE_LABELS[lead.source]}
                        </p>
                        {lead.property ? (
                          <p className="mt-1 text-sm text-sand-600">
                            {lead.property.reference_code} · {lead.property.locality}
                          </p>
                        ) : (
                          <p className="mt-1 text-sm text-sand-600">No listing attached</p>
                        )}
                      </div>
                      <div className="text-right">
                        <Badge tone={leadTone(lead.status)}>
                          {LEAD_STATUS_LABELS[lead.status]}
                        </Badge>
                        <p className="mt-2 text-xs text-sand-600">
                          {formatRelative(lead.created_at)}
                        </p>
                        <p className="text-xs text-sand-600">
                          {lead.assignee ? lead.assignee.full_name : "Unassigned"}
                        </p>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </section>

        <section aria-labelledby="upcoming-visits">
          <div className="flex items-end justify-between gap-3">
            <h2 id="upcoming-visits" className="font-display text-xl text-navy-900">
              Upcoming visits
            </h2>
            <Link
              href="/crm/visits"
              className="text-sm text-navy-800 underline underline-offset-4 hover:text-gold-700"
            >
              All visits
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {data.upcomingVisits.length === 0 ? (
              <EmptyState
                title="Nothing scheduled"
                description="Open a lead and book a site visit to see it here."
              />
            ) : (
              data.upcomingVisits.map((visit) => (
                <Card key={visit.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/crm/visits/${visit.id}`}
                        className="font-medium text-navy-900 underline-offset-4 hover:underline"
                      >
                        {visit.lead?.full_name ?? "Lead removed"}
                      </Link>
                      <p className="mt-1 text-sm font-medium text-navy-800">
                        {formatVisitSlot(visit.scheduled_start, visit.scheduled_end)}
                      </p>
                      {visit.property ? (
                        <p className="mt-1 text-sm text-sand-600">
                          {visit.property.reference_code} · {visit.property.title}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-sand-600">
                        Agent: {visit.agent?.full_name ?? "Unassigned"} · Booked{" "}
                        {formatDateTime(visit.created_at)}
                      </p>
                    </div>
                    <Badge tone={visitTone(visit.status)}>
                      {VISIT_STATUS_LABELS[visit.status]}
                    </Badge>
                  </div>
                </Card>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}