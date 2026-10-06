"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/validation";
import { Alert, Button, Labeled, Input } from "@/components/ui";

const INITIAL: FormState = { ok: false };

export function ResetRequestForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);

  if (state.success) {
    return (
      <Alert tone="positive" title="Check your inbox">
        If that address belongs to a staff account, a reset link is on its way. The link is valid
        for a short time. If it does not arrive, check the spam folder or ask an administrator to
        confirm your address.
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.formError ? <Alert tone="critical">{state.formError}</Alert> : null}

      <Labeled label="Email address" htmlFor="reset-email" required>
        <Input
          id="reset-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          required
        />
      </Labeled>

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Email me a reset link"}
      </Button>
    </form>
  );
}