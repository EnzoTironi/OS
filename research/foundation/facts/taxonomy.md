# Taxonomy of information states

**Decision state:** `hypothesis`  
**Kind key:** domain evidence, source-system artifact, candidate law, counterexample, runtime consequence.

This note names kinds of information that the compared sources actually distinguish. It does not say OS must have a type for each name.

## Names that collide

`Claim` is the most dangerous word in this issue.

ValueFlows `Claim` is an economic receivable-like flow started by the receiver after an `EconomicEvent`, then settled by later events. It is not an epistemic statement that a source believes a property.

Source: https://www.valueflo.ws/concepts/flows/  
Source: https://www.valueflo.ws/specification/all_vf.html

**Domain evidence.** A payable or receivable is a right or obligation, not a rumor about a date.

**Source-system artifact.** Calling every incoming payload a `Claim` would overload the REA word and hide the economic object.

**Candidate law.** Epistemic speech and economic claims must not share one type name. `hypothesis`

## Kinds that survive comparison

### Observation

A record that something was perceived or measured. ValueFlows puts this on the observation layer and restricts `EconomicEvent` to past flows. Palantir tells modelers to split identity from observation when a row is a measurement or event about an entity.

Source: https://www.valueflo.ws/introduction/core/  
Source: https://www.valueflo.ws/concepts/flows/  
Source: https://palantir.com/docs/foundry/ontology/ontology-best-practices/

**Domain evidence.** A warehouse count, a sensor reading, and a goods receipt are about what was seen.

**Candidate law.** An observation cites a subject, a property or event type, a value, a time of occurrence, a recording time, and a source. It does not by itself change authorized plans. `hypothesis`

### Assertion

A statement offered as true by an agent, without a required observation protocol. PROV attributes an entity to an agent and can cite a primary source. It does not require the entity to be a measurement.

Source: https://www.w3.org/TR/prov-o/  
Source: https://www.w3.org/TR/prov-dm/

**Domain evidence.** A customer WhatsApp message that "delivery is the 22nd" is an assertion. It may also be an `Intent` in ValueFlows if it proposes a future flow.

**Candidate law.** Assertion is the generic speech act. Observation is assertion plus an observational method. `hypothesis`

### Intent, commitment, and observed event

ValueFlows and later REA split three layers.

- Knowledge. Recipes, policies, classifications.
- Plan. `Intent` and `Commitment`.
- Observation. `EconomicEvent`.

`Intent` is a desired or proposed future flow, usually with one agent. `Commitment` is a scheduled or promised flow agreed by agents. `EconomicEvent` is a past observed flow. Those three can share quantity and date shapes and still not compete.

Source: https://www.valueflo.ws/introduction/core/  
Source: https://www.valueflo.ws/concepts/flows/  
Source: https://www.valueflo.ws/specification/model-text/  
McCarthy, W. E. 1982. The REA Accounting Model. *The Accounting Review* volume 57 number 3, pages 554 to 578. https://doi.org/10.2308/tar-4487748  
Geerts, G. L., and McCarthy, W. E. Later REA work adds commitment and policy layers above the original operational events. Summary in Dunn, Gerard, Grabski, and Sutton, 2016, CAIS 38. https://doi.org/10.17705/1cais.03829

**Domain evidence.** Requested date, promised date, planned date, and actual date are different world relations.

**Source-system artifact.** One ERP `delivery_date` column.

**Candidate law.** Most "two sources disagree about the date" cases are collapsed properties, not rival facts. `hypothesis`

### Decision

A governed intervention that an actor attempted. Palantir `Action` writes user edits. Ontologiq `Action` proposes, waits for human approval, rechecks preconditions, then fires an effect. OS thesis already separates Action from Event.

Source: https://palantir.com/docs/foundry/object-edits/how-edits-applied/  
Source: https://github.com/ontologiq/ontologiq/blob/main/README.md  
Source: `docs/thesis.md` in this repo

**Domain evidence.** Approving a promise and seeing a truck arrive are different acts.

**Candidate law.** A decision is not an observation and not a derived projection. `hypothesis`

### Derived fact

A value computed from other records. Ontologiq `state` is a predicate over live warehouse columns, not a stored column. ValueFlows says `accountingQuantity` may be stored or derived from events. Palantir tells builders to use pipelines for automated transforms and actions for decisions.

Source: https://github.com/ontologiq/ontologiq/blob/main/README.md  
Source: https://www.valueflo.ws/specification/all_vf.html  
Source: https://palantir.com/docs/foundry/ontology/ontology-best-practices/

**Domain evidence.** On-hand quantity after a count is not the count. It is the effect of applying the count, or of summing movements.

**Candidate law.** A derived value must cite its inputs and function revision. It cannot outrank those inputs by confidence. `hypothesis`

### Accepted or canonical operational state

A single current value that operations treat as the number to use.

Palantir wants one canonical *object type* per concept. That is model hygiene, not a winner among rival observations. Palantir then merges user edits and datasource rows with a configured strategy so applications see one object.

ERPNext and Odoo keep rival documents and project a balance. The balance is accepted for operations. The documents remain.

Ontologiq computes one `state` from one declared source table. It does not ingest two masters for the same property.

Source: https://palantir.com/docs/foundry/ontology/ontology-best-practices/  
Source: https://palantir.com/docs/foundry/object-edits/how-edits-applied/  
Source: https://docs.frappe.io/erpnext/stock-reconciliation  
Source: https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/inventory/warehouses_storage/inventory_management/count_products.html  
Source: https://github.com/ontologiq/ontologiq/blob/main/README.md

**Source-system artifact.** Palantir's "user edits always win" merge. Foundry property multiplicity is unsupported, so one property cannot be fed by two datasources.

**Domain evidence.** Warehouse pickers and payment runs need one quantity or one payable.

**Candidate law.** Accepted state, if it exists, is a projection under an authority policy, not a second stored world. `hypothesis`

**Counterexample needed.** A domain where two current values for the same typed property must both drive operations at once, with no projection that is safe. See [`disagreement-classes.md`](disagreement-classes.md).

## PROV kinds that are not Fact

PROV-O has `Entity`, `Activity`, and `Agent`. An entity has some *fixed* aspects. Different aspects or times of the same thing are related by `alternateOf` and `specializationOf`. A later version uses `wasRevisionOf`. A destroyed or withdrawn entity uses `wasInvalidatedBy` and `invalidatedAtTime`. A firsthand record uses `hadPrimarySource`.

Source: https://www.w3.org/TR/prov-o/  
Source: https://www.w3.org/TR/prov-dm/

**Domain evidence.** Provenance can support a later judgment of trust. The 2013 PROV-CONSTRAINTS abstract says provenance is used to form assessments about quality, reliability, or trustworthiness.

Source: https://www.w3.org/TR/prov-constraints/

**Candidate law.** PROV records history and responsibility. It does not pick a canonical business value. `hypothesis`

## What this taxonomy is not

It is not a proposed OS type list. RFC-0001 still lists `Fact` as speculative. Q3 stays open.

**Runtime consequence.** If OS stores only one mutable field per business name, the taxonomy above cannot be recovered from data. If OS stores typed records with provenance, accepted state can be computed later.
