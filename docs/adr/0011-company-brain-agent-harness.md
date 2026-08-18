# ADR-0011: Company Brain and agent harness live outside semantic authority

**Status:** Accepted for Architecture v0  
**Date:** 2026-08-18

## Context

Enterprise AI is converging on company-context/brain systems and agent harnesses. These are valuable for retrieval, planning, memory, model orchestration and code-mode execution, but allowing them to become a second source of organizational truth would undo the ontology's authority model.

## Decision

Zoen has an intelligence plane outside the Rust semantic authority. It may be implemented primarily in TypeScript and may include Company Brain retrieval, agent loops, model providers, skills, code sandboxes, session memory and capability/plugin composition inspired by modern harness architectures such as DeepSeek Harness.

The Company Brain spans organizational knowledge, semantic world state and causal memory, but retrieved knowledge remains evidence/context unless admitted through governed semantic paths. Agent working memory is distinct from persistent organizational memory.

Model-visible company context is attributable: the system records enough source/revision/digest/retrieval information to reconstruct what material context supported an auditable proposal or decision.

## Invariants

- Agent intelligence is not authorization.
- Agent-visible Actions are scoped by actual semantic capability, authority, delegation and task/session context.
- Agents query and act through the same semantic contracts available to humans/APIs.
- Scratchpad, sandbox files, retrieved passages and model outputs do not become authoritative state automatically.
- Harness plugins can replace models/search/sandbox behavior but cannot redefine semantic commit, authority or historical meaning.

## Consequences

The intelligence plane can evolve rapidly without destabilizing the semantic constitution. Agent code mode is a smart client of Zoen APIs, never an execution bypass.

## Evidence

- Issues #50, #52, #53.
- PR #182 demonstrates human and agent workloads using one Action.
- Session research of `deepseek-ai/deepseek-harness` established capability seams, typed events, reversible registrations and scoped plugin composition as useful intelligence-plane patterns.

## Revisit if

A future architecture proves that part of agent reasoning must become authoritative for correctness; such a change requires a new ADR defining how that authority becomes deterministic, reviewable and historically reproducible.
