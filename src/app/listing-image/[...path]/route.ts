import { adminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import { hasSupabaseConfig } from "@/lib/env";
import { IMAGE_BUCKET } from "@/lib/images";

/**
 * Listing photography, served through an authorization check.
 *
 * The `property-images` bucket is private (see supabase/migrations/
 * 0005_private_image_storage.sql), so there is no bucket URL to hand out. Every
 * image request lands here instead and is decided against the database:
 *
 *   staff of the owning brokerage -> served, including drafts, so an agent can
 *                                   preview a listing before it is published;
 *   anyone else                  -> served only while the listing is published,
 *                                   available, and its brokerage has its public
 *                                   site switched on.
 *
 * Unlisting a listing therefore removes its photographs immediately, rather
 * than leaving them readable at a stable public URL.
 *
 * The path segment is a lookup key, not the authorization. It is matched
 * against a strict pattern and then resolved to a `property_images` row, so a
 * guessed or guessed-at path cannot reach an object that is not a listing
 * photograph of this brokerage.
 */

// Publication state is per-request; never prerender or statically cache this.
export const dynamic = "force-dynamic";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const STORAGE_PATH = new RegExp(
  `^${UUID}\\/${UUID}\\/[A-Za-z0-9][A-Za-z0-9._-]{0,80}\\.(?:jpe?g|png|webp|avif)$`,
  "i",
);

/**
 * Caching policy.
 *
 * These are protected images: an archived, sold or unpublished listing's
 * photographs must stop being available when it stops being listed, not up to
 * fifteen minutes later. So no `max-age` and no `stale-while-revalidate` — both
 * of which deliberately let a cache keep serving a response it already holds.
 *
 * `no-cache` does not forbid storing, it forbids *reusing* a stored response
 * without asking the origin again, which is exactly the trade-off wanted here:
 * unlisting takes effect on the next request, and a shared cache cannot serve a
 * withdrawn photograph in the meantime. Staff responses additionally go to
 * `private, no-store`, because a draft image must never be written into a cache
 * another visitor could read back.
 */
const PUBLIC_CACHE = "no-cache";
const PRIVATE_CACHE = "private, no-store";

function notFound(): Response {
  // 404 rather than 403: a visitor should not be able to distinguish "exists
  // but withheld" from "does not exist" and probe for draft inventory.
  return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  const { path: segments } = await context.params;

  if (!Array.isArray(segments) || segments.length !== 3) return notFound();

  const storagePath = segments.join("/");
  if (!STORAGE_PATH.test(storagePath)) return notFound();

  /*
   * Demo mode serves committed artwork from /demo, so there is nothing in the
   * bucket to authorise. Bail out before touching the service-role client: with
   * no Supabase project configured that client throws, and an unhandled throw
   * would surface as a 500 instead of the 404 a visitor should see.
   */
  if (!hasSupabaseConfig()) return notFound();

  const admin = adminClient();

  /*
   * The service-role client is intentionally untyped (`createClient` without a
   * Database generic), so rows arrive as `never`. These three shapes are fixed
   * by the migrations and are restated here rather than widening the client.
   */
  interface ImageRow {
    storage_path: string;
    tenant_id: string;
    property_id: string;
  }
  interface PropertyRow {
    status: string;
    is_available: boolean;
  }
  interface TenantRow {
    public_site_enabled: boolean;
  }

  const { data: imageData, error: imageError } = await admin
    .from("property_images")
    .select("storage_path, tenant_id, property_id")
    .eq("storage_path", storagePath)
    .maybeSingle();

  if (imageError || !imageData) return notFound();
  const image = imageData as unknown as ImageRow;

  const [propertyResult, tenantResult] = await Promise.all([
    admin
      .from("properties")
      .select("status, is_available")
      .eq("id", image.property_id)
      .eq("tenant_id", image.tenant_id)
      .maybeSingle(),
    admin.from("tenants").select("public_site_enabled").eq("id", image.tenant_id).maybeSingle(),
  ]);

  if (!propertyResult.data || !tenantResult.data) return notFound();
  const property = propertyResult.data as unknown as PropertyRow;
  const tenant = tenantResult.data as unknown as TenantRow;

  const staff = await getSessionProfile();
  const isOwningStaff = staff?.tenantId === image.tenant_id;

  const isPubliclyListed =
    property.status === "published" &&
    property.is_available === true &&
    tenant.public_site_enabled === true;

  if (!isOwningStaff && !isPubliclyListed) return notFound();

  const { data: blob, error: downloadError } = await admin.storage
    .from(IMAGE_BUCKET)
    .download(image.storage_path);

  if (downloadError || !blob) return notFound();

  return new Response(blob, {
    status: 200,
    headers: {
      "Content-Type": blob.type || "application/octet-stream",
      // The bucket enforces this on upload; re-checking here keeps a malformed
      // object from being served back with an attacker-chosen type.
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": isOwningStaff ? PRIVATE_CACHE : PUBLIC_CACHE,
    },
  });
}