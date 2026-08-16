# Invariant catalog

**Status.** Partial. Each card is one claim Odoo Community tries to keep true.  
**Decision.** per card.

Card fields: decision, kinds, claim, evidence, source artifact, counterexample, runtime consequence.

Pinned source is Odoo `18.0` SHA `bca6e5d13118fc2dff99d7b81bd49860e743132a`.

## INV-ACC-01. A journal entry is balanced

**Decision.** supported (in Odoo)  
**Kinds.** domain-evidence, candidate law

**Claim.** For an `account.move` with lines, rounded debit equals rounded credit in company currency.

**Evidence.** `account_move.py` `_check_balanced` and `_get_unbalanced_moves`. The SQL groups lines by move and currency decimal places and raises when rounded `SUM(balance)` is not zero. Create and write run inside that check. The thesis example `BalancedJournal` matches this source behavior.

**Source artifact.** Auto-balancing lines for some tax cases (`_sync_unbalanced_lines`) on unposted moves.

**Counterexample.** This pass did not find an Odoo equivalent of ERPNext's exchange-gain exemption. Undetermined whether any move type skips the check.

**Runtime consequence.** Posting is a function plus a constraint. The thesis example remains a hypothesis for OS. Odoo supports the constraint inside this source.

## INV-ACC-02. Posted names are unique per journal

**Decision.** supported  
**Kinds.** source-system artifact, domain-evidence

**Claim.** Two posted moves in the same journal cannot share a name other than `/`.

**Evidence.** Unique index `account_move_unique_name` on `(name, journal_id) WHERE state = 'posted' AND name != '/'`.

**Source artifact.** Drafts can share `/`. Reset-to-draft can free a name if the row leaves `posted`.

**Counterexample.** `posted_before` keeps sequence history after a return to draft. The name constraint is about current posted state, not historical occupancy.

**Runtime consequence.** Fiscal identity of a posted entry must be unique in its numbering space. How history keeps the old name is a separate question.

## INV-ACC-03. Lock dates bound what may be posted or altered

**Decision.** supported  
**Kinds.** domain-evidence, runtime consequence

**Claim.** A company can forbid adding or modifying entries on or before a fiscal, sales, or purchase lock date.

**Evidence.** `_check_fiscal_lock_dates` raises "You cannot add/modify entries prior to and inclusive of". Hard lock is requested with `hard=True`. Create of a reverse can shift `date` to the day after the user fiscal lock.

**Source artifact.** Multiple lock kinds on `res.company`. Context key `bypass_lock_check`.

**Counterexample.** Bypass context exists. That is an implementation escape, not a domain counterexample.

**Runtime consequence.** Period close is an authority fact that later actions must read.

## INV-ACC-04. A move cannot be born posted

**Decision.** supported  
**Kinds.** source-system artifact, candidate law

**Claim.** New journal rows start draft. Posting is a later action.

**Evidence.** `create` raises if any vals set `state` to `posted`. Message: create a draft move and post it after.

**Runtime consequence.** "Insert posted fact" is not a legal mutation. The mutation is post.

## INV-ACC-05. Posted is not always terminal

**Decision.** supported as Odoo behavior. rejected as a universal posted-fact law  
**Kinds.** source-system artifact, counterexample

**Claim.** Odoo allows many posted or cancelled journal entries to return to draft.

**Evidence.** `button_draft` requires state `posted` or `cancel`, then writes `state = 'draft'` after `_check_draftable`. `button_cancel` on posted rows calls `button_draft` first.

**Source artifact.** `need_cancel_request` for government-sent invoices. `inalterable_hash` blocks draft reset. Exchange-difference and tax cash-basis entries also block it.

**Counterexample to "posted facts are immutable".** This button. Official credit-note docs still say a credit note is the legal method to cancel or modify a validated invoice. The product therefore ships two correction stories.

**Runtime consequence.** OS cannot treat Odoo as evidence that posted journals are immutable. Use ERPNext immutable-ledger docs and this card as a disagreement, not an average.

## INV-STOCK-01. A done stock move is not cancelled in place

**Decision.** supported  
**Kinds.** domain-evidence, candidate law

**Claim.** Once a non-scrap stock move is done, cancel is refused. A return must reverse it.

**Evidence.** `stock_move.py` `_action_cancel` raises "You cannot cancel a stock move that has been set to 'Done'. Create a return in order to reverse the moves which took place."

**Source artifact.** Scrap done moves are excluded from that guard. `propagate_cancel` can cancel waiting destination moves.

**Counterexample.** Account moves can reset to draft. Stock moves cannot. The same product rejects one universal cancel semantic.

**Runtime consequence.** Physical completion and fiscal posting are different terminalities.

## INV-STOCK-02. A done move cannot be unreserved

**Decision.** supported  
**Kinds.** domain-evidence

**Claim.** Reservation ends when the move is done. Unreserve is then illegal.

**Evidence.** `_do_unreserve` raises "You cannot unreserve a stock move that has been set to 'Done'."

**Runtime consequence.** Done means the claim became a movement. The reservation relator is gone.

## INV-STOCK-03. Available quantity is on-hand minus reserved

**Decision.** supported (in Odoo quants)  
**Kinds.** domain-evidence, candidate law

**Claim.** For a quant, available equals quantity minus reserved quantity.

**Evidence.** `stock_quant.py` `_compute_available_quantity`. SQL aggregate path subtracts `reserved_quantity:sum` from `quantity:sum`.

**Source artifact.** The formula lives on a mutable cache row, not on a ledger replay.

**Counterexample.** `_get_available_quantity(..., allow_negative=True)` can return a negative availability. Location reservation bypass exists for some usages.

**Runtime consequence.** Allocation must not treat on-hand as free.

## INV-STOCK-04. Unreserve cannot exceed reserved

**Decision.** supported  
**Kinds.** domain-evidence, runtime consequence

**Claim.** The system must not reduce reserved quantity below what the quant believes is reserved.

**Evidence.** `_update_reserved_quantity` path raises "It is not possible to unreserve more products of %s than you have in stock." PR [103624](https://github.com/odoo/odoo/pull/103624) exists because move lines and quants desynchronized in production.

**Source artifact.** The invariant is enforced procedurally, not by a SQL check that reserved is between 0 and quantity.

**Counterexample.** The PR is itself evidence that custom code and bugs violated the claim. The claim is desired, not historically airtight.

**Runtime consequence.** Reservation updates need a single writer. Dual writes on move and quant are a known failure mode.

## INV-STOCK-05. A quant is unique for product, location, lot, package, and owner

**Decision.** hypothesis  
**Kinds.** domain-evidence, source-system artifact

**Claim.** Current stock is keyed by those five dimensions. Duplicating a quant is refused.

**Evidence.** `_get_inventory_fields` grouping and `_gather(..., strict=True)` look up that key. `copy` raises "You cannot duplicate stock quants."

**Source artifact.** The key is an ORM gather convention. This pass did not confirm a unique SQL index on the pin.

**Counterexample.** Inventory mode can create a quant for a missing key, then set counted quantity. That is how adjustments are born, not a second quant for the same key.

**Runtime consequence.** Ownership and package are part of stock identity, not attributes of a later report.

## INV-ID-01. Lot or serial name is unique per product and company

**Decision.** supported  
**Kinds.** domain-evidence

**Claim.** The pair product plus lot name does not repeat inside a company, and a no-company lot collides with company lots.

**Evidence.** `stock.lot` `_check_unique_lot`. ValidationError text: "The combination of lot/serial number and product must be unique within a company including when no company is defined."

**Source artifact.** Lots and serials share `stock.lot`.

**Counterexample.** Official serial docs say unique serials that are not reused should show one product per number. Reuse policy is an operation-type setting, not this uniqueness check.

**Runtime consequence.** Identity is not a free-text label.

## INV-ID-02. A serial-tracked manufacturing output step is quantity one

**Decision.** supported  
**Kinds.** domain-evidence

**Claim.** While producing a serial-tracked good, the producing quantity is forced to one. Larger demand is split.

**Evidence.** `mrp_production.py` `_set_qty_producing` resets quantity to one when tracking is serial and the UoM quantity is not 1. Official manufacturing-lots doc describes splitting the MO when serials are assigned.

**Counterexample.** A lot-tracked product can produce many units under one lot.

**Runtime consequence.** Serial identity is per unit. Lot identity is per batch.

## INV-MFG-01. Manufacturing demand is positive

**Decision.** supported  
**Kinds.** domain-evidence

**Claim.** `mrp.production.product_qty` must be greater than zero.

**Evidence.** SQL constraint `qty_positive` on `mrp.production`.

**Counterexample.** Unbuild is a different document, not a negative MO quantity.

**Runtime consequence.** Reversal of production is a named act.

## INV-MFG-02. Manufacturing order reference is unique per company

**Decision.** supported  
**Kinds.** source-system artifact

**Claim.** `mrp.production.name` is unique per `company_id`.

**Evidence.** SQL constraint `name_uniq`.

**Runtime consequence.** Authorization documents need a stable identifier in an organizational scope.

## INV-SELL-01. A confirmed sales order has a confirmation date

**Decision.** supported  
**Kinds.** domain-evidence, source-system artifact

**Claim.** State `sale` requires `date_order` to be set.

**Evidence.** SQL constraint `date_order_conditional_required`. Help text says `date_order` is confirmation date after confirm.

**Source artifact.** The same field is creation date while the record is still a quotation.

**Counterexample.** That dual meaning is a collapsed date. `docs/open-questions.md` section 3 warns about this class of collapse. The constraint proves a confirmed order has a timestamp. It does not prove which real-world date it is.

**Runtime consequence.** Do not map `date_order` to a single ontology date property.

## INV-SELL-02. A locked sales order cannot be cancelled

**Decision.** supported  
**Kinds.** domain-evidence

**Claim.** Cancel is refused while `locked` is true.

**Evidence.** `action_cancel` raises "You cannot cancel a locked order. Please unlock it first."

**Source artifact.** Lock is a boolean beside `state`, not a state value. Purchase uses `state == 'done'` for the same idea.

**Runtime consequence.** "Do not change this commitment" is an authority state distinct from cancel.

## INV-CRM-01. Opportunity probability stays in 0 to 100

**Decision.** supported  
**Kinds.** source-system artifact

**Claim.** `crm.lead.probability` is between 0 and 100.

**Evidence.** SQL constraint `check_probability`.

**Runtime consequence.** A percentage field needs a unit and a range. This is not evidence that probability belongs in the semantic core.
