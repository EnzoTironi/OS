# ADR-0008: Published ontology revisions are immutable and historically pinned

**Status:** Accepted for Architecture v0  
**Date:** 2026-08-18

## Context

Executable definitions affect the meaning of queries, decisions and Actions. A prototype allowed an installed expression to change in memory without changing its definition digest; later review found the same leak in a different executable expression path. A migration experiment also showed that naively copying a value from an old semantic definition into a new one can create false current meaning.

## Decision

A published ontology revision is immutable, canonical and content-addressed. Every executable part of a published definition — including computations, lifecycle/ingest expressions and future executable contracts — is frozen as part of the revision digest. Changes create a new revision.

Historical Actions, queries, decisions and explanations pin the exact definition revisions that gave them meaning. Ontology evolution is not equivalent to database schema migration: changes are classified by semantic compatibility, and migrations must preserve or explicitly supersede historical meaning.

## Invariants

- Published definitions cannot be mutated in place.
- Same canonical semantic definition produces the same digest.
- Historical records never silently resolve `latest` definitions.
- Old and new revisions may coexist while migration is incomplete.
- A migration may not manufacture a historical claim merely by copying a value whose semantics changed.
- Activation and rollback operate on explicit revision sets/artifacts.

## Consequences

Authoring syntax is separate from canonical IR. The toolchain may compile, interpret or generate artifacts, but all such artifacts are attributable to immutable definition revisions.

A full compatibility taxonomy, impact analysis and migration/rollback protocol belong in the Architecture v0 spec; the two-day prototype only established the laws and counterexamples.

## Evidence

- Issue #9 and AGI evolution issue #52.
- PR #182 pins operations before/after a mid-cycle definition revision.
- PR #184 demonstrates historical pinning and a naive migration creating false current meaning.
- Later review on PR #183 found an executable `on_record` path still mutable, strengthening the rule that *all* executable definition material must be frozen.

## Revisit if

A production use case requires mutable published semantics and can preserve deterministic historical interpretation without revision pinning.
