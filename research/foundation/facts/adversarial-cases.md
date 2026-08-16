# Adversarial cases from issue 4

**Decision state:** `hypothesis` for the readings below  
**Kind key:** domain evidence, source-system artifact, candidate law, counterexample, runtime consequence.

## Case 1. Four disagreeing delivery dates

ERP says 25. Customer WhatsApp requests 22. Production estimates 26. A spreadsheet says 27.

### Domain evidence

These are four different relations to one shipment or order line.

| Saying | Likely kind | Why |
| --- | --- | --- |
| Customer WhatsApp, 22 | Intent or request | One agent, not agreed |
| ERP, 25 | Commitment or promised date if the ERP stores the promise | Agreed or scheduled |
| Production, 26 | Plan or estimate | Internal schedule, not a customer promise |
| Spreadsheet, 27 | Assertion with weak provenance | Unknown layer, often a stale copy |

ValueFlows would not put them on one `EconomicEvent`. Palantir would treat a spreadsheet tab as a source to map, not as the domain.

Source: https://www.valueflo.ws/concepts/flows/  
Source: https://palantir.com/docs/foundry/ontology/ontology-best-practices/

### Source-system artifact

One `delivery_date` column in ERP, chat, MRP, and a sheet.

### Candidate law

Class A. Disagreement dissolves after typing. `hypothesis`

### Counterexample

If all four speakers intend the same promised date to the customer, this becomes Class D. Then authority is needed. The WhatsApp text would have to be a promise, not a request. That is a facts-of-the-case question, not a metamodel question.

### Runtime consequence

Surfaces must not show one date widget that writes all four. An agent that "fixes delivery_date" without naming the layer is unsafe.

## Case 2. Two inventory systems

System A and system B report different on-hand quantities for one SKU at one location.

### Domain evidence

Physical stock is one quantity. Each system is a book. Odoo states that recorded counts and warehouse counts can differ because of damage, error, or theft, and that an adjustment posts a move. ERPNext stock reconciliation sets book quantity as of a posting time and writes ledger effect.

Source: https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/inventory/warehouses_storage/inventory_management/count_products.html  
Source: https://docs.frappe.io/erpnext/stock-reconciliation

Foundry cannot attach both books to one property. It would need two properties, two object types, or a pipeline that already picked a winner.

Source: https://palantir.com/docs/foundry/object-permissioning/multi-datasource-objects/

### Source-system artifact

Treating each system's `qty_on_hand` as the ontology quantity.

### Candidate law

Class D. Authority is irreducible if identity, location, lot, and valid time already match. `hypothesis`

First check Class B and Class C. Different bins, lots, or as-of times dissolve the clash.

### Counterexample

If A is reserved quantity and B is on-hand, the case was Class A.

### Runtime consequence

A pick Action must name which book, or a counted adjustment, it is using. A silent average of A and B is not attested in these sources.

## Case 3. Split supplier identity

The same supplier exists under two identities.

### Domain evidence

ERPNext documents the same legal party as Customer and Supplier on purpose. Party Link offsets eligible balances. It does not merge masters, ledgers, tax, or credit behavior.

Source: https://docs.frappe.io/erpnext/common-party-accounting

Ontologiq refuses to guess identity from dbt tests. Unique and not-null tests become commented candidates.

Source: https://github.com/ontologiq/ontologiq/blob/main/README.md

PROV `alternateOf` can relate two entities that present aspects of the same thing.

Source: https://www.w3.org/TR/prov-o/

### Source-system artifact

A fuzzy name match that writes one vendor master and deletes the other.

### Candidate law

Class B. Bind or link identities. Do not average their properties. `hypothesis`

If both identities already denote one role, one location, and one tax id, remaining property clashes move to Class D.

### Counterexample

Two legal entities that share a trade name. Linking them would be a domain error.

### Runtime consequence

Ingestion must produce a link, a same-as decision, or two objects. It must not produce one object with blended addresses.

## Case 4. Late source correction

A source later changes a value that operations already used.

### Domain evidence

ValueFlows. Do not edit the original event. Post a new event with `corrects`, often a negative quantity, dated at correction time. Keep process and agreement links. Store `created` time as well as event time.

Source: https://www.valueflo.ws/concepts/accounting/  
Source: https://www.valueflo.ws/specification/all_vf.html `vf:corrects`

ERPNext. Keep original ledger rows. Post reversals on cancel. Amend, return, reverse, or repost. Closed periods can block rewrite. Backdated stock can rebuild later valuation through `Repost Item Valuation`.

Source: https://docs.frappe.io/erpnext/immutable-ledger-in-erpnext

PROV. A later entity `wasRevisionOf` an earlier one, or the earlier entity is invalidated.

Source: https://www.w3.org/TR/prov-o/

Odoo. A count that waits to apply can race new moves. The software asks for confirmation.

Source: https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/inventory/warehouses_storage/inventory_management/count_products.html

### Source-system artifact

Updating the original row so reports never show the first value.

### Candidate law

Class E. Correction appends. Knowledge time and valid time both move. Prior decisions stay explainable. `hypothesis`

This is not Class D unless a second source still asserts the old value.

### Counterexample

A jurisdiction that requires the original fiscal row to disappear. Not found in these manuals. Even then the ontology would keep a tombstone for explainability. Constitution §14.

### Runtime consequence

Any Action that used the old value must remain replayable under the old knowledge time. Current projections may change after the correction, subject to period policy.

## Cross-case table

| Case | Class | Dissolves by modeling? | Authority irreducible? |
| --- | --- | --- | --- |
| Four dates | A, unless all four are the same promise | Usually yes | Only if they share one typed property |
| Two inventories | D after identity and time bind | No | Yes for the pick and the ledger |
| Split supplier | B | Yes, by link or split | Only leftover property clashes |
| Late correction | E | Yes, by append | Period policy, not source voting |

**Decision state for the table:** `hypothesis`
