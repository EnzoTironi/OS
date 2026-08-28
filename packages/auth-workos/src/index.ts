import { createAuth } from "./auth.js";

/**
 * App 0: browser AuthKit door.
 *
 * Public API is loginUrl, handleCallback, logout, and currentUser.
 * Speaker, zoend, Cedar, World, and membership must not import this package.
 * WhatsApp JID binding stays Zoen-owned. Browser OIDC via hosted AuthKit
 * (Google + Apple + email). Do not add a second social OAuth stack.
 */

/**
 * Authorization URL from the WorkOS SDK with provider `authkit`.
 * Hosted UI shows enabled social methods (Google and Apple required).
 * Optional `state` restores `/onboard/:token` after callback.
 */
export function loginUrl(state?: string): string {
  return createAuth().loginUrl(state);
}

/**
 * Exchange the AuthKit `code` via `authenticateWithCode` and seal the session.
 */
export function handleCallback(code: string) {
  return createAuth().handleCallback(code);
}

/**
 * Resolve WorkOS logout URL from the sealed cookie. Always clear the cookie.
 */
export function logout(sessionCookie?: string) {
  return createAuth().logout(sessionCookie);
}

/**
 * Authenticate the sealed `wos-session` cookie. Null when absent or invalid.
 */
export function currentUser(sessionCookie?: string) {
  return createAuth().currentUser(sessionCookie);
}

export type { AuthUser, CallbackResult, LogoutResult } from "./auth.js";
