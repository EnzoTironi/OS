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

WhatsApp destination is Kapso `defineChannel`. Do not use `@chat-adapter/whatsapp` Cloud API. Outbound is text plus one https URL.

## Fly images

A Fly image may still build zoend this week.
