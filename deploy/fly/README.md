# Fly `zoen`

One machine in `gru`. Volume `zoen_data` → `/data` (postgres, Restate, MinIO).
Public HTTPS is `zoen.tironi.xyz` → zoend `:58701`. Postgres, Restate, and the Better Auth door stay up (`auto_stop_machines = off`). The door listens on `127.0.0.1:58704`. zoend forwards `/api/auth`, `/.well-known/openid-configuration`, `/device`, and `/onboard/done` there. WhatsApp `/onboard/{token}` stays on zoend.

Eve listens on `127.0.0.1:3000`. zoend forwards `/eve/v1` and `/.well-known/workflow` there without rewrite. Node 24 is `/usr/local/node24`. Auth stays Node 22.

`ZOEN_OIDC_ISSUER` is `https://zoen.tironi.xyz`. Boot fetches discovery and JWKS from `ZOEN_OIDC_DISCOVERY_URL` (`http://127.0.0.1:58704`). The one Fly machine must not hairpin its public origin before zoend listens. Remint session-mints on the loopback door (`http://127.0.0.1:58704`) and writes `/data/zoen/agent.token`. `ZOEN_BA_AGENT_PASSWORD` is a Fly secret, not committed.

## Ship a change

1. Land on `main` (PR, not from the laptop).
2. GitHub Actions `fly-deploy` builds `deploy/fly/Dockerfile` on the runner.
3. It pushes `registry.fly.io/zoen:$GITHUB_SHA` and runs `fly deploy --image` (no Fly remote builder).
4. Volume data survives.

Manual: Actions → `fly-deploy` → Run workflow.

## Do not

- `fly deploy` without `--image` (that bills a Fly builder).
- Preview apps per PR.
- GitHub Release on every push. A `v*` tag can make a Release later; rollback is the previous image SHA.
- Merge from the laptop.

## First boot

App exists. Volume, IPs, cert, and secrets are staged.
Cedar is `deploy/fly/policies.json` in `/etc/zoen/policies.json`.

## After the first `/ready`

Secrets stay on the Fly app, not in `fly.toml`. Door is `+553798136141`.

```
fly ssh console --app zoen -C "zoen-bind-inbox"
```

Bind uses `ZOEN_IDENTITY_ADMIN_TOKEN` for the person JID (`5531999941160@s.whatsapp.net` by default). Never the door.

`ZOEN_MODEL` and `OPENAI_BASE_URL` are in fly.toml `[env]`; `OPENAI_API_KEY` stays a Fly/GitHub secret. Effects/connector stay unset on this VM.

`BETTER_AUTH_URL` is in fly.toml `[env]`. `BETTER_AUTH_SECRET` is a Fly secret, not committed. Auth crashloops without it. zoend still boots.
