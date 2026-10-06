/**
 * Public listing skeleton.
 *
 * This lives in `components/` rather than `(site)/loading.tsx` on purpose. A
 * `loading.tsx` installs a Suspense boundary around every page in the segment,
 * which lets Next flush the shell before a page resolves — and once the shell
 * is flushed, `notFound()` can no longer turn the response into a 404. An
 * unavailable listing would then be served as a cached HTTP 200. Mounting the
 * skeleton per page keeps the streaming benefit and the correct status code.
 */
export default function ListingSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6" aria-busy="true">
      <p className="sr-only" role="status">
        Loading
      </p>
      <div className="animate-pulse space-y-6">
        <div className="h-4 w-24 rounded bg-sand-300" />
        <div className="h-9 w-72 max-w-full rounded bg-sand-300" />
        <div className="h-4 w-96 max-w-full rounded bg-sand-200" />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="overflow-hidden rounded-lg border border-sand-300 bg-white">
              <div className="aspect-[4/3] bg-sand-200" />
              <div className="space-y-2.5 p-5">
                <div className="h-3 w-20 rounded bg-sand-200" />
                <div className="h-5 w-full rounded bg-sand-200" />
                <div className="h-4 w-2/3 rounded bg-sand-200" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}