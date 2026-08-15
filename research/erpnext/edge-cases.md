# Edge-case catalog

**Status.** Partial. Prefer tests, historical PRs, and cancel paths over happy-path manuals.  
**Decision.** per card.

These are the cases a metamodel must survive. Several already exist as OS scenarios.

## EC-LEDGER-01. Two cancel encodings for the same GL

**Kinds.** source-system artifact, counterexample  
**Decision.** supported as ERPNext behavior

Default cancel flags original and reverse `is_cancelled = 1`. Immutable-ledger mode leaves originals visible and posts an active reverse dated today (`general_ledger.py` around the `immutable_ledger_enabled` branch; setting from `Accounts Settings.enable_immutable_ledger`).

**Attacks.** "Cancel always preserves original valid time." Immutable mode re-dates the reverse.  
**Attacks.** "Cancelled rows are always hidden the same way." Depends on the setting.

**OS scenario.** S-010.

## EC-LEDGER-02. Payment Ledger and Leave Ledger do not use `is_cancelled`

**Kinds.** source-system artifact, counterexample  
**Decision.** supported

Payment Ledger Entry has `delinked`. Leave Ledger deletes on cancel of the source document, except expiry rows which may be cancelled directly.

**Attacks.** "The product has one ledger immutability law." It has at least three.

## EC-LEDGER-03. Repost is not cancel

**Kinds.** domain-evidence  
**Decision.** supported

Official docs say Repost Accounting Ledger regenerates entries for a document that remains submitted. Cancel reverses a document that is no longer active. Stock has `Repost Item Valuation` with statuses Queued / In Progress / Skipped. Cancel of the source voucher is blocked while In Progress (`stock_ledger.py` `validate_cancellation`).

**Runtime consequence.** Rebuild-projection and reverse-action are different operations.

## EC-STOCK-01. Backdated movement after a later posting

**Kinds.** domain-evidence, runtime consequence  
**Decision.** supported as a forced problem

[erpnext#18740](https://github.com/frappe/erpnext/pull/18740) originally banned backdates and removed future repost. Current docs (2026-08-14) say controlled repost exists and is expensive. Tests still include `test_back_dated_entry_not_allowed` and several batch-valuation backdate cases.

**OS scenario.** S-007.  
**Open question.** `docs/open-questions.md` §7. ERPNext has posting time and creation time. It does not give a full "what did we believe on date T" API. State: undetermined.

## EC-STOCK-02. Negative stock throws away FIFO layers

**Kinds.** counterexample  
**Decision.** supported

`test_negative_fifo_valuation` in `test_stock_ledger_entry.py`. Comment in the test: when stock goes negative, discard FIFO queue.

**Attacks.** "Valuation is always a function of identifiable receipts."

## EC-STOCK-03. Landed cost after receipt and after a return

**Kinds.** domain-evidence  
**Decision.** supported as a historical complexity site

`test_purchase_return_valuation_reposting` and `test_sales_return_valuation_reposting` cancel in a stack: return, delivery/receipt, landed cost voucher. Incoming and outgoing rates must still match after repost.

**Candidate law.** A valuation adjustment is a later fact about an earlier receipt. It is not an edit of the receipt.

## EC-STOCK-04. Packed items and product bundles

**Kinds.** domain-evidence, source-system artifact  
**Decision.** hypothesis

Sales Order tests cover product bundle material requests and reserved qty with packing lists. SLE tests include `test_reposting_of_sales_return_for_packed_item`.

A commercial line can explode into different stock identities. Whether the bundle is a product, a BOM-like spec, or a UI convenience is undetermined.

## EC-RES-01. Cancel of an inward document that was already reserved outward

**Kinds.** domain-evidence  
**Decision.** supported

`test_consider_reserved_stock_while_cancelling_an_inward_transaction`. You cannot pretend the receipt never happened if a later reservation already claimed that qty.

**OS scenario.** S-010 after a goods receipt.

## EC-RES-02. Reservation cannot be amended; some cannot be updated

**Kinds.** source-system artifact, domain-evidence  
**Decision.** supported

`test_amended_document_is_rejected`. `can_be_updated` blocks Partially Delivered, Delivered, Pick List origin, or any delivered_qty > 0.

**Interpretation.** Once a claim has been consumed, the claim is historical. Create a new claim.

## EC-RES-03. Two reservation subsystems

**Kinds.** source-system artifact  
**Decision.** supported

The sales/stock path uses Stock Reservation Entry. The manufacturing path uses reserved qty for production on Bin, plus optional `WorkOrderStockReservation` when `reserve_stock` is set. Tests `test_reserved_qty_for_production_*` and `test_reserved_qty_for_partial_completion`.

**Attacks.** "Reservation is one concept in this product." The product grew two.

## EC-ID-01. Serial exists before stock exists

**Kinds.** domain-evidence  
**Decision.** supported

Work Order can bulk-insert Serial No rows with status Inactive (`create_serial_no_batch_no`, `test_auto_serial_no_creation`). Identity precedes the manufacture Stock Entry.

**Attacks.** "Serial identity is created by the inward event."

## EC-ID-02. Delivered serial reused on manufacture or repack

**Kinds.** domain-evidence, counterexample  
**Decision.** supported as implemented

`validate_serial_nos_duplicate` special-cases Stock Entry purposes Manufacture and Repack for serials in status Delivered.

**OS scenario.** S-009 rework. Whether this is the same individual returning, or a new individual with a recycled label, is undetermined.

## EC-ID-03. Alternative item on return

**Kinds.** domain-evidence  
**Decision.** supported as a test burden

`test_return_attribution_when_item_doubles_as_alternative` and `test_return_after_consumption_distributes_across_attributions` in `test_work_order.py`.

Substitution breaks naive "return the same item_code that was issued" accounting.

## EC-MFG-01. Partial transfer of only one required item

**Kinds.** domain-evidence  
**Decision.** supported

`test_status_in_process_when_only_one_required_item_transferred` (and the Material Request variant). Work Order status becomes In Process before all components arrive.

**Attacks.** "In Process means all inputs are in WIP."

## EC-MFG-02. Extra material transfer and over-production

**Kinds.** domain-evidence  
**Decision.** supported

`test_extra_material_transfer`, `test_allow_overproduction`, `test_over_production_for_sales_order`, `test_backflush_qty_for_overpduction_manufacture`. Policy-capped overflow, not a new Work Order.

## EC-MFG-03. Process loss versus completed qty

**Kinds.** domain-evidence  
**Decision.** supported

`test_work_order_material_transferred_qty_with_process_loss`. Job Card tracks `process_loss_qty` separately from completed qty and feeds Work Order valuation.

**OS scenario.** S-009 scrap. Scrap is not a silent shrink of completed qty.

## EC-MFG-04. Manufacture blocked until operations complete

**Kinds.** domain-evidence  
**Decision.** supported

`test_manufacture_blocked_until_operations_completed`. A transformation event is illegal while execution objects are unfinished.

**Candidate law.** Authorization plus incomplete execution does not license the output event.

## EC-MFG-05. Disassemble is a later transformation of a manufacture entry

**Kinds.** domain-evidence  
**Decision.** hypothesis

`get_disassembly_available_qty` subtracts already-disassembled FG qty from a source Stock Entry. You cannot disassemble more than was manufactured on that entry.

## EC-PARTIAL-01. Invoice after return and redelivery

**Kinds.** domain-evidence  
**Decision.** supported

`test_make_sales_invoice_after_return_and_redelivery`, `test_make_sales_invoice_after_partial_billing_return_and_redelivery`, `test_so_billed_amount_against_return_entry`.

Remaining billable qty is a function of ordered, delivered, returned, and already billed. It is not "the original qty" and not "a new order".

**OS scenario.** S-002.

## EC-PARTIAL-02. Over-delivery via Sales Invoice Update Stock

**Kinds.** domain-evidence, source-system artifact  
**Decision.** supported

`test_reserved_qty_for_over_delivery_via_sales_invoice`. Billing and delivery collapse. Allowance still applies. Reservation must still release.

## EC-PARTIAL-03. Zero-qty and negative-rate settings

**Kinds.** source-system artifact, domain-evidence  
**Decision.** supported

`test_sales_order_zero_qty`. `test_sales_order_with_negative_rate` and related Selling Settings tests. Negative rate can be allowed. Negative qty on a non-return cannot.

**Interpretation.** Rate sign is a commercial policy. Qty sign is a flow-direction law.

## EC-SELL-01. Submitted Sales Order lines can still change

**Kinds.** source-system artifact, counterexample  
**Decision.** supported

Many `test_update_child_*` tests add, remove, or repriced items after submit, including permission and workflow variants.

**Attacks.** "Submit freezes the commitment." ERPNext treats some commitment edits as update-after-submit, not amend.

**Open question.** `docs/open-questions.md` §4 and §6. State: undetermined whether OS should allow this.

## EC-SELL-02. Closed or on-hold order

**Kinds.** domain-evidence  
**Decision.** supported

`test_sales_order_on_hold`. Closed orders cannot be cancelled until unclosed. Hold blocks downstream posting (`check_sales_order_on_hold_or_close` from Sales Invoice cancel path).

## EC-ACCT-01. Sales Invoice submit is a multi-ledger fan-out

**Kinds.** runtime consequence  
**Decision.** supported

`sales_invoice.py` `on_submit` may write stock bundles, SLE, asset split/depreciation, GL, reservation updates, pick list status, DN/SO billing status, credit limit, JV against-document, timesheets, inter-company link, coupons, loyalty, common-party accounting, subcontract billed qty, subscription refresh.

`on_cancel` walks most of that backward, plus `make_gl_entries_on_cancel` and future SLE/GL repost.

**Runtime consequence.** One Action, many Events, many Effects. `docs/open-questions.md` §5 asks whether that needs a primitive. ERPNext implements it as a procedure. State: undetermined.

## EC-ACCT-02. Return invoice can skip status updater

**Kinds.** source-system artifact  
**Decision.** supported

If `is_return` and not `update_billed_amount_in_sales_order`, `status_updater` is cleared on submit and cancel. Returns do not always rewrite the commitment's billed percent.

## EC-ASSET-01. Cancel walks movements and depreciation journals

**Kinds.** domain-evidence  
**Decision.** supported

`on_cancel` validates, cancels movements, deletes/cancels depreciation entries, cancels schedules, reverse-posts GL. Composite Component assets skip some GL.

**OS scenario.** S-010 in the asset register, not only AR.

## EC-HR-01. Leave ledger is mutable by deletion

**Kinds.** counterexample  
**Decision.** supported

`create_leave_ledger_entry(..., submit=False)` deletes. Expiry rows are the exception that may cancel.

**Attacks.** INV-LEDGER-02 as a universal law.

## EC-HR-02. Employee master is in ERPNext, transactions are in HRMS

**Kinds.** source-system artifact  
**Decision.** supported

`erpnext/setup/doctype/employee` still exists on the ERPNext SHA. Attendance, leave, payroll are in `frappe/hrms`.

**Interpretation.** Person identity leaked into the operational ERP because Job Card, Timesheet, and Expense Claim need a link. That is packaging, not a proof that Employee is an ERP primitive.

## EC-CRM-01. Lost opportunity is not a ledger cancel

**Kinds.** domain-evidence  
**Decision.** hypothesis

`declare_enquiry_lost` records a commercial death. No GL. Useful contrast to invoice cancel.

## EC-QUAL-01. Inspection can be warn-only

**Kinds.** source-system artifact, domain-evidence  
**Decision.** supported

Stock Settings `action_if_quality_inspection_is_not_submitted` and `action_if_quality_inspection_is_rejected` are Stop or warn (`job_card.py` `handle_unsubmitted_inspection` / `handle_rejected_inspection`).

**Attacks.** "A failed inspection is always a hard gate."

## EC-XCUT-01. Direct documents skip operational controls

**Kinds.** domain-evidence  
**Decision.** supported (official docs)

A direct Sales Invoice does not update a Sales Order billed percent. A direct Delivery Note does not update delivered percent. Official docs tell you to choose the short path only when you do not need the omitted milestone.

**Candidate law.** Missing a commitment reference is allowed only as an explicit loss of control, not as the default model.

## EC-XCUT-02. Common party and inter-company pair documents

**Kinds.** domain-evidence  
**Decision.** undetermined as a model, supported as a product feature

`process_common_party_accounting` and `Party Link`. Inter-company fields plus `update_linked_doc` / `unlink_inter_company_doc`.

Scenario S-005 is live in this corpus. ERPNext's answer is "two kinds plus a link", not "one organization with roles". That answer is a source choice, not a closed OS decision.
