# Edge-case catalog

**Status.** Partial. Cases that stress Odoo invariants or reveal hidden assumptions.  
**Decision.** per card.

Pinned source is Odoo `18.0` SHA `bca6e5d13118fc2dff99d7b81bd49860e743132a` unless noted.

## EC-RES-01. Reservation desync between move line and quant

**Decision.** supported as a historical failure  
**Kinds.** counterexample, runtime consequence

**What happened.** Production databases hit "It is not possible to unreserve more products of … than you have in stock" after `stock.move.line.reserved_qty` and `stock.quant.reserved_quantity` drifted.

**Evidence.** [odoo#103624](https://github.com/odoo/odoo/pull/103624). The old order was: move checks availability, move writes the quant, move creates the line. A line could be created with reserved quantity while the quant was never updated. The fix made the line responsible for the quant write.

**Domain evidence.** Reservation is a real claim. Two writers make a false claim.

**Source artifact.** Dual mutable fields for one fact.

**Candidate law.** A reservation needs one authoritative record. If two stores exist, they will diverge.

**Runtime consequence.** Do not implement reservation as parallel counters on movement and on-hand rows.

## EC-STOCK-01. Done stock is reversed by a return, not by undo

**Decision.** supported  
**Kinds.** domain-evidence, counterexample

**What happens.** `_action_cancel` refuses done non-scrap moves and tells the user to create a return. Destination moves may still cancel if they are not done and `propagate_cancel` is set. Origins can cancel when the `stock.cancel_moves_origin` parameter is on.

**Why it matters.** Cancel of a plan is not cancel of a completed movement. Chains of moves make "cancel" a graph operation.

**Counterexample to simple state machines.** Sibling moves must all be cancelled before propagate-cancel walks forward.

## EC-STOCK-02. Negative availability is a parameter, not a universal ban

**Decision.** supported as Odoo behavior  
**Kinds.** counterexample

**What happens.** `_get_available_quantity` accepts `allow_negative`. Some gather paths pass `allow_negative=True`. Location usage can bypass reservation.

**Why it matters.** "Negative stock is illegal" is not supported as an Odoo-wide law. It may still be a company policy.

**Open question.** `docs/open-questions.md` does not ask this directly. Do not invent a default for OS.

## EC-STOCK-03. Partial validation leaves leftover demand

**Decision.** supported  
**Kinds.** domain-evidence

**What happens.** `_action_done` can cancel leftover lines or create a backorder, depending on `cancel_backorder` and picked quantity. Official batch-picking docs show a Create Backorder dialog when done quantity is below reserved. Official manufacturing-backorder docs split `WH/MO/XXXXX-001` and `-002`.

**Domain evidence.** Partial fulfillment is normal. The leftover is still a commitment.

**Source artifact.** Backorder as a cloned document with a suffix, rather than a remaining-qty field alone.

## EC-STOCK-04. Inventory adjustment is a counted quantity that births a move

**Decision.** supported  
**Kinds.** source-system artifact, domain-evidence

**What happens.** In inventory mode, setting `inventory_quantity` on a quant computes a diff and `action_apply_inventory` creates the compensating stock move. Official lot-valuation docs use Physical Inventory to create a lot and assign cost from the product form.

**Why it matters.** The quant is edited, but the system still wants a movement fact. Current quantity is not supposed to change without a move, even when the UI looks like a cell edit.

**Candidate law.** A recount is an observation that may produce an adjustment event. It is not a silent overwrite of history.

## EC-ACC-01. Reset to draft after post

**Decision.** supported as Odoo behavior  
**Kinds.** counterexample, source-system artifact

**What happens.** `button_draft` unreconciles lines, deletes analytic lines, sets `state` to `draft`, and detaches invoice PDF attachments so they can be regenerated.

**Why it matters.** A posted invoice can become an editable draft without a reverse entry. Official credit-note docs contradict the spirit of that button by calling a credit note the legal correction method.

**Runtime consequence.** Any claim that "posted implies immutable" must name which source and which localization hash lock is in force.

## EC-ACC-02. Posted-before keeps the sequence after draft reset

**Decision.** supported  
**Kinds.** source-system artifact

**What happens.** `posted_before` is a stored boolean, copy=False. Sequence and name logic treat a once-posted move differently from a never-posted draft. Journal changes are refused if the move was posted once, unless the name is cleared to `/`.

**Why it matters.** Even when state returns to draft, the record remembers it occupied a fiscal number.

**Candidate law.** Knowledge that a number was issued is a fact distinct from current draft or posted state.

## EC-ACC-03. Hash lock and government cancel request

**Decision.** supported  
**Kinds.** domain-evidence, runtime consequence

**What happens.** `inalterable_hash` blocks `_check_draftable`. `need_cancel_request` blocks draft reset and points at a government cancellation request hook.

**Why it matters.** Some jurisdictions make invoice mutation illegal after clearance. Odoo models that as a flag and a hook, not as a different document type.

**Open question.** `docs/open-questions.md` section 8, provenance and authority. Undetermined whether hash lock is provenance or policy.

## EC-ACC-04. Credit note is a reverse journal of type refund

**Decision.** supported  
**Kinds.** domain-evidence

**What happens.** Official credit-note docs: issuing a credit or debit note is the legal method to cancel, refund, or modify a validated invoice. The credit note sequence is `R` plus the origin number. `_reverse_moves` builds the reverse. `move_type` distinguishes `out_refund` from `out_invoice`.

**Why it matters.** Correction can be a new posted fact linked to the old one. That path agrees more with ERPNext cancel-and-reverse than `button_draft` does.

## EC-ACC-05. Lock date can rewrite the posting date of a reverse

**Decision.** supported  
**Kinds.** domain-evidence, counterexample

**What happens.** On create, if the default date is on or before the user fiscal lock, vals `date` becomes lock date plus one day.

**Why it matters.** Valid time in the world and recordable time in a closed period are not the same. Odoo silently prefers a bookable date.

**Open question.** `docs/open-questions.md` section 7. This is pressure, not an answer.

## EC-MFG-01. Serial assignment splits the manufacturing order

**Decision.** supported  
**Kinds.** domain-evidence

**What happens.** Official manufacturing-lots doc: an MO for several serial-tracked units splits into one MO per unit when serials are assigned. `Prepare MO` leaves them open. `Produce` closes them. Code forces `qty_producing` to 1 for serial tracking.

**Why it matters.** Identity granularity can change the identity of the authorization document. That is surprising if an MO is thought of as one customer commitment.

**Source artifact.** Split-by-clone rather than one authorization with many unit executions.

## EC-MFG-02. Unbuild is a named reverse of a done MO

**Decision.** supported  
**Kinds.** domain-evidence

**What happens.** `button_unbuild` opens a wizard with the producing lot. It is not a negative quantity on the original MO.

**Why it matters.** Disassembly is an action with its own stock moves. Compare ERPNext manufacture stock entry cancel or unbuild.

## EC-MFG-03. A kit BOM never becomes a manufacturing order

**Decision.** supported  
**Kinds.** domain-evidence, source-system artifact

**What happens.** `mrp.bom.type` `phantom` is labeled Kit. Existing stock moves that point at kit lines block some BOM changes.

**Why it matters.** "This product is made of those components" can mean explode on delivery, not authorize production. BOM is not always a manufacturing specification.

## EC-SELL-01. Quotation and sales order are one row

**Decision.** supported  
**Kinds.** source-system artifact, counterexample

**What happens.** Confirm writes `state` from `draft` or `sent` to `sale` on the same id. There is no new document identity at commitment time.

**Why it matters.** Offer and commitment can share identity in a product and still be different acts. A one-to-one model mapping would erase the act.

**Counterexample to "document equals act".** The same row is both.

## EC-SELL-02. Cancelled quotations return to draft

**Decision.** supported  
**Kinds.** source-system artifact

**What happens.** `action_draft` filters `state in ['cancel', 'sent']` and writes `draft`, clearing signature fields.

**Why it matters.** Cancel of an unconfirmed offer is treated as reversible record state. That may be correct for offers and wrong for posted stock.

## EC-ID-01. Operation type gates lot creation

**Decision.** supported  
**Kinds.** domain-evidence, source-system artifact

**What happens.** `stock.lot._check_create` raises if the active picking type has `use_create_lots` off. Official serial docs describe the same setting on Receipts, Delivery Orders, and Manufacturing.

**Why it matters.** Whether a new identity may be born is a policy on the operation, not only a product flag.

## EC-ID-02. Product change on a used lot is refused

**Decision.** supported  
**Kinds.** domain-evidence

**What happens.** `stock.lot.write` refuses a new `product_id` when move lines already exist, citing stock inconsistencies.

**Why it matters.** Identity is bound to a product specification once it has participated in a movement.

## EC-CRM-01. Lead to opportunity is a type write

**Decision.** supported  
**Kinds.** source-system artifact

**What happens.** `crm.lead.type` flips between `lead` and `opportunity` on the same record. Probability stays on that record.

**Why it matters.** Qualification can be a phase of one pursuit, not a new party or a new document. ERPNext's Lead versus Opportunity DocTypes disagree. See `D-09`.

## EC-MAINT-01. Completing a stage can spawn the next request

**Decision.** supported  
**Kinds.** domain-evidence

**What happens.** Writing a done stage can `copy` the request with a new `schedule_date` for preventive recurrence.

**Why it matters.** A completed intervention and the next planned intervention are different instances. Recurrence is not a status on the old request.

## EC-QUALITY-01. Quality models absent from Community pin

**Decision.** undetermined  
**Kinds.** source-system artifact

**What happens.** The Community `18.0` tree had no `addons/quality/models/quality.py`. Edge cases for quality points, failed checks blocking pickings, and alerts were not observed.

**Follow-up.** If Enterprise source is later approved for clean-room notes, inspect `quality.check` and `quality.alert` there. Until then, do not invent Community quality invariants.
