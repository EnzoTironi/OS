# ADR-0012: Surfaces derive from semantics through a replaceable Surface IR

**Status:** Accepted for Architecture v0  
**Date:** 2026-08-18

## Context

A single business capability should not need separate semantic implementations for web, mobile, chat, API, MCP or agents. Generative UI is useful, but coupling Zoen directly to one rendering library would turn a presentation choice into architecture.

## Decision

Zoen defines a presentation-neutral `Surface IR` above semantic Query and Action contracts. Deterministic generated UI, agent-generated adaptive UI and purpose-built applications may all consume the same semantic capabilities.

`json-render` is a strong candidate renderer/adapter for generative and declarative web surfaces, not the semantic UI model itself. Other renderers may target native/mobile, terminal, WhatsApp, custom React or future surfaces.

Surface nodes bind to typed `QueryRef`, `ActionRef` and semantic object references. They do not contain arbitrary SQL, privileged JavaScript callbacks or hidden business rules.

## Invariants

- Presentation metadata is not business truth.
- UI cannot bypass Action authority or mutate authoritative storage directly.
- The same Action can generate human controls, APIs and agent tools without duplicating business behavior.
- Renderer replacement does not change ontology or Action semantics.
- Purpose-built high-frequency applications are allowed; they still use the same semantic Query/Action contracts.

## Consequences

Most administrative/list/detail/form/history surfaces may be derived deterministically. An agent may compose a temporary Surface IR for a specific decision without creating a new application backend.

## Evidence

- Issues #44 and #54.
- The two-day architecture session compared generative UI with `json-render` and the DeepSeek Harness client separation between data objects, rendering machinery and disposable presentation.

## Revisit if

Surface IR begins accumulating business semantics or renderer-specific concepts, or purpose-built applications repeatedly require capabilities the semantic contracts cannot express cleanly.
