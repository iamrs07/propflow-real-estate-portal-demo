import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Demo-mode session cookie: signed, not just set.
 *
 * Demo mode has no Supabase session, so the signed-in staff member is carried in
 * a cookie holding their profile id. That id is the whole authorisation decision
 * — it selects the tenant and the role — so an unsigned cookie is just a role
 * selector anyone can rewrite. `HttpOnly` does not help: it stops script reading
 * the cookie, not the person sitting at the browser from editing it in devtools,
 * and anyone could point their own instance at a known admin id.
 *
 * The value is therefore `<profileId>.<hmac>` and is rejected unless the tag
 * verifies against a server-only secret. Changing the cookie to another profile id
 * invalidates the tag, so the request falls back to anonymous.
 *
 * This file must stay server-only: it reads the signing secret.
 */

/** Cookie name. Unchanged so an existing browser session survives the upgrade. */
export const DEMO_COOKIE = "propflow_demo_profile";

/**
 * Fallback used only when no secret is configured *and* this is not a production
 * build. It is committed to source, so it is not a secret — that is precisely why
 * it is acceptable only outside production, where the app is either on an
 * author's own machine or not reachable from a network.
 *
 * The alternative — refusing to run without a secret — would mean a fresh clone
 * could not start, since `.env.local` is not committed either.
 */
const DEVELOPMENT_FALLBACK_SECRET = "propflow-demo-signing-key-development-only";
const MIN_SECRET_LENGTH = 32;

export type DemoSecret = {
  secret: string;
  /** True when using the committed development fallback. Never true in production. */
  developmentFallback: boolean;
};

export function demoSecret(): DemoSecret | null {
  const configured = process.env.PROPFLOW_DEMO_SECRET?.trim();
  if (configured && configured.length >= MIN_SECRET_LENGTH) {
    return { secret: configured, developmentFallback: false };
  }

  if (process.env.NODE_ENV === "production") return null;

  return { secret: DEVELOPMENT_FALLBACK_SECRET, developmentFallback: true };
}

/**
 * True when demo mode can be reached safely: either a real secret is configured,
 * or we are in a local development build.
 */
export function demoSessionIsSafe(): boolean {
  return demoSecret() !== null;
}

/**
 * The reason demo sign-in is unavailable, for the sign-in screen.
 *
 * A production build with demo mode on and no PROPFLOW_DEMO_SECRET would otherwise
 * serve a demo workspace whose only protection is a key published in this
 * repository. Refusing the session is the correct outcome: fictional data, but
 * reachable.
 */
export const DEMO_UNSAFE_REASON =
  "Demo mode is not available on this deployment because no demo signing secret is configured.";

function tag(secret: string, profileId: string): string {
  return createHmac("sha256", secret).update(profileId).digest("base64url");
}

/** `<profileId>.<tag>`, or null when no usable secret is configured. */
export function signDemoProfile(profileId: string): string | null {
  const key = demoSecret();
  if (!key) return null;
  return `${profileId}.${tag(key.secret, profileId)}`;
}

/**
 * Return the profile id from a signed cookie value, or null.
 *
 * The comparison is constant-time, the id is length-checked before use, and any
 * parse failure is indistinguishable from no cookie at all.
 */
export function verifyDemoProfile(signed: string | null | undefined): string | null {
  const key = demoSecret();
  if (!key || typeof signed !== "string") return null;

  const separator = signed.lastIndexOf(".");
  if (separator <= 0) return null;

  const profileId = signed.slice(0, separator);
  const provided = signed.slice(separator + 1);

  // A profile id is a uuid; rejecting anything else keeps a crafted cookie from
  // reaching the profile lookup with an arbitrary string.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profileId)) {
    return null;
  }
  if (provided.length === 0 || provided.length > 128) return null;

  const expected = Buffer.from(tag(key.secret, profileId));
  const actual = Buffer.from(provided);
  if (expected.length !== actual.length) return null;
  if (!timingSafeEqual(expected, actual)) return null;

  return profileId;
}