import Link from "next/link";

/**
 * Not-found boundary for the public site.
 *
 * `property/[reference]` calls notFound() for a draft, archived or unavailable
 * listing, so the visitor gets a real 404 status — search engines and caches
 * stop treating the reference as live — while still being offered the current
 * homes inside the normal site chrome.
 */
export default function SiteNotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
      <p className="text-xs font-semibold tracking-[0.2em] text-gold-600 uppercase">
        Listing not available
      </p>
      <h1 className="mt-4 font-display text-3xl text-navy-900 sm:text-4xl">
        This listing is no longer on the market
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-sand-700">
        It may have been rented out, sold, or taken off the market — a listing that is no longer
        available looks exactly the same as one that never existed. The current homes are all on
        the listings page.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/properties"
          className="rounded-md bg-gold-500 px-5 py-2.5 text-sm font-medium text-navy-950 transition-colors hover:bg-gold-400"
        >
          Browse all homes
        </Link>
        <Link
          href="/"
          className="rounded-md border border-navy-300 bg-white px-5 py-2.5 text-sm font-medium text-navy-900 transition-colors hover:border-navy-500"
        >
          Back to the home page
        </Link>
      </div>
    </div>
  );
}