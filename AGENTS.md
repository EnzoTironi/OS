# Agent laws

The same law lives in `.cursor/rules/journey-tests-and-restate.mdc`.

## Products

Zoen OS is three products. Ontology is the CLI, the API, and MCP. Conversation is the Vercel Eve runtime in `apps/conversation`. Auth door is Better Auth.

The conversation product is not named Poke. Poke is a voice and quality reference only. A fourth product is out of scope.

Ontology CLI shape lives in `docs/product/cli-workbench.md`.

## Tests

You do not add unit tests, mocks, fakes, stubs, or `vi.mock`. Remaining tests and new tests are journeys that drive a product as a user would.

You put import-graph locks in dependency-cruiser or eslint. You do not put import-graph locks in `*.test.ts`.

## Durability

You do not add Redis. Restate is ontology ZoenEffect only. Conversation durability is Eve.

## WhatsApp

WhatsApp destination is the official Chat SDK Kapso channel at `/eve/v1/kapso`. Do not use `@chat-adapter/whatsapp` Cloud API. Everyday replies are text plus one https URL.

## Pre-launch evolution

Zoen has not launched. There are no production users and no production data. Revisit this before the first production deployment.

You optimize for the smallest coherent design that is dest today: Better Auth SessionDoor, planted `zoen`, Eve membership workbench, one Fly app, canonical JSON Publish, `zoen-effect-dispatcher`.

You remove obsolete code, schemas, APIs, configuration, aliases, dest-wrong teaching, and transitional paths directly.

You do not add backward-compatibility shims, dest-amend banners, leftover aliases, dual-read or dual-write paths, or data-preserving backfills unless Enzo explicitly asks.

Internal interfaces are not public compatibility contracts. You update callers and journeys atomically when they change.

Development and test data are disposable. You prefer recreating those databases over complicating the product to preserve local data.

You treat migration history as a replaceable development baseline, but you keep the checked-in migration chain and setup workflow coherent. You do not rewrite an already-applied migration without also resetting affected development and test databases.

You preserve database invariants, transactional safety, migration idempotence, and deterministic setup. Those are correctness properties, not backward-compatibility requirements.

You consolidate the migration baseline only as an explicit, coordinated change, not as incidental work in a feature branch.

Cleanup is profound. Dead code, dead paths, dest-wrong sentences, and leftover complexity in a file you touch are bugs. You migrate then delete. You do not leave historical V1 beside dest. The product must read production-ready, not AI slop.

## Fly images

A Fly image may still build zoend this week.
