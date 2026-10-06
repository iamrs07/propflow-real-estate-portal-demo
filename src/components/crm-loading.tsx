/**
 * Dashboard skeleton.
 *
 * Kept in its own module so `crm/page.tsx` can mount it inside a Suspense
 * boundary — the CRM segment itself must stay boundary-free so that the
 * admin-only routes can still refuse an agent with a real redirect.
 */
export default function CrmLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true">
      <p className="sr-only" role="status">
        Loading
      </p>
      <div className="h-4 w-32 rounded bg-sand-300" />
      <div className="h-9 w-64 max-w-full rounded bg-sand-300" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-24 rounded-lg border border-sand-300 bg-white" />
        ))}
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-28 rounded-lg border border-sand-300 bg-white" />
        ))}
      </div>
    </div>
  );
}