"use client";

import { useActionState, useId } from "react";
import type { FormState } from "@/lib/validation";
import type { Profile } from "@/lib/data/types";
import { APP_ROLES } from "@/lib/domain";
import {
  createTeamMember,
  reactivateTeamMember,
  sendMemberReset,
  updateTeamMember,
} from "@/server/actions/team";
import { Alert, Badge, Button, Input, Labeled, Select } from "@/components/ui";

const INITIAL: FormState = { ok: false };

function Outcome({ state }: { state: FormState }) {
  if (state.formError) return <Alert tone="critical">{state.formError}</Alert>;
  if (state.notice) return <Alert tone="info">{state.notice}</Alert>;
  if (state.success) return <Alert tone="positive">Saved.</Alert>;
  return null;
}

export function AddTeamMemberForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    createTeamMember,
    INITIAL,
  );
  const id = useId();
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.formError ? <Alert tone="critical">{state.formError}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Labeled label="Full name" htmlFor={`${id}-name`} required error={errors.full_name}>
          <Input
            id={`${id}-name`}
            name="full_name"
            maxLength={120}
            required
            autoComplete="off"
            aria-invalid={Boolean(errors.full_name)}
          />
        </Labeled>

        <Labeled label="Email address" htmlFor={`${id}-email`} required error={errors.email}>
          <Input
            id={`${id}-email`}
            name="email"
            type="email"
            maxLength={254}
            required
            autoComplete="off"
            aria-invalid={Boolean(errors.email)}
          />
        </Labeled>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Labeled label="Role" htmlFor={`${id}-role`} required error={errors.role}>
          <Select id={`${id}-role`} name="role" defaultValue="agent">
            {APP_ROLES.map((value) => (
              <option key={value} value={value}>
                {value === "admin" ? "Admin" : "Agent"}
              </option>
            ))}
          </Select>
        </Labeled>

        <Labeled label="Job title" htmlFor={`${id}-title`} error={errors.title}>
          <Input id={`${id}-title`} name="title" maxLength={120} placeholder="Senior Agent" />
        </Labeled>

        <Labeled label="Phone" htmlFor={`${id}-phone`} error={errors.phone}>
          <Input id={`${id}-phone`} name="phone" type="tel" maxLength={24} />
        </Labeled>
      </div>

      <Labeled
        label="Starting password"
        htmlFor={`${id}-password`}
        required
        error={errors.password}
        hint="At least 12 characters. Share it over a channel you trust, then ask them to change it from the reset page."
      >
        <Input
          id={`${id}-password`}
          name="password"
          type="text"
          minLength={12}
          maxLength={200}
          required
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
        />
      </Labeled>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add team member"}
        </Button>
        {state.success ? <span className="text-sm text-positive-600">Added.</span> : null}
      </div>
    </form>
  );
}

export function EditMemberForm({
  member,
  isSelf,
}: {
  member: Profile;
  isSelf: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    updateTeamMember,
    INITIAL,
  );
  const [resetState, resetAction, resetPending] = useActionState<FormState, FormData>(
    sendMemberReset,
    INITIAL,
  );
  const [reactivateState, reactivateAction, reactivatePending] = useActionState<
    FormState,
    FormData
  >(reactivateTeamMember, INITIAL);

  const id = useId();
  const errors = state.fieldErrors ?? {};

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="member_id" value={member.id} />
        <input type="hidden" name="is_active" value={member.is_active ? "true" : "false"} />

        <div className="grid gap-4 sm:grid-cols-3">
          <Labeled label="Full name" htmlFor={`${id}-name`} required error={errors.full_name}>
            <Input
              id={`${id}-name`}
              name="full_name"
              defaultValue={member.full_name}
              maxLength={120}
              required
            />
          </Labeled>

          <Labeled label="Role" htmlFor={`${id}-role`} required error={errors.role}>
            <Select id={`${id}-role`} name="role" defaultValue={member.role}>
              {APP_ROLES.map((value) => (
                <option key={value} value={value}>
                  {value === "admin" ? "Admin" : "Agent"}
                </option>
              ))}
            </Select>
          </Labeled>

          <Labeled label="Job title" htmlFor={`${id}-title`} error={errors.title}>
            <Input
              id={`${id}-title`}
              name="title"
              defaultValue={member.title ?? ""}
              maxLength={120}
            />
          </Labeled>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" variant="secondary" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
          {isSelf ? (
            <span className="text-xs text-sand-600">
              This is you. You cannot deactivate your own account.
            </span>
          ) : null}
        </div>

        <Outcome state={state} />
      </form>

      <div className="flex flex-wrap gap-2 border-t border-sand-200 pt-3">
        <form action={resetAction}>
          <input type="hidden" name="member_id" value={member.id} />
          <Button type="submit" size="sm" variant="outline" disabled={resetPending}>
            {resetPending ? "Working…" : "Create reset link"}
          </Button>
        </form>

        {!member.is_active ? (
          <form action={reactivateAction}>
            <input type="hidden" name="member_id" value={member.id} />
            <Button type="submit" size="sm" variant="outline" disabled={reactivatePending}>
              {reactivatePending ? "Working…" : "Reactivate"}
            </Button>
          </form>
        ) : (
          <form action={action}>
            <input type="hidden" name="member_id" value={member.id} />
            <input type="hidden" name="full_name" value={member.full_name} />
            <input type="hidden" name="role" value={member.role} />
            <input type="hidden" name="title" value={member.title ?? ""} />
            <input type="hidden" name="is_active" value="false" />
            <Button type="submit" size="sm" variant="danger" disabled={pending}>
              Deactivate
            </Button>
          </form>
        )}
      </div>

      <Outcome state={resetState} />
      <Outcome state={reactivateState} />
    </div>
  );
}

export function RoleBadge({ role }: { role: Profile["role"] }) {
  return <Badge tone={role === "admin" ? "gold" : "navy"}>{role === "admin" ? "Admin" : "Agent"}</Badge>;
}