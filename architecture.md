# Architecture

Zoen is three products on one Fly app.

**Ontology.** One Rust binary `zoen`: Connect API (`zoen serve`) and CLI (`zoen <noun> <verb>`). Meaning lives in committed canonical JSON. Publish is `DefinitionService.Publish`. The kernel is Rust. `zoen-core` holds types and laws with no IO. `zoen-engine` runs publish, propose, Cedar, and commit. `zoen-query` reads through DataFusion. `zoen-adapters` talks to Postgres 18, Restate, and object storage. `zoen serve` is the composition root.

**Conversation.** Eve in `apps/conversation`. TypeScript. Durability is Eve, not Restate. Isolate runs planted `zoen` and cannot commit.

**Auth door.** Better Auth in `apps/auth`. Sessions live in `zoen_auth`. zoend boots `ProcessAuth::SessionDoor` with `ZOEN_AUTH_DATABASE_URL`. The session cookie is the Bearer. Membership is an Active row, not an IdP group.

Public protocol is Protobuf, Buf, and ConnectRPC. Definition identity is JCS plus SHA-256. Policy is Cedar. Untrusted code is Wasmtime. Ontology effects are Restate behind `zoen-effect-dispatcher`. Conversation does not own Restate.

Production is one machine. Image `deploy/fly/Dockerfile`. Postgres, Restate, MinIO, the door, Eve, and zoend share the VM. Public HTTPS is zoend. The door and Eve bind loopback. WhatsApp inbound dest is Kapso at `/eve/v1/kapso`. Telegram inbound dest is Eve's first-class channel at `/eve/v1/telegram`. The product bar is Poke plus Palantir: Eve talks like a sharp friend; ontology verbs carry company-grade depth for every audience.

CLI shape is `zoen <noun> <verb>`. JSON on stdout. Mutations are propose then Cedar then commit on zoend. Isolate denies `action commit`.

```
publish -> DefinitionRevision
query   -> SemanticResult
propose -> Proposal
commit  -> CommitReceipt
explain -> CausalExplanation
```

Callers do not pick Postgres versus Parquet, Cedar versus engine, or Restate invocation details.
