# Cross-cycle executable vertical — issue #71

**Issue:** #71  
**Consumes:** #40, #41, #42, #45, #46, #70, #156, #157, #158  
**Candidate under test:** `R6-capability = Type + Relation + Computation + Action`  
**Status:** hypothesis under attack  
**Architecture decision:** none

## Purpose

This is the first cross-domain acceptance vertical for the reduced metamodel. It is intentionally harder than CRUD and intentionally independent from one production storage/orchestration stack.

The test asks:

> Can the semantics needed to operate one real commercial cycle be represented and enforced with only **Type, Relation, Computation and Action** as canonical executable forms, while runtime capabilities remain explicit but non-semantic primitives?

If the vertical needs a hidden `Event`, `Property`, `Link`, `Policy`, `Constraint`, `Fact`, `Effect`, `Workflow` or `RuleBinding` interpreter to stay correct, R6 fails and the missing form must be revived or a smaller composition found.

## Canonical forms allowed

```text
Type
Relation
Computation
Action
```

Everything else in this experiment must be one of:

- a **domain Type/pattern** constructed from those forms;
- a **standard Type/Relation contract**;
- a **runtime capability** independently required for authority/transactions/effects/execution;
- a **tooling/physical projection**.

The executable anti-cheat gate inspects canonical definitions and generators for forbidden canonical species.

## Runtime capabilities are not canonical forms

The reference engine uses runtime records such as:

```text
StateBasis
AuthorityProof
ApprovalRecord
ExternalRequest / ExternalAttempt / ExternalObservation
ExecutionContext
TransactionResult
```

These are required to make execution safe. They do not become ontology kinds merely because the runtime stores them.

The distinction is deliberate:

```text
business ontology says what the organization means
runtime capability says how the engine safely evaluates/commits/interacts
```

## Vertical

One commercial commitment for **12 units** of a product begins with a current inventory observation of **10 units**.

```text
identity evidence
    ↓
CustomerIntent (12)
    ↓ AcceptOrder
CommercialCommitment (12 @ frozen quoted price)
    ↓
ReserveInventory proposal (live availability basis)
    ↓ concurrent reservation consumes 3
stale proposal rejected
    ↓ repropose
InventoryReservation (7)
    ↓ Computation
shortage = 5
    ↓ CreateProcurementCommitment
ProcurementCommitment (5)
    ↓ runtime external request to supplier
sent / no response -> UNKNOWN
    ↓ reconciliation
supplier confirms request/commitment
    ↓ physical receipt observed/admitted
StockReceipt (5)
    ↓ ReserveInventory
InventoryReservation (5)
    ↓ ShipOrder
Shipment (12)
    ↓ carrier request
sent / no response -> UNKNOWN
    ↓ duplicate/out-of-order observations
DeliveryObservation confirmed
    ↓ IssueReceivable
ReceivableClaim
    ↓ payment instruction external request
SettlementObservation
    ↓ AllocateSettlement
ClaimSettlementAllocation
    ↓ later return
ReturnReceipt + CreditClaim / correction relation
```

The vertical then changes ontology Type revisions and asks historical `why?` questions about the old cycle.

## Required semantic cuts

### Identity

- source identity != exact business identity;
- Product != marketplace/source listing;
- fuzzy candidate != exact identity;
- identity assurance is separate from identity relation;
- high-risk Actions can demand stronger assurance without making identity consumer-relative.

### Intent / commitment / occurrence / observation

These remain different domain meanings even without dedicated base sorts:

```text
CustomerIntent       : Type
CommercialCommitment : Type
StockReceipt         : Type with sealed semantic lifecycle contract
Shipment             : Type with sealed semantic lifecycle contract
DeliveryObservation  : Type representing sourced evidence
```

`Action != occurrence` remains mandatory. An Action can create a locally accepted occurrence record, but executing an Action is not proof that an external-world effect happened.

### Current state without invented history

The initial stock quantity is an `InventoryPositionObservation` snapshot. The model does **not** fabricate ten prior receipt/movement Events to explain it.

Current on-hand and available inventory are Computations over:

- latest relevant position observation;
- later receipts/returns;
- later shipments;
- outstanding reservations.

### Price basis != inventory basis

The accepted order binds:

- **pinned/frozen quote** for commercial price;
- **live state basis** for inventory reservation.

One proposal may therefore depend on several basis modes. `Always reread all current state` is not the contract.

### Authority / human / agent

The same `CreateProcurementCommitment` Action must be invocable by:

- a human principal directly;
- an agent workload acting for a represented principal under a scoped grant.

Proof values bind exact Action, operation id, actor, represented principal, workload, authority domain, inputs and StateBasis. A revoked/stale grant invalidates commit without requiring a RuleBinding registry.

### External effects

Supplier, carrier and payment integrations are runtime capabilities. The ontology sees the business records and causal Relations; it does not promote `Effect` to a canonical form.

Required runtime semantics:

- stable local external-request identity;
- optional provider dedupe key;
- optional remote receipt learned later;
- sent/no-response remains epistemically unknown;
- later definitely-not-sent attempt cannot erase earlier uncertainty;
- duplicate/out-of-order callback does not duplicate business outcome;
- contradictory terminal evidence requires reconciliation rather than last-write-wins.

### Correction / reversal

A return or correction creates new Types/Relations. It does not mutate the protected semantic core of the original shipment/receipt/claim.

### Historical explanation

After a new ontology revision exists, the old cycle must still answer:

```text
Why was this commitment accepted?
Which quote did it bind?
Which identity evidence was relied upon?
Who/what was authorized?
Which StateBasis was checked?
Which Type/Relation/Computation/Action revisions governed it?
Which external outcome was unknown and how was it reconciled?
Which later record corrected/reversed it?
```

## Implementation-neutral engine contract

The reference engine is deliberately small and in-memory. It exists to make semantics executable, not to select production architecture.

Another engine passes #71 if it can satisfy the same acceptance suite and explanations using a different physical design.

Production candidates may use PostgreSQL, other transaction stores, durable orchestration, generated SQL/SDKs, graph/search projections, etc. None receive semantic authority merely because the reference model used a Python class.

## R6 kill conditions

R6 fails this vertical if any required behavior needs one of these hidden forms in canonical execution:

1. Event/Occurrence-specific interpreter branch rather than generic Type lifecycle contracts;
2. Property/Link-specific canonical branch rather than Relation role/endpoint/cardinality semantics;
3. RuleBinding/locus registry rather than typed proof values + privileged operation signatures;
4. Policy/Constraint primitive needed because Computation + Type refinement cannot preserve no-bypass enforcement;
5. Effect primitive needed because runtime external capability cannot remain causally linked without entering the ontology kernel;
6. Fact primitive needed because RelationAssertion/typed evidence records cannot express observation/provenance/correction safely;
7. Workflow primitive needed because durable runtime memory cannot remain subordinate to business Process/Commitment semantics;
8. source-shaped domain exceptions in the generic engine;
9. `last write wins` used to hide competing evidence/authority;
10. historical semantics reinterpreted under later Type/Relation/Computation/Action revisions.

## Success is not promotion

Passing #71 means only:

> R6 survived one intentionally hostile cross-cycle vertical.

It does **not** make R6 an accepted architecture. #80 still decides whether enough evidence exists to stop research/promote a candidate, and explicit RFC/ADR governance remains required.
