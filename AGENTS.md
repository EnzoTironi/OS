# Agent laws

The same law lives in `.cursor/rules/journey-tests-and-restate.mdc`.

Zoen is three products. Ontology is the CLI, the API, and MCP. Conversation is Eve in `apps/conversation`. Auth door is Better Auth. Conversation is not named Poke. A fourth product is out of scope.

Do not add unit tests, mocks, fakes, stubs, or `vi.mock`. Tests are journeys that drive a product as a user would. Import-graph locks live in dependency-cruiser or eslint, not `*.test.ts`.

Do not add Redis. Restate is ontology ZoenEffect only. Conversation durability is Eve.

WhatsApp dest is Kapso at `/eve/v1/kapso`. Do not use `@chat-adapter/whatsapp`. Everyday replies are text plus one https URL.

Zoen has not launched. There are no production users or production data. Dest today is Better Auth SessionDoor, planted `zoen`, Eve membership workbench, one Fly app, canonical JSON Publish, and `zoen-effect-dispatcher`. Delete obsolete paths. Do not add compatibility shims, dual-read, dual-write, or leftover aliases. Internal interfaces are not public contracts. Development data is disposable. Do not rewrite an already-applied migration without resetting the databases it touched. Keep transactional safety and migration idempotence.

Do not add `#[allow(clippy::...)]` or other linter bypasses. Generated `gen/connect` protobuf is the exception.

Do not `.unwrap()`. Return `Result` or handle the case. Clippy `unwrap_used` is deny.

A Fly image may still build zoend this week.
