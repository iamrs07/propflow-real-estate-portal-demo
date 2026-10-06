"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { FormState } from "@/lib/validation";
import { Alert, Button, Labeled, Input } from "@/components/ui";

const INITIAL: FormState = { ok: false };

export function SignInForm({
  action,
  redirectTo,
  defaultEmail = "",
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  redirectTo: string;
  defaultEmail?: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={redirectTo} />

      {state.formError ? <Alert tone="critical">{state.formError}</Alert> : null}

      <Labeled label="Email address" htmlFor="email" required error={errors.email}>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          required
          defaultValue={state.values?.email ?? defaultEmail}
          aria-invalid={Boolean(errors.email)}
        />
      </Labeled>

      <Labeled label="Password" htmlFor="password" required error={errors.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={200}
          aria-invalid={Boolean(errors.password)}
        />
      </Labeled>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/auth/forgot-password"
          className="text-sm text-navy-200 underline underline-offset-4 hover:text-gold-400"
        >
          Forgot your password?
        </Link>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </div>
    </form>
  );
}