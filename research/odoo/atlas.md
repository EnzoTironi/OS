# Odoo domain atlas

**Status.** Partial map of Community 18.0 domains.  
**Decision.** none.  
**How to use.** Each section names the real-world distinction first, then where Odoo encodes it, then what is likely a source artifact.

Do not copy the model list into an ontology.

Pinned source is Odoo `18.0` SHA `bca6e5d13118fc2dff99d7b81bd49860e743132a` unless a card says otherwise.

## A-PARTY. One partner, many commercial roles

**Kinds.** domain-evidence, source-system artifact  
**Decision.** supported that Odoo uses one partner record for customers and suppliers. undetermined whether Party plus Role is the domain law.

**Real-world distinction.** The same legal person can buy, sell, be invoiced, receive goods, or hold consigned stock.

**Where it lives.** `sale.order.partner_id`, `purchase.order.partner_id`, and `account.move.partner_id` all point at `res.partner`. `stock.quant.owner_id` is also a partner. That last field is how consignment or customer-owned stock is kept off company ownership without a second product.

**Source artifact.** Customer and supplier are ranks and accounting flags on one address book row, not separate kinds.

**Candidate law.** Commercial role is not the same as organizational identity.

**Runtime consequence.** A model that freezes "Customer" as a kind will fight Odoo evidence and REA-style role evidence. Cross-check issue 14 before promoting either encoding.

**Cross-link.** Disagreement `D-05`. `docs/open-questions.md` section 12.

## A-LIFECYCLE. Each document family has its own state machine

**Kinds.** source-system artifact, domain-evidence  
**Decision.** supported inside Odoo. rejected as a hidden universal `docstatus`. undetermined as an OS law.

**Real-world distinction.** A draft can change. A sent offer is still an offer. A confirmed commitment has consequences. A posted journal has fiscal consequences. A completed goods movement has physical consequences. Those are not one ladder.

**Where it lives.**

| Model | Stored or computed | Values seen on the pin |
| --- | --- | --- |
| `sale.order` | stored | `draft` Quotation, `sent` Quotation Sent, `sale` Sales Order, `cancel` |
| `purchase.order` | stored | `draft` RFQ, `sent` RFQ Sent, `to approve`, `purchase`, `done` Locked, `cancel` |
| `account.move` | stored | `draft`, `posted`, `cancel` |
| `stock.move` | stored | `draft`, `waiting`, `confirmed`, `partially_available`, `assigned`, `done`, `cancel` |
| `mrp.production` | computed, stored | `draft`, `confirmed`, `progress`, `to_close`, `done`, `cancel` |
| `mrp.workorder` | computed, stored | `pending`, `waiting`, `ready`, `progress`, `done`, `cancel` |
| `crm.lead` | stored type plus stage | `lead` or `opportunity`, plus `crm.stage` |
| `project.task` | computed state plus stage | stage plus `01_in_progress`, `02_changes_requested`, `03_approved`, waiting, closed |
| `maintenance.request` | stage | `maintenance.stage.done` marks completion |

Sales order also has `locked`. Purchase order uses `done` to mean locked. Account move has `posted_before` even after a return to draft.

**Source artifact.** There is no framework-wide submit integer. Modules invent parallel `invoice_status`, `reservation_state`, `payment_state`, and `kanban_state`.

**Candidate law.** Offer, commitment, execution, and posted fiscal fact are different phases. One integer cannot carry all four.

**Counterexample.** `sale.order.action_draft` writes cancelled or sent orders back to `draft`. `account.move.button_draft` writes posted or cancelled entries back to `draft`. Those paths treat "posted" as reversible record state.

**Runtime consequence.** Surfaces must not assume one lifecycle for every operational object.

**Cross-link.** Edge `EC-ACC-01`, `EC-SELL-02`. Disagreement `D-01`.

## A-SELL. Order to cash

**Kinds.** domain-evidence  
**Decision.** hypothesis

**Distinctions Odoo actually enforces.**

- Quotation and sales order are the same record. `SALE_ORDER_STATE` in `sale_order.py` labels `draft` as Quotation and `sale` as Sales Order.
- `date_order` is creation time while draft or sent, and confirmation time after confirm. The help text says so. Requested, promised, and actual delivery are not that field. Promised delivery is `commitment_date`.
- Confirm (`action_confirm`) creates downstream stock work and can lock the order (`_should_be_locked`, `action_lock`).
- A locked order cannot be cancelled until unlocked. The error is explicit in `action_cancel`.
- Billing progress is a second field, `invoice_status`, computed from lines. Values include `to invoice`, `invoiced`, `upselling`, and `no`.
- Invoices are `account.move` rows with `move_type` `out_invoice` or `out_refund`, not a sales document type.

**Source artifacts.** Upselling as an invoice status. Catalog-driven line edits. Quotation sent as a state rather than an event.

**Map, not types.** Offer, commitment, lock, reservation, delivery event, invoice or claim, payment, credit note.

**Cross-link.** Official credit-note doc. Invariant `INV-SELL-01`. Disagreement `D-03`.

## A-BUY. Procure to pay

**Kinds.** domain-evidence  
**Decision.** hypothesis

**Distinctions.**

- RFQ and purchase order are the same record. States include approval (`to approve`) before `purchase`.
- `invoice_status` is `no`, `to invoice` (Waiting Bills), or `invoiced` (Fully Billed).
- Vendor bills are `account.move` with `move_type` `in_invoice` or `in_refund`.
- Receipts are stock pickings, not purchase documents. Three-way match is implied by ordered, received, and billed quantities. This pass did not read the match widget in full. Match semantics stay `undetermined`.

**Candidate law.** Supplier commitment, receipt of goods, and recognition of a payable are different facts.

**Cross-link.** Disagreement `D-06`.

## A-STOCK. Inventory as move, line, and quant

**Kinds.** domain-evidence, candidate law  
**Decision.** supported that Odoo splits intention, reservation slice, and current quantity. hypothesis that a mutable quant is the domain law.

**Masters.** `product.product`, `stock.location`, `stock.warehouse`, `stock.lot`, `stock.quant.package`, `uom.uom`.

**Location usage.** Internal, transit, supplier, customer, inventory, production, and view locations appear in lot and move logic. Official two-step receipt docs move vendor to input, then input to stock.

**Movements.**

- `stock.move` is the quantity change between `location_id` and `location_dest_id`. Help text on `state` says New is created but not confirmed, Waiting Another Move is blocked on a linked move, Waiting Availability is confirmed but unreservable, Available is reserved, Done is transferred.
- `stock.picking` groups moves for a warehouse operation type such as receipt, pick, pack, or delivery.
- `stock.move.line` is the detailed operation. On Community 19.0 the line calls `stock.quant._update_reserved_quantity`. PR [103624](https://github.com/odoo/odoo/pull/103624) records the 16.0-era decision that the line, not the move, owns reservation writes.

**Current quantity.**

- `stock.quant` holds `quantity` and `reserved_quantity`.
- `available_quantity` is computed as quantity minus reserved quantity.
- Gather key listed in `_get_inventory_fields` style grouping is product, location, lot, package, owner.
- Users are told they cannot duplicate quants. Direct create and write are restricted outside inventory mode.

**Source artifacts.** `picked` on a move is documented as indicative and not a validation. Forecasted quantity on the move is a computed helper. Multi-step routes are warehouse configuration.

**Candidate law.** Intended movement, reserved identity, and on-hand quantity can diverge and must be separately addressable.

**Cross-link.** Invariants `INV-STOCK-*`. Disagreement `D-02`, `D-06`.

## A-RESERVE. Reservation is quantity on a quant

**Kinds.** domain-evidence, source-system artifact  
**Decision.** supported as Odoo behavior. hypothesis as an OS encoding.

**Where it lives.** `_action_assign` on `stock.move` creates or updates move lines. Those lines reserve on quants. `_do_unreserve` is refused when the move is done. Unreserving more than `reserved_quantity` raises "It is not possible to unreserve more products of … than you have in stock."

Reservation timing can follow the picking type. `reservation_date` is computed from `reservation_method` and days-before settings.

Manufacturing has a second readiness field, `reservation_state` on `mrp.production`, computed from component moves. Values are Waiting, Ready, and Waiting Another Operation.

**Source artifact.** There is no submitted reservation document in the Community stock module inspected here.

**Candidate law.** Reservation is a temporary claim on identity-bearing stock. It is not on-hand and not a delivery.

**Counterexample.** Incoming moves from supplier locations can assign without consuming internal reserved stock. Negative stock can be allowed when `allow_negative` is passed into `_get_available_quantity`.

**Cross-link.** Edge `EC-RES-01`. Disagreement `D-04`. `docs/open-questions.md` section 12.

## A-IDENTITY. Lots and serials

**Kinds.** domain-evidence  
**Decision.** supported that identity-bearing stock is not interchangeable quantity. undetermined how OS should type identity.

**Where it lives.**

- Product tracking is none, lot, or serial. Official serial-number docs require the traceability setting and per-operation-type permission to create or use numbers.
- `stock.lot` is one model for lots and serials. `_check_unique_lot` requires the combination of product and name to be unique inside a company, including when company is empty.
- Changing `product_id` on a lot is refused if move lines already exist.
- Manufacturing of a serial-tracked product forces `qty_producing` to 1. Official manufacturing docs say assigning serials splits one MO into one MO per unit.
- Operation type `use_create_lots` gates lot creation from a picking (`stock.lot._check_create`).

**Source artifact.** One table for lot and serial, distinguished by product tracking.

**Cross-link.** Official manufacture-with-lots doc. Invariant `INV-ID-01`. Edge `EC-MFG-01`. Scenario pressure for S-008 if that scenario exists in-repo.

## A-VALUATION. Quantity event is not the cost layer

**Kinds.** domain-evidence  
**Decision.** supported inside Odoo when automatic valuation is on. hypothesis as an OS split.

**Where it lives.** `stock.valuation.layer` is readonly on quantity, unit cost, value, remaining quantity, and remaining value. It points at `stock.move` and optionally `account.move`. `_validate_accounting_entries` posts journal entries only when the product valuation is real-time and the layer value is not currency-zero.

Official automatic-valuation docs say a new stock move layer generates a journal entry, and that periodic valuation leaves accounting to a later manual post.

**Source artifact.** Valuation method hangs on product category. Anglo-Saxon versus continental is a company flag consumed when reconciling invoice lines to valuation.

**Candidate law.** Physical quantity change, remaining cost layer, and posted accounting effect are three facts. They can fail independently.

**Cross-link.** Disagreement `D-12`. Official using-inventory-valuation doc.

## A-ACC. Unified journal entry

**Kinds.** domain-evidence, source-system artifact  
**Decision.** supported that Odoo posts invoices as journal entries. undetermined whether that collapse is domain-correct.

**Where it lives.** `account.move.move_type` is `entry`, `out_invoice`, `out_refund`, `in_invoice`, `in_refund`, `out_receipt`, or `in_receipt`. One balance check, `_check_balanced`, sums debit and credit per move and raises when the rounded balance is not zero.

Posting is `action_post` then `_post`. Creating a row already in `posted` is refused. Posted name plus journal is unique while name is not `/`. Fiscal lock dates block add or modify on or before the lock. `button_draft` returns posted or cancelled moves to draft unless a cancel request, inalterable hash, exchange-difference, or cash-basis entry blocks it. `button_cancel` on a posted move first resets to draft, then cancels.

Official credit-note docs say a credit or debit note is the legal method to cancel, refund, or modify a validated invoice, and that the credit note generates a reverse entry.

**Source artifacts.** Sequence gaps (`made_sequence_gap`, `posted_before`). Hash-locked entries. Abnormal-amount wizard.

**Candidate law.** A posted balanced journal is a fiscal fact. Correcting it is a later reverse or a governed amendment, not a silent line edit.

**Counterexample.** Reset-to-draft is a first-class button. That is the opposite of ERPNext's default cancel-and-reverse ledger story.

**Cross-link.** Invariants `INV-ACC-*`. Disagreement `D-01`, `D-03`, `D-10`.

## A-MFG. Specification, authorization, and operation execution

**Kinds.** domain-evidence  
**Decision.** hypothesis

**Distinctions.**

- `mrp.bom` type is `normal` (manufacture this product) or `phantom` (kit). Kit BOMs explode into delivery moves instead of a manufacturing order. Subcontracting is a later addon, not a third BOM type on this file.
- `mrp.production` is the manufacturing order. Help text: Draft is unconfirmed. Confirmed triggers stock rules and component reordering. In Progress means production started on the MO or a work order. To Close means production is done and the MO must be closed. Done means the MO is closed and stock moves are posted. Cancelled cannot be confirmed again.
- That `state` is computed. So is `reservation_state`.
- Constraints: name unique per company, `product_qty > 0`.
- `mrp.workorder` is one operation at a work center. States include waiting for another work order, waiting for components, ready, in progress, finished. `button_start` and `button_finish` are the execution actions. Quantity producing is synced from the manufacturing order.
- `button_unbuild` opens an unbuild wizard from a done MO.
- Partial output creates a backorder MO. Official manufacturing-backorder docs describe `WH/MO/XXXXX-001` closed and `-002` leftover.

**Source artifacts.** Shop Floor is a separate UI. Work order duration fields. Procurement group used to count child MOs.

**Candidate law.** Product specification, authorized production, and operation execution are different objects. Kit explosion is a specification kind that skips authorization-to-produce.

**Cross-link.** `docs/open-questions.md` section 14. Disagreement `D-07`.

## A-CRM. Lead and opportunity share a record

**Kinds.** source-system artifact, domain-evidence  
**Decision.** supported as Odoo behavior. undetermined as domain law.

**Where it lives.** `crm.lead.type` is `lead` or `opportunity`. Default depends on the "use leads" group. Pipeline position is `stage_id`. Probability is constrained to 0 through 100. Expected revenue times probability becomes prorated revenue.

**Source artifact.** One model, a type flag, and team-scoped stages. Conversion is a field change, not a new identity.

**Cross-link.** Disagreement `D-09`.

## A-PROJECT. Stage is not the same as state

**Kinds.** domain-evidence  
**Decision.** hypothesis

**Where it lives.** `project.task.stage_id` is a project-specific kanban column (`project.task.type`). `state` is a computed stored selection with in progress, changes requested, approved, waiting, and closed values. Personal stages exist per user and do not replace the project stage.

**Source artifact.** Number-prefixed selection keys such as `01_in_progress`.

**Candidate law.** Workflow column and completion state can differ. A task can sit in a column while its state is waiting or closed.

## A-HR. Employee is a person record, not a payroll engine

**Kinds.** domain-evidence  
**Decision.** undetermined for payroll and contract law. supported that Community HR starts from `hr.employee` as a person linked to user and resource.

**Where it lives.** This pass did not finish `hr_employee.py`. Community also ships attendance, time off, recruitment, and expenses as separate addons. Payslip logic is commonly Enterprise or a separate localization. Do not infer payroll invariants from this atlas.

**Follow-up.** Read `addons/hr/models/hr_employee.py` and `hr_holidays` next pass.

## A-MAINT. Maintenance request completion is a stage flag

**Kinds.** domain-evidence  
**Decision.** hypothesis

**Where it lives.** `maintenance.request.stage_id` points at `maintenance.stage`. `done` is related from the stage. Writing a done stage sets `close_date`. Writing a not-done stage clears `close_date`. Recurring requests copy to a new request when a done stage is reached. Equipment tracks open corrective requests.

**Source artifact.** Kanban state `normal`, `blocked`, `done` sits beside stage.

**Candidate law.** An asset maintenance intervention has a lifecycle that is not a stock move and not a journal.

## A-QUALITY. Community gap

**Kinds.** source-system artifact  
**Decision.** undetermined

`addons/quality/models/quality.py` returned HTTP 404 on Community `18.0`. Quality checks, control points, and alerts were not inspected. Official Quality docs exist for the commercial app and were not treated as Community evidence.

ERPNext Quality Inspection lives in Stock and was not re-mined here. Disagreement `D-11` records the gap only.

## A-ROUTE. Multi-step custody is configuration

**Kinds.** domain-evidence, source-system artifact  
**Decision.** hypothesis

Official two-step delivery moves stock to an output location, then to the customer, using two pickings. That is custody change inside the warehouse, not a second sales order. Dropship and make-to-order are stock rules on routes. This pass did not read `stock.rule` in full.

**Candidate law.** Planned internal custody steps are not the same as the customer delivery event.

**Cross-link.** Disagreement `D-08`.
