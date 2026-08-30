# ADR-0024: Production substitutes stay out of live paths

**Status:** Accepted for V1  
**Date:** 2026-08-25

## Context

ADR-0017 selects Wasmtime for untrusted execution and Restate for durable effects. Production substitutes leaked into live wiring. A Node Restate worker ran in place of the production dispatcher. A Node workbench ran on the live WhatsApp path. WhatsApp inbound and identity admin were unauthenticated. Turn and reply ledgers were in-memory.

## Decision

### Restate worker

Live `explain` starts `zoen-effect-dispatcher`. Fly and Compose must not execute `dist/e2e` workers. CI rejects `dist/e2e` in `deploy/fly`.

### Workbench

Live tool execution is Wasmtime (ADR-0017) plus planted `zoen` on the membership workbench. `just-bash` is not the production runtime. Eve `defineSandbox` isolates by membership. The worker cannot commit and cannot speak.

Wasmtime remains no-WASI, fuel, epoch, and memory limited, and audited.

### WhatsApp and identity

Destination WhatsApp is the Chat SDK Kapso channel at `/eve/v1/kapso`. Everyday replies are text plus one https URL. Do not use `@chat-adapter/whatsapp` Cloud API.

Humans authenticate at the Better Auth door. zoend `ProcessAuth` is `SessionDoor`. Missing `ZOEN_AUTH_DATABASE_URL` fails closed. The URL must be loopback. zoend does not read `ZOEN_OIDC_*`. Identity `/identity/admin/*` requires a Bearer. Missing secret or invalid auth fail closed.

WhatsApp subjects are person E.164. Door JID and groups are rejected. Inbound person subjects are admitted to a personal membership without a login click. Multiple active memberships without a tenant hint prefer the single personal membership, otherwise fail closed. Media is not ingested and must not be advertised as native.

### Durable turns

Conversation durability is Eve. Ontology ZoenEffect durability is Restate. Conversation tables on zoend are rebuildable operational records, not semantic authority.

## Consequences

Journeys use durable stores on the live serve path. Live tool execution is Wasmtime. Conversation durability is Eve.
