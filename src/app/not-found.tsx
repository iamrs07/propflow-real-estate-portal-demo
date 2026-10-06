import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center px-6 py-24 text-center">
      <p className="text-xs font-semibold tracking-[0.2em] text-gold-600 uppercase">Not found</p>
      <h1 className="mt-4 font-display text-3xl text-navy-900">We could not find that page</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-sand-700">
        The page may have moved, or the listing it pointed at is no longer published. The current
        homes are all on the listings page.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link
          href="/properties"
          className="rounded-md bg-gold-500 px-5 py-2.5 text-sm font-medium text-navy-950 transition-colors hover:bg-gold-400"
        >
          Browse homes
        </Link>
        <Link
          href="/"
          className="rounded-md border border-navy-300 bg-white px-5 py-2.5 text-sm font-medium text-navy-900 transition-colors hover:border-navy-500"
        >
          Back to the home page
        </Link>
      </div>
    </main>
  );
}