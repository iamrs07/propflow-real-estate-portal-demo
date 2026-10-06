/**
 * Listing image URLs.
 *
 * Two sources:
 *   - `/demo/*` — original placeholder artwork committed to the repository and
 *     served from the same origin, used by demo mode;
 *   - anything else — a path inside the private `property-images` Storage
 *     bucket, reached through the server-authorized `/listing-image` route.
 *
 * The bucket is deliberately not public: a bucket URL would stay readable after
 * a listing is unpublished or sold. The route re-checks publication state on
 * every request, so `propertyImageUrl` only has to name the object; whether the
 * viewer may have it is decided server-side, never here.
 *
 * This module stays importable from client components, so it must not reach for
 * the service-role key or any secret.
 */
export const IMAGE_BUCKET = "property-images";

/** Route that authorizes a single listing image before streaming it. */
export const IMAGE_ROUTE_PREFIX = "/listing-image";

/**
 * Upload paths are "<tenant_id>/<property_id>/<name>" and are generated
 * server-side. Anything else is rejected by the route as well; this guard just
 * keeps a malformed value from producing a bogus URL in the first place.
 */
const STORAGE_PATH =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(?:jpe?g|png|webp|avif)$/i;

export function propertyImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("/")) return path;
  if (!STORAGE_PATH.test(path)) return null;

  return `${IMAGE_ROUTE_PREFIX}/${path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}