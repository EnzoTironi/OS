# ADR-0004: Temporal semantics and dependency-based StateBasis

**Status:** Accepted for Architecture v0  
**Date:** 2026-08-18

## Context

Enterprise history needs to distinguish when something was valid in the modeled world from when the system learned it. The prototype also exposed a subtle stale-state bug: an approval advanced the knowledge revision and incorrectly made an unchanged proposal stale.

## Decision

Zoen distinguishes at least:

- valid time — when a statement applies in the modeled world;
- knowledge/record time — when Zoen learned or recorded it;
- commit revision — ordering/version of authoritative local state.

Temporal values are explicit typed forms, not string slicing conventions. Architecture v0 uses clear instant/interval semantics; intervals are half-open unless a domain definition explicitly models another convention.

An Action proposal captures a `StateBasis` from the dependencies actually evaluated. Staleness is determined by material changes to those dependencies, not by unrelated global revision movement.

## Invariants

- Empty/invalid temporal ranges never mean “all time”.
- Historical queries can distinguish `known then` from `now believed for then`.
- Approval alone does not make a proposal stale.
- A dependency may be materially stale even if the final scalar value is unchanged, when the evidence or derivation relevant to the decision changed.
- StateBasis retains enough evidence and dependency identity for explanation and revalidation.

## Consequences

Time parsing and timezone normalization happen at boundaries; the semantic core receives normalized temporal values. StateBasis is a first-class runtime mechanism but not an ontology primitive.

## Evidence

- Issues #5 and #59.
- PR #181 removed unrelated `knowledge_cut` from the stale digest while retaining it for explanation.
- PR #183 exercised explicit ValidTime semantics and dependency-driven planner inputs.
- PR #184 demonstrated different historical and current interpretations across definition revisions.

## Revisit if

Production domains demonstrate additional temporal dimensions that cannot be represented compositionally, or dependency-based revalidation cannot preserve required concurrency safety.
