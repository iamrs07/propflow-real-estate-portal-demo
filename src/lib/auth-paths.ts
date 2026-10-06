/**
 * The staff authentication routes, in one place.
 *
 * Client-safe on purpose: this module must stay importable from components that
 * carry the "use client" directive, so it holds nothing but string constants and
 * must never grow a secret or a server-only import.
 *
 * These are the real routes under src/app. Earlier code referenced "/login" and
 * "/reset-password", which do not exist, so every unauthenticated CRM visit and
 * every sign-out landed on a 404. Anything that links to or redirects to an auth
 * page must import from here instead of writing the path inline.
 */
export const SIGN_IN_PATH = "/auth/login";
export const FORGOT_PASSWORD_PATH = "/auth/forgot-password";
export const RESET_PASSWORD_PATH = "/auth/reset-password";

/** Every staff auth route, for the session-refresh matcher and tests. */
export const AUTH_PATHS = [SIGN_IN_PATH, FORGOT_PASSWORD_PATH, RESET_PASSWORD_PATH] as const;