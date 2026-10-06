import type { Metadata } from "next";
import { requestPasswordReset } from "@/server/actions/auth";
import { ResetRequestForm } from "@/components/reset-request-form";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <div className="rounded-lg border border-sand-300 bg-white p-7 shadow-card">
      <h1 className="font-display text-2xl text-navy-900">Reset your password</h1>
      <p className="mt-2 text-sm leading-relaxed text-sand-700">
        Enter the email address you sign in with. If it matches a staff account, we will email a
        reset link to it.
      </p>
      <div className="mt-6">
        <ResetRequestForm action={requestPasswordReset} />
      </div>
    </div>
  );
}