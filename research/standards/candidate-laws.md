# Candidate laws

A candidate law is the smallest claim that explains the evidence and could be shown false. Decision state is never `accepted`.

## Laws

### L-001 An interchange occurrence is an assertion, not an intervention

- Kind: candidate law
- Decision state: `supported`
- Claim: A visibility or MOM performance record says a capturing party asserts that something occurred, failed to occur, or was later judged erroneous. That record is not the attempt that tried to make it so.
- Evidence: E-001, E-002, E-015, E-016, E-019
- Falsify if: a first-party standard treats the capture message itself as the authorizing act, with no remaining gap between request and observation.
- Runtime consequence: surfaces that ingest EPCIS or B2MML performance messages must land in observation or event forms, then apply policy before they become accepted operational state.

### L-002 Current operational state is a projection of prospective assertions until contradicted

- Kind: candidate law
- Decision state: `hypothesis`
- Claim: "Where is it" and "what condition is it in" are not stored independently of history. They are the latest uncontradicted prospective claims (business location, disposition) derived from occurrences.
- Evidence: E-003, E-012, E-013
- Falsify if: a domain requires a current-state fact that is authoritative even when no occurrence has ever supported it, and that fact is not a plan or capability.
- Runtime consequence: stock-on-hand and disposition queries need a rule for "no later contradicting event," plus a knowledge-time cutoff. See R-001.

### L-003 Instance identity and class-plus-quantity identity are not interchangeable

- Kind: candidate law
- Decision state: `supported`
- Claim: Naming a specific object is a different act from naming a class and an amount. Amount may be a count, a physical measure, or unknown.
- Evidence: E-005, E-006, E-017 BOM versus bill of resources
- Falsify if: every operationally meaningful quantity in manufacturing and logistics can be rewritten as instances without loss, including bulk oil, wire, and produce.
- Runtime consequence: inventory math cannot assume serials. Unknown quantity must be representable without inventing a fake count.

### L-004 Temporary containment, durable composition, and transformation are three relations

- Kind: candidate law
- Decision state: `supported`
- Claim: Packing cases on a pallet, installing a motor in a machine, and consuming lots into a new lot are not one "parent-child" link. Reversibility and identity survival distinguish them.
- Evidence: E-004, E-008, E-009, E-010
- Falsify if: a single composition form can answer recall, unpack, and uninstall without extra hidden flags that recreate the three-way split.
- Runtime consequence: recall walks transformation participation. Unpack walks aggregation. Uninstall walks association. Mixing them silently drops lots or keeps dead parents.

### L-005 Transformation participation may be lossy on purpose

- Kind: candidate law
- Decision state: `supported` as what visibility standards encode. `undetermined` as what OS should allow as the only transform form.
- Claim: After some processes, the true statement is "any of these inputs may have contributed to each of these outputs," possibly across a series of captures that share one transformation identity.
- Evidence: E-008. Scenario S-008.
- Falsify if: every regulated transformation in scope can and must record exact input-to-output fractions, making the EPCIS rule a mere messaging approximation.
- Runtime consequence: a recall engine that returns only certain customers after a TransformationEvent is over-claiming. It should return the closure of possible outputs.

### L-006 Occurrence time, record time, and sensor time are different clocks

- Kind: candidate law
- Decision state: `supported` for occurrence versus record. `hypothesis` that sensor time is a third required clock rather than event payload.
- Claim: When the world changed, when a system learned it, and when a sensor sampled a condition can diverge. Backdating changes occurrence time. Late arrival changes record time. A temperature spike can precede the receiving step that carries the sensor element.
- Evidence: E-011. Scenario S-007.
- Falsify if: one timestamp answers all three questions in every retrieved standard and in S-007 without contradiction.
- Runtime consequence: standing queries and audit views must not sort only on one clock. See R-002.

### L-007 Identifier commissioning is not the same fact as object creation

- Kind: candidate law
- Decision state: `hypothesis`
- Claim: Binding a new instance identifier to an object is a distinct fact from the physical process that produced the object. The same production process can exist without identifiers. The same identifier birth can wrap many sector processes.
- Evidence: E-007. CBV commissioning versus creating_class_instance versus destroying versus decommissioning.
- Falsify if: every identifier birth is identical to a production performance, and decommissioning is identical to destroying.
- Runtime consequence: reuse of a serial after decommissioning must be a new identity, matching CBV. Destroyed instances must not reappear without an error declaration or equivalent.

### L-008 Capability, definition, schedule, and performance are four faces of work

- Kind: candidate law
- Decision state: `supported` as a domain split. `undetermined` as four kernel forms.
- Claim: What a resource can do, what the product or process specification says to do, what was scheduled, and what was done are different statements. Collapsing them into one Work Order object recreates the ERP ambiguity open question 14 is hunting.
- Evidence: E-017, E-018, E-021
- Falsify if: a single object with phases can keep capability, spec, plan, and actual independently queryable without hidden fields, across ISA-95 nouns and ISA-88 recipe tiers.
- Runtime consequence: scheduling against performance, or exploding a BOM against a capability, must name which face is input.

### L-009 Role-bearing equipment is not the serialized asset

- Kind: candidate law
- Decision state: `hypothesis`
- Claim: A work-center role that can perform an operation is not the same individual as the tagged physical asset currently filling that role.
- Evidence: E-018 names both models. E-021 treats equipment capability as something recipes bind to.
- Falsify if: ISA-95 Part 2 (full text) defines Equipment and Physical Asset as aliases, or if plants never move a capability from one serial asset to another.
- Runtime consequence: maintenance and genealogy attach to the asset. Scheduling attaches to the role. Swapping a motor must not rewrite the work-center identity.

### L-010 History is append-only. Remediation is new occurrences.

- Kind: candidate law
- Decision state: `supported`
- Claim: A wrong visibility event stays in the trace. The fix is another event that either models the business remediation or declares the prior assertions erroneous as of a declaration time.
- Evidence: E-015, E-014 void_shipping
- Falsify if: a first-party visibility standard permits silent overwrite as the conforming correction path.
- Runtime consequence: queries must return the original and the correction. Delete APIs on occurrence records would violate the law.

## Counterexamples

### CX-001 Expected observation that failed

- Kind: counterexample
- Decision state: `supported` as a case L-001 must cover
- Attack: If Event means "something happened," then "we looked and the case was not there" cannot be an Event.
- Outcome: EPCIS explicitly allows that ObjectEvent. Event-nature must include non-occurrence assertions or Observation must be separate.
- Cite: E-002

### CX-002 Destroyed serial found in storage

- Kind: counterexample
- Decision state: `supported` as a case L-010 must cover
- Attack: An ObjectEvent DELETE says the instance should not appear later. An ordinary compensating event cannot resurrect it under those semantics.
- Outcome: ErrorDeclaration exists because ordinary events are not enough. OS cancellation after irreversible consequences (scenario S-010) needs a similar escape that still does not mutate the original.
- Cite: E-015 example 3

### CX-003 Pallet tag unread at receiving

- Kind: counterexample
- Decision state: `supported` as a case L-004 must cover
- Attack: If aggregation requires a known parent, receiving cannot be recorded when only children are seen.
- Outcome: Parent is optional on OBSERVE. Unknown container identity is a legal state.
- Cite: E-010

### CX-004 Mixed-lot cook with one transformationID

- Kind: counterexample
- Decision state: `supported` as a case L-005 must cover
- Attack: A recall law that demands exact customer-to-input-lot edges will fail on a conforming TransformationEvent series.
- Outcome: Either OS stores finer plant-floor weighings (ISA-88 batch record, not retrieved) or recall answers stay modal ("may have received").
- Cite: E-008. Scenario S-008.

### CX-005 Shipping recorded, goods never left

- Kind: counterexample
- Decision state: `supported`
- Attack: If prospective `in_transit` is stored as mutable status on the object, voiding the shipment mutates history.
- Outcome: CBV `void_shipping` is a new step. Prospective state changes because a new event contradicts the old one.
- Cite: E-014, E-015 example 2

### CX-006 Ossie "orders" dataset as the Order object

- Kind: counterexample
- Decision state: `supported` as a case against importing Ossie
- Attack: If a semantic model is the ontology, an `orders` dataset with `SUM(orders.amount)` is the Sales Order.
- Outcome: That dataset is a projection over warehouse rows. It has no commissioning, custody, or performance. L-001 and L-008 fail if this is treated as the object.
- Cite: E-022. X-009.

### CX-007 One Work Order field named status

- Kind: counterexample
- Decision state: `hypothesis`
- Attack: If ISA-95 capability, definition, schedule, and performance can live as status values on one document, L-008 is unnecessary.
- Outcome: Part 5 still ships four noun families plus a parallel Work* family. That is evidence against the single-field collapse, but the full attribute tables were not read.
- Cite: E-018

## Runtime pressure

Wave B must not pick engines yet. These are enforcement properties implied if a law survives.

### R-001 Prospective projection

- Kind: runtime consequence
- Decision state: `hypothesis`
- If L-002 survives, a query "where is serial X now" is a fold over events, not a row update. The fold needs a knowledge-time argument so S-007 can answer both "as known on August 10" and "now believed about August 10."

### R-002 Multiple clocks on ingest

- Kind: runtime consequence
- Decision state: `hypothesis`
- If L-006 survives, ingest of EPCIS must keep eventTime, recordTime, and sensor time without coercing them into one `created_at`.

### R-003 Modal recall

- Kind: runtime consequence
- Decision state: `hypothesis`
- If L-005 survives, trace-forward and trace-back operators must return possible sets, not pretended exact edges, unless a finer record exists.

### R-004 Append-only occurrence log at the semantic boundary

- Kind: runtime consequence
- Decision state: `hypothesis`
- If L-010 survives, the generic engine may physically update indexes, but it cannot expose "edit this event" as a business mutation. Correction is a new occurrence.

### R-005 Interchange adapters are surfaces

- Kind: runtime consequence
- Decision state: `supported`
- EPCIS capture, B2MML transactions, and Ossie YAML are surfaces in the thesis sense. They address shared domain forms. They are not those forms.
- Cite: X-001, X-006, X-009. Thesis "one model, many surfaces."
