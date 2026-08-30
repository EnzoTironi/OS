# ADR-0019: TypeScript owns Eve conversation without becoming semantic authority

**Status:** Accepted for V1  
**Date:** 2026-08-18

## Context

Zoen needs a conversation product and an ontology door. Putting model and UI libraries in Rust would slow product iteration and make them part of the semantic kernel. Letting TypeScript interpret ontology or mutate storage would create a second semantic authority.

## Decision

TypeScript is the conversation language. Conversation is Eve in `apps/conversation`. Dest authoring is committed canonical JSON plus `DefinitionService.Publish`. Planted `zoen` is the ontology CLI. `docs/product/cli-workbench.md` is dest law.

Rust owns semantic authority. TypeScript never writes authority tables.

## Ontology authoring

Authors publish committed canonical JSON.

```text
committed canonical JSON
 -> CanonicalDefinitionBundle
 -> canonical JSON/JCS/digest
 -> Connect DefinitionService.Publish
```

Publish has no ambient network, unrestricted filesystem, wall-clock, or randomness. Canonical JSON is dest identity.

`@zoen/ontology` and `.zoen.ts` are not dest. `@zoen/sdk` and `@zoen/osdk` are not dest. Do not restore a generated client.

## Model/provider layer

Eve uses configured external LLM providers. Model choice is deployment policy, not application architecture.

The conversation runtime uses a provider abstraction. Preferred V1 seam for model calls is the Vercel AI SDK. Zoen-owned capability categories such as:

```text
reasoning-high
reasoning-fast
embedding-default
rerank-default
vision-default
```

Deployment configuration maps categories to concrete provider and model IDs. OpenAI and Anthropic are first-class real provider integrations. Additional compatible providers may be registered without changing Action semantics. No V1 requirement exists for local or self-hosted LLM inference. The provider seam must not prohibit it later.

The AI SDK never owns agent authority, memory truth, Action lifecycle, or ontology semantics.

Company Brain is not dest. Roadmap `brain-live` is DON'T HAVE. Conversation is Eve.

## Agent runtime

Eve owns the conversation loop, session log, model calls, and workbench isolation. Live untrusted execution is Wasmtime (ADR-0017). Planted `zoen` is the ontology verb surface.

Agent-visible capability is always:

```text
semantic capability
INTERSECT authority
INTERSECT delegation
INTERSECT task/session scope
```

Whether an agent may automatically commit an Action is configurable by policy and delegation. Human approval is neither universally required nor bypassable. The Action and authority contract determines the path.

Agent session events are distinct from semantic business history. Scratch artifacts are ephemeral unless explicitly admitted.

## Experience

Dest face is conversation plus one HTTPS. The TanStack web app and Surface IR live on `archive/pre-modeled-erp`. They are not dest. ADR-0022.

Presentation is not business truth. Renderer replacement must not change ontology or Action semantics. Live WhatsApp destination is the Chat SDK Kapso channel at `/eve/v1/kapso`.

## E2E verification

Release gates use real production paths:

- publish committed canonical JSON through `DefinitionService.Publish` into `zoend` twice and prove deterministic digest;
- consume that published definition through planted `zoen` or another client;
- run Eve conversation plus a governed Action (`just e2e governed-action`);
- run Wasmtime code-mode (`just e2e wasm-code-mode`);
- prove a conflicting document remains evidence and cannot overwrite semantic world state;
- allow an agent to auto-commit an Action when policy permits and require or deny it when policy changes, using the same Action implementation.

Mocks may test error cases but are not the release proof for LLM, retrieval, or Action integration.

## Invariants

- TypeScript never writes authority tables directly.
- LLM output is proposal or content until explicitly admitted through semantic contracts.
- Model and provider identity is configuration and recorded execution evidence, not business meaning.
- Conversation surfaces never grant server-side authority.
- Authoring sugar never creates a hidden fifth canonical semantic primitive without an ADR.
- Knowledge indexes are rebuildable and never accepted world state.

## Revisit if

TypeScript ceases to provide the best product tooling ecosystem, or a model abstraction fails production needs. Replacements remain outside the Rust-owned semantic authority.
