import { createAuth } from "./auth.js";

/**
 * App 0: browser AuthKit door.
 *
 * Public API is loginUrl, handleCallback, logout, and currentUser.
 * Speaker, zoend, Cedar, World, and membership must not import this package.
 * WhatsApp JID binding stays Zoen-owned. This module only does browser OIDC.
 */

/**
 * Authorization URL from the WorkOS SDK with provider `authkit`.
 */
export function loginUrl(): string {
  return createAuth().loginUrl();
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
