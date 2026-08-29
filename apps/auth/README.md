# How to run the Auth door

This process is the Better Auth 1.7.2 door. It listens on `127.0.0.1:58704` and stores sessions in the `zoen_auth` database. On Fly, supervisord starts it next to Keycloak. Public HTTPS still lands on zoend `:58701`, which forwards `/api/auth`, `/.well-known/openid-configuration`, `/device`, and `/onboard/done` to this process. WhatsApp `/onboard/{token}` stays on zoend.

## Start Postgres

From `apps/auth`, run:

```sh
docker compose up -d --wait
```

That starts `postgres:18` on `127.0.0.1:55404` with database `zoen_auth`, user `postgres`, and password `postgres`.

## Set environment

Copy `.env.example` to `.env`. Set `BETTER_AUTH_SECRET` with:

```sh
openssl rand -base64 32
```

Leave `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` empty until a Google OAuth client exists. Empty Google is valid at boot.

Required names:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`

If any of those is missing, the process writes the missing name to stderr and exits non-zero.

Local values:

```
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55404/zoen_auth
BETTER_AUTH_URL=http://127.0.0.1:58704
```

## Migrate and start

Load `.env`, then apply the Better Auth schema and start the process:

```sh
set -a && . ./.env && set +a
npx auth@1.7.2 migrate --config src/auth.ts --yes
npx tsx src/server.ts
```

Or run the same steps with `scripts/prove.sh`. That script curls `GET http://127.0.0.1:58704/api/auth/ok` and prints command, URL, status, body, and a timestamp in `America/Sao_Paulo`.

To prove the owned screens and the device-authorization start, run `scripts/prove-screens.sh` from `apps/auth`. The script runs compose, migrates, and restarts the pid in `.auth.pid` even when `/api/auth/ok` already answers. It writes `/workspace/ship/better-auth-screens-proof.md`. That file omits `device_code` and `user_code` values and records status and field names only.

## Issue a JWT for zoend

The door plants the official Better Auth `jwt` plugin with `RS256`. Issuer is `BETTER_AUTH_URL` with no trailing slash. Audience is `zoend`.

Email and password sign-up is enabled so a local journey can mint a session without Google.

Discovery and JWKS:

1. `GET /.well-known/openid-configuration` returns `issuer` and `jwks_uri`.
2. `jwks_uri` is `{issuer}/api/auth/jwks`.
3. `GET /api/auth/jwks` returns the public key set. The first call mints an RS256 key when the set is empty.

Mint path:

1. `POST /api/auth/sign-up/email` with JSON `email`, `password`, and `name`. Send `Origin` matching `BETTER_AUTH_URL`. Keep the `Set-Cookie` jar.
2. `GET /api/auth/token` with that cookie. The body is `{ "token": "..." }`.
3. Call zoend with `Authorization: Bearer <token>`. Set `ZOEN_OIDC_AUDIENCE` to `zoend`. Set `ZOEN_OIDC_ISSUER` to the token `iss`, which is `BETTER_AUTH_URL` with no trailing slash. If that issuer is not loopback, set `ZOEN_OIDC_DISCOVERY_URL` to the loopback door. On Fly that value is `http://127.0.0.1:58704`.

Remint grant on Fly is the same session path against loopback `http://127.0.0.1:58704` (never the public origin). `deploy/fly/zoen-remint-agent` signs in as `ZOEN_BA_AGENT_EMAIL`, calls `GET /api/auth/token`, and writes the JWT to `ZOEN_AGENT_BEARER_TOKEN_FILE`. Origin is `BETTER_AUTH_URL`. Password is the Fly secret `ZOEN_BA_AGENT_PASSWORD`.

To prove the full path locally, run `scripts/prove-zoend-ba.sh` from `apps/auth`. The script starts the door, mints a token, boots a throwaway zoend against that issuer, and writes `/workspace/ship/zoend-ba-proof.md` with commands and status codes. The proof file does not record the JWT, session cookie, or `BETTER_AUTH_SECRET`.

To prove remint's session mint plus WebOidc bind and lake publish, run `scripts/prove-remint-ba.sh`. That writes `/workspace/ship/remint-ba-proof.md`.

To prove boot against a public token `iss` while fetching discovery on loopback, run `scripts/prove-issuer-cutover.sh`. That writes `/workspace/ship/issuer-cutover-proof.md`.

## Google redirect URIs

Register these later on the existing GCP project. Do not create the client from this README.

- Production: `https://zoen.tironi.xyz/api/auth/callback/google`
- Local: `http://127.0.0.1:58704/api/auth/callback/google`

Until those env values are set, a Google start or callback responds `503` with `GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set`.
