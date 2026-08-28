# `@zoen/auth-workos`

Zoen's only screens: hosted AuthKit + vanilla `/onboard/:token`. Same module. Not the kernel.

Public API: `loginUrl`, `handleCallback`, `logout`, `currentUser`.

No Next, Vite, StyleX, or SPA. Express serves HTML. Login chrome is AuthKit (`provider: "authkit"`). Speaker, zoend, Cedar, World, and membership must not import this package.

## Screens

| Method | Path | What it is |
| --- | --- | --- |
| GET | `/onboard/:token` | WhatsApp door. Product page. |
| GET | `/auth/workos/login` | `getAuthorizationUrl({ provider: "authkit" })` |
| GET | path of `WORKOS_REDIRECT_URI` | `authenticateWithCode` + sealed cookie |
| POST | `/auth/workos/logout` | `getLogoutUrl`, clear cookies |
| GET | `/auth/workos` | Session peek. Not the WhatsApp return. |

Mint in chat is always `https://zoen.tironi.xyz/onboard/{token}`. Never `app.zoen.local`. Do not dump a bare device code.

After Google/Apple on AuthKit, if the session started from `/onboard/:token`, callback returns there and the page says **Volta pro Zap.**

zoend still has `/onboard` until callers migrate. The product page is this package. Token check is HTTP to zoend (`ZOEN_IDENTITY_BASE_URL`) or a stub: missing → 404, ready → HTML. This package does not import Cedar or World.

## CLI Auth is not WhatsApp login

`zoen login` on laptop/VFS/herdr uses WorkOS CLI Auth (device grant) on the **same** WorkOS app. The binary prints a code, opens a browser, and polls. That grant does not replace AuthKit on the web.

WhatsApp is not person-facing device-flow login. If a lookup says the token is a CLI Auth user-code completion, `/onboard/:token` may 302 to the **given** `verification_uri_complete` (one-click). We never build that URL. Agent polls. Person still does Google/Apple on AuthKit.

## Google and Apple

Dashboard toggles. No `GOOGLE_*` / `APPLE_*` env.

| Method | Dashboard | Staging |
| --- | --- | --- |
| Email + password | On by default | Nothing |
| Google | Authentication → OAuth providers → Enable | WorkOS demo credentials |
| Apple | Authentication → OAuth providers → Enable | WorkOS demo credentials |

Staging client id (public): `client_01M12W0Q80ECHW95FW3R9D5V5C`. Redirects already set to `https://zoen.tironi.xyz/auth/workos/callback` and `http://localhost:3000/auth/workos/callback`.

## Env

| Variable | Purpose |
| --- | --- |
| `WORKOS_API_KEY` | Server SDK key |
| `WORKOS_CLIENT_ID` | AuthKit client |
| `WORKOS_REDIRECT_URI` | Exact callback URL. Default public: `https://zoen.tironi.xyz/auth/workos/callback`. Localhost is local only. Path is always `new URL(...).pathname`. |
| `WORKOS_COOKIE_PASSWORD` | Sealed session password, 32+ chars |
| `ZOEN_IDENTITY_BASE_URL` | Optional private zoend for invite lookup |

```bash
npm run build
node dist/packages/auth-workos/src/server.js
```

Keycloak stays on live Fly. This PR does not replace it and does not merge.

## Later swap (not this PR)

Today zoend `SessionRegistry` verifies a Keycloak JWT, then `binding_for_oidc_sub` → Active Membership.

Later: WorkOS `currentUser()` → same identity lookup → same membership. Only then retire Keycloak at the zoend door.
