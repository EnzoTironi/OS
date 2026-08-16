# R5 vertical — order, inventory, manufacturing, accounting

**Issue:** #70  
**Purpose:** test whether the reduced executable forms can model a realistic business cycle without turning domain concepts into kernel sorts or deleting authoring concepts.

This is a semantic vertical, not a storage schema. ERP/REA terminology is used as domain knowledge; the only candidate **base executable forms** are R5:

```text
Type
Relation
Computation
Action
RuleBinding
```

Authoring may still expose ergonomic resources such as `EventType`, `Invariant`, `Policy`, `Interface`, `Projection`, etc. They compile/normalize to standard contracts over R5 rather than each requiring an unrelated kernel implementation.

## 1. Product and commercial agreement

```text
Type Organization   entity
Type Product        entity
Type SalesOrder     entity
Type SalesLine      entity
Type Commitment     entity
Type Money          value
Type Quantity       value
Type DateTime       value
```

Relations:

```text
seller       : SalesOrder -> Organization [1]
buyer        : SalesOrder -> Organization [1]
line         : SalesOrder -> SalesLine [1..*]
lineProduct  : SalesLine  -> Product [1]
orderedQty   : SalesLine  -> Quantity [1]
unitPrice    : SalesLine  -> Money [1]

commitment   : SalesLine  -> Commitment [1]
promisedQty  : Commitment -> Quantity [1]
dueAt        : Commitment -> DateTime [0..1]
```

`Commitment` is a domain Type because a promised future flow has independent business meaning. It is not a workflow token and does not become a base metamodel primitive.

Action:

```text
Action AcceptSalesOrder(order)
```

Possible authoring view:

```text
Policy CustomerCreditPolicy
Invariant PriceCurrencyCompatible
Precondition OrderHasAtLeastOneLine
```

Canonical R5 view:

```text
Computation evaluateCredit(...)
Computation currencyCompatible(...)
Computation orderHasLines(...)

RuleBinding creditPolicy
  scope=AcceptSalesOrder
  locus=commit
  obligation=authority/system as defined

RuleBinding currencyInvariant
  scope=AcceptSalesOrder
  locus=commit

RuleBinding linePrecondition
  scope=AcceptSalesOrder
  locus=commit
```

The Action commits the accepted order/commitments with semantic operation identity. A retry of the same acceptance is not a second contract.

## 2. Inventory

```text
Type Warehouse      entity
Type InventoryLot   entity
Type StockMovement  entity + OccurrenceContract
Type Quantity       value
```

Relations:

```text
lotProduct      : InventoryLot  -> Product [1]
lotWarehouse    : InventoryLot  -> Warehouse [1]
lotQuantity     : InventoryLot  -> Quantity [1]   // current projection/position if modeled this way

movementProduct : StockMovement -> Product [1]
movementFrom    : StockMovement -> Warehouse [0..1]
movementTo      : StockMovement -> Warehouse [0..1]
movementQty     : StockMovement -> Quantity [1]
corrects        : StockMovement -> StockMovement [0..1]
```

Authoring resource:

```text
EventType StockMovement
```

R5 normalization:

```text
Type StockMovement contracts=[occurrence]
RuleBinding noOrdinaryStockMovementUpdate locus=lifecycle:update deny
RuleBinding noOrdinaryStockMovementDelete locus=lifecycle:delete deny
```

Actions:

```text
ReceiveMaterial(product, warehouse, qty)
MoveMaterial(product, from, to, qty)
ReserveMaterial(product, warehouse, qty)
ConsumeMaterial(...)
ProduceMaterial(...)
CorrectStockMovement(original, correction)
```

Computations:

```text
AvailableQuantity(product, warehouse, basis) -> Quantity
InventoryValue(product/lot/warehouse, basis) -> Money
```

Critical RuleBinding:

```text
inventoryAvailability
  scope=ReserveMaterial/ConsumeMaterial/MoveMaterial
  locus=commit
  basis=current aggregate/predicate dependency
  obligation=system
```

The physical implementation may use PostgreSQL SERIALIZABLE, CAS, lock, escrow/reservation rows, FoundationDB conflict ranges, etc. The semantic contract is the dependency/invariant, not the database mechanism.

## 3. Manufacturing

ERPNext-like business knowledge is represented as domain Types rather than ERP modules:

```text
Type BOM                  entity
Type BOMLine              entity
Type OperationSpec        entity
Type WorkCenter           entity
Type WorkOrder            entity
Type OperationExecution   entity + OccurrenceContract?  // depends on exact semantics
```

Relations:

```text
bomProduct        : BOM -> Product [1]
bomInput          : BOM -> BOMLine [1..*]
inputProduct      : BOMLine -> Product [1]
inputQty          : BOMLine -> Quantity [1]
operation         : BOM -> OperationSpec [0..*]
operationCenter   : OperationSpec -> WorkCenter [0..1]

workOrderProduct  : WorkOrder -> Product [1]
workOrderBOM      : WorkOrder -> BOM [1]
plannedQty        : WorkOrder -> Quantity [1]
```

Domain interpretation:

```text
BOM / OperationSpec      = recipe / process specification knowledge
WorkOrder                = planned/authorized manufacturing instance
OperationExecution       = observed execution record when independently meaningful
StockMovement            = material/resource occurrence
```

Actions:

```text
ReleaseWorkOrder
StartOperation
RecordOperationExecution
ConsumeMaterial
ProduceMaterial
RecordScrap
CloseWorkOrder
CancelWorkOrder
```

Computations:

```text
ExplodeBOM
RequiredMaterials
CompletedQuantity
OperationCost
ManufacturingCost
```

RuleBindings:

```text
cannotConsumeMoreThanAvailable
workOrderUsesApprovedBOMRevision
cannotCloseWithUnresolvedWIP
scrapRequiresReasonAboveThreshold
operatorAuthority
```

No `ManufacturingKernel` is introduced. Deterministic BOM explosion and inventory invariants remain business logic in the executable ontology, run through appropriate Computation/RuleBinding/Action semantics.

## 4. Accounting

```text
Type Account       entity
Type JournalEntry  entity + OccurrenceContract
Type JournalLine   entity
Type Money         value
```

Relations:

```text
entryLine     : JournalEntry -> JournalLine [2..*]
lineAccount   : JournalLine  -> Account [1]
debit         : JournalLine  -> Money [0..1]
credit        : JournalLine  -> Money [0..1]
correctsEntry : JournalEntry -> JournalEntry [0..1]
```

Authoring:

```text
Invariant BalancedJournal
EventType JournalEntryPosted
```

R5:

```text
Computation JournalBalanced(proposedLines) -> DecisionResult
RuleBinding BalancedJournal
  scope=Action PostJournalEntry
  locus=commit
  obligation=system
  on_deny=deny
  on_error=deny

OccurrenceContract JournalEntry
  no ordinary update/delete after posting
```

Action:

```text
PostJournalEntry(lines)
```

Correction/reversal:

```text
ReverseJournalEntry(original)
  -> creates a new JournalEntry occurrence
  -> Relation correctsEntry(new, original)
```

This is the same semantic pattern as stock ledger immutability without requiring a separate Accounting Kernel.

## 5. Cross-domain causality

Shipment example:

```text
Action ShipOrder(order)
  commit can create:
    StockMovement occurrence(s)
    fulfillment relation(s) from occurrence to Commitment
    JournalEntry occurrence(s) where accounting policy requires
    EffectRequest for carrier/marketplace/etc.
```

The Action invocation is not itself any of those occurrences.

External carrier behavior:

```text
local ShipOrder committed
EffectRequest carrierPickup created
remote timeout
knowledge = indeterminate
```

The order/stock local commit remains true; carrier pickup is not fabricated. Reconciliation later supplies remote evidence.

## 6. Fulfillment status is derived, not workflow truth

```text
Computation CommitmentFulfillment(commitment, occurrences, asOf) -> FulfillmentState
Computation OrderFulfillment(order, commitments, asOf) -> OrderFulfillmentState
```

A materialized dashboard projection may cache these results.

A workflow timer may wake at `dueAt`, but:

```text
timer fired != commitment overdue
```

The business computation evaluates actual commitment/evidence basis.

## 7. Authorization and approval

A high-value order may introduce ordinary governance Types:

```text
Type Proposal
Type Approval
Type Grant
```

Relations preserve:

```text
Proposal -> Action intent/bounds/basis
Approval -> Proposal
Approval -> actor/grant/policy revision
Grant -> principal/scope/limits/parent grant
```

RuleBindings decide which evidence/current authority is required at commit.

A low-risk stock labeling Action may have no Proposal/Approval records at all.

## 8. Source evidence

Suppose ERP/Bling says Product P cost 100 and spreadsheet says 105:

```text
Type Observation contracts=[occurrence,evidence]
OBS-ERP  -> P / cost / 100 / source ERP / extractor rev E1
OBS-XLSX -> P / cost / 105 / source spreadsheet / row/hash / extractor rev E2
```

Both survive.

```text
Action SetPlanningCost(P, 105)
```

commits the locally governed planning-cost decision with evidence relations to both observations.

A physical current-value projection can then expose 105 without erasing the 100 assertion.

This vertical therefore does not require `Fact` as a universal atom, but it still leaves open whether a reusable Statement/Assertion authoring contract is worth standardizing.

## 9. What the vertical shows

R5 can express a non-trivial enterprise cycle while retaining familiar authoring vocabulary:

```text
ObjectType      -> Type(entity)
ValueType       -> Type(value)
Property        -> Relation(entity,value)
Link            -> Relation(entity,entity)
Interface       -> shape/capability contract over signatures
Function        -> Computation
ActionType      -> Action
Invariant       -> RuleBinding(system, commit/lifecycle)
Policy          -> RuleBinding(authority, declared decision algebra)
EventType       -> Type + OccurrenceContract/lifecycle bindings
Projection      -> Computation + materialization
Effect          -> typed effect records + external-I/O runtime capability
Workflow        -> durable runtime memory
```

And it keeps domain language rich:

```text
Product
SalesOrder
Commitment
Warehouse
StockMovement
BOM
WorkOrder
OperationExecution
Account
JournalEntry
Grant
Approval
Observation
```

The reduced kernel does not imply a reduced business ontology.

## 10. What this vertical does *not* prove

It does not yet prove:

- one Relation algebra is ergonomically sufficient for every property/link/n-ary constraint;
- minimum cardinality/required relations across construction transactions are solved;
- Interface can be demoted in all SDK/query/action tooling;
- RuleBinding itself is irreducible;
- Event lifecycle survives every real admin/migration/privacy path;
- Fact/Statement standardization is unnecessary;
- the physical ontology layout is efficient;
- fiscal/accounting jurisdiction details fit without additional domain libraries;
- R5 should replace RFC-0001 now.

Those remain explicit kill/open questions.
