# Candidate authority semantics

**Decision state:** `hypothesis`  
**Kind key:** domain evidence, source-system artifact, candidate law, counterexample, runtime consequence.

Authority is the rule that says which record may drive an operation. Confidence is a quality estimate. The compared sources keep those apart, or never model confidence at all.

## What the sources actually do

### Palantir Foundry

Foundry maps datasets onto object types. A row becomes an object. A column becomes a property. Several datasets may back one object type as a column-wise multi-datasource object. Each non-key property must come from exactly one datasource. Property multiplicity is not supported. Row-wise union of two full objects with the same schema is not supported.

Source: https://palantir.com/docs/foundry/object-link-types/object-types-overview/  
Source: https://palantir.com/docs/foundry/object-permissioning/multi-datasource-objects/

When user edits and a backing dataset both touch the same object, Foundry applies a conflict strategy per datasource.

- Default. User edits win for edited properties, including after the row disappears and returns.
- Alternate. Apply the most recent value by comparing the action time to a UTC timestamp column on the *input datasource*. Edits to the timestamp property itself are ignored for that comparison.
- Edit-only properties always take the user edit.

Deletions are not edits. A deleted object stays gone even if the datasource still has the row.

Source: https://palantir.com/docs/foundry/object-edits/how-edits-applied/

Design guidance says to model reality, not systems, and to keep one canonical object type per concept. That is a modeling rule. It is not a rule for rival observations of one property.

Source: https://palantir.com/docs/foundry/ontology/ontology-best-practices/

**Source-system artifact.** One-property-one-datasource and "user edits win" hide disagreement from applications.

**Domain evidence.** Different properties of one thing often have different owners. Price may live in ERP. Assignee may live only in the ontology.

**Candidate law.** Authority is scoped to a property, not to an object. `hypothesis`

### REA and ValueFlows

Authority is mostly implicit in layer and relation, not in a score.

- A `Commitment` can fulfill an `Intent`.
- An `EconomicEvent` can fulfill a `Commitment` or satisfy an `Intent`.
- A `Claim` is settled by later events.
- Resource economic fields change only through events.

There is no "ERP beats WhatsApp" predicate. A customer request and a supplier promise are different flow types. They do not vote.

Source: https://www.valueflo.ws/concepts/flows/  
Source: https://www.valueflo.ws/specification/model-text/  
Source: https://www.valueflo.ws/specification/event-resource/

**Domain evidence.** Contractual promise outranks a wish for planning. Observation outranks both for what already happened.

**Candidate law.** Layer and speech-act type carry more authority than source brand. `hypothesis`

### PROV-O

PROV records who is responsible and what was derived from what. `hadPrimarySource` marks a firsthand record. `wasAttributedTo` and `wasAssociatedWith` name agents. `actedOnBehalfOf` records delegation. Validity of a PROV instance is consistency of history, not election of a business winner.

Source: https://www.w3.org/TR/prov-o/  
Source: https://www.w3.org/TR/prov-constraints/

**Domain evidence.** A signed invoice and a chat extract can share a number and still differ in responsibility.

**Candidate law.** Provenance participates in authority. It does not replace a policy that names which provenance is allowed to drive which operation. `hypothesis`

### ERP reconciliation

ERPNext buying settings can require a purchase order before receipt or invoice, and a receipt before invoice. They can stop or warn when the rate changes across that cycle. Landed cost can later follow the invoice rate and trigger `Repost Item Valuation`.

Source: https://docs.frappe.io/erpnext/buying-settings

Three-way match in that family is a comparison of three documents, not a merge of three values into one `qty` field.

Stock reconciliation writes a new counted quantity as of a posting date and time. Odoo keeps `On Hand Quantity` and `Counted Quantity` on the adjustment line, then applies a stock move. If stock moved between count and apply, Odoo asks for confirmation.

Source: https://docs.frappe.io/erpnext/stock-reconciliation  
Source: https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/inventory/warehouses_storage/inventory_management/count_products.html

ERPNext immutable ledger keeps original GL and stock rows and posts reversals. Cancel and amend, return, reverse journal, or repost. Do not edit ledger rows.

Source: https://docs.frappe.io/erpnext/immutable-ledger-in-erpnext

**Domain evidence.** Payment authority waits on match. Inventory authority waits on a counted adjustment or a movement. Closed periods block silent rewrite.

**Candidate law.** Reconciliation is an operation that consumes several records and emits a decision or a new event. It is not a property overwrite. `hypothesis`

### Ontologiq

Ontologiq compiles YAML objects to SQL views over a declared source table. Identity is listed by the modeler. `state` is computed from live data. The product does not write to the warehouse. Effects are webhooks or handlers. A lost response is stored as `unknown`, never `failed`. Preconditions run at propose time and again at execute time.

Source: https://github.com/ontologiq/ontologiq/blob/main/README.md retrieved 2026-08-15

**Source-system artifact.** One source table per object in the published model. No rival-master merge.

**Domain evidence.** Live recomputation beats a stale local copy for source-owned state.

**Candidate law.** Source-backed state is a view. Ontology-owned state needs an explicit store. Derived state is not writable. `hypothesis`

The session note already warned that Ontologiq state is closer to a view over source data than to multi-source truth. That warning matches the README. It is not new architecture.

Source: `research/reference-landscape.md`

Treat older write-back essays that name source-backed, ontology-owned, and derived ownership as session hypotheses, not as Ontologiq behavior, unless a later corpus note traces them into this repo's Ontologiq checkout.

## Authority dimensions

These dimensions appear independently. None is promoted to an OS type.

### By property

Foundry maps each property to one datasource. Ontologiq computes some fields and stores none of the warehouse. ERPNext party masters keep sales fields on Customer and purchase fields on Supplier even when Party Link says they are one business.

Source: https://docs.frappe.io/erpnext/common-party-accounting

**Candidate law.** Authority tables are keyed by property or property class, not by object type alone. `hypothesis`

### By context and operation

A number that may drive a dashboard may not drive a payment. Three-way match is an operation-scoped gate. Ontologiq approval is an operation-scoped gate. Palantir Actions are the only supported user mutation path in the docs above.

**Candidate law.** The same observation can be visible and still unauthorized for a given Action. `hypothesis`

### By time

ValueFlows asks for event time and computer `created` time so late entry and correction stay separable. ERPNext stock reconciliation posts as of a chosen date and time, then may repost later valuation. Foundry's "most recent value" compares action time to a source timestamp, which is a crude knowledge-time test.

Source: https://www.valueflo.ws/concepts/accounting/

**Candidate law.** Authority is time-indexed. A late correction changes what we now treat as valid then. It must not erase what we knew then. `hypothesis`

Q7 on bitemporality stays open. This note only records pressure.

### By identity

ERPNext Party Link does not merge Customer and Supplier. Odoo inventory adjustments are per location and lot. Foundry joins MDO datasources on primary key. Missing keys yield null properties, not a second object.

**Candidate law.** Authority cannot be applied until identity is bound. Unbound identity is a different problem than rival values. `hypothesis`

## Confidence is not authority

None of the primary sources use a numeric confidence to overwrite a contractual or fiscal record.

PROV says provenance supports later assessment of trust. That assessment sits outside the core triples.

Palantir's timestamp strategy is recency, not confidence.

Ontologiq records `unknown` rather than a probability of failure.

**Candidate law.** Confidence may rank which observation to inspect next. It must not settle a payable, a stock ledger, or a legal promise. `hypothesis`

**Counterexample needed.** A regulated process that treats a calibrated sensor posterior as legally sufficient without a human or policy decision. Not found in this pass.

## Correction versus contradiction

**Correction.** The same speaker or system says the earlier record was wrong. ValueFlows adds a new event with `corrects`. ERPNext cancels and reverses, then amends or posts a return. PROV uses `wasRevisionOf` or invalidation.

**Contradiction.** Two sources still stand, and neither withdraws. Foundry then picks a winner in the index. REA keeps both as different flow types when the model is honest. When the model collapsed them, ERP match fails and a human decides.

**Candidate law.** A correction adds a superseding record that points at the earlier one. A contradiction leaves both records live. Accepted state may follow only one of them. `hypothesis`

## Session designs

H1 in `docs/hypothesis-history.md` put an ontology above ERP systems of record. That is an integration pattern. It is not evidence that OS should inherit a winner table.

**Decision state for inheriting those designs:** `rejected` as requirements, `hypothesis` as integration options.

## Runtime consequence

If these candidate laws survive, a runtime must be able to

- store more than one live record per business name
- evaluate authority per property, Action, and time
- explain the projection that operations used
- refuse to treat confidence as a write

Storage layout remains open. See Q18.
