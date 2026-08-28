# `@zoen/auth-workos`

Zoen's only screens: hosted AuthKit + vanilla `/onboard/:token`. Same module. Not the kernel.

Public API: `loginUrl`, `handleCallback`, `logout`, `currentUser`.

No Next, Vite, StyleX, or SPA. Express serves HTML. Login chrome is AuthKit (`provider: "authkit"`). Speaker, zoend, Cedar, World, and membership must not import this package.

## Screens

| Method | Path | What it is |
| --- | --- | --- |
| GET | `/onboard/:token` | WhatsApp door. After AuthKit session, POST confirm to zoend, then **Volta pro Zap.** |
| GET | `/auth/workos/login` | `getAuthorizationUrl({ provider: "authkit" })` |
| GET | path of `WORKOS_REDIRECT_URI` | `authenticateWithCode` + sealed cookie |
| POST | `/auth/workos/logout` | `getLogoutUrl`, clear cookies |
| GET | `/auth/workos` | Session peek. Not the WhatsApp return. |

Mint in chat is always `https://zoen.tironi.xyz/onboard/{token}`. Never `app.zoen.local`. Do not dump a bare device code.

After Google/Apple on AuthKit, if the session started from `/onboard/:token`, callback returns there. This package then HTTP POSTs zoend `/onboard/{token}/confirm` (private origin). zoend runs `complete_onboard` and consumes the invite so the WhatsApp JID binds. Only then the page says **Volta pro Zap.** This package does not import Cedar, World, or zoend.

## Identity URL (private, fail closed)

`ZOEN_IDENTITY_BASE_URL` is the **private** zoend origin for GET lookup and POST confirm. On Fly that is already `http://127.0.0.1:58701`.

Do not point it at the public door (`https://zoen.tironi.xyz`). If this package becomes the public `/onboard` and looks up the same origin, the GET returns HTML and can recurse. Public host and same origin as `WORKOS_REDIRECT_URI` are rejected.

When the identity URL is missing:

- Non-local door (`WORKOS_REDIRECT_URI` host is not `localhost` / `127.0.0.1`): lookup is missing → 404. Confirm never stub-succeeds.
- Local door only: GET may show the start HTML (stub open). After AuthKit, confirm still fails closed until a private zoend URL is set.

`cli_complete` / `verification_uri_complete` is test-injection only. HTTP lookup returns ready or missing. We never invent that URL.

## Live Fly (not this PR)

Probe 2026-08-28: `https://zoen.tironi.xyz/ready` is zoend 200. `GET /auth/workos/login` is 404 JSON. `GET /onboard/…` is zoend HTML (`lang="pt"`), not this package (`lang="pt-BR"`). This module is **not** on the public Fly port.

Do not change `deploy/fly/fly.toml`, Dockerfile, or supervisord in this PR. Keycloak stays. Public door swap (route `/onboard` and `/auth/workos` here; keep lookup/confirm on `http://127.0.0.1:58701`) is a later Fly unit.

## CLI Auth is not WhatsApp login

`zoen login` on laptop/VFS/herdr uses WorkOS CLI Auth (device grant) on the **same** WorkOS app. The binary prints a code, opens a browser, and polls. That grant does not replace AuthKit on the web.

WhatsApp is not person-facing device-flow login. If a **test** lookup says the token is a CLI Auth user-code completion, `/onboard/:token` may 302 to the **given** `verification_uri_complete`. We never build that URL. Agent polls. Person still does Google/Apple on AuthKit.

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
| `ZOEN_IDENTITY_BASE_URL` | Required on a deployed door. Private zoend origin (`http://127.0.0.1:58701` on Fly). Never `https://zoen.tironi.xyz`. |

```bash
npm run build
node dist/packages/auth-workos/src/server.js
```

Keycloak stays on live Fly. This PR does not replace it and does not merge.

## Later swap (not this PR)

1. Fly unit: put this package on the public port for `/onboard` and `/auth/workos`. zoend stays on the loopback port. Do not point `ZOEN_IDENTITY_BASE_URL` at the public origin.
2. Identity: today zoend `SessionRegistry` verifies a Keycloak JWT, then `binding_for_oidc_sub` → Active Membership. Later: WorkOS `currentUser()` → same lookup → same membership. Only then retire Keycloak.
