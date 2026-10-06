import type { Metadata } from "next";
import { updatePassword } from "@/server/actions/auth";
import { UpdatePasswordForm } from "@/components/update-password-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <div className="rounded-lg border border-sand-300 bg-white p-7 shadow-card">
      <h1 className="font-display text-2xl text-navy-900">Choose a new password</h1>
      <p className="mt-2 text-sm leading-relaxed text-sand-700">
        You opened this page from a reset link. Set a new password to finish.
      </p>
      <div className="mt-6">
        <UpdatePasswordForm action={updatePassword} />
      </div>
    </div>
  );
}