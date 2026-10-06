import Link from "next/link";
import type { Agency } from "@/lib/data/types";
import { SIGN_IN_PATH } from "@/lib/auth-paths";
import { listSentence, telHref, whatsappHref } from "@/lib/format";

/** `contactInert` is supplied by the server layout; see SiteHeader for why. */
export function SiteFooter({ agency, contactInert = false }: { agency: Agency; contactInert?: boolean }) {
  const phone = telHref(agency.phone, { inert: contactInert });
  const whatsapp = whatsappHref(agency.whatsapp, { inert: contactInert });

  return (
    <footer className="mt-auto bg-navy-900 text-navy-100">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3">
        <div>
          <p className="font-display text-xl text-white">{agency.name}</p>
          {agency.tagline ? (
            <p className="mt-2 text-sm leading-relaxed text-navy-200">{agency.tagline}</p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-3">
            {phone ? (
              <a
                href={phone}
                className="rounded-md border border-navy-600 px-3 py-1.5 text-sm transition-colors hover:border-gold-500 hover:text-gold-400"
              >
                {agency.phone}
              </a>
            ) : (
              <span className="rounded-md border border-navy-800 px-3 py-1.5 text-sm tabular-nums">
                {agency.phone}
              </span>
            )}
            {whatsapp ? (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-navy-600 px-3 py-1.5 text-sm transition-colors hover:border-gold-500 hover:text-gold-400"
              >
                WhatsApp
              </a>
            ) : null}
          </div>
        </div>

        <nav aria-label="Footer">
          <p className="text-xs font-semibold tracking-[0.18em] text-gold-500 uppercase">Explore</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li>
              <Link href="/properties" className="text-navy-200 transition-colors hover:text-gold-400">
                All homes
              </Link>
            </li>
            <li>
              <Link href="/about" className="text-navy-200 transition-colors hover:text-gold-400">
                About &amp; contact
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="text-navy-200 transition-colors hover:text-gold-400">
                Privacy
              </Link>
            </li>
            <li>
              <Link href={SIGN_IN_PATH} className="text-navy-200 transition-colors hover:text-gold-400">
                Staff sign-in
              </Link>
            </li>
          </ul>
        </nav>

        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-gold-500 uppercase">
            Where we work
          </p>
          <p className="mt-4 text-sm leading-relaxed text-navy-200">
            {agency.service_areas.length
              ? listSentence(agency.service_areas)
              : "Contact us for current coverage."}
          </p>
          {agency.office_address ? (
            <p className="mt-4 text-sm leading-relaxed text-navy-300">{agency.office_address}</p>
          ) : null}
        </div>
      </div>

      <div className="border-t border-navy-800">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-navy-300 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {new Date().getFullYear()} {agency.name}. Demonstration installation — fictional
            agency, fictional listings.
          </p>
          <p>Property data is fictional and not an offer to transact.</p>
        </div>
      </div>
    </footer>
  );
}