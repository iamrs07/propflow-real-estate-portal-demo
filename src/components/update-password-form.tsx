"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { FormState } from "@/lib/validation";
import { Alert, Button, Labeled, Input } from "@/components/ui";

const INITIAL: FormState = { ok: false };

export function UpdatePasswordForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const errors = state.fieldErrors ?? {};

  if (state.success) {
    return (
      <Alert tone="positive" title="Password updated">
        Your password has been changed.{" "}
        <Link href="/crm" className="font-medium underline underline-offset-4">
          Go to the dashboard
        </Link>
        .
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.formError ? <Alert tone="critical">{state.formError}</Alert> : null}

      <Labeled
        label="New password"
        htmlFor="new-password"
        required
        hint="At least 12 characters. A short phrase you will remember beats a scrambled word."
        error={errors.password}
      >
        <Input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={200}
          aria-invalid={Boolean(errors.password)}
        />
      </Labeled>

      <Labeled
        label="Confirm new password"
        htmlFor="confirm-password"
        required
        error={errors.confirm}
      >
        <Input
          id="confirm-password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          maxLength={200}
          aria-invalid={Boolean(errors.confirm)}
        />
      </Labeled>

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}