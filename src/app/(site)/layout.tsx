import type { ReactNode } from "react";
import { getAgency } from "@/lib/data/public";
import { isDemoMode } from "@/lib/env";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

/**
 * Public chrome. The agency record comes from api_public_agency(), which
 * returns only branding fields — never the tenant id or any other brokerage's
 * data.
 *
 * `contactInert` is resolved here, on the server, because this is the only place
 * the demo-mode flag can be read. Passing it down keeps the header and footer from
 * needing the flag themselves.
 */
export default async function SiteLayout({ children }: { children: ReactNode }) {
  const agency = await getAgency();
  const contactInert = isDemoMode();

  if (!agency) {
    return (
      <main id="main" className="flex flex-1 items-center justify-center px-6 py-24">
        <div className="max-w-md text-center">
          <h1 className="font-display text-2xl text-navy-900">The site is not configured yet</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-sand-700">
            No brokerage has been marked as serving the public site. Run the database migrations
            and the seed script, or check the environment settings.
          </p>
        </div>
      </main>
    );
  }

  return (
    <>
      <SiteHeader agency={agency} contactInert={contactInert} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter agency={agency} contactInert={contactInert} />
    </>
  );
}