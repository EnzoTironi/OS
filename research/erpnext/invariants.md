# Invariant catalog

**Status.** Partial. Each card is one claim ERPNext tries to keep true.  
**Decision.** per card.

Card fields: decision, kinds, claim, evidence, source artifact, counterexample, runtime consequence.

## INV-DOC-01. Posted documents do not return to draft

**Decision.** supported (in Frappe)  
**Kinds.** source-system artifact, candidate law

**Claim.** A submitted document cannot become a draft again.

**Evidence.** `frappe/model/document.py` `check_docstatus_transition` raises on Submitted to Draft and on Draft to Cancelled (normal path). Cancelled documents cannot be edited.

**Source artifact.** `docstatus` integer and `is_submittable` metadata.

**Counterexample.** `discard` sets a draft to Cancelled without submit. `update_after_submit` mutates some fields while staying submitted. Close/Stop change `status` without changing `docstatus`.

**Runtime consequence.** Mutation API must name the operation (submit, cancel, amend, close, update-after-post). Generic "set status=draft" is illegal for posted work.

## INV-DOC-02. Amend replaces a cancelled document, it does not revive it

**Decision.** supported  
**Kinds.** domain-evidence, source-system artifact

**Claim.** A replacement document may exist only if the original is already cancelled. The original remains cancelled.

**Evidence.** `validate_amended_from` requires `amended_from.docstatus == 2`. Official ledger docs: cancel, then create an amended copy.

**Counterexample.** Stock Reservation Entry forbids amend entirely (`validate_amended_doc`, `test_amended_document_is_rejected`). Some corrections use Return documents instead of amend.

**Runtime consequence.** Replacement must point at the cancelled action. History stays queryable.

## INV-DOC-03. Close is not cancel

**Decision.** supported  
**Kinds.** domain-evidence

**Claim.** Closing or stopping an open commitment leaves it submitted. Cancel is a different act and is often refused until the hold is lifted.

**Evidence.** Closed Sales Order cannot be cancelled (`sales_order.py`). Stopped Work Order cannot be cancelled (`work_order.py` `validate_cancel`). `stop_unstop` is a dedicated API.

**Runtime consequence.** "No longer going to fulfill" and "this posted act never should have happened" are different actions.

## INV-DOC-04. Downstream posted work blocks cancel

**Decision.** supported  
**Kinds.** domain-evidence, runtime consequence

**Claim.** You cannot cancel a document while a later submitted (or even draft, in some paths) document still depends on it, unless the later document is cancelled first.

**Evidence.**

- Work Order cancel refused if a submitted Stock Entry exists.
- Job Card cancel refused if produced qty would desync manufacturing entries (`JobCardCancelError`).
- Sales Order cancel refused while draft Sales Invoices still reference it.
- Asset cancel refused while In Maintenance / Out of Order.
- Stock Reservation cancel refused when a Work Order has used a PR-origin reservation.

**Source artifact.** Frappe link validation plus ad hoc `ignore_linked_doctypes` lists (SO cancel ignores GL/SLE/PLE so ledgers are not treated as blockers).

## INV-LEDGER-01. Ledger rows are not independently cancellable

**Decision.** supported  
**Kinds.** domain-evidence, candidate law

**Claim.** A stock or accounting ledger row is a consequence. Users cancel the source voucher.

**Evidence.** `gl_entry.py` and `stock_ledger_entry.py` `on_cancel` both throw "Individual … Entry cannot be cancelled. Please cancel related transaction." Official docs: do not delete GL/SLE through the database or API.

**Runtime consequence.** No CRUD surface on ledger facts.

## INV-LEDGER-02. Cancel of a posted voucher adds compensating ledger facts

**Decision.** supported  
**Kinds.** domain-evidence, candidate law

**Claim.** Cancellation does not delete the original history. It records a reverse effect.

**Evidence.**

- Docs: [Immutable ledger](https://docs.frappe.io/erpnext/immutable-ledger-in-erpnext), [How transactions affect the ledger](https://docs.frappe.io/erpnext/how-transactions-affect-the-ledger).
- `general_ledger.py` builds a swapped debit/credit copy with remarks "On cancellation of …".
- Historical introduction: [erpnext#18740](https://github.com/frappe/erpnext/pull/18740).

**Source artifact.** Two encodings.

1. Default. Originals and reverses get `is_cancelled = 1`. Reports filter `is_cancelled = 0`.
2. `Accounts Settings.enable_immutable_ledger`. Originals are not flagged. Reverse rows stay `is_cancelled = 0` and take `posting_date` of today (or the form posting date).

**Counterexample.** Leave Ledger deletes rows on cancel of application/allocation (`hrms/.../leave_ledger_entry.py` `delete_ledger_entry`). Payment Ledger uses `delinked`.

**Runtime consequence.** If OS claims one cancel semantic, it must say which of these three encodings it rejects.

## INV-LEDGER-03. A GL map is balanced

**Decision.** supported  
**Kinds.** domain-evidence, candidate law

**Claim.** For a voucher, total debit equals total credit within a documented allowance.

**Evidence.** `process_debit_credit_difference`. Difference above allowance raises. Tiny differences become a round-off GL line.

**Counterexample.** Journal Entry of type Exchange Gain Or Loss is exempted from the hard throw.

**Runtime consequence.** Posting is a function with a constraint, matching the thesis example `BalancedJournal`. That example remains a hypothesis for OS. ERPNext supports the constraint inside this source.

## INV-LEDGER-04. Commitment documents do not post stock or GL

**Decision.** supported (ERPNext official)  
**Kinds.** domain-evidence, candidate law

**Claim.** An order or quotation is not a stock movement and not a journal.

**Evidence.** Official commitment-versus-ledger table. Sales Order / Purchase Order `on_submit` update reservations, credit limits, previous-doc status, not `make_gl_entries` (advances are separate Payment Entries).

**Counterexample.** Sales Invoice with Update Stock posts stock and GL together. Direct invoices skip the commitment document and therefore skip `per_delivered` / `per_billed` updates. Official docs warn about this.

**Cross-link.** `docs/constitution.md` §8. `docs/open-questions.md` §13.

## INV-STOCK-01. Quantity after a movement equals prior quantity plus actual qty

**Decision.** supported as the intended invariant. undetermined as always-held, because the product ships a drift detector.

**Kinds.** domain-evidence, runtime consequence

**Claim.** For a given Item+Warehouse (and dimension/batch when used), `qty_after_transaction` is the running sum of non-cancelled `actual_qty` in posting-datetime order.

**Evidence.** `stock_ledger_invariant_check.py` sets `expected_qty_after_transaction` and `difference_in_qty`. It also compares valuation rate to `stock_value / qty` and to a reconstructed FIFO queue.

**Source artifact.** The running qty is stored on each SLE, not only derived at read time. Bin is a second stored projection.

**Counterexample.** The report's existence, plus `create_reposting_entries`, is evidence the invariant is violated in production and then repaired.

**Runtime consequence.** Either derive on read, or treat drift as a defect with a rebuild. Do not let users edit the projection.

## INV-STOCK-02. Posting datetime order is part of valuation truth

**Decision.** supported  
**Kinds.** domain-evidence, runtime consequence

**Claim.** Inserting a movement earlier than an existing one can change later FIFO layers, moving-average rates, and COGS.

**Evidence.** Immutable-ledger docs (FIFO and moving average). `test_back_dated_entry_not_allowed`, `test_batch_wise_valuation_across_warehouse`, `test_intermediate_average_batch_wise_valuation`, `test_item_cost_reposting`. `BackDatedStockTransaction` in `stock_ledger_entry.py`.

**Source artifact.** `Repost Item Valuation` job and per-(item, warehouse) advisory gate (`test_stock_write_takes_sle_advisory_gate`).

**Cross-link.** Scenario S-007. `docs/open-questions.md` §7.

## INV-STOCK-03. Negative stock is a policy, not a silent wrap

**Decision.** supported  
**Kinds.** domain-evidence, counterexample

**Claim.** A movement that would take a dimensioned balance below zero is rejected unless policy allows it.

**Evidence.** `validate_inventory_dimension_negative_stock`. Item `allow_negative_stock`.

**Counterexample.** `test_negative_fifo_valuation` documents that when stock goes negative, the FIFO queue is discarded. Valuation then stops being layer-faithful.

**Candidate law under attack.** "Inventory value is always a function of identifiable layers." ERPNext itself drops that law under negative stock.

## INV-RES-01. Reserved qty is not available qty

**Decision.** supported  
**Kinds.** domain-evidence, candidate law

**Claim.** A reservation reduces what others may consume without changing on-hand possession.

**Evidence.** `test_cant_consume_reserved_stock`. `test_get_available_qty_to_reserve`. `validate_with_allowed_qty` uses `get_available_qty_to_reserve`. Status is a function of reserved vs delivered vs voucher qty.

**Runtime consequence.** Available-to-promise is a query over reservations plus stock, not a field on Item.

## INV-RES-02. Identity-bearing reservations are exclusive per commitment

**Decision.** supported (inside ERPNext tests)  
**Kinds.** domain-evidence, candidate law

**Claim.** A serial or a reserved batch slice cannot be delivered against a different Sales Order than the one that reserved it, unless first unreserved.

**Evidence.** `test_reserved_stock_cannot_be_delivered_against_a_different_sales_order`. `test_delivery_draining_a_batch_reserved_for_another_sales_order_is_blocked`. `test_stock_can_be_unreserved_and_reserved_against_another_sales_order`.

**Counterexample.** `test_batch_shared_across_sales_orders_can_be_delivered` shows a batch can be shared when the remaining unreserved slice is enough. Exclusivity is of the reserved qty, not of the batch identity as a whole.

## INV-ID-01. A serial cannot be inwarded twice while already in a warehouse

**Decision.** supported  
**Kinds.** domain-evidence

**Claim.** Inward of an existing in-warehouse serial is rejected.

**Evidence.** `serial_and_batch_bundle.py` `validate_serial_nos_duplicate` / `SerialNoDuplicateError`.

**Counterexample.** Manufacture/Repack may inward a serial whose status is Delivered. Identity persists across a leave-and-return.

## INV-ID-02. Serial/batch flags on the movement must match the Item

**Decision.** supported  
**Kinds.** source-system artifact, domain-evidence

**Claim.** A movement cannot pretend an item is not serialized if the Item says it is.

**Evidence.** SLE `validate_serial_batch_no_bundle` copies `has_serial_no` / `has_batch_no` from Item when they differ, and then requires a bundle.

## INV-MFG-01. Work Order cancel requires no submitted stock transformations

**Decision.** supported  
**Kinds.** domain-evidence, candidate law

**Claim.** Once materials have moved under a Work Order, the authorization cannot be cancelled out from under those movements.

**Evidence.** `work_order.py` `validate_cancel`. Job Card `validate_produced_quantity` on cancel.

**Runtime consequence.** Reverse the transformations first, or record a different kind of close.

## INV-MFG-02. Job Card completion cannot exceed remaining Work Order qty

**Decision.** supported  
**Kinds.** domain-evidence

**Claim.** Completed qty plus process loss is bounded by the Work Order.

**Evidence.** `validate_produced_quantity`, `validate_job_card_qty`, `validate_completed_qty_matches_for_quantity`, `validate_complete_job_card_qty`. Tests `test_job_card`, `test_partial_manufacture_entries`.

## INV-MFG-03. A BOM used as a specification cannot vanish

**Decision.** supported  
**Kinds.** domain-evidence

**Claim.** Cancel of a BOM is refused when other BOMs still link to it. Cancel also clears `is_active` and `is_default`.

**Evidence.** `bom.py` `on_cancel`, `validate_bom_links`.

**Source artifact.** `is_default` is a convenience pointer, not the specification itself.

## INV-MFG-04. Cost allocation of outputs sums to 100%

**Decision.** supported  
**Kinds.** domain-evidence

**Claim.** Finished good plus secondary items allocate raw-material cost at exactly 100%.

**Evidence.** `validate_total_cost_allocation`.

**Cross-link.** Co-product / by-product. Scenario family in `scenarios/README.md` "Next scenario families".

## INV-PARTIAL-01. Downstream qty cannot exceed upstream qty plus allowance

**Decision.** supported  
**Kinds.** domain-evidence, candidate law

**Claim.** Delivered, received, or billed qty against a previous document may exceed the referenced qty only within item or global allowance.

**Evidence.** `status_updater.py` `validate_qty`, `check_overflow_with_allowance`, `get_allowance_for`. Item `over_delivery_receipt_allowance` / `over_billing_allowance`. Stock Settings and Accounts Settings globals.

**Tests.** `test_reserved_qty_for_over_delivery`, `test_allow_overproduction`, `test_backflush_qty_for_overpduction_manufacture`.

**Runtime consequence.** Partial and over-fulfillment are the same remaining-qty function with a policy cap. They are not new order identities.

## INV-PARTIAL-02. Return qty has the opposite sign of the original flow

**Decision.** supported  
**Kinds.** domain-evidence, source-system artifact

**Claim.** On a non-return document, qty must be positive. On a return document, qty must be negative.

**Evidence.** `status_updater.py` `validate_qty`. `test_sales_order_negative_rate_setting_does_not_allow_negative_quantity`.

**Source artifact.** Encoding returns as signed qty on the same DocType rather than as a distinct event type.

**Counterexample needed.** Independent sources that model Return as a new EconomicEvent without negative qty. See `cross-validation.md` XV-06.

## INV-ACCT-01. Party accounts have a currency

**Decision.** supported  
**Kinds.** domain-evidence

**Claim.** A GL line for a party must use the account's currency.

**Evidence.** `gl_entry.py` `validate_currency`. Skipped when `is_cancelled`.

## INV-ASSET-01. An asset in maintenance is not cancellable

**Decision.** supported  
**Kinds.** domain-evidence

**Claim.** Active maintenance or repair blocks asset cancel.

**Evidence.** `asset.py` `validate_cancellation`.

## INV-HR-01. Leave ledger intervals are well-ordered

**Decision.** supported  
**Kinds.** domain-evidence

**Claim.** `from_date` is not after `to_date`.

**Evidence.** `leave_ledger_entry.py` `validate` / `InvalidLeaveLedgerEntry`.

## INV-HR-02. A leave allocation with applications cannot be removed

**Decision.** supported  
**Kinds.** domain-evidence

**Claim.** Deleting/cancelling an allocation is refused if a Leave Application ledger sits inside its interval.

**Evidence.** `validate_leave_allocation_against_leave_application`.
