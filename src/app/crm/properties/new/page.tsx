import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createProperty } from "@/server/actions/properties";
import { PropertyForm } from "@/components/property-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New listing" };

export default async function NewPropertyPage() {
  // Admin only: agents cannot create or change listings.
  await requireAdmin();

  return (
    <div className="space-y-6">
      <header className="max-w-2xl">
        <h1 className="font-display text-3xl text-navy-900">New listing</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-sand-700">
          Create the listing as a draft, add photographs, then publish it when it is ready. Nothing
          here is visible to the public until the status is set to published and the home is marked
          available.
        </p>
      </header>

      <PropertyForm action={createProperty} />
    </div>
  );
}