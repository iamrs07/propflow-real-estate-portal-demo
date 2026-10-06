import "server-only";
import { createHash } from "node:crypto";

/**
 * Opaque per-visitor fingerprint used only for the public enquiry rate limit.
 *
 * We never store a raw IP address. The value is a salted SHA-256 of the
 * tenant, the client IP and the user agent, so the throttle table cannot be
 * turned into a list of visitors. Rotating PROPFLOW_SALT invalidates every
 * existing counter.
 */
function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || headers.get("cf-connecting-ip")?.trim() || "unknown";
}

export async function requestFingerprint(headers: Headers): Promise<string> {
  const parts = [
    process.env.PROPFLOW_SALT ?? "propflow-local-dev-salt",
    clientIp(headers),
    (headers.get("user-agent") ?? "unknown").slice(0, 200),
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}