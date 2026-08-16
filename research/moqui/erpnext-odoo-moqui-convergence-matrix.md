# ERPNext, Odoo, and Moqui convergence matrix

Three-way lookup for issue 34. Moqui and Mantle cells are cited in `research/notes/issue-0034-moqui-mantle-archaeology.md`. ERPNext and Odoo cells use official docs opened on 2026-08-15. Source trees for ERPNext and Odoo were not opened. Those cells stay `undetermined` when the doc is silent.

Legend.

- Converge means independent sources make the same real-world split.
- Diverge means they disagree on identity or cardinality.
- Collapse means one source merges what another keeps apart.

## Party and role

| Distinction | Mantle | ERPNext | Odoo | Verdict | State |
| --- | --- | --- | --- | --- | --- |
| Person versus organization | Party plus Person or Organization. E-013 | Customer Type Company, Individual, Partnership. E-023 | Individual or Company on Contacts. E-026 | Converge | `supported` |
| Buyer identity | Role on Party. bill-to customer is a RoleType. E-013 | Customer master. E-023 | One Contact with sales fields. E-026 | Diverge. D-001 | `undetermined` as law |
| Same party as supplier | Same Party, other RoleType | Not opened | Same Contact has purchase fields. E-026 | Mantle and Odoo lean together | `hypothesis` |
| Addresses | Immutable ContactMech plus dated PartyContactMech. E-014 | Linked Address records. E-023 | Invoice and delivery addresses on the contact. E-026 | Converge that address is not a field dump. Immutability is Mantle-specific | `hypothesis` |

## Product and inventory

| Distinction | Mantle | ERPNext | Odoo | Verdict | State |
| --- | --- | --- | --- | --- | --- |
| Catalog versus instance | Product versus Asset. E-015 | Item versus stock and serial or batch. Delivery Note writes Stock Ledger Entry. E-024 | Not opened beyond quotation product lines | Converge on catalog versus stock movement. Asset-as-instance is Mantle-shaped | `hypothesis` |
| Quantity as sum of changes | AssetDetail diffs. I-003 | Stock Ledger Entry on Delivery Note submit. E-024 | Not opened | Suggestive converge | `undetermined` |
| Reservation | `reserve#AssetsForOrder` after order update. E-009 | Not opened | Not opened | Mantle only in this pass | `undetermined` |
| Equipment versus inventory | Same Asset entity. E-015 | Not opened | Not opened | Possible Mantle collapse | `hypothesis` |

## Order to cash

| Distinction | Mantle | ERPNext | Odoo | Verdict | State |
| --- | --- | --- | --- | --- | --- |
| Offer versus accepted order | Order status Proposed versus Accepted. E-017 | Quotation then Sales Order. E-024 | Quotation converts to sales order. E-025 | Diverge on identity. D-002. Converge that offer is not fulfillment | `hypothesis` |
| Multi-party order | OrderPart has customer and vendor. E-016 | One Customer on Sales Order. E-024 | Not opened | Mantle distinction others may miss | `hypothesis` |
| Order versus shipment | Order versus Shipment. E-019 | Sales Order versus Delivery Note. E-024 | Sales order versus delivery. E-025 | Converge. L-004 | `supported` |
| Shipment versus invoice | Packed shipment creates invoices. E-019 | Delivery Note optional. Invoice can come from Sales Order. E-024 | Invoice from order or delivered products. E-025 | Converge that they can be separate. Diverge on whether shipment is required | `hypothesis` |
| Invoice versus payment | Payment plus PaymentApplication. E-020 | Sales Invoice then Payment Entry. E-024 | Invoice then payment. E-025 | Converge | `supported` |
| Shared item types | Order, invoice, return share ItemType. E-018 | Not opened | Not opened | Mantle-specific in this pass | `undetermined` |
| Billing join | OrderItemBilling and ShipmentItemSource. E-018, E-019 | Links between documents. Mechanism not opened | Not opened | Converge that a join exists. Relator shape is Mantle | `hypothesis` |

## Time

| Distinction | Mantle | ERPNext | Odoo | Verdict | State |
| --- | --- | --- | --- | --- | --- |
| Requested, promised, planned, actual | Shipment estimates plus route-segment actuals plus optional WorkEffort. E-019 | Sales Order has a promised Delivery Date. E-024 | Quotation has issue and expiration. E-025 | Partial. S-001 is easier in Mantle than in a single delivery date | `hypothesis` |

## Mutation style

| Distinction | Mantle | ERPNext | Odoo | Verdict | State |
| --- | --- | --- | --- | --- | --- |
| Named business verbs | Service `place#Order`, `pack#Shipment`, `apply#Payment`. E-022 | Submit plus Create Delivery Note, Create Invoice. E-024 | Confirm quotation to sales order. E-025 | Converge that some verbs are named. Moqui makes the verb the primary API | `hypothesis` |
| Escape-hatch CRUD | Implicit `update#Entity`. X-001 | Not opened | Not opened | Moqui has an explicit CRUD back door | `supported` for Moqui |
| Cross-domain composition | SECA on named services. E-009 | Document Create actions. E-024 | App integration and smart buttons. E-026 | Converge that packing or confirming has consequences. Mechanism differs | `hypothesis` |

## Distinctions Mantle makes that the other two may miss

These are research questions, not scores.

1. OrderPart as a first-class customer and vendor slice. E-016.
2. Optional PartyRole with FKs that do not require the role row. E-013.
3. ContactMech immutability with expire-and-create. E-014.
4. AssetDetail as the inventory change log that explains totals. E-015.
5. Shared ItemType across order, invoice, and return. E-018.
6. PaymentApplication with an unapplied cash account. E-020.
7. AcctgTrans trigger pointers back to operational records. E-021.
8. WorkEffort reused for picklist, manufacturing, and shipment calendar. C-011.
9. Quote collapsed into order status. This may be a miss in the other direction. D-002.

## Distinctions the others make that Mantle may miss

1. ERPNext Quotation as a sendable document with its own lifecycle. E-024. D-002.
2. ERPNext Delivery Note as optional. Goods sale can invoice from the order. E-024. X-005.
3. Odoo quotation templates, optional products, and online signature as first-class offer behavior. E-025.
4. ERPNext company-specific credit limit rows on Customer. E-023. Mantle BillingAccount is the closest analog and was not compared in depth.

## What this does not settle

`docs/open-questions.md` item 4, what an Action is, stays `undetermined`. This matrix only says Moqui has a subset of services that look like Actions and a CRUD path that does not.

RFC-0001 is unchanged.
