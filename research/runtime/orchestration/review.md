# Adversarial review — issue #43

**Date:** 2026-08-16  
**Status:** pre-merge self-review.

## R-ORCH-01 — run/epoch is a role, not a mandatory backend field

Temporal exposes run identity, while other engines expose redrive, fork, migration, or one stable execution identity plus history. OS needs to explain execution continuation/replacement when it happens; it does not require every backend to manufacture the same `RunId` shape.

## R-ORCH-02 — wake-up must evaluate the declared #40 basis, not always current state

A timer/signal/recovery can lead to:

```text
current predicate
pinned revision
immutable reference
as-of snapshot
```

The semantic operation chooses which basis is valid. The orchestrator does not.

## R-ORCH-03 — do not overfit the runtime boundary to deterministic replay

The contract must fit:

- replay/event-history engines;
- BPMN token/state engines;
- declarative state machines;
- database checkpoint engines;
- invocation journals.

Pseudocode in `orchestration-contract.md` is illustrative, not a target backend API.

## R-ORCH-04 — semantic separation does not require physical separation

A runtime can physically co-commit an authoritative database change and durability checkpoint when the storage contract supports it. Likewise, one UI action can complete a human task and submit a governed Approval.

The requirement is distinguishable meaning/evidence, not two mandatory distributed transactions.

## R-ORCH-05 — runtime input can map to a domain Event when an independent source contract proves it

`signal != Event by default` does not mean `signal can never be Event`. A signed/canonical external message can simultaneously be admitted as a domain occurrence and wake an orchestration. Authority comes from the source/domain contract, not the engine envelope.

## R-ORCH-06 — a business deadline may be materialized as a runtime timer

A one-to-one materialization can be efficient. The surviving invariant is that stale/duplicate timer firing cannot independently establish a deadline breach.

## R-ORCH-07 — #43 does not reject domain Process/Commitment

Manufacturing and REA/ValueFlows still provide independent pressure for real-world process/commitment identity. Separating orchestration memory from business semantics does not decide #10/#70.

## R-ORCH-08 — runtime serialization can implement a #40 concurrency mechanism only within a proven serialization domain

If every competing mutation for one invariant is forced through the same serialized key/instance, that mechanism may implement the semantic concurrency contract. It is insufficient for invariants spanning independent keys or bypass paths.

## R-ORCH-09 — runtime completion and business completion may occur together through an explicit domain commit

A final orchestration step can commit `CompleteProcess` after its domain preconditions pass. What is rejected is only the shortcut:

```text
runtime terminal status alone -> business completion
```

## R-ORCH-10 — BPMN can remain valuable as an authoring/projection language

Rejecting BPMN token state as ontology truth does not reject BPMN. #63/#70 should test a mapping where BPMN references domain Actions/Processes/Commitments while the runtime owns only coordination state.

# Pre-CI verdict

The central boundary survives the review:

```text
business semantics / authority
        !=
execution memory / scheduling
```

Refinements above prevent Temporal-specific vocabulary from becoming the abstract architecture. No reviewed evidence earns `Workflow` as a base semantic primitive, and no reviewed evidence rules out independently meaningful domain `Process` or `Commitment` concepts.
