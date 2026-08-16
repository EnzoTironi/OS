# Catalog of reducible and irreducible disagreements

**Kind.** reference  
**Fetched.** 2026-08-16  
**Decision.** per row. Never `accepted`.

## Question

Which source disagreements dissolve after the world is typed correctly, and which still need a decision?

## Test used on every row

A pair of values is **reducible** when, after identity is bound and the values are typed by speech-act or layer, valid time versus knowledge time, unit, and party role, both values can be true at once.

A pair is **irreducible** when those splits still leave two live records asserting incompatible values of the same property for the same bound identity at the same valid time, and some later Action still needs one input.

Rows that fail the test stay `undetermined`.

## How to read a row

**Kind** is domain evidence, source-system artifact, or mixed.  
**Authority needed** is `none`, `decision-action`, or `undetermined`.  
`none` means modeling is enough. `decision-action` means a governed reconciliation or override Action is still required. It does not mean a standing canonical-fact store.

## Reducible disagreements

| ID | Domain | Apparent clash | After typing | Evidence | Kind | Decision | Authority needed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RED-01 | Customer commitments | ERP promised 25. Chat asked 22. Plan says 26. Truck arrived 27. | Requested Intent date, promised Commitment date, planned schedule date, observed Economic Event date. Scenario S-001. | E-001, E-006, E-007 | domain evidence | `supported` | none |
| RED-02 | Customer commitments | Odoo Delivery Date versus Expected date | Promise versus computed capability. Shipping Policy picks a lead-time rule. | E-007 | domain evidence | `supported` | none |
| RED-03 | Customer commitments | Sales Order "open" versus Delivery Note "shipped" | Commitment versus observed shipment. ERPNext status is a projection of those documents. | E-006, E-019 | domain evidence | `supported` | none |
| RED-04 | Inventory | On-hand 100. Reserved 40. Available 60. Projected 130. | Custody quantity, exclusive claim, remainder, planning formula. | E-008, E-009, sibling inventory quantities on `origin/cursor/issue-18-domain-cfd8` | domain evidence | `supported` | none |
| RED-05 | Inventory | Consigned stock "ours" versus "theirs" | GS1 `possessing_party` versus `owning_party`. | E-010 | domain evidence | `supported` | none |
| RED-06 | Inventory | Transit quantity missing from a bin | Quantity at a transit place, or a transfer in progress. Not a second on-hand of the same bin. | E-010 | mixed | `hypothesis` | none |
| RED-07 | Finance | IFRS profit disagrees with local GAAP profit | Two valuation questions. SAP parallel ledgers keep both books. | E-015 | domain evidence | `supported` | none |
| RED-08 | Finance | This year's depreciation changed after a new useful-life study | IAS 8 estimate change. Prospective. Not a rival fact about last year. | E-014 | domain evidence | `supported` | none |
| RED-09 | Master data | Same trade name as Customer and as Supplier | One party, two roles, two masters. Party Link does not merge them. | E-016 | domain evidence | `supported` | none |
| RED-10 | Master data | Palantir "canonical Customer" versus three team copies | DRY for one concept. Not election among observations of one property. | E-003 | source-system artifact | `supported` as modeling hygiene | none |
| RED-11 | Quality | Sensor temperature on a shipment versus "the pallet" | EPCIS How observation on an event. Not a property of the GTIN identity. | E-011, E-003 | domain evidence | `supported` | none |
| RED-12 | Quality | Mean of three readings versus one out-of-range spike | Different derived functions over the same observation set. Formula-based criteria in ERPNext. | E-013 | mixed | `hypothesis` | none |
| RED-13 | Imported ERP | Dataverse screen shows a sales order that F&O also shows | Virtual table is a proxy. One store. No second fact. | E-017 | source-system artifact | `supported` | none |
| RED-14 | Imported ERP | Two systems show different order "status" strings | Often collapsed projections. Map each status to the documents or events that produce it before calling it a clash. | E-019 | mixed | `hypothesis` | none until mapped |
| RED-15 | Time | Late invoice rate versus earlier receipt rate | Same economic flow, different knowledge time. ValueFlows `created` versus event time. | E-002 | domain evidence | `supported` | none |
| RED-16 | Provenance | Signed invoice amount equals a chat extract amount | Same number, different `hadPrimarySource` and attribution. Not yet a value clash. | E-018 | domain evidence | `supported` | none |

## Irreducible disagreements

| ID | Domain | Clash that remains | Why typing fails | Evidence | Kind | Decision | Authority needed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| IRR-01 | Inventory | WMS on-hand 87 and ERP on-hand 92 for one SKU, location, and lot at one instant | Both claim current custody quantity. Palantir cannot map both onto one property. ERPNext and Odoo treat book and count as two inputs to a new posting. | E-004, E-008, E-009 | domain evidence | `supported` | decision-action |
| IRR-02 | Inventory | Counted 80 at 09:00. Book became 78 before Apply because a shipment posted. | After typing, two observations of on-hand at different knowledge times still force a choice of which quantity to post. Odoo asks for confirmation. | E-009 | domain evidence | `supported` | decision-action |
| IRR-03 | Quality | Lab A 0.162 and Lab B 0.148 on one sample, one characteristic, one valid time | GUM treats both as estimates plus uncertainty. Release still needs a disposition. ERPNext Manual Inspection is that disposition. | E-012, E-013 | domain evidence | `supported` | decision-action |
| IRR-04 | Quality | Automatic reject versus supervisor accept of the same reading | The reading is not renamed. A person decides the inspection status that gates stock. | E-013 | domain evidence | `supported` | decision-action |
| IRR-05 | Finance | Bank statement cash 12,410 and book cash 12,250 for one account on one statement date | After typing, both claim the same cash position. Reconciliation emits matching and adjustment entries. Not a second GAAP. | E-014 | mixed | `hypothesis` | decision-action |
| IRR-06 | Finance | Material prior-period error versus the originally issued statements | IAS 8 keeps the historical issue and requires retrospective restatement later. The correction is a dated decision, not a silent overwrite. | E-014, E-002 | domain evidence | `supported` | decision-action |
| IRR-07 | Master data | Two legal entities share a name, or one entity has two vendor codes that must not merge | After role split, identity is still unbound. A link or split decision is required before any value authority. | E-016, E-003 | domain evidence | `supported` | decision-action on identity, not on values |
| IRR-08 | Customer commitments | Two live promises for the same order line and the same promised-date property, neither withdrawn | After Intent versus Commitment split, two Commitments still collide. Someone must supersede or split the line. | E-001, E-006 | domain evidence | `hypothesis` | decision-action |
| IRR-09 | Imported ERP | Dual-write left Dataverse qty 10 and F&O qty 8 on one order line after both sides wrote | Two stores now hold the same typed property. Virtual tables avoid this. Copy paths create it. | E-017, E-005 | source-system artifact that creates a domain problem | `supported` that copy creates the case. `hypothesis` for Microsoft's exact conflict rule | decision-action |
| IRR-10 | Imported ERP | User override in an ontology index versus later ERP refresh of the same property | Foundry default keeps the user edit and drops the ERP value from the object. The dropped value is still a live claim in the ERP. | E-005 | source-system artifact | `supported` as product behavior | decision-action if both claims must remain speakable |

## Counts

- Reducible rows marked `supported`: 11
- Irreducible rows marked `supported`: 6
- Rows still `hypothesis` or mixed: 9

Hypothesis A wins the count. It does not win the remainder.

## Domain evidence

Most "disagreement" in the six required domains is a collapsed name. Requested, promised, planned, and actual dates. On-hand, reserved, owned, counted. IFRS versus local GAAP. Customer versus Supplier. Sensor How versus object identity. Proxy view versus copied store.

A smaller set does not dissolve. Two custody books. Two labs. Bank versus book. Identity merge or split. Two live promises. A copied ERP row that drifted.

## Source-system artifacts

Do not promote these to OS law.

- Foundry one-property-one-datasource and user-edits-win merge.
- Palantir "canonical object type" as DRY.
- ERPNext DocType pair Customer and Supplier.
- SAP leading ledger as the Controlling feed.
- Microsoft dual-write copy versus virtual-table proxy.
- Odoo and ERPNext screen field names.

## Candidate implication

See [`L-001`](candidate-laws.md#l-001-most-named-disagreements-are-reducible) through [`L-005`](candidate-laws.md#l-005-accepted-state-is-a-projection-plus-optional-decision).
