# Falsification criteria for Fact as a kernel type

**Decision state:** `undetermined`  
**Kind key:** domain evidence, source-system artifact, candidate law, counterexample, runtime consequence.

RFC-0001 proposes `Fact` as a temporally and provenance-aware assertion. Status there is `hypothesis`. This note does not promote or reject it. It states what would count as a result.

## The claim under test

From RFC-0001, paraphrased.

A Fact is a subject, predicate, value or object, valid time, and provenance. The engine may add knowledge time and ontology revision. Open questions include contradictory facts and the split among observation, assertion, accepted fact, and derived fact.

Source: `rfcs/0001-metamodel-hypothesis.md`, Fact section. Not edited.

## What "Fact is a kernel type" would mean

At least one of these would have to be true.

1. Composition of Observation, Decision, Event, and provenance cannot enforce the same invariants without hidden convention.
2. Independent mature systems converge on a Fact-shaped unit rather than on events, documents, or objects plus history.
3. Removing Fact creates repeated operational failures that typed events and projections do not.

Constitution §1 is the bar.

Source: `docs/constitution.md` §1 and §18

## Falsifiers

Each item is a test. A pass weakens Fact as a kernel type. A fail strengthens it. None is scored in this pass.

### F1. Layer typing removes the need

If Class A cases in [`disagreement-classes.md`](disagreement-classes.md) cover the first four research domains, then a generic Fact that holds "the delivery date" is the wrong unit. ValueFlows already uses one flow shape with layer-specific types.

**Pass condition.** Order-to-cash and procure-to-pay date conflicts in ERPNext, Odoo, and ValueFlows all restate as Intent, Commitment, or EconomicEvent without a leftover rival.

**Fail condition.** A single typed property still has two live values that operations must choose between after layers are split.

### F2. Event plus correction is enough

ValueFlows and ERPNext correct by appending. PROV revises or invalidates entities with fixed aspects. If every historical explanation OS needs is a chain of events, revisions, and invalidations, a mutable Fact row is unnecessary.

**Pass condition.** Late correction, cancel, and closed-period adjustment in those systems never require in-place mutation of the original economic record.

**Fail condition.** A required query cannot be answered from the append-only chain without an extra accepted-fact snapshot that has its own identity and authority.

ERPNext already posts reversals rather than editing GL rows. That leans toward pass. It is not a full pass. Valuation repost rewrites later derived layers under control.

Source: https://docs.frappe.io/erpnext/immutable-ledger-in-erpnext  
Source: https://www.valueflo.ws/concepts/accounting/

### F3. Object snapshot plus provenance is enough

Palantir and Ontologiq present objects with properties. History lives in actions, pipelines, or the warehouse. If that shape can explain current state and rival sources, Fact may be a storage encoding of object history, not a semantic type.

**Pass condition.** Multi-source objects can expose per-property provenance and rival values without a Fact type in the language.

**Fail condition.** Builders repeatedly invent an implicit Fact table to recover contradictions that the object index deleted.

Foundry's merge strategies delete the losing value from the object. That is a warning, not yet a fail.

Source: https://palantir.com/docs/foundry/object-edits/how-edits-applied/

### F4. Accepted fact is only a view

If every consumer that needs "the" quantity can name an Action or report and a policy, accepted state is a function. It is not a stored kind.

**Pass condition.** No Action in the first vertical requires a durable accepted-fact identity distinct from the Decision that selected it.

**Fail condition.** Audit or fiscal law requires a stored accepted value with its own identity that later events do not reconstruct reliably.

### F5. Independent non-convergence

If ERPNext, Odoo, ValueFlows, PROV, Palantir, and Ontologiq keep disagreeing on the unit of information after Class A, B, and C splits, Fact is not forced by convergence. Constitution §4 would then keep the question open rather than add a type.

**Pass condition.** The six sources still use six units after collapsed fields are removed.

**Fail condition.** They converge on one assertion-like unit with valid time and provenance.

This pass shows convergence on *distinctions*, not on a Fact type. Layers, correction-by-append, and property-scoped source ownership recur. A Fact class does not.

### F6. Hidden convention test

If an implementation of Fact needs extra undocumented fields to encode observation versus decision versus derivation, Fact is a kitchen-sink type. Palantir names that anti-pattern.

Source: https://palantir.com/docs/foundry/ontology/ontology-best-practices/

**Pass condition.** Research notes keep adding roles onto Fact instead of splitting types.

**Fail condition.** A small Fact record plus typed links stays readable in adversarial cases 1 to 4.

## What would support Fact without making it the only unit

A weaker surviving claim.

Fact is a useful interchange or storage encoding for dated, sourced assertions. Observation, Decision, and Derived remain subtypes or views. Accepted state remains a projection.

**Decision state for that weaker claim:** `hypothesis`

## What this note must not do

It must not treat RFC-0001 wording as evidence. It must not close Q2 or Q3. It must not pick a store.

**Runtime consequence.** Experimental code may persist assertion-like rows to test F1 to F6. That code is not a semantic decision.
