# Odoo corpus tracker

**Status.** Partial Wave A pass, 2026-08-15.  
**Decision.** none.  
**Issue.** [33](https://github.com/EnzoTironi/OS/issues/33)

## Question

What real-world distinctions and invariants did Odoo Community encode across sales, purchase, inventory, MRP, accounting, CRM, project, HR, and quality or maintenance? Where do those distinctions converge with ERPNext, and where does the difference look like architecture rather than domain?

## Method

1. Pin Odoo Community `18.0` and ERPNext `version-15` public heads.
2. Read model fields, SQL constraints, action methods, and official user docs.
3. Read selected tests and one historical reservation fix.
4. Extract concepts and behavior only. No implementation was copied into this repo.
5. Tag every claim as domain-evidence, source-system artifact, candidate law, counterexample, or runtime consequence.
6. Leave `docs/open-questions.md` unanswered unless an independent source is cited on the card.

Timebox stopped this pass before a full test and migration sweep, before Enterprise Quality, and before Moqui or REA cross-checks beyond pointers.

## Sources

### Odoo Community

| Item | Value |
| --- | --- |
| Repository | https://github.com/odoo/odoo |
| Branch | `18.0` |
| Head SHA | `bca6e5d13118fc2dff99d7b81bd49860e743132a` |
| Head date | 2026-08-15 |
| License | LGPL-3.0, https://github.com/odoo/odoo/blob/18.0/LICENSE |

Inspected files at that branch. Line numbers can drift after the pin. Prefer the SHA when re-checking.

| Path | Why |
| --- | --- |
| `addons/sale/models/sale_order.py` | Quotation and order states, lock, confirm, cancel |
| `addons/purchase/models/purchase_order.py` | RFQ and order states, billing status |
| `addons/stock/models/stock_move.py` | Move states, assign, done, cancel, unreserve |
| `addons/stock/models/stock_move_line.py` | Reservation write path onto quants |
| `addons/stock/models/stock_quant.py` | On-hand, reserved, available, identity key |
| `addons/stock/models/stock_lot.py` | Lot and serial uniqueness |
| `addons/stock_account/models/stock_valuation_layer.py` | Cost layers and journal posting |
| `addons/account/models/account_move.py` | Unified journal, balance, lock, post, draft, reverse |
| `addons/mrp/models/mrp_production.py` | Manufacturing order states and constraints |
| `addons/mrp/models/mrp_workorder.py` | Work order states and start or finish |
| `addons/mrp/models/mrp_bom.py` | Manufacture versus kit |
| `addons/crm/models/crm_lead.py` | Lead versus opportunity on one model |
| `addons/project/models/project_task.py` | Stage plus computed state |
| `addons/maintenance/models/maintenance.py` | Request stages and done flag |
| `addons/quality/models/quality.py` | Missing on Community 18.0, HTTP 404 |

Older design note, not the pin:

- `addons/stock/doc/stock.rst` on branch `13.0`, https://github.com/odoo/odoo/blob/13.0/addons/stock/doc/stock.rst

Historical fix:

- [odoo#103624](https://github.com/odoo/odoo/pull/103624), reservation ownership moved onto `stock.move.line`

### Official Odoo 18.0 docs

- [Serial numbers](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/product_management/product_tracking/serial_numbers.html)
- [Manufacture with lots and serial numbers](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/workflows/manufacture_lots_serials.html)
- [Automatic inventory valuation](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/product_management/inventory_valuation/inventory_valuation_config.html)
- [Valuation by lots or serial numbers](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/product_management/inventory_valuation/valuation_by_lots.html)
- [Using inventory valuation](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/product_management/inventory_valuation/using_inventory_valuation.html)
- [Credit notes and refunds](https://www.odoo.com/documentation/18.0/applications/finance/accounting/customer_invoices/credit_notes.html)
- [Two-step receipt and delivery](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/shipping_receiving/daily_operations/receipts_delivery_two_steps.html)
- [Manufacturing backorders](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/workflows/manufacturing_backorders.html)
- [Batch picking](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/shipping_receiving/picking_methods/batch.html)

### ERPNext comparison pin

Used for disagreement only. Issue 32 owns the ERPNext corpus. This pass did not copy those files.

| Item | Value |
| --- | --- |
| Repository | https://github.com/frappe/erpnext |
| Branch | `version-15` |
| Head SHA | `d707cb1e0e808fa6699d29a2bbaf9310983e94ac` |
| Head date | 2026-08-14 |
| License | GPL-3.0 |
| Framework | https://github.com/frappe/frappe `version-15` SHA `9b8d265b27a1dfb11c7aef21a533a127e14a0a5a` |

Official ERPNext docs cited in disagreement cards:

- [How transactions affect the ledger](https://docs.frappe.io/erpnext/how-transactions-affect-the-ledger)
- [Immutable ledger](https://docs.frappe.io/erpnext/immutable-ledger-in-erpnext)

## Evidence summary

See the catalogs. Strongest local evidence is in inventory reservation, stock-move cancel, account-move reset-to-draft, lot uniqueness, and manufacturing-order computed state.

## Source artifacts

These look like Odoo product choices, not domain laws, until independent sources agree.

- One model for quotation and sales order.
- One model for RFQ and purchase order.
- One model for invoice, credit note, and miscellaneous journal.
- One model for lead and opportunity.
- Current stock stored on mutable quants rather than only as a projection of an append-only ledger.
- Reservation stored as `reserved_quantity` on the quant.
- Per-model `state` fields instead of one framework `docstatus`.
- Quality as a commercial addon, not in the Community tree inspected here.

## Convergence

Independent of schema names, Odoo and ERPNext both distinguish:

- offer versus customer or supplier commitment
- commitment versus goods movement
- goods movement versus receivable or payable claim
- claim versus payment or reconciliation
- on-hand quantity versus reserved quantity
- interchangeable quantity versus lot or serial identity
- specification or BOM versus authorized production versus operation execution
- partial fulfillment via leftover demand
- return or reverse as a later act, at least for done stock

## Divergence

See [`disagreement-erpnext.md`](disagreement-erpnext.md). The largest architecture-driven splits are reset-to-draft on posted journals, unified `account.move`, quant-centric stock, and reservation-without-a-document.

## Candidate laws

Stated on invariant cards. None are accepted for OS.

## Counterexamples

Stated on edge-case cards and on invariant cards that already have a known hole.

## Runtime pressure

If any candidate law survives, a runtime must name the mutation, refuse silent field writes on posted facts, keep reservation consistent with identity, and keep debit equal to credit at post time. That is pressure, not a storage choice.

## Open questions

These stay undetermined. No invented answers.

- `docs/open-questions.md` section 4. Is every mutation an Action? Odoo mixes named actions with stored field writes and computed states.
- Section 5. Action versus Event versus Effect. Odoo `action_confirm` is not proof that goods moved.
- Section 6. Is `status` stored or derived? Odoo uses both, even inside manufacturing.
- Section 7. Bitemporality. Odoo has accounting dates and lock dates. It does not expose a general valid-time and known-time pair on every fact.
- Section 12. Is reservation a relator? Odoo encodes it as quantity on a quant plus a move line.
- Section 13. Are ERP documents surfaces over REA? Undetermined.
- Section 14. Is a work order a commitment, authorization, plan, or execution? Odoo names the manufacturing order as the authorization and the work order as the operation execution. That is one source.

## Decision state

Corpus-level decision is `undetermined` for OS primitives. Several Odoo-internal claims are `supported` inside this source. RFC-0001 remains `hypothesis`.

## Licensing note

OS is MIT. This folder extracts behavior and distinctions from an LGPL-3 corpus and compares them to a GPL-3 corpus. Do not paste or translate implementation into OS.
