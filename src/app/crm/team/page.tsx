import type { Metadata } from "next";
import { requireAdmin, requireSessionProfile } from "@/lib/auth";
import { listTeam } from "@/lib/data/crm";
import { formatDate } from "@/lib/format";
import { Alert, Badge, Card, DetailRow, SectionHeading } from "@/components/ui";
import { AddTeamMemberForm, EditMemberForm, RoleBadge } from "@/components/team-forms";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  // Admin only. requireAdmin resolves the tenant from `profiles` and redirects
  // an agent away before anything is read.
  await requireAdmin();
  const profile = await requireSessionProfile();
  const team = await listTeam();

  const active = team.filter((member) => member.is_active);
  const inactive = team.filter((member) => !member.is_active);

  return (
    <div className="space-y-8">
      <header className="max-w-2xl">
        <h1 className="font-display text-3xl text-navy-900">Team</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-sand-700">
          Staff accounts are created here. There is no public sign-up, and an agent cannot create
          accounts, change roles or see this page.
        </p>
      </header>

      <Alert tone="info" title="How accounts work">
        Adding a member creates a sign-in account with the starting password you set. Share it
        privately and ask them to change it from the password reset page. Deactivating a member
        removes their access immediately, including the leads assigned to them.
      </Alert>

      <section aria-labelledby="add-heading">
        <Card className="p-6">
          <SectionHeading eyebrow="New member" title="Add a team member" />
          <div className="mt-5">
            <AddTeamMemberForm />
          </div>
        </Card>
      </section>

      <section aria-labelledby="active-heading" className="space-y-4">
        <h2 id="active-heading" className="font-display text-2xl text-navy-900">
          Active ({active.length})
        </h2>

        {active.length === 0 ? (
          <Card className="p-6">
            <p className="text-sm text-sand-600">No active team members yet.</p>
          </Card>
        ) : (
          <ul className="space-y-4">
            {active.map((member) => (
              <li key={member.id}>
                <Card className="p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-sand-200 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-lg text-navy-900">
                        {member.full_name}
                      </span>
                      <RoleBadge role={member.role} />
                      {member.id === profile.id ? <Badge tone="neutral">You</Badge> : null}
                    </div>
                    <dl className="flex flex-wrap gap-x-8">
                      <DetailRow label="Phone" className="py-0">
                        {member.phone ?? "—"}
                      </DetailRow>
                      <DetailRow label="Since" className="py-0">
                        {formatDate(member.created_at)}
                      </DetailRow>
                    </dl>
                  </div>

                  <EditMemberForm member={member} isSelf={member.id === profile.id} />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {inactive.length > 0 ? (
        <section aria-labelledby="inactive-heading" className="space-y-4">
          <h2 id="inactive-heading" className="font-display text-2xl text-navy-900">
            Deactivated ({inactive.length})
          </h2>
          <ul className="space-y-4">
            {inactive.map((member) => (
              <li key={member.id}>
                <Card className="p-5 opacity-90">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-sand-200 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-lg text-navy-900">
                        {member.full_name}
                      </span>
                      <RoleBadge role={member.role} />
                      <Badge tone="critical">No access</Badge>
                    </div>
                  </div>
                  <EditMemberForm member={member} isSelf={false} />
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}