# ADR-0006: Operation identity, idempotency and atomic durable commit

**Status:** Accepted for Architecture v0  
**Date:** 2026-08-18

## Context

A governed Action is unsafe if an approved proposal can be committed under a different operation/namespace, if retries duplicate writes, or if a lost client response cannot be distinguished from a failed commit. The PostgreSQL experiments also exposed identity collisions that originally surfaced as incidental unique-constraint errors.

## Decision

A committed operation has explicit, bound identity including its authority namespace, operation identifier and intent digest. Proposal and commit identities must match.

The durable commit protocol uses optimistic concurrency/CAS over the authority head and atomically persists the operation, semantic records, causal records required by the commit, EffectRequests and the new revision. Replay of the same committed intent returns the canonical durable result; a different intent under the same identity returns a typed mismatch. Record/effect identity collisions return typed outcomes and leave no partial semantic write.

A status operation can recover a committed result after a caller loses the response.

## Invariants

- Exactly one semantic winner advances a contested authority revision.
- A rejected attempt writes nothing authoritative.
- Replay and status reconstruct the same canonical receipt from durable state.
- Operation identity cannot be changed between proposal and first commit.
- Multi-record semantic writes are atomic; this applies beyond the Action path to any universal runtime operation that claims atomic semantics.

## Consequences

Physical databases enforce atomicity and uniqueness, while semantic intent, authority and planning remain above the storage seam. Exactly-once delivery to external systems is not assumed.

## Evidence

- Issue #40.
- PR #181 closes the proposal/operation/namespace identity hole.
- PRs #178 and #179 test CAS, replay, lost-response status recovery, typed collisions and atomic operation+records+effects in PostgreSQL 16/18.
- Later review on PR #183 found another partial-write identity path, reinforcing the general atomic-write law rather than validating the prototype implementation.

## Revisit if

The production store cannot implement this protocol without moving business semantics into database-specific code, or distributed authority requirements force a stronger commit model.
