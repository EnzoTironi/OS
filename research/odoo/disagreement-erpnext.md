# First ERPNext and Odoo disagreement report

**Status.** First pass. Architecture-driven splits first, then leftover domain questions.  
**Decision.** none. Disagreement is a research question, not a vote.  
**Pins.** Odoo Community `18.0` SHA `bca6e5d13118fc2dff99d7b81bd49860e743132a`. ERPNext `version-15` SHA `d707cb1e0e808fa6699d29a2bbaf9310983e94ac`. Frappe `version-15` SHA `9b8d265b27a1dfb11c7aef21a533a127e14a0a5a`.

ERPNext file-level citations below follow public docs and the issue 32 corpus notes on branch `cursor/issue-32-corpus-cfd8`. Those notes were read, not copied into this branch.

## How to read a card

Each card states the real-world question, what each source does, whether the split looks like domain disagreement or product architecture, a candidate law, a counterexample, and runtime pressure. Decision state is never `accepted`.

## Convergence that survived this pass

These are not OS laws. They are the same distinction appearing in both products.

| ID | Distinction | Odoo | ERPNext | Decision |
| --- | --- | --- | --- | --- |
| C-01 | Offer versus commitment versus goods event versus claim versus payment | Quotation state, `sale` state, stock picking, `account.move` invoice, payment reconcile | Quotation, Sales Order, Delivery Note, Sales Invoice, Payment Entry | hypothesis |
| C-02 | On-hand versus reserved | `quant.quantity` versus `reserved_quantity` | Bin actual versus reserved, plus Stock Reservation Entry | hypothesis |
| C-03 | Interchangeable qty versus lot or serial identity | `stock.lot` plus product tracking | Serial No, Batch, Serial and Batch Bundle | supported as a shared distinction |
| C-04 | Balanced journal | `_check_balanced` | `process_debit_credit_difference` | supported inside both sources |
| C-05 | Specification versus authorized production versus operation execution | BOM, manufacturing order, work order | BOM, Work Order, Job Card | hypothesis |
| C-06 | Partial fulfillment leaves leftover demand | Backorder picking or MO | Partial DN or SI, `per_delivered` | hypothesis |
| C-07 | Completed stock is reversed, not undone | Return move | Return document with `is_return`, cancel adds reverse SLE | hypothesis |
| C-08 | Recount becomes an adjustment movement | Inventory quantity on quant creates a move | Stock Reconciliation writes SLE | hypothesis |

`C-01` matches the official ERPNext table in [How transactions affect the ledger](https://docs.frappe.io/erpnext/how-transactions-affect-the-ledger) and Odoo's split between `sale.order` and `account.move` plus pickings. That is the strongest cross-source commercial chain seen in this pass.

## D-01. May a posted fiscal document return to draft?

**Kinds.** domain-evidence, source-system artifact, counterexample  
**Decision.** supported that the products disagree. undetermined which encoding is the domain law.

**Question.** After a journal or invoice is posted, can the same record become an editable draft again?

**Odoo.** Yes, often. `account.move.button_draft` writes `posted` or `cancel` back to `draft`, with hash-lock and government-cancel exceptions. `posted_before` remembers that a number was issued.

**ERPNext.** No on the normal path. Frappe `check_docstatus_transition` refuses Submitted to Draft. Cancel is `docstatus` 2. Official [immutable ledger](https://docs.frappe.io/erpnext/immutable-ledger-in-erpnext) describes reverse ledger rows rather than unposting.

**Why this looks architectural.** Odoo treats the journal row as a mutable document with a state field. ERPNext treats submit as a one-way framework act and makes correction a new ledger fact. Both still know that fiscal periods can close. Odoo lock dates and ERPNext posting-date plus immutable-ledger setting are the shared domain pressure.

**Candidate law.** A posted fiscal fact remains queryable. Correction is a later act. Whether the original row may be reused is a product choice.

**Counterexample.** Odoo official credit-note docs tell users to reverse, not to unpost. The product ships both stories.

**Runtime consequence.** OS cannot inherit "reset to draft" from Odoo or "never unpost" from ERPNext without saying which jurisdictions and audit trails it must survive.

**Open question.** `docs/open-questions.md` sections 5 and 6 stay undetermined.

## D-02. Is current stock a mutable row or a projection of a ledger?

**Kinds.** domain-evidence, source-system artifact  
**Decision.** supported that the products disagree on the store. hypothesis that the domain still wants an explainable quantity.

**Question.** What makes an on-hand quantity trustworthy?

**Odoo.** `stock.quant` is the current quantity. Done moves update it. Valuation history is a second table, `stock.valuation.layer`. Users are blocked from casual CRUD on quants, and adjustments still create moves.

**ERPNext.** Stock Ledger Entry is the movement fact. Cancel of an individual SLE is refused. Bin is a cache of reserved, actual, and ordered qty. `stock_ledger_invariant_check.py` exists because stored projections drift. Backdated posts can enqueue repost jobs.

**Why this looks architectural.** Both create a movement when stock changes. Odoo optimizes current qty as the document. ERPNext optimizes the append-only ledger as the document. Thesis line "current state as an explainable consequence" is closer to the ERPNext story and to Odoo's adjustment-creates-a-move story, not to treating the quant as a primitive.

**Candidate law.** On-hand quantity must be explainable from movements, ownership, and identity. The physical table can be a cache.

**Counterexample.** Odoo reservation bugs (edge `EC-RES-01`) and ERPNext invariant-check diffs both show caches lying.

**Runtime consequence.** If OS stores only a mutable balance, it must still answer why the balance is that number. If it stores only events, it must still present on-hand quickly. That is runtime pressure, not a primitive.

**Open question.** `docs/open-questions.md` section 6.

## D-03. Is an invoice a journal, or a commercial document that writes a journal?

**Kinds.** source-system artifact  
**Decision.** supported that the schemas disagree. undetermined as domain law.

**Question.** Does customer billing have identity apart from the accounting entry?

**Odoo.** `account.move` with `move_type` `out_invoice` is the invoice. Lines are `account.move.line`. The same model is a miscellaneous entry when `move_type` is `entry`.

**ERPNext.** Sales Invoice is a selling or accounts document. It writes GL Entry rows. Journal Entry is a different DocType. Payment Entry is another.

**Why this looks architectural.** Odoo 13+ unified invoices into the journal for implementation simplicity. ERPNext keeps a commercial document that can also update stock. Official ERPNext docs even warn that a stock-updating Sales Invoice skips some order-status fields.

**Candidate law.** The legal claim on a customer and the balanced journal that recognizes it are related facts. They may share a surface. They should not be assumed to be one type.

**Counterexample.** A proforma or draft invoice is a claim-shaped document with no journal. Odoo drafts are `account.move` in `draft`. ERPNext drafts are `docstatus` 0.

**Runtime consequence.** Do not put `if objectType == "SalesInvoice"` in a generic engine. Also do not assume `JournalEntry` is the only billing type because Odoo collapsed them.

**Open question.** `docs/open-questions.md` section 13.

## D-04. Is reservation a document or a quantity field?

**Kinds.** domain-evidence, source-system artifact  
**Decision.** supported that encodings disagree. hypothesis that reservation is still a relator with lifecycle.

**Question.** What kind of thing is a reservation?

**Odoo.** `reserved_quantity` on `stock.quant`, written by `stock.move.line`. Lifecycle is the parent move's state. No Community reservation DocType was found on this pass.

**ERPNext.** Stock Reservation Entry is a submitted document with statuses Draft, Partially Reserved, Reserved, Partially Delivered, Delivered, Closed, Cancelled. It cannot be amended. Tests refuse delivering reserved stock against a different Sales Order.

**Why this looks mixed.** The domain pressure is the same. Reserved stock is not free. The encoding is not. ERPNext elevated a failure mode, stealing reserved stock, into a document. Odoo kept a field and then had to fix dual-write bugs.

**Candidate law.** Reservation is a temporary exclusive claim on quantity or identity, tied to a purpose such as a sales order or a manufacturing order. It has lifecycle. It is not on-hand.

**Counterexample.** Odoo incoming supplier moves assign without reserving internal stock. ERPNext has a second production-reservation path on Work Order besides SRE. Both products already have two mechanisms.

**Runtime consequence.** A single reserved-qty integer will not express purpose, identity, or partial delivery. A document per reservation may be heavier than some warehouse flows need.

**Open question.** `docs/open-questions.md` section 12.

## D-05. Is Customer a kind or a role?

**Kinds.** domain-evidence, source-system artifact  
**Decision.** supported that encodings disagree. undetermined as domain law.

**Question.** Is the buyer a kind of party or a role on a party?

**Odoo.** `res.partner` is the record. Sales, purchase, and accounting point at it. Owner of a quant is a partner.

**ERPNext.** Customer and Supplier are master DocTypes. Issue 32 notes credit limit per Customer plus Company, and a `customer` field leaking onto Purchase Order for drop-ship.

**Why this looks architectural.** ERPNext grew selling and buying as separate modules with separate masters. Odoo grew a shared address book. REA-style models treat roles as relationships. That third family was not mined in this pass.

**Candidate law.** The legal person and the commercial role can differ. Consignment `owner_id` is evidence that ownership role appears on stock, not only on a Customer master.

**Runtime consequence.** Do not freeze Customer as an ObjectType solely because ERPNext has that DocType.

## D-06. Are stock events purpose-specific documents or one move model?

**Kinds.** source-system artifact  
**Decision.** supported that encodings disagree. hypothesis that purpose still matters.

**Question.** Is a receipt a different kind of event from a delivery, a manufacture consume, or an adjustment?

**Odoo.** Almost everything is `stock.move` plus a `stock.picking` operation type. Location usage and picking type carry purpose.

**ERPNext.** Delivery Note, Purchase Receipt, Stock Entry, Stock Reconciliation, and stock-updating invoices are different DocTypes. Each writes SLE.

**Why this looks architectural.** Odoo generalized the movement and specialized the operation type. ERPNext specialized the voucher and generalized the ledger row. Users still think in receipt versus delivery.

**Candidate law.** Purpose, from-location, to-location, ownership change, and valuation effect are independent properties of a movement. A single model can hold them. A family of documents can hold them. Neither choice proves the ontology type.

**Runtime consequence.** Engine branches on `DeliveryNote` or `stock.picking` would be domain leakage.

## D-07. What is a Work Order?

**Kinds.** domain-evidence, source-system artifact  
**Decision.** supported that the same English words name different objects. undetermined for OS.

**Question.** Is a Work Order an authorization to produce, or the execution of one operation?

**Odoo.** `mrp.production` is the manufacturing order, the authorization and plan. `mrp.workorder` is the operation execution at a work center. Official docs and field help use those meanings.

**ERPNext.** Work Order is the authorization to produce. Job Card is the execution at a workstation. Production Plan sits above. Issue 32 atlas `A-MFG` records that split.

**Why this looks like naming, not domain.** The three-way split specification, authorization, execution appears in both. The label "Work Order" moved. ISA-95 was not mined in this pass.

**Candidate law.** Do not treat the string Work Order as a stable concept. Keep specification, authorization, and execution distinct until a standard collapses them.

**Open question.** `docs/open-questions.md` section 14 remains undetermined. This card only shows two ERPs already split authorization from execution.

## D-08. Warehouse versus location tree plus routes

**Kinds.** source-system artifact  
**Decision.** hypothesis

**Question.** Is a warehouse a leaf place, or a configuration of locations and steps?

**Odoo.** `stock.warehouse` owns lots of locations and picking types. Multi-step routes create extra locations such as Input and Output. Official two-step receipt docs describe vendor to input to stock.

**ERPNext.** Warehouse is the usual posting place. Group warehouses cannot be reserved or posted against as a leaf. Issue 32 records that restriction.

**Why this looks architectural.** Odoo encodes internal custody steps as extra locations. ERPNext often encodes them as additional warehouses or as a Pick List plus Delivery Note. The domain is still "stock can sit in a place that is not yet the customer's place."

**Candidate law.** Custody location, ownership, and warehouse-as-organization-unit are different. Routes are plans over custody locations.

## D-09. Lead, opportunity, and customer identity

**Kinds.** source-system artifact  
**Decision.** supported that encodings disagree.

**Question.** When a pursuit becomes a customer, is that a new identity?

**Odoo.** `crm.lead` holds both lead and opportunity. Partner is a related customer record. Type can flip on the same id.

**ERPNext.** Lead, Opportunity, and Customer are separate DocTypes.

**Why this looks architectural.** CRM product history, not a discovered law about persons.

**Candidate law.** A pursuit has phases. A legal customer has identity. Mapping them onto one or three tables does not decide the ontology.

## D-10. How is cancel encoded on ledgers?

**Kinds.** domain-evidence, source-system artifact  
**Decision.** supported that encodings disagree.

**Question.** After cancel, what remains in the ledger?

**Odoo stock.** Done moves stay done. A return creates opposite moves. Incomplete moves unreserve and become `cancel`.

**Odoo accounting.** Either reset to draft, or post a reverse `account.move` such as a credit note.

**ERPNext.** Default cancel flags originals and reverses `is_cancelled = 1`. Optional immutable ledger keeps originals and posts reverse rows dated today. Leave Ledger deletes rows. Payment Ledger uses `delinked`. Issue 32 `INV-LEDGER-02` already recorded those three encodings.

**Candidate law.** There is no single cancel semantic across these two products, and ERPNext does not have one cancel semantic inside itself.

**Runtime consequence.** If OS claims one cancel law, it must say which of these encodings it rejects. Averaging them is not a law.

## D-11. Quality

**Kinds.** source-system artifact  
**Decision.** undetermined

**Question.** Is a quality inspection a stock gate, a manufacturing operation, or a separate control process?

**Odoo Community.** Quality models were not in the inspected tree.

**ERPNext.** Quality Inspection is a Stock DocType referenced from stock transactions and Job Card. A broader Quality Management module also exists.

**Follow-up.** Do not synthesize a quality primitive from this pair until Community or Enterprise quality source is read, and until ISA-95 or ISO quality models are cited.

## D-12. Where remaining value lives

**Kinds.** source-system artifact  
**Decision.** hypothesis

**Question.** After a partial outbound, where is the leftover FIFO or AVCO value stored?

**Odoo.** `stock.valuation.layer.remaining_qty` and `remaining_value`. Layers link to later layers. Official lot-valuation docs group the valuation report by lot.

**ERPNext.** SLE stores `qty_after_transaction`, valuation rate, and stock value. Batch can carry `use_batchwise_valuation`. Invariant-check recomputes FIFO value.

**Why this looks architectural.** Both keep a stored running valuation because recomputing from every historical row is expensive. Both then grow repair tools when the store drifts.

**Candidate law.** Remaining valued quantity is a projection with an invariant. Storing it does not make it a base fact.

**Runtime consequence.** Issue 58, specialized kernels, should treat this as pressure for deterministic valuation functions, not as proof that a stock kernel must be a separate language.

## Architecture versus domain, first cut

Likely architecture or product history:

- reset-to-draft on `account.move`
- unified invoice and journal model
- unified lead and opportunity model
- unified quotation and order model
- reservation as a field versus a DocType
- the English name Work Order
- Quality missing from Community

Likely domain, pending more corpora:

- offer, commitment, goods event, claim, payment
- on-hand versus reserved
- lot and serial identity
- balanced journal
- authorization versus operation execution
- partial leftover demand
- reverse of completed stock
- period lock

## What this report does not decide

It does not promote RFC-0001 primitives.  
It does not answer `docs/open-questions.md`.  
It does not choose event sourcing.  
It does not choose a storage engine.

## Follow-ups

1. Read `stock.rule`, dropship, and subcontracting on both sides.
2. Read Odoo `account.partial.reconcile` against ERPNext Payment Ledger.
3. Read Community `hr.employee` and ERPNext HRMS only as far as employment-as-relator.
4. If clean-room notes on Enterprise Quality are approved, fill `D-11`.
5. Independent third source, Moqui or ValueFlows, before any card moves from hypothesis to supported as an OS law.
