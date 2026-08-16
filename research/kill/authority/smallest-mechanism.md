# Smallest authority mechanism

**Kind.** explanation  
**Fetched.** 2026-08-16  
**Decision.** `hypothesis` for the mechanism. `rejected` for a standing truth layer.

## Question

If irreducible disagreements remain, what is the smallest mechanism that covers them?

## What the evidence does not buy

A kernel type named Accepted Fact. A global winner table keyed by object. A merge that drops the losing observation from current state. A confidence score that writes a ledger.

Foundry already implements the large mechanism. User edits win, or recency wins, and the loser leaves the object. That is convenient for applications. It is a poor audit of IRR-01 and IRR-10. The ERP still holds the dropped value.

Microsoft virtual tables show the other extreme. The ERP remains the store. Dataverse does not invent a second fact. That works until someone copies. Dual-write then recreates IRR-09.

## What the IRR rows share

Each supported irreducible row has the same shape.

1. Two or more live records already typed.
2. One later Action that cannot proceed with both values.
3. A person or policy that consumes the records and emits a new record.

ERPNext Stock Reconciliation fetches book quantity, accepts a counted quantity, and posts as of a date. Odoo Apply writes a stock move and asks again if the book moved. ERPNext Manual Inspection sets inspection status after a failed reading. IAS 8 restates later statements and keeps the fact of the original issue. ValueFlows adds a `corrects` event. PROV can mark revision or invalidation without deleting the earlier entity.

That is already a mechanism. It does not need a second semantic layer above Facts.

## Candidate mechanism

Call it a **reconciliation Decision**. The name is local to this note. It is not an OS type.

Required pieces, and no more.

- Persist every rival record with identity, property, value, valid time, knowledge time, source, and speech-act or layer.
- Permit two live records for one property.
- Bind identity in a separate Decision when codes disagree.
- For each Action that needs one input, name the policy that selects, matches, or overrides. The policy may be "use the latest Decision for this property," "use the counted adjustment," or "refuse until a human disposition exists."
- When a human or policy overrides, write a new Decision record that points at the consumed records. Do not mutate them.
- Project "the number we used" per Action and time. Keep that projection explainable.

This is L-003, L-004, L-005, and L-007 together.

## What can stay out of the kernel

Winner-merge indexes. Golden-record MDM products. Leading-ledger defaults. Dual-write copies. Confidence as a write. A generic Fact type that collapses Intent, Commitment, Observation, and Decision.

Those may appear as runtime or integration choices later. Wave B waits on this pressure. They are not required by the catalog.

## Runtime consequence

If L-003 survives, a runtime must store rival live records, evaluate authority per property and Action and time, and explain which Decision an Action used. It must not treat a materialized current object as the only remaining evidence.

No store, queue, or language is selected.

## Relation to issue 4

Issue 4, on `origin/cursor/issue-4-foundation-cfd8` at `905baa0c99f09fd445b9f1bb0eee5435fa814be3`, already pressed a projection-plus-Decision reading of question 3. This kill test reached the same size of mechanism from the six-domain catalog and from sources issue 4 did not use, including GUM, IAS 8, GS1 CBV ownership, SAP parallel ledgers, and Microsoft virtual tables.

The independent result is the catalog split and the kill of both oversized answers. Hypothesis A as "no authority needed" dies on IRR-01. Hypothesis B as "add a truth layer" dies on the size of the surviving Action.
