# Zoen

[![verify](https://github.com/EnzoTironi/OS/actions/workflows/verify.yml/badge.svg)](https://github.com/EnzoTironi/OS/actions/workflows/verify.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Zoen is the operating system for a company that humans, agents, and software share.

A person signs in at the Better Auth door. Membership is an Active row. From there the same verbs run in the CLI, the API, MCP, and Eve. Meaning lives in published canonical JSON. Mutation is a governed Action. Evidence, commit, and external effects stay distinct.

This repository is the product. See [architecture.md](architecture.md) for the module map.

## Products

| Product | What you run |
| --- | --- |
| Ontology | `zoen` CLI and Connect API, MCP |
| Conversation | Eve in `apps/conversation` |
| Auth door | Better Auth in `apps/auth` |

Conversation is not named Poke. Poke is a voice reference only.

## Install

You need Docker, `just`, Node 22, and Rust 1.88 (`rust-toolchain.toml`).

```bash
git clone https://github.com/EnzoTironi/OS.git
cd OS
just build
```

That builds the `zoen` binary (API daemon and CLI) plus workspace TypeScript. The binary lands in `target/debug/zoen`.

## CLI

`zoen serve` is the Connect API. No args prints help. `zoen <noun> <verb>` is the CLI. JSON on stdout. Flags over prompts. `--dry-run` on mutations. One static executable. No Node runtime for the CLI.

```
zoen auth login --email you@example.com --password secret
zoen definition publish --file definition.canonical.json
zoen world query --type inventory.Item
zoen action discover --resource-id inventory.item.1
zoen action propose --proposal-id p --action-id inventory.replenish --resource-id inventory.item.1 --quantity 1
zoen action commit --proposal-id p --operation-id p --preview-hash <hash>
zoen source connect rest --id rest --base https://api.example.com
zoen source introduce rest --path /pedidos
zoen source sync rest
zoen history explain --claim-id claim.x
```

The binary does not govern. Propose, Cedar, and commit run on zoend. Bearer is a Better Auth session. Isolate (`ZOEN_ISOLATE=1`) denies `action commit` and `world scenario apply`.

Publish canonical JSON. Do not author `.zoen.ts` as the compiler. `@zoen/sdk` and `@zoen/osdk` are not this door.

## Auth door

Better Auth listens on `127.0.0.1:58704` and stores sessions in `zoen_auth`. zoend forwards `/api/auth`, `/device`, and `/onboard/done`. The `session_token` cookie is the zoend Bearer.

```bash
cd apps/auth
docker compose up -d --wait
cp .env.example .env
# set DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL
set -a && . ./.env && set +a
npx auth@1.7.2 migrate --config src/auth.ts --yes
npx tsx src/server.ts
```

Local database URL is `postgres://postgres:postgres@127.0.0.1:55404/zoen_auth`. `BETTER_AUTH_URL` is `http://127.0.0.1:58704`. Generate `BETTER_AUTH_SECRET` with `openssl rand -base64 32`. Empty Google client id is valid at boot.

Google callback later:

- Production `https://zoen.tironi.xyz/api/auth/callback/google`
- Local `http://127.0.0.1:58704/api/auth/callback/google`

## Conversation

Eve is `apps/conversation`. It binds loopback `:3000`. zoend forwards `/eve/v1` and `/.well-known/workflow` without rewrite. Isolate runs planted `zoen`. The worker cannot commit and cannot speak.

## WhatsApp

Inbound dest is the official Chat SDK Kapso channel at `/eve/v1/kapso`. Everyday replies are text plus one https URL. Do not use `@chat-adapter/whatsapp` Cloud API.

## Deploy

Production is one Fly app in `gru`. Volume `zoen_data` is `/data`. Public HTTPS is `zoen.tironi.xyz` on zoend `:58701`.

1. Merge a pull request to `main`.
2. GitHub Actions `fly-deploy` builds `deploy/fly/Dockerfile` on the runner.
3. It pushes `registry.fly.io/zoen:$GITHUB_SHA` and runs `fly deploy --image`.

Do not `fly deploy` without `--image`. Do not add preview apps. Secrets stay on the Fly app. `BETTER_AUTH_SECRET` and `ZOEN_BA_AGENT_PASSWORD` are Fly secrets. After `/ready`:

```
fly ssh console --app zoen -C "zoen-bind-inbox"
```

Bind uses `ZOEN_IDENTITY_ADMIN_TOKEN` for the person JID. Never the door.

zoend boots `ProcessAuth::SessionDoor` and `ZOEN_AUTH_DATABASE_URL`. Remint writes the opaque session to `/data/zoen/agent.token`.

## Develop

```bash
just lint      # buf, tsc, JCS fixtures, rustfmt, cargo test
just clippy    # cargo clippy -D warnings
just build
just e2e <scenario>
just verify    # lint, clippy, build, every live journey
```

CI is the same gates. Journeys live in `e2e/`. Do not add mocks or `vi.mock`.

Live lake JSON is `testdata/lakes/`. JCS fixtures are `testdata/jcs/`.

## Community

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SECURITY.md](SECURITY.md)
- [Discussions](https://github.com/EnzoTironi/OS/discussions)
