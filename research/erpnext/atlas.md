# ERPNext domain atlas

**Status.** Partial map of ten domains plus lifecycle and ledger cross-cuts.  
**Decision.** none.  
**How to use.** Each section names the real-world distinction first, then where ERPNext encodes it, then what is likely a source artifact.

Do not copy the DocType list into an ontology.

## A-LIFECYCLE. Draft, submit, cancel, amend, discard, close

**Kinds.** source-system artifact, domain-evidence  
**Decision.** supported that ERPNext uses one framework lifecycle for most operational documents. undetermined whether three states are the domain law.

**Real-world distinction.** An offer or draft can change. A posted operational act has consequences. A posted act can be reversed. A reversed act can be replaced. A still-open commitment can be stopped without claiming it never existed.

**Where it lives.**

- Framework states are Draft (0), Submitted (1), Cancelled (2). Valid transitions are documented in `frappe/model/document.py` `check_docstatus_transition`. Draft to Cancelled is rejected on the normal path. Submitted to Draft is rejected. Cancelled documents cannot be edited.
- `submit` / `cancel` set `docstatus` then save. Hooks are `before_submit`, `on_submit`, `before_cancel`, `on_cancel`, plus `before_update_after_submit` / `on_update_after_submit`. Official table: [Controllers](https://docs.frappe.io/framework/user/en/basics/doctypes/controllers).
- `discard` sets a draft to Cancelled without submitting. It is a later framework path, not the historical cancel.
- Amend requires the source to already be cancelled (`validate_amended_from`). The new document points at `amended_from`.
- Close is a domain status, not `docstatus`. A Closed Sales Order cannot be cancelled until unclosed (`sales_order.py` `on_cancel`). A Stopped Work Order cannot be cancelled until unstopped (`work_order.py` `validate_cancel`).

**Source artifact.** One integer on every DocType. Domain modules then pile a second `status` string on top (`status_updater.py`).

**Candidate law.** Posted actions are not drafts. Reversal is a new act, not an undo of `docstatus` back to zero.

**Runtime consequence.** Surfaces must not treat "edit the record" as the mutation model for posted facts.

## A-LEDGER. Commitment documents versus ledger documents

**Kinds.** domain-evidence, candidate law  
**Decision.** supported inside ERPNext and its official docs. hypothesis as an OS law until Odoo/Moqui/REA agree.

Official table from [How transactions affect the ledger](https://docs.frappe.io/erpnext/how-transactions-affect-the-ledger):

| Document | Business effect | Usual ledger effect |
| --- | --- | --- |
| Quotation | Offer | None |
| Sales Order | Customer commitment and fulfilment plan | None, except advances |
| Purchase Order | Supplier commitment | None, except advances |
| Delivery Note | Goods delivered | Stock and COGS when perpetual |
| Purchase Receipt | Goods received | Stock and GRNI / received-not-billed |
| Sales Invoice | Customer billing | Income, tax, receivable, optional stock |
| Purchase Invoice | Supplier billing | Expense or asset, tax, payable, optional stock |
| Payment Entry | Movement of money | Bank/cash and party |

One document can write three ledgers. A stock-updating Sales Invoice writes GL, Payment Ledger, and Stock Ledger.

**Source artifact.** The split is implemented as different DocTypes and controller subclasses, not as one Action producing many Events.

**Cross-link.** `docs/open-questions.md` §13. Scenario S-010.

## A-SELL. Selling (order-to-cash)

**Kinds.** domain-evidence  
**Decision.** hypothesis

**Distinctions ERPNext actually enforces.**

- Customer is a master DocType, not a role on Organization. Credit limit is per Customer+Company, bypassable per row (`sales_order.py` `check_credit_limit`).
- Quotation is an offer. Sales Order is the commitment. Delivery Note is the goods event. Sales Invoice is the claim. Payment Entry is settlement. Proforma Invoice exists as a selling DocType without being the receivable.
- Line identity matters. Status updater writes delivered/billed qty back onto the previous document's child rows (`status_updater.py` `update_prevdoc_status` / `validate_qty`).
- Partial delivery and partial billing are first-class. Tests include `test_make_sales_invoice_bills_ordered_qty_for_partial_delivery` and `test_reserved_qty_for_partial_delivery` in `test_sales_order.py`.
- Return is the same DocType with `is_return` and negative qty. Positive qty on a return is rejected (`status_updater.py` `validate_qty`).
- Drop ship requires a supplier on the line (`validate_drop_ship`). After submit, changing that supplier is blocked if a PO already exists (`validate_supplier_after_submit`).
- Inter-company order reference is a linked pair, not a single multi-entity fact.
- Cancel of SO is blocked while draft Sales Invoices still point at it (`check_nextdoc_docstatus`). Submitted downstream docs are the usual link-cancel problem.

**Source artifacts.** Selling Settings, coupon code counters, loyalty points, `update_after_submit` child-item edits (many `test_update_child_*` tests). Those last tests show submitted commitments are still mutable under policy.

**Map, not types.** Offer, commitment, reservation, delivery event, invoice/claim, payment, return, close.

## A-BUY. Buying (procure-to-pay)

**Kinds.** domain-evidence  
**Decision.** hypothesis

Buying DocTypes on the pinned SHA include Supplier, Request for Quotation, Supplier Quotation, Purchase Order, scorecards, and settings. Receipt and landed cost live in Stock. Purchase Invoice lives in Accounts.

**Distinctions.**

- RFQ / Supplier Quotation / Purchase Order is the offer-to-commitment chain on the buy side.
- Purchase Receipt is the goods event. Purchase Invoice is the payable. Official docs say a PI against a PR should clear Stock Received But Not Billed rather than capitalize stock twice.
- Landed Cost Voucher is a later valuation fact that rewrites incoming rates and triggers SLE/GL repost (`test_purchase_return_valuation_reposting` in `test_stock_ledger_entry.py`).
- Purchase Order still carries a `customer` field for drop-ship / inward subcontracting. That is a role leak on the document, not a Party model.
- Subcontracting is now its own top-level module (`erpnext/subcontracting`), not only a checkbox on PO.

**Candidate law.** Receipt of goods, recognition of a payable, and valuation adjustments are different facts even when they share an item line.

**Cross-link.** Three-way match is implied by PO/PR/PI qty fields. This pass did not read the match controller in full. State for match semantics: undetermined.

## A-STOCK. Inventory

**Kinds.** domain-evidence, candidate law  
**Decision.** supported that ERPNext treats stock as an append-only movement history with stored projections. hypothesis that this is the domain law.

**Masters.** Item, Warehouse, Batch, Serial No, Serial and Batch Bundle, Inventory Dimension, UOM conversion, Item Alternative, Price List.

**Movements.** Stock Entry, Delivery Note, Purchase Receipt, Stock Reconciliation, stock-updating invoices, Material Request, Pick List, Packing Slip, Shipment, Delivery Trip.

**Ledgers and caches.**

- Stock Ledger Entry is the movement fact. Mandatory fields include warehouse, posting_date, voucher_type, voucher_no, company. Actual qty is mandatory except Stock Reconciliation (`stock_ledger_entry.py` `validate_mandatory`).
- Individual SLE cancel is rejected. Message: cancel the related transaction (`on_cancel`).
- `qty_after_transaction`, valuation rate, and stock value are stored on the SLE. `stock_ledger_invariant_check.py` recomputes expected qty and FIFO value and reports diffs. That report existing is evidence that stored projections drift.
- Bin holds current reserved/actual/ordered qty for the Item+Warehouse pair. It is a cache, not the ledger.
- Backdated movements can create Repost Item Valuation jobs. Cancel is blocked while a repost for that voucher is In Progress (`stock_ledger.py` `validate_cancellation`).

**Quality gate.** Quality Inspection is a Stock DocType. It is referenced from Job Card and stock transactions. It is not the Quality Management module.

**Source artifacts.** Inventory Dimension columns on SLE. Group warehouse (cannot be reserved or posted against as a leaf). Company restriction.

## A-RESERVE. Reservation

**Kinds.** domain-evidence, candidate law  
**Decision.** hypothesis that reservation is a relator with lifecycle. supported that ERPNext implemented it as its own submitted document.

Stock Reservation Entry (`stock_reservation_entry.py`):

- Submitted document. Statuses include Draft, Partially Reserved, Reserved, Partially Delivered, Delivered, Partially Used, Closed, Cancelled.
- Based on qty or on serial/batch identity.
- Cannot be amended (`validate_amended_doc`).
- Cannot reserve a group warehouse.
- On submit it updates reserved qty on the voucher, pick list, and Bin.
- Delivery Note consume and cancel restore reservation (`test_reservation_restored_on_delivery_note_cancel`).
- Reserved stock cannot be delivered against a different Sales Order (`test_reserved_stock_cannot_be_delivered_against_a_different_sales_order`).
- A later reservation against a Purchase Receipt can be consumed by a Work Order. Cancel of that SRE is then blocked (`validate_reserved_entries`).
- Update after submit is refused once partially delivered, delivered, or created from a Pick List (`can_be_updated`).

Work Order has a parallel production reservation (`reserve_stock` plus `WorkOrderStockReservation`) and older reserved-qty-for-production fields on Bin. Two reservation mechanisms in one product.

**Cross-link.** `docs/open-questions.md` §12. Scenario S-002.

## A-IDENTITY. Lots, serials, alternatives

**Kinds.** domain-evidence  
**Decision.** supported that identity-bearing stock is not interchangeable qty. undetermined how identity should be typed in OS.

- Item flags `has_serial_no` / `has_batch_no` change validation on every SLE (`validate_serial_batch_no_bundle`).
- Serial and Batch Bundle is the current container (thousands of lines of validation). Duplicate inward serials raise `SerialNoDuplicateError` (`validate_serial_nos_duplicate`).
- Manufacture and Repack inward can reuse a serial whose status is Delivered. That is a rework/return-to-stock path, not a second birth of the same identity without history.
- Batch can carry `use_batchwise_valuation`. Invariant-check then treats FIFO per batch.
- Work Order can pre-create inactive serials and batches for the finished good (`create_serial_no_batch_no`). Identity can exist before the stock event.
- Item Alternative and return-attribution tests (`test_return_attribution_when_item_doubles_as_alternative`) show substitution is a first-class headache.

**Cross-link.** Scenario S-008.

## A-MFG. Manufacturing

**Kinds.** domain-evidence  
**Decision.** hypothesis

**Layering observed.**

| Layer | ERPNext object | What it is in the world |
| --- | --- | --- |
| Specification | BOM (+ Routing, Operation, Workstation Type) | How a product is supposed to be made. Active/default flags. Recursion check. Cost allocation across finished and secondary items must total 100%. Cannot cancel if linked from another BOM (`bom.py` `on_cancel` / `validate_bom_links`). |
| Plan | Production Plan, Master Production Schedule, Sales Forecast, Material Request | What we intend to make or buy, often exploded from Sales Orders. |
| Authorization | Work Order | Permission and target to make a qty of an item from a BOM. On submit it updates SO work-order qty, reserved qty for production, planned qty, and can create Job Cards. Cannot target an item template. Qty must be > 0. |
| Execution | Job Card | Actual operation at a workstation, with time logs, employee overlap checks, transferred qty, completed qty, process loss. Submit updates the Work Order. Quality Inspection may be required before complete. |
| Transformation event | Stock Entry (Manufacture, Material Transfer for Manufacture, Material Consumption, Disassemble, Repack) | What actually moved. Work Order cancel is refused if any submitted Stock Entry points at it. |

**Other enforced distinctions.**

- Source / WIP / FG / scrap warehouses are Company defaults (`get_default_warehouse`).
- Semi-finished tracking is a mode (`track_semi_finished_goods`) that changes Job Card material-transfer rules.
- Over-production is a setting, not a free-for-all (`test_allow_overproduction`, `test_over_production_for_sales_order`).
- Partial manufacture, extra material transfer, and process loss have dedicated tests.
- Corrective Job Card is a distinct path (`is_corrective_job_card`).
- Close and Stop are operational holds. They are not Cancel.

**Candidate law.** A BOM is not a Work Order. A Work Order is not a Job Card. A Job Card is not a stock transformation. Collapsing any pair loses a validation that ERPNext already needs.

**Cross-link.** `docs/open-questions.md` §14. Scenarios S-008, S-009.

## A-ACCT. Accounts

**Kinds.** domain-evidence, candidate law  
**Decision.** supported for debit=credit and voucher-level cancel. hypothesis for payment-as-separate-ledger.

**Facts.**

- GL Entry is submitted by `general_ledger.make_entry`. Individual cancel is rejected (`gl_entry.py` `on_cancel`).
- A GL map must balance within a precision allowance. Over the allowance raises `raise_debit_credit_not_equal_error`, except Exchange Gain Or Loss journal entries (`process_debit_credit_difference`).
- Accounts, Cost Centers, and Fiscal Years are structural. Group accounts and group cost centers cannot be posted.
- Payment Ledger Entry tracks receivable/payable outstanding with `delinked` rather than `is_cancelled`. Advance Payment Ledger Entry is a fourth family.
- Payment Entry (3337-line controller) separates cash movement from allocation. A payment can be unallocated, split, or an advance against an order. Official docs say reconciliation can attach money already recorded.
- Period Closing Voucher, freeze-upto, and Accounting Period block late mutation. Immutable-ledger docs say these are not the same as ledger immutability.
- Sales Invoice `on_submit` / `on_cancel` is a fan-out. Stock, assets, GL, reservations, loyalty, tax withholding, project sales, inter-company links, subcontracted billed qty.

**Source artifacts.** Finance Book, Accounting Dimension columns, POS Invoice merge log, `repost_accounting_ledger`.

## A-ASSET. Assets

**Kinds.** domain-evidence  
**Decision.** hypothesis

Asset is not a stock item. Item flags `is_fixed_asset` versus `is_stock_item` (`asset.py` `validate_item`).

Lifecycle: create, submit (optionally book GL and activate depreciation schedules), move, depreciate, maintain/repair, adjust value, sell or scrap, cancel.

Cancel is allowed only from Submitted / Partially Depreciated / Fully Depreciated, and not while In Maintenance or Out of Order (`validate_cancellation`). Cancel cascades to Asset Movements and depreciation Journal Entries, then reverse GL.

Asset Movement is its own submitted document. Quantity greater than one can split (`FixedAssetService.split_asset_based_on_sale_qty` from Sales Invoice).

**Candidate law.** A capitalized identifiable asset has a custody and depreciation history that inventory qty does not.

## A-PROJ. Projects

**Kinds.** domain-evidence  
**Decision.** undetermined (thinner pass)

Project, Task (with `Task Depends On`), Timesheet, Activity Type/Cost, Project Template.

Project is not the same submit/ledger document as an invoice. `update_percent_complete` is a stored projection. Sales Order and Sales Invoice can update project sales amount when Selling Settings say Each Transaction.

Timesheet billing is a service on Sales Invoice (`TimesheetBillingService`). Work is an event stream that can become a claim.

**Gap.** Did not read task dependency cycle checks or timesheet overlap in full.

## A-CRM. CRM

**Kinds.** domain-evidence  
**Decision.** undetermined (thinner pass)

Lead, Opportunity, Prospect (with Prospect Lead / Prospect Opportunity), Campaign, Appointment, Competitor, Contract, Sales Stage.

Opportunity validates qty and party. `declare_enquiry_lost` is a terminal commercial state, not a ledger cancel.

Contract is a commercial agreement object with fulfilment checklist. It is closer to a relator than a Lead.

**Source artifact.** Customer still sits in Selling. Lead-to-Customer conversion is a kind-change in this product, which is exactly the role-versus-kind question in scenario S-005.

## A-QUAL. Quality

**Kinds.** domain-evidence, source-system artifact  
**Decision.** supported that ERPNext split "inspection gate" from "quality system". hypothesis which split OS needs.

**Inspection gate (Stock).** Quality Inspection, parameters, templates. `on_submit` / `on_cancel` update references on the source document. Job Card can require a submitted, non-rejected inspection. Stock Settings choose Stop versus warn for unsubmitted or rejected inspections (`job_card.py` `validate_inspection`).

**Quality system (quality_management).** Quality Procedure, Goal, Review, Action, Meeting, Feedback, Non Conformance. No stock ledger writes observed in this pass.

**Candidate law.** A release decision on a lot or job is not the same object as a CAPA procedure.

## A-HR. HR and payroll

**Kinds.** domain-evidence, source-system artifact  
**Decision.** undetermined for the employment relator. supported that leave has its own ledger.

**Split across repos.**

- Employee and some history child tables still live in `erpnext/setup/doctype/employee`. GPL ERPNext owns the person-as-master.
- HRMS (GPL) owns attendance, leave, onboarding, separation, appraisal, expense claim, interviews, shifts, and payroll (Salary Structure, Salary Slip, Payroll Entry, tax slabs, gratuity).

**Leave Ledger Entry.** Interval-valued (`from_date` < `to_date`). Created on submit of allocation/application/encashment. On cancel of those documents the ledger row is deleted (`create_leave_ledger_entry` / `delete_ledger_entry`). Direct cancel of a ledger row is allowed only for expiry rows, or Leave Adjustment. This is a different immutability story than GL/SLE.

**Candidate law.** Leave is a time-bounded claim on a person, not a stock qty.  
**Counterexample to "all ledgers are immutable".** Leave deletes.

**Cross-link.** Scenario S-006. `docs/open-questions.md` §12.

## A-XCUT. Cross-module consequences worth keeping

1. Sales Order submit can create Stock Reservation Entries. Invoice with Update Stock consumes them. Cancel restores them.
2. Work Order submit reserves production qty and may create Job Cards and serials. Stock Entry is the thing that makes cancel illegal.
3. Landed cost and backdated SLE force future valuation and sometimes GL repost (`test_dependent_gl_entry_reposting`).
4. Asset sale from Sales Invoice splits assets and posts depreciation consequences in the same submit.
5. Common-party accounting (`process_common_party_accounting`) is the in-product admission that Customer and Supplier can be the same organization.
6. Inter-company links pair documents rather than modeling one economic event seen by two entities.

## Module inventory (source artifact)

Top-level `erpnext/` directories on SHA `1212a278`. Useful for navigation, not ontology.

accounts, assets, buying, crm, manufacturing, projects, quality_management, selling, stock, subcontracting, support, maintenance, regional, plus controllers, patches, setup.

HR transactions are not in that tree. They are in `frappe/hrms`.
