# When disagreement dissolves, and when it does not

**Decision state:** `undetermined` for Q3 as a whole. The class split below is `hypothesis`.  
**Kind key:** domain evidence, source-system artifact, candidate law, counterexample, runtime consequence.

Issue 4 asks whether accepted or canonical fact is needed, or whether better modeling removes most conflict. The sources support a split, not a single answer.

## Class A. Collapsed concepts

Two payloads use the same field name for different world relations.

Palantir's first design rule is to model reality, not source tables. A CSV with order, customer, and product columns is at least three entities. A measurement row is not the measured entity.

Source: https://palantir.com/docs/foundry/ontology/ontology-best-practices/

ValueFlows keeps `Intent`, `Commitment`, and `EconomicEvent` as the same flow shape at different layers. Open questions already warn that `requestedDate`, `promisedDate`, `plannedDate`, and `actualDate` must not share one field.

Source: https://www.valueflo.ws/concepts/flows/  
Source: `docs/open-questions.md` Q3 caution

**Domain evidence.** A customer request for the 22nd and a production estimate of the 26th can both be true.

**Candidate law.** If two values become consistent after they are typed as different properties or different layers, the case is not a fact conflict. `hypothesis`

Worked case in [`adversarial-cases.md`](adversarial-cases.md) case 1.

## Class B. Same type, different identity

Two records look like rivals because identity was not bound.

ERPNext keeps Customer and Supplier as separate masters when one legal party plays both roles. Party Link is an accounting workflow, not a merge.

Source: https://docs.frappe.io/erpnext/common-party-accounting

Foundry MDO joins on primary key. Keys present in only one datasource show nulls on the other properties. That is missing data, not a second quantity.

Source: https://palantir.com/docs/foundry/object-permissioning/multi-datasource-objects/

**Domain evidence.** "Vertex the supplier" and "Vertex the customer" can share a legal name and still be two roles.

**Candidate law.** Identity reconciliation is prior to authority. A split identity is not a contradictory fact. `hypothesis`

Worked case in [`adversarial-cases.md`](adversarial-cases.md) case 3.

## Class C. Same type, different time

A late invoice rate and an earlier receipt rate are both records of what was known. ERPNext can keep the receipt, then repost valuation from the invoice if configured. ValueFlows stores event time and `created` time so a late entry is visible.

Source: https://docs.frappe.io/erpnext/buying-settings  
Source: https://www.valueflo.ws/concepts/accounting/

**Domain evidence.** "What was valid on Tuesday" and "what we learned Thursday about Tuesday" are two questions.

**Candidate law.** Bitemporal split removes many apparent contradictions. It does not remove two observations of the same property at the same valid time. `hypothesis`

Q7 stays open.

## Class D. Same type, same identity, same valid time

Two inventory systems report different on-hand quantities for one SKU, location, and lot at one instant. Palantir cannot map both onto one property. ERPNext stock reconciliation treats book quantity and counted quantity as two inputs to a new posting. Odoo does the same with on-hand versus counted, then writes a move.

Source: https://palantir.com/docs/foundry/object-permissioning/multi-datasource-objects/  
Source: https://docs.frappe.io/erpnext/stock-reconciliation  
Source: https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/inventory/warehouses_storage/inventory_management/count_products.html

**Domain evidence.** Physical stock and two books can disagree, and operations still need a quantity to pick.

**Candidate law.** This class does not dissolve by renaming fields. Some authority or reconciliation operation is irreducible. `hypothesis`

Worked case in [`adversarial-cases.md`](adversarial-cases.md) case 2.

## Class E. Correction of a withdrawn record

The source that spoke first now says it was wrong. ValueFlows `corrects`, ERPNext cancel and reverse, PROV revision or invalidation.

Source: https://www.valueflo.ws/concepts/accounting/  
Source: https://docs.frappe.io/erpnext/immutable-ledger-in-erpnext  
Source: https://www.w3.org/TR/prov-o/

**Domain evidence.** The earlier record remains part of history because reports may already have used it.

**Candidate law.** Correction is not contradiction. Both records stay. Only the later one is live for new operations, under period rules. `hypothesis`

Worked case in [`adversarial-cases.md`](adversarial-cases.md) case 4.

## Does OS need accepted fact?

**Undetermined.**

Pressure toward a projection called accepted or operational state.

- Pickers, payment runs, and tax filings need one number.
- Foundry materializes a merged object for applications.
- ERP ledgers present an active balance while cancelled rows stay hidden unless asked.

Pressure against a stored canonical fact as a kernel type.

- REA and ValueFlows get far by typing flows and appending events.
- Palantir's merge is a product index, and it drops the losing value from the object.
- Ontologiq avoids a second store for source-owned state.
- Constitution §9 says uncertainty must not be erased to simplify implementation.

**Candidate law.** Preserve Class D and Class E records. Compute accepted state per Action and time. Do not replace the records with that projection. `hypothesis`

**Counterexample.** If every Class D case in the first four domains can be restated as Class A, B, or C, then explicit authority is unnecessary. Kill test #59 is the place to press that.

**Counterexample the other way.** If agents cannot act without a stored winner, and reconstructing the projection is legally insufficient, then accepted state needs a durable decision record. That record would still be a Decision, not a mutated Fact.
