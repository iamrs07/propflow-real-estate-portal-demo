"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Generic error boundary.
 *
 * `error.message` is deliberately NOT rendered: it can carry a database message,
 * a column name or an internal identifier. The visitor gets a plain apology and
 * a way forward; the operator gets the digest, which Next writes to the server
 * logs rather than the response.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[propflow] unhandled error", error.digest ?? "no-digest");
  }, [error]);

  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center px-6 py-24 text-center"
    >
      <p className="text-xs font-semibold tracking-[0.2em] text-critical-700 uppercase">
        Something went wrong
      </p>
      <h1 className="mt-4 font-display text-3xl text-navy-900">This page did not load</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-sand-700">
        The problem has been logged. Try again — if it keeps happening, call the agency and quote the
        reference below.
      </p>
      {error.digest ? (
        <p className="mt-4 text-xs text-sand-600">
          Reference: <span className="font-mono">{error.digest}</span>
        </p>
      ) : null}
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-gold-500 px-5 py-2.5 text-sm font-medium text-navy-950 transition-colors hover:bg-gold-400"
        >
          Try again
        </button>
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