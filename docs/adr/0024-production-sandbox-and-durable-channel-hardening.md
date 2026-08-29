# ADR-0024: Production substitutes stay out of live paths

**Status:** Accepted for V1  
**Date:** 2026-08-25

## Context

ADR-0017 selects Wasmtime for untrusted execution and Restate for durable effects. Three production substitutes leaked into live wiring:

- Docker started `dist/e2e/effect-worker.js` instead of a production Restate worker.
- The speaker workbench used `just-bash` + `node:vm` on the live WhatsApp `spawn_execution` path. That leftover Node chat left with `packages/speaker`.
- WhatsApp inbound and identity admin were unauthenticated; turn/reply ledgers were in-memory.

## Decision

### Restate worker

Fly and Compose must not execute `dist/e2e` workers. Live `explain` starts `e2e/effect-worker.ts`. CI rejects `dist/e2e` in `deploy/fly`.

### Workbench

Live tool execution is Wasmtime (ADR-0017). `createExecutionAgent` / `runExecuteTypescript` (`node:vm`, `just-bash`) require `ZOEN_ALLOW_JS_SANDBOX=1` and are test/dev only. `createInteractionExecuteWork` returns `undefined` without that flag so no live tool can reach the JS sandbox.

The JS VFS must reject path traversal, symlink escape, ambient network/process, secret exfiltration, and unbounded resource use. Wasmtime remains no-WASI, fuel/epoch/memory limited, and audited.

### WhatsApp and identity

`POST /channels/whatsapp/inbound` uses Standard Webhooks HMAC (timestamp skew, replay id, constant-time compare). Missing secret is 503; bad signature is 401. Durable replay rows are namespaced at persist time (`zoend:` / `gateway:`) so the proxy hop and the gateway can both persist without colliding. HMAC still signs the raw `webhook-id` header. Identity `/identity/admin/*` requires a Bearer. `ZOEN_IDENTITY_ADMIN_TOKEN` is the god token for minting foreign subjects, issuing invites, and merging accounts. A valid OIDC bearer may bootstrap and mutate only the caller's bound account; it cannot mint another subject's provisional row. Missing secret or invalid auth fail closed. WhatsApp subjects are person E.164 or `s.whatsapp.net`/`c.us` JIDs; door JID and groups are rejected. `ZOEN_WHATSAPP_DOOR_E164` is required: missing door or a subject that matches the door is `invalid external subject`. Inbound person subjects are admitted to a personal membership without a login click. Onboard and OIDC stay for external boundaries (web reports, bank access, fiscal issuance). Multiple active memberships without a tenant hint prefer the single personal membership, otherwise fail closed. Media is not ingested and must not be advertised as native.

### Durable turns

Conversation turns, delivery claims, reply ledger, and ingress replay are Postgres (migration `0019`). Debounce is 1750 ms, rearmed on inbound bursts, one attempt per burst. Status is silent under 2.0 s, at most one line after. `wait` and terminal states close silently with a durable ack. Inbound during `delivering` queues; it does not supersede. Pre-send claims enforce at-most-once provider sends.

Conversation tables are rebuildable operational SoR, not semantic authority.

## Consequences

E2E and unit tests must sign inbound, send identity bearers, and use durable stores on the live serve path. JS sandbox tests set the gate flag explicitly.
