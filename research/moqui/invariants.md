# Mantle and Moqui invariants

Lookup list. Full statements, falsifiers, and citations are in `research/notes/issue-0034-moqui-mantle-archaeology.md` section 7.

| ID | Statement | Scope | State |
| --- | --- | --- | --- |
| I-001 | A defined service joins the active transaction or begins one | Service Facade default | `supported` |
| I-002 | ContactMech used as history is not updated in place | Party and Facility contact services | `supported` |
| I-003 | Asset quantity totals are sums of AssetDetail diffs | Non-serialized inventory | `supported` as documented |
| I-004 | Invoice sales versus purchase is party direction | Mantle Invoice | `hypothesis` |
| I-005 | Packed is the default goods-billing trigger | Sales and purchase shipments | `hypothesis` |
| I-006 | Payment to invoice is many-to-many | PaymentApplication | `supported` as documented |

## Related claims that are not invariants yet

| ID | Statement | State |
| --- | --- | --- |
| L-001 | Meaningful mutations should be named operations | `hypothesis`, limited by X-001 |
| L-002 | Kind and role differ | `hypothesis`, contested in D-001 |
| L-003 | Description, instance, and quantity-change differ | `hypothesis` |
| L-004 | Order, shipment, invoice, and payment stay separate | `supported` as a distinction |
| L-005 | Cross-domain effects attach to named operations | `hypothesis`, contested in D-003 |
| L-006 | Requested, promised, planned, and actual time differ | `hypothesis` |

## Failure notes worth keeping

Contact in-place edit. Old orders would silently show a new address. E-014.

Asset total without a detail. The balance cannot be explained. E-015, R-002.

Payment equal to one invoice. Overpay, split pay, and unapplied cash disappear. E-020.

EECA as the process bus. Any CRUD path, including implicit `update#Entity`, would start billing or reservation. E-008, X-003.
