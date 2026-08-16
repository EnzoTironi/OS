# R5 concrete encodings

**Issue:** #70  
**Purpose:** show exactly how demoted concepts survive composition. Representation alone is insufficient; each encoding names the runtime guarantee it depends on.

## 1. Scalar Property and entity Link through one Relation algebra

### Product planning price

```text
Type Product        nature=entity
Type Money          nature=value

Relation planningPrice
  roles:
    owner  : Product [1]
    value  : Money   [0..1]
```

The physical store may use a typed column. `Relation` is the semantic form, not a requirement to store a triple.

Required guarantees:

- a Product reference cannot be used where Money is expected;
- Money equality is by value/type, not object identity;
- cardinality is enforceable;
- currency/amount semantics live in the Money value type rather than a float convention.

### Employment link with lifecycle

A cheap binary edge is insufficient because employment can be suspended, promoted and terminated.

```text
Type Employment   nature=entity
Type Person       nature=entity
Type Organization nature=entity

Relation employee
  Employment -> Person [exactly 1]

Relation employer
  Employment -> Organization [exactly 1]

Relation employmentStatus
  Employment -> EmploymentStatus [exactly 1]

Action SuspendEmployment(target: Employment)
Action TerminateEmployment(target: Employment)
```

No native `Relator` is required. The relationship earns **ordinary identity**, not a second storage species.

## 2. Interface as shape contract, not Role

```text
ShapeContract Priceable
  requires Relation priceCurrency -> Currency
  requires Computation effectivePrice(context) -> Money

Type Product conforms Priceable
Type FreightQuote conforms Priceable
```

Conformance is static/tooling-visible and can drive polymorphic query/action signatures.

It says nothing about anti-rigidity or relational dependence.

Supplier remains different:

```text
Type SupplyRelationship
Relation supplierParty : SupplyRelationship -> Organization
Relation buyerParty    : SupplyRelationship -> Organization
```

An Organization is not assigned a second identity because it became a supplier.

## 3. Event demoted to enforced occurrence contract

Wave A rejected an unenforced `Event` tag. R5 instead requires a contract whose lifecycle is enforced by generic RuleBinding/commit machinery.

```text
Type StockMovement nature=entity

OccurrenceContract StockMovement
  RuleBinding noOrdinaryUpdate
    scope      = StockMovement
    locus      = lifecycle:update
    obligation = system
    decision   = deny

  RuleBinding noOrdinaryDelete
    scope      = StockMovement
    locus      = lifecycle:delete
    obligation = system
    decision   = deny
```

Correction:

```text
Action CorrectStockMovement(original, correctedQuantity)
  commit:
    create StockMovement correction
    create Relation corrects(correction, original)
```

The reduction passes only if **every exported mutation path** crosses the lifecycle binding. An occurrence stored in an “events table” but editable through an admin API fails the test.

## 4. Constraint and Invariant through RuleBinding

Balanced journal:

```text
Computation journalBalanced(proposedLines) -> DecisionResult

RuleBinding balancedJournal
  scope      = Action PostJournalEntry
  locus      = commit
  obligation = system
  basis      = proposed mutation set + declared current dependencies
  on_deny    = reject commit
  on_error   = reject commit
```

This is not a UI validation. A second mutation API cannot bypass it if the commit capability owns all authoritative mutation.

Inventory reservation can bind a different evaluator/dependency shape:

```text
Computation enoughAvailable(product, warehouse, quantity, stateBasis)

RuleBinding inventoryReservationInvariant
  locus      = commit
  basis      = current aggregate/predicate dependencies
```

The binding does not dictate PostgreSQL SERIALIZABLE vs CAS vs conflict ranges. #40/#39 choose the physical enforcement mechanism from declared dependencies.

## 5. Policy through RuleBinding without pretending authority is Bool

```text
DecisionEvaluator authorizePurchase
  input:
    actor
    representedPrincipal?
    workload
    grant chain
    action
    resource
    context
  output:
    Permit | Deny | Error
    determiningEvidence[]
    modelRevision

RuleBinding purchaseAuthority
  scope      = Action ApprovePurchase
  locus      = commit
  obligation = authority
  basis      = current grant + current emergency policy
  on_deny    = deny
  on_error   = deny
  combination= backend/model-specific declared algebra
```

A different domain can vest some business authority at local commit while still requiring current emergency controls at effect-attempt. That is another RuleBinding, not the same stale session snapshot.

## 6. Preview versus commit and current versus pinned basis

Preview:

```text
RuleBinding previewAvailability
  locus = preview
  basis = current
```

Commit:

```text
RuleBinding commitAvailability
  locus = commit
  basis = current
```

If stock changes after preview, commit re-evaluates and can reject.

But a historical FX basis may be intentionally pinned:

```text
RuleBinding invoiceFxBasis
  locus = commit
  basis = pinned(FxQuote Q, revision R)
```

A later current quote does not silently change the approved calculation. `RuleBinding` therefore cannot mean “always reread latest”.

## 7. Projection demoted to Computation + materialization

```text
Computation availableToPromise(Product, Warehouse, asOf) -> Quantity

Materialization ATPIndex
  computationRevision = R7
  inputWatermark       = W123
  refreshedAt          = T
```

The materialization is a runtime/query artifact. A high-risk Action declares whether it can use:

```text
current authoritative dependencies
bounded-staleness projection at watermark W
pinned historical projection snapshot S
```

The fast table does not acquire authority merely because it is queried often.

## 8. Observation and rival assertions without a Fact base sort

```text
Type Observation nature=entity
OccurrenceContract Observation  // create-only evidence record

Relation observedSubject   Observation -> Product
Relation observedPredicate Observation -> PredicateId
Relation observedValue     Observation -> Value
Relation source            Observation -> SourceRef
Relation assurance         Observation -> Assurance
```

Two sources can coexist:

```text
OBS-ERP   says Product P cost = 100
OBS-XLSX  says Product P cost = 105
```

A governed Action may later commit:

```text
SetPlanningCost(P, 105)
```

with evidence links to both observations and its decision basis. Neither observation is overwritten.

This demonstrates representability without `Fact` as a base sort. It does **not** yet prove that a universal Fact/Statement form has no generic query/provenance value; that remains a #70 open question.

## 9. Action as first-class attempted intervention

```text
Action SetPlanningCost
  input Product, Money
  invocation identity O
  intent digest D
  actor / represented / workload context
  RuleBindings[]
  StateBasis
  planner Computation -> MutationPlan
  commit -> state changes + causal records + EffectRequests?
```

Required replay law:

```text
same O + same D -> replay prior semantic result, no second mutation
same O + different D -> reject mismatch
```

If Action is collapsed to “call a Computation that returns mutations” without a mandatory invocation protocol, caller retry can create a second business operation. The executable kill test intentionally implements this weaker model.

## 10. Effect demoted from semantic sort, external I/O retained as native capability

Local Action commits ordinary typed effect records:

```text
Type EffectRequest
Type EffectAttempt
Type RemoteObservation
Type EffectOutcome
```

Runtime capability:

```text
ExecuteExternalEffect(
  EffectRequest,
  connectorCapability,
  environment,
  credentialScope,
  protocolRevision
)
```

Protocol A may provide a dedupe key before send. Protocol B may provide no remote identity until a receipt returns.

Timeout after send:

```text
EffectAttempt sent=true response=none
knowledge = indeterminate
```

A generic workflow retry is not permission to send again. Reconciliation/read-back or a protocol-specific idempotency guarantee decides safety.

The security/I/O boundary is native even if `Effect` is not a semantic base form.

## 11. Process, Commitment and Workflow stay separate

```text
Type Commitment
Type ManufacturingProcess
Type WorkOrder
Type EconomicEvent/occurrence
```

Durable runtime:

```text
execution X
  timer
  wait
  activity retry
  signal buffer
```

A timer wake triggers reevaluation of declared basis. It does not mutate `Commitment.overdue=true` by itself.

The business process can survive replacement/migration of runtime execution. `Workflow` therefore remains runtime memory, while Process/Commitment remain domain ontology concepts.

## 12. CommitWitness as explanation graph, not mandatory noun

For operation `O`, durable evidence can reconstruct:

```text
Action invocation O
  actor/delegation/workload
  definition revisions
  proposal/approval? if present
  StateBasis dependencies
  physical transaction attempts
  determining RuleBindings
  committed mutation/event identities
  EffectRequests
```

This graph may be materialized as an audit record for performance/retention. That does not yet require `CommitWitness` as a base metamodel form.

## 13. One language, different runtime capabilities

R5 does **not** imply one interpreter performs every job.

```text
Computation definition
  -> pure evaluator
  -> solver runtime
  -> graph/PDP evaluator
  -> agent judgment runtime

RuleBinding
  -> transaction commit gate
  -> authorization gate
  -> type lifecycle gate
  -> effect-attempt gate

Action
  -> commit authority

EffectRequest records
  -> safe external I/O capability

Workflow/runtime records
  -> durable execution engine
```

Semantic composition can be small while runtime implementation remains specialized behind explicit capabilities.
