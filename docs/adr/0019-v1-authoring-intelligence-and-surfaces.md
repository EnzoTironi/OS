# ADR-0019: TypeScript owns V1 authoring, intelligence and experience without becoming semantic authority

**Status:** Accepted for V1  
**Date:** 2026-08-18

## Context

Zoen needs a strong human/agent authoring experience, Company Brain, multi-provider LLM access, code mode and rich generated/custom applications. Putting these concerns in Rust would slow product iteration and make model/UI libraries part of the semantic kernel. Letting TypeScript independently interpret ontology or mutate storage would create a second semantic authority.

## Decision

TypeScript is the V1 product/intelligence/experience language. It is a client/authoring compiler for the Rust semantic authority.

## Ontology authoring

The primary authoring surface is a typed package, `@zoen/ontology`, using `.zoen.ts` sources.

Conceptual author usage:

```ts
const Product = defineType(...)
const suppliedBy = defineRelation(...)
const requiredPurchase = defineComputation(...)
const purchaseMaterial = defineAction(...)
```

Authoring syntax may expose ergonomic concepts such as properties, links, interfaces, policies, views or modules. The compiler normalizes them into the canonical semantic IR before publication.

Pipeline:

```text
.zoen.ts
 -> TypeScript typecheck
 -> restricted deterministic authoring evaluation
 -> RawDefinitionBundle
 -> semantic validation
 -> CanonicalDefinitionBundle
 -> canonical JSON/JCS/digest
 -> Connect DefinitionService.Publish
```

Ontology compilation has no ambient network, unrestricted filesystem, wall-clock or randomness. CI compiles the same source independently and compares canonical digest to detect nondeterminism.

Canonical JSON remains a supported machine input/output; TypeScript authoring is not semantic identity.

## Model/provider layer

V1 supports multiple external LLM providers from the first release. Model choice is deployment policy, not application architecture.

The intelligence package uses a provider abstraction/registry (the Vercel AI SDK is the preferred V1 substrate for model/provider calls) and exposes Zoen-owned capability categories such as:

```text
reasoning-high
reasoning-fast
embedding-default
rerank-default
vision-default
```

Deployment configuration maps categories to concrete provider/model IDs. OpenAI and Anthropic are first-class real provider integrations; additional compatible providers may be registered without changing Company Brain/Action semantics. No V1 requirement exists for local/self-hosted LLM inference, but the provider seam must not prohibit it later.

The AI SDK/provider library never owns agent authority, memory truth, Action lifecycle or ontology semantics.

## Company Brain

Company Brain unifies access while preserving authority distinctions:

```text
raw evidence -> knowledge fragments -> semantic world -> causal history
```

V1 storage:

- original/raw binary content in S3-compatible object storage by content digest;
- source/fragment/extraction metadata in PostgreSQL;
- PostgreSQL full-text search for lexical retrieval;
- pgvector for dense embedding retrieval;
- hybrid ranking (including reciprocal-rank fusion or reranking as configured);
- immutable source/fragment digests and retrieval traces for attributable model context.

Retrieved text or model inference does not become accepted semantic state automatically. Promotion into evidence/claims/definitions uses explicit Zoen admission/Action/evolution paths.

Every materially model-visible company datum in an auditable proposal/session carries enough immutable source/query/revision references to reconstruct the supplied context.

## Agent runtime

The Zoen harness owns agent loop, session log, capability discovery, skills, model calls and code-mode orchestration. Agent-visible capability is always:

```text
semantic capability
INTERSECT authority
INTERSECT delegation
INTERSECT task/session scope
```

Whether an agent may automatically commit an Action is configurable by policy/delegation. Human approval is neither universally required nor bypassable: the Action/authority contract determines the path.

Agent session events are distinct from semantic business history. Scratch artifacts are ephemeral unless explicitly admitted.

## Web and Surface IR

The V1 web application uses React + TanStack Start and TanStack libraries where appropriate for query/form/table/virtualization concerns.

Zoen owns a presentation-neutral `Surface IR`. It contains typed semantic data bindings, `QueryRef`, `ActionRef`, evidence/explanation references, layout/component metadata and presentation state. It cannot contain raw SQL or privileged arbitrary business-write callbacks.

`json-render` is the first generated/adaptive web renderer adapter, not the Surface IR schema and not a semantic dependency. A minimal reference renderer is maintained to prove the renderer seam.

Three UI classes are first-class:

1. deterministic surfaces generated from definitions/query/action contracts;
2. agent-generated adaptive Surface IR validated against a safe catalog/schema;
3. purpose-built high-frequency React applications using the same Query/Action protocol.

## E2E verification

Release gates use real production paths:

- compile real `.zoen.ts` definitions twice and prove deterministic canonical digest;
- publish from the TypeScript generated client into `zoend` and consume them from another client;
- ingest a real PDF/document/message-shaped corpus into object storage/Postgres/pgvector and run lexical+dense hybrid retrieval;
- call a real configured external LLM and reconstruct material model context from immutable refs;
- prove a conflicting document remains evidence and cannot overwrite semantic world state;
- run an agent under two different delegations and prove different capability visibility;
- allow an agent to auto-commit an Action when policy permits and require/deny it when policy changes, using the same Action implementation;
- render deterministic Surface IR in a real browser and commit a real Action through it;
- generate adaptive Surface IR with a real LLM, validate it, render it, and prove invented/unauthorized ActionRefs cannot bypass the runtime;
- swap renderer/provider configuration without semantic-result changes.

Mocks may test error cases but are not the release proof for LLM, retrieval, browser or Action integration.

## Invariants

- TypeScript never writes authority tables directly.
- LLM output is proposal/content until explicitly admitted through semantic contracts.
- Model/provider identity is configuration and recorded execution evidence, not business meaning.
- Surface visibility never grants server-side authority.
- Authoring sugar never creates a hidden fifth canonical semantic primitive without an ADR.
- Knowledge indexes are rebuildable and never accepted world state.

## Revisit if

TypeScript ceases to provide the best product/tooling ecosystem, a retrieval workload exceeds PostgreSQL/pgvector materially, or a renderer/model abstraction fails production needs. Replacements remain outside the Rust-owned semantic authority.
