# W1-01 governed Publish architecture

## Decision

Keep governed publication inside `DefinitionEngine`. Split content admission from authority admission, then let the store accept only a sealed, policy-bearing publication. Candidate A is the base. Candidate B contributes post-authorization event construction, explicit pack-caller coverage, and the rejection of replay caches.

The independent judge scored A 29 and B 26. Both were eligible. The coordinator reached the same result after reading both candidates and the current activation path. Activation already demonstrates the repository's intended ownership pattern. A separate `DefinitionCatalog` would add composition and caller choice without strengthening the invariant.

## Caller contract

Connect, pack installation, and any future internal caller make one call.

```rust
let publication = engine
    .publish(
        &context,
        canonical_bytes,
        claimed_digest,
        published_at,
    )
    .await?;
```

The caller receives the durable authority fact.

```rust
pub struct DefinitionPublication {
    pub revision: DefinitionRevision,
    pub published_at: TimestampMicros,
    pub published_by: ActorId,
    pub principal_id: PrincipalId,
    pub workload_id: WorkloadId,
    pub policy: PolicyEvidence,
}
```

The pre-launch Connect contract changes atomically to return that aggregate.

```proto
message PublishResponse {
  DefinitionPublication publication = 1;
}

message DefinitionPublication {
  DefinitionRevision revision = 1;
  google.protobuf.Timestamp published_at = 2;
  string published_by = 3;
  string principal_id = 4;
  string workload_id = 5;
  zoen.action.v1.PolicyEvidence policy = 6;
}
```

There is no bare-revision compatibility field. All callers and journeys move in the same unit.

## Type boundary

`DefinitionCandidate` is private content admission. It contains canonical JSON and the derived `DefinitionReference`. It cannot cross the store port.

`AdmittedDefinitionPublication` becomes the only write-capable input. Its constructor is private and reachable only after delegation and Cedar permit. It contains the candidate, the SessionDoor-resolved `ExecutionContext`, exact `PolicyEvidence`, server timestamp, and the ready projection event.

```rust
pub trait AuthorityStore {
    fn publish(
        &self,
        publication: &AdmittedDefinitionPublication,
    ) -> impl Future<Output = Result<DefinitionPublication, StoreError>> + Send;
}
```

The old `(context, content_only_publication)` signature and constructor are deleted. No boolean authorization flag exists.

## Authority flow

`DefinitionEngine::publish` performs one ordered operation.

1. Canonicalize, verify the digest, decode, and validate into a private candidate.
2. Derive `ActionId("zoen.definition.publish")` and a resource ID from the candidate definition ID.
3. Check the current delegation at the server timestamp.
4. Evaluate `PolicyOperation::PublishDefinition` against the candidate `DefinitionReference` and the directory projection.
5. On permit, construct the sealed publication and `DefinitionPublished` v2 event.
6. Call the transactional store once.

Delegation deny and Cedar deny map to `PermissionDenied`. Missing candidate policy or evaluator failure maps to `FailedPrecondition`. All three return before a store call.

For W1, `CedarPolicyEvaluator` remains the only policy source, keyed by candidate digest and `zoen.definition.publish`. There is no membership, active-definition, activation-policy, or default-allow fallback. W2 atomically replaces evaluator construction with candidate policy from `WorldRelease`. The engine and store contracts do not change.

## Event

Content admission does not create an event. The sealed publication creates `DefinitionPublished` version 2 after authority succeeds. Its payload includes definition ID, digest, revision, actor, principal, workload, publication time, policy ID, policy revision, policy digest, and determining policies. Version 1 is not mutated in place.

## Transaction and schema

Add forward migration `0026_governed_definition_publication.sql`. Do not edit migration 0001 or backfill disposable development data.

The migration adds immutable, forced-RLS `definition_publications` and `definition_publication_grants` tables modeled on definition activation. The publication row has exact foreign keys to the authority commit and definition revision, a unique commit, a unique tenant/definition/digest/revision identity, actor, principal, workload, server time, and every `PolicyEvidence` field. The grants table records the delegation chain used for the admitted mutation.

A deferred database invariant rejects any new `definition_revisions` row that lacks its governed `definition_publications` row at commit. Existing ungoverned rows are not synthesized. A replay that finds content without publication evidence returns corruption.

The Postgres transaction owns these steps.

1. Set tenant RLS from the sealed context.
2. Create and lock that World's authority head.
3. Check for exact replay by joining revision and publication evidence.
4. Return the original aggregate for exact replay.
5. Reject revision-number conflict.
6. Insert authority commit, revision, publication evidence, delegation grants, v2 outbox event, and head advancement.
7. Commit once.

An error in any write rolls back every artifact. No process-global replay cache is allowed.

## Replay

Every request repeats content admission, current delegation, and current candidate-policy evaluation before the store is reachable. A revoked caller cannot retrieve an earlier success by replaying bytes. An authorized replay returns the original `DefinitionPublication` and original committed evidence. It creates no authority commit, evidence row, outbox row, or head movement.

## Module map

```text
apps/zoend/src/service.rs
  SessionDoor context, wire parsing, server time, error/result mapping
        |
        v
crates/zoen-engine/src/publication.rs
  candidate admission, delegation, Cedar, sealing, v2 event
        |
        v
crates/zoen-adapters/src/authority_store.rs
  replay join and one Postgres authority transaction
```

`crates/zoen-core` owns `DefinitionPublication`. `crates/zoen-engine/src/action.rs` owns the new policy operation. `crates/zoen-adapters/src/cedar.rs` owns its Cedar name and candidate-digest lookup. The proto owns the wire aggregate. Pack installation remains a normal `DefinitionEngine::publish` caller with no privileged bypass.

## Journey proof

Extend `e2e/definition-publication.ts`. It must prove allow, Cedar deny, delegation deny, missing policy, tenant substitution, no-write denial including no head movement, exact policy evidence through Connect and Postgres, authorized replay without new rows, revoked replay denial, outbox rollback of every artifact, and exact restart recovery.

After the first allow/deny slice, inspect fixture edits. If a second same-shaped digest-policy edit is needed, build a deterministic fixture generator or checker before continuing. Every live journey that publishes must declare Publish authority explicitly.

## Rejected choices

- A separate `DefinitionCatalog`. It duplicates an engine ownership boundary without a stronger invariant.
- Public authorize-then-commit methods. They expose temporal sequencing and evidence lifetime to callers.
- Policy inside Postgres. It leaks Cedar and release-source mechanics into persistence.
- Policy columns on `definition_revisions`. They conflate canonical content with the governed publication fact.
- Replay lookup before authority. It preserves the current bypass.
- Any raw store method, compatibility alias, fallback policy source, or cache.

## Verification

The worker must run `just e2e definition-publication`, `just verify`, and `git diff --check`. An independent verifier must inspect the exact SHA, confirm denial precedes every store call, inspect the negative database assertions and migration invariants, and rerun the live journey. Typecheck alone is not a verdict.

This decision applies Foundational Thinking by fixing the write-capable type first. Type System Discipline makes unauthorized persistence unrepresentable. Boundary Discipline keeps transport, Cedar, and SQL in their owners. Sequence Work into Verifiable Units binds the change to one existing live journey. Prove It Works requires exact replay, rollback, restart, and database evidence.
