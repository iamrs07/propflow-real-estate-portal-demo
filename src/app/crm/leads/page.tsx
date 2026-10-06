import type { Metadata } from "next";
import Link from "next/link";
import { isAdmin, requireSessionProfile } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { listLeads, listTeam } from "@/lib/data/crm";
import { LEAD_SOURCE_LABELS, LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/lib/domain";
import { leadTone } from "@/lib/status-tone";
import { formatDateTime, formatRelative, telHref, whatsappHref } from "@/lib/format";
import { Badge, Card, EmptyState, Input, Select, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Leads" };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await requireSessionProfile();
  const params = await searchParams;
  const admin = isAdmin(profile);

  const rawStatus = first(params.status);
  const rawAssigned = first(params.assignedTo);
  const search = first(params.search).slice(0, 80);

  const status = LEAD_STATUSES.includes(rawStatus as (typeof LEAD_STATUSES)[number])
    ? rawStatus
    : null;
  const assignedTo = rawAssigned === "unassigned" || rawAssigned ? rawAssigned : null;

  const [leads, team] = await Promise.all([
    listLeads(profile, { search: search || undefined, status, assignedTo }),
    listTeam(),
  ]);

  const agents = team.filter((member) => member.is_active);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl text-navy-900">Leads</h1>
        <p className="mt-2 text-[15px] text-sand-700">
          {admin
            ? "Every enquiry in the brokerage. Assign an owner so somebody can act on it."
            : "Leads assigned to you. You cannot see other agents' leads."}
        </p>
      </header>

      <form
        action="/crm/leads"
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-sand-300 bg-white p-4 shadow-card"
        aria-label="Filter leads"
      >
        <div className="min-w-52 flex-1">
          <label htmlFor="lead-search" className="mb-1.5 block text-xs font-medium text-sand-600 uppercase">
            Search
          </label>
          <Input
            id="lead-search"
            name="search"
            type="search"
            placeholder="Name or phone"
            defaultValue={search}
            maxLength={80}
          />
        </div>

        <div className="w-44">
          <label htmlFor="lead-status" className="mb-1.5 block text-xs font-medium text-sand-600 uppercase">
            Status
          </label>
          <Select id="lead-status" name="status" defaultValue={status ?? ""}>
            <option value="">All statuses</option>
            {LEAD_STATUSES.map((value) => (
              <option key={value} value={value}>
                {LEAD_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>

        {admin ? (
          <div className="w-48">
            <label htmlFor="lead-agent" className="mb-1.5 block text-xs font-medium text-sand-600 uppercase">
              Assigned to
            </label>
            <Select id="lead-agent" name="assignedTo" defaultValue={assignedTo ?? ""}>
              <option value="">Anyone</option>
              <option value="unassigned">Unassigned</option>
              {agents.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="rounded-md bg-navy-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-700"
          >
            Filter
          </button>
          {search || status || assignedTo ? (
            <Link
              href="/crm/leads"
              className="rounded-md px-3 py-2.5 text-sm text-sand-700 transition-colors hover:bg-sand-200"
            >
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      <p className="text-sm text-sand-600" aria-live="polite">
        {leads.length === 1 ? "1 lead" : `${leads.length} leads`}
      </p>

      {leads.length === 0 ? (
        <EmptyState
          title="No leads match"
          description={
            admin
              ? "Nothing matches these filters. New enquiries from the public site appear here automatically."
              : "Nothing assigned to you matches these filters."
          }
        />
      ) : (
        <ul className="space-y-3">
          {leads.map((lead) => (
            <li key={lead.id}>
              <Card
                className={cx(
                  "p-4 transition-colors hover:border-navy-300",
                  lead.status === "new" && "border-l-2 border-l-gold-500",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/crm/leads/${lead.id}`}
                        className="font-display text-lg text-navy-900 underline-offset-4 hover:underline"
                      >
                        {lead.full_name}
                      </Link>
                      <Badge tone={leadTone(lead.status)}>{LEAD_STATUS_LABELS[lead.status]}</Badge>
                      {!lead.assigned_to && admin ? (
                        <Badge tone="caution">Unassigned</Badge>
                      ) : null}
                    </div>

                    <p className="mt-1.5 text-sm text-sand-700">
                      {telHref(lead.phone, { inert: isDemoMode() }) ? (
                        <a href={telHref(lead.phone, { inert: isDemoMode() }) ?? "#"} className="tabular-nums hover:text-navy-900">
                          {lead.phone}
                        </a>
                      ) : (
                        lead.phone
                      )}
                      {whatsappHref(lead.phone, { inert: isDemoMode() }) ? (
                        <>
                          <span aria-hidden="true" className="mx-2 text-sand-400">
                            ·
                          </span>
                          <a
                            href={whatsappHref(lead.phone, { inert: isDemoMode() }) ?? "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-navy-900"
                          >
                            WhatsApp
                          </a>
                        </>
                      ) : null}
                      {lead.email ? (
                        <>
                          <span aria-hidden="true" className="mx-2 text-sand-400">
                            ·
                          </span>
                          <a href={`mailto:${lead.email}`} className="hover:text-navy-900">
                            {lead.email}
                          </a>
                        </>
                      ) : null}
                    </p>

                    <p className="mt-1 text-sm text-sand-600">
                      {LEAD_SOURCE_LABELS[lead.source]}
                      {lead.property ? (
                        <>
                          <span aria-hidden="true" className="mx-2 text-sand-400">
                            ·
                          </span>
                          {lead.property.reference_code} · {lead.property.title}
                        </>
                      ) : null}
                    </p>

                    {lead.message ? (
                      <p className="mt-2 line-clamp-2 max-w-2xl text-sm leading-relaxed text-sand-700">
                        {lead.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="w-full shrink-0 text-right text-xs text-sand-600 sm:w-48">
                    <p>{lead.assignee ? lead.assignee.full_name : "Unassigned"}</p>
                    <p className="mt-1">{formatRelative(lead.created_at)}</p>
                    <p className="mt-1">Consent {formatDateTime(lead.consent_at)}</p>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}