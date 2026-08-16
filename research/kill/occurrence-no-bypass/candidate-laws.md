# Candidate laws — issue #157

**Architecture decision:** none.  
**Event base-form disposition:** under attack.

## L-OCC-01 — Action and occurrence remain semantically distinct even if Event is not a base sort

**State:** `supported` by prior research; encoding remains `hypothesis`.

Demoting Event does not permit an attempted/authorized Action to stand for the historical occurrence it intended to cause.

## L-OCC-02 — Type plus an advisory Event tag is insufficient

**State:** `supported`.

A tag/interface that callers or admin tools can bypass does not preserve historical semantics. Any demotion requires inescapable lifecycle enforcement at the authoritative boundary.

## L-OCC-03 — Semantic immutability can be a generic Type contract rather than an Event-specific base nature

**State:** `hypothesis`.

The bounded candidate uses `sealed_semantics` on StockMovement, JournalPosting and non-event PublishedDefinition. Runtime enforcement branches on the generic Type contract, not a hard-coded Event species.

**Falsifier:** real occurrence requirements force unique interpreter behavior that cannot be shared with other committed semantic values.

## L-OCC-04 — Every authoritative write path must obey the same protected-semantic boundary

**State:** `hypothesis`.

Action, admin, ingest, bulk import, migration, repair, privacy, restore/replay and connector reconciliation must not possess a lower raw semantic-update path.

## L-OCC-05 — External occurrence admission does not require inventing a local business Action

**State:** `supported` as a distinction.

An externally observed/authoritative occurrence may be admitted through ingest/reconciliation authority. The admission operation is not evidence that OS caused the business occurrence.

## L-OCC-06 — Source observation, accepted occurrence and correction are different records/claims

**State:** `supported` as modeling pressure.

Correcting a source assertion does not automatically authorize rewriting an accepted business occurrence. The model must preserve which statement was corrected.

## L-OCC-07 — Replay reconstructs state only when semantic identity is preserved

**State:** `hypothesis`.

Restore/replay of the same semantic operation/record may recreate missing physical state without creating a second occurrence. A replay under conflicting meaning must surface conflict rather than overwrite.

## L-OCC-08 — Stable record identity with conflicting semantic core is a reconciliation error, not last-write-wins

**State:** `supported` in the bounded model.

Duplicate/conflicting source material cannot replace a sealed record in place merely because it carries the same external key.

## L-OCC-09 — Correction should preserve the original accepted record where retention law permits

**State:** `hypothesis` with strong accounting/inventory provenance pressure.

A correction/retraction/supersession/reversal is an explicit new record/relation. Current projections may prefer the newer statement without erasing that the original was once accepted.

## L-OCC-10 — Reversal is a new occurrence, not mutation of the reversed occurrence

**State:** `supported` for ledger-like domains; broader domain scope remains `hypothesis`.

Where a real compensating/reversing event occurs, it must be represented as a new occurrence linked to the original rather than rewriting the original event.

## L-OCC-11 — Privacy erasure and semantic correction are different operations

**State:** `supported` as a distinction.

Privacy authority may erase data classified as legally erasable payload without silently changing protected business semantics.

## L-OCC-12 — No universal retention artifact is justified by #157

**State:** `supported` as epistemic discipline.

A digest/tombstone/audit envelope may be useful or forbidden depending on law/policy and data. The model must not require retaining a hash merely to preserve append-only aesthetics.

## L-OCC-13 — Representation migration may rewrite physical representation while preserving logical semantic value

**State:** `hypothesis`.

Physical bytes/schema encoding are not the same as historical semantic meaning. Migration can change representation version if the logical protected value remains equal.

## L-OCC-14 — Ontology/Type revision changes must not silently reinterpret historical records

**State:** `supported` as historical-explanation pressure.

Existing records remain bound to the Type/ontology revision under which their semantic meaning was admitted unless an explicit migration/reinterpretation record says otherwise.

## L-OCC-15 — Projection rebuild is not a business occurrence

**State:** `supported`.

Recomputing a read model/cache/analytics projection from unchanged authority must not append a new business occurrence or change authoritative history.

## L-OCC-16 — Repair metadata and repair business meaning require different authority

**State:** `hypothesis`.

Annotations/provenance/diagnostic metadata may be repairable in place when modeled as non-semantic envelope data; a change to protected meaning requires correction/supersession/reversal semantics.

## L-OCC-17 — Disaster-recovery restore does not grant semantic rewrite authority

**State:** `hypothesis`.

Restoring old physical state must be followed by replay/reconciliation using stable operation/record identities. DR is not an exception that allows newer accepted occurrences to be overwritten by stale backup bytes.

## L-OCC-18 — Connector reconciliation adds evidence/outcomes/corrections; it does not own generic overwrite authority

**State:** `hypothesis`.

A connector may observe that external state differs and propose/admit correction evidence. It cannot rewrite any protected semantic record merely because it is the integration path.

## L-OCC-19 — A native Event base sort should be revived only if occurrence lifecycle is uniquely irreducible

**State:** `hypothesis`.

If the same generic sealed-semantic contract correctly protects a non-event PublishedDefinition, lifecycle enforcement alone is insufficient evidence for Event as a base form.

**Revival condition:** real occurrence semantics require a unique identity/evolution/authority protocol that generic Type contracts cannot express without an Event-specific runtime branch.

## L-OCC-20 — Passing #157 is insufficient to accept R6

**State:** `supported` as epistemic discipline.

#158 must still attack Relation unification and #71 must execute the same candidate through a cross-cycle business vertical. RFC-0002 remains a hypothesis until explicit synthesis/promotion occurs.
