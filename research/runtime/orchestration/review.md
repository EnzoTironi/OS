# Adversarial review — issue #43

**Date:** 2026-08-16  
**Status:** `review-clean` after semantic refinements and executable CI.

Validated CI before final review-status mutation:

```text
orchestration-research-ci run 31928375693
30 candidate laws
70 adversarial scenarios
22 executable semantic-boundary tests
index/schema checks green
```

## R-ORCH-01 — run/epoch is a role, not a mandatory backend field

Temporal exposes run identity, while other engines expose redrive, fork, migration, or one stable execution identity plus history. OS needs to explain execution continuation/replacement when it happens; it does not require every backend to manufacture the same `RunId` shape.

**Resolved in primary contract:** execution epoch/continuation evidence is explicitly backend-dependent.

## R-ORCH-02 — wake-up must evaluate the declared #40 basis, not always current state

A timer/signal/recovery can lead to:

```text
current predicate
pinned revision
immutable reference
as-of snapshot
```

The semantic operation chooses which basis is valid. The orchestrator does not.

**Resolved in primary contract:** wake/recovery now evaluates the declared semantic basis and does not universally reread “latest state”.

## R-ORCH-03 — do not overfit the runtime boundary to deterministic replay

The contract must fit:

- replay/event-history engines;
- BPMN token/state engines;
- declarative state machines;
- database checkpoint engines;
- invocation journals.

The candidate runtime capability section is deliberately role/capability-oriented, not a Temporal-shaped API.

## R-ORCH-04 — semantic separation does not require physical separation

A runtime can physically co-commit an authoritative database change and durability checkpoint when the storage contract supports it. Likewise, one UI action can complete a human task and submit a governed Approval.

The requirement is distinguishable meaning/evidence, not two mandatory distributed transactions.

**Resolved in primary contract:** physical co-commit is explicitly permitted.

## R-ORCH-05 — runtime input can map to a domain Event when an independent source contract proves it

`signal != Event by default` does not mean `signal can never be Event`. A signed/canonical external message can simultaneously be admitted as a domain occurrence and wake an orchestration. Authority comes from the source/domain contract, not the engine envelope.

**Resolved in primary contract:** this positive case is explicit.

## R-ORCH-06 — a business deadline may be materialized as a runtime timer

A one-to-one materialization can be efficient. The surviving invariant is that stale/duplicate timer firing cannot independently establish a deadline breach.

**Resolved in primary contract:** physical one-to-one timer materialization is allowed without granting timer firing business authority.

## R-ORCH-07 — #43 does not reject domain Process/Commitment

Manufacturing and REA/ValueFlows still provide independent pressure for real-world process/commitment identity. Separating orchestration memory from business semantics does not decide #10/#70.

This remains an intentional open question, not a defect.

## R-ORCH-08 — runtime serialization can implement a #40 concurrency mechanism only within a proven serialization domain

If every competing mutation for one invariant is forced through the same serialized key/instance, that mechanism may implement the semantic concurrency contract. It is insufficient for invariants spanning independent keys or bypass paths.

**Resolved in primary contract:** the proven-shared-serialization-domain exception is explicit.

## R-ORCH-09 — runtime completion and business completion may occur together through an explicit domain commit

A final orchestration step can commit `CompleteProcess` after its domain preconditions pass. What is rejected is only the shortcut:

```text
runtime terminal status alone -> business completion
```

**Resolved in primary contract:** co-occurring completion through explicit domain semantics is supported.

## R-ORCH-10 — BPMN can remain valuable as an authoring/projection language

Rejecting BPMN token state as ontology truth does not reject BPMN. #63/#70 should test a mapping where BPMN references domain Actions/Processes/Commitments while the runtime owns only coordination state.

This remains an intentional downstream experiment.

# Final review verdict

The central boundary survived source comparison, 70 adversarial cases, executable modeling and two rounds of semantic red-team:

```text
business semantics / authority
        !=
execution memory / scheduling
```

The review also narrows the positive architecture:

```text
semantic domain (#40/#41/#42/#45)
        │
        │ stable identities + declared basis + evidence
        ▼
generic durable-execution capability boundary
        │
        ├─ replay/history backend
        ├─ BPMN/token backend
        ├─ declarative state-machine backend
        ├─ DB checkpoint backend
        └─ invocation-journal backend
```

No reviewed evidence earns `Workflow` as a base semantic primitive. No reviewed evidence rules out independently meaningful domain `Process` or `Commitment` concepts.

The temporary web fact-check service returned HTTP 503 during the final pass, so two nonessential product-specific claims were deliberately narrowed rather than guessed. This does not affect the semantic result; the source study now avoids depending on those uncertain details.
