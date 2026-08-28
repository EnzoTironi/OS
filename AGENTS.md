# Agent laws

The same law lives in `.cursor/rules/journey-tests-and-restate.mdc`.

## Products

Zoen OS is three products. Ontology is the CLI, the API, and MCP. Poke harness is the Chat SDK and the messaging adapters. The third product is Auth door.

You do not add a fourth product.

## Tests

You do not add unit tests, mocks, fakes, stubs, or `vi.mock`. Remaining tests and new tests are journeys that drive a product as a user would.

You put import-graph locks in dependency-cruiser or eslint. You do not put import-graph locks in `*.test.ts`.

## Restate

You do not add Redis. Poke lock, debounce, subscribe, and idempotency are Restate virtual objects on the existing Restate. ZoenEffect stays ontology on the same server.

## WhatsApp

The WhatsApp adapter is the existing whatsmeow companion. It is not `@chat-adapter/whatsapp` Cloud API. Cards and buttons become text plus one https URL.

## Fly images

You leave zoend, companion, and speaker buildable so a Fly image still builds.
