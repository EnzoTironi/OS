# `@zoen/auth-workos`

App 0. Browser AuthKit door. Not the kernel.

Public API: `loginUrl`, `handleCallback`, `logout`, `currentUser`.

Speaker, zoend, Cedar, World, and membership must not import this package. WhatsApp JID binding stays Zoen-owned.

## Why this is standalone

Live public HTTPS today is `https://zoen.tironi.xyz` → zoend `:58701` (`ZOEN_PUBLIC_ORIGIN`).

`/onboard/{token}` is a real door, not a stub. zoend identity admin mints `{origin}/onboard/{token}` for WhatsApp JID confirmation. That path is Zoen membership/binding, not OIDC.

Mounting AuthKit on zoend would import WorkOS into the process that owns Cedar, World, and membership. This package stays out of that process.

A later edge can serve `/auth/workos/*` next to `/onboard/*` on the same host. The callback path is always `new URL(WORKOS_REDIRECT_URI).pathname`. Candidate public URI: `https://zoen.tironi.xyz/auth/workos/callback`. Do not point that URI at zoend in this PR.

## Env

| Variable | Purpose |
| --- | --- |
| `WORKOS_API_KEY` | Server SDK key |
| `WORKOS_CLIENT_ID` | AuthKit client |
| `WORKOS_REDIRECT_URI` | Exact callback URL |
| `WORKOS_COOKIE_PASSWORD` | Sealed session password, 32+ chars |

Copy `.env.example`. Cookie password: `openssl rand -base64 32`.

Register `WORKOS_REDIRECT_URI` and the initiate login URL (`/auth/workos/login`) on the application Redirects tab. Register a Sign-out URI there too. This repo does not invent CLI or dashboard click-paths.

## Routes

| Method | Path | SDK call |
| --- | --- | --- |
| GET | `/auth/workos/login` | `userManagement.getAuthorizationUrl({ provider: "authkit" })` |
| GET | path of `WORKOS_REDIRECT_URI` | `authenticateWithCode` with `sealSession: true` |
| POST | `/auth/workos/logout` | `loadSealedSession` → `getLogoutUrl`, then clear `wos-session` |
| GET | `/auth/workos` | `loadSealedSession` → `authenticate` |

Keycloak / existing OIDC stay. This door is additive.

```bash
npm run build
node dist/packages/auth-workos/src/server.js
```

## Later swap (not this PR)

Today zoend `SessionRegistry` verifies a Keycloak JWT, then `binding_for_oidc_sub` → Active Membership.

Later, without rewriting membership:

1. Keep Keycloak on Fly until a WorkOS `currentUser()` id (or email) resumes the same binding row `oidc_sub` uses today.
2. WorkOS sealed session → same identity store lookup → same Active Membership.
3. Only then retire the Keycloak JWT at the zoend door.

This PR does not deploy AuthKit to Fly and does not replace live Keycloak.
