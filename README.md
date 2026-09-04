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

Conversation is Eve. Do not name the product Poke. The bar is Poke plus Palantir: intimate conversation and ontology-grade depth for every audience. Poke is the voice reference only.

## Install

You need Docker, `just`, Node 22, and Rust 1.98 (`rust-toolchain.toml`).
Kache 0.16.0 is optional and can accelerate ordinary Rust builds when installed.

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

The binary does not govern. Propose, Cedar, and commit run on zoend. Bearer is a Better Auth session. Isolate (`ZOEN_ISOLATE=1`) denies `action commit`, `world scenario apply`, and `source sync` without `--dry-run`.

Publish canonical JSON. Do not author `.zoen.ts` as the compiler. `@zoen/sdk` and `@zoen/osdk` are not this door.

## Auth door

Better Auth listens on `127.0.0.1:58704` and stores sessions in `zoen_auth`. zoend forwards `/api/auth` and `/device`. Browser channel linking stays on zoend at `/link`; confirmation reads the Better Auth `session_token` cookie directly.

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

Inbound dest is the official Chat SDK Kapso channel at `/eve/v1/kapso`. Flatten structured chrome to readable text. Never invent a URL. Never ship helpdesk copy. Do not use `@chat-adapter/whatsapp` Cloud API.

## Telegram

Inbound dest is Eve's first-class Telegram channel at `/eve/v1/telegram` (`eve/channels/telegram`). Same reply law as WhatsApp. Secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET_TOKEN`, optional `TELEGRAM_BOT_USERNAME`. Register the webhook yourself with `setWebhook` (eve does not). Prefer Telegram for headless loop proofs: forge an Update with the secret header, then observe `sendMessage`.

After Eve accepts a Telegram turn, it records `message.from.id` as a provisional external subject through zoend's loopback machine boundary. Recording proves only the channel subject: Better Auth linking and Membership admission remain separate ceremonies.

The local messaging journey proves recorder and database idempotence. Provider acceptance remains a two-account ceremony through `/eve/v1/telegram`, using only owned Telegram accounts and without reading browser sessions, QR data, or webhook credentials.

## Deploy

Production is one Fly app in `gru`. Volume `zoen_data` is `/data`. Public HTTPS is `zoen.tironi.xyz` on zoend `:58701`.

1. Merge a pull request to `main`.
2. GitHub Actions `fly-deploy` builds `deploy/fly/Dockerfile` on the runner.
3. It pushes `registry.fly.io/zoen:$GITHUB_SHA` and runs `fly deploy --image`.

Do not `fly deploy` without `--image`. Do not add preview apps. Secrets stay on the Fly app. `BETTER_AUTH_SECRET`, `ZOEN_BA_AGENT_PASSWORD`, `ZOEN_PROJECTION_PASSWORD`, `ZOEN_CONNECTOR_CALLER_TOKEN`, and `ZOEN_CONNECTOR_CREDENTIALS` are Fly secrets. `ZOEN_CONNECTOR_PROVIDER_URL` must use HTTPS outside loopback and name the real provider adapter. The projection role is created only while PostgreSQL initializes an empty volume; recreate the disposable pre-launch development volume when adopting this role.

Channel edges mint one-time `/link#token=…` intents with `ZOEN_IDENTITY_ADMIN_TOKEN`. A real Better Auth browser session confirms the exact channel binding; no operator bind command exists.

zoend boots `ProcessAuth::SessionDoor` and `ZOEN_AUTH_DATABASE_URL`. Remint writes the opaque session to `/data/zoen/agent.token`.

The effect runtime is private to the same VM: the HTTP connector binds `127.0.0.1:8081`, the Restate handler binds `127.0.0.1:9081`, and its exact-registration probe binds `127.0.0.1:9082`. None is a Fly service. Restate Admin also binds loopback and the registrar is its only deployment writer; the exclusive probe bind prevents a second registrar from entering reconciliation. The image bakes the Git commit into Restate service metadata. Before registration, the registrar authenticates a non-deliverable connector probe for the exact tenant credential reference. It replaces a prior build at the stable Restate URI only after validating URI, owner, artifact consistency, protocol range, transport settings, and the complete service/handler contract before and after the update; every other drift is refused.

Provision `workload.effect-worker` explicitly after the operator’s Better Auth membership has the governed `zoen.workload.manageCredentials` action on `zoen.workload.credentials`. Save the one-time `apiKeyOnce` value as `/data/zoen/effect-worker.api-key` with mode `0600`. The supervised validator only authenticates that existing file and checks the configured tenant, principal, actor, and workload; it never mints or replaces a key. A missing, revoked, expired, unknown, mismatched, symlinked, or incorrectly permissioned key keeps effect registration and dispatch closed. The reconciler must use a different `workload.effect-reconciler` credential.

## Develop

```bash
just lint      # buf, tsc, JCS fixtures, rustfmt, cargo test
just clippy    # cargo clippy -D warnings
just build
just e2e <scenario>
just verify    # lint, clippy, build, every live journey
```

`just build`, `just e2e`, and `just verify` automatically use Kache 0.16.0
for their ordinary Rust build when it is installed and none of
`ZOEN_BUILD_RUSTC_WRAPPER`, `RUSTC_WRAPPER`, or
`CARGO_BUILD_RUSTC_WRAPPER` is present. Tests, Clippy, and coverage remain
outside Kache. See [Kache builds](CONTRIBUTING.md#kache-builds) for setup,
safety boundaries, and measured rollout evidence.

CI is the same gates. Journeys live in `e2e/`. Do not add mocks or `vi.mock`.

Live lake JSON is `testdata/lakes/`. JCS fixtures are `testdata/jcs/`.

## Community

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SECURITY.md](SECURITY.md)
- [Discussions](https://github.com/EnzoTironi/OS/discussions)
