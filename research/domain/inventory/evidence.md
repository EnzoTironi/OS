# Evidence

**Fetched.** 2026-08-16  
**Decision.** per block. Never silently accepted.

Each block names a **kind**: domain-evidence, source-system artifact, candidate law, counterexample, or runtime consequence. Source IDs are in [sources.md](sources.md).

## Question

What do independent systems actually distinguish when they say stock, warehouse, available, reserved, owned, or moved?

## Ownership versus custody

### E-01. ValueFlows accounting quantity versus on-hand quantity

**Kind.** domain-evidence  
**Source.** S-VF-RES, S-VF-SPEC  
**Decision.** supported as a ValueFlows distinction

Two current quantities live on an inventoried resource.

`accountingQuantity` is "the current amount and unit of the economic resource for which the agent has primary rights and responsibilities, sometimes thought of as ownership."

`onhandQuantity` is "the current amount and unit of the economic resource which is under direct control of the agent. It may be more or less than the accounting quantity."

Vendor-managed inventory. The vendor sees the goods in accounting quantity. The store sees them in on-hand quantity. FOB source. The intended receiver already owns the goods and sees them in accounting. The goods are on-hand on a truck.

`primaryAccountable` is the agent bound to `accountingQuantity`.

**Runtime consequence.** A single `qty` field cannot answer both "do we own it" and "is it in our hands."

### E-02. ValueFlows transfer actions split rights and custody

**Kind.** domain-evidence  
**Source.** S-VF-ACT, S-VF-XFR  
**Decision.** supported as a ValueFlows distinction

`transferAllRights` gives rights and responsibilities without physical custody.

`transferCustody` gives physical custody without rights. Loan, transport, and repair are the documented examples.

`transfer` is shorthand for both.

`move` changes location, and possibly identifier if location is part of the logical key, without transferring rights or custodianship.

A transfer is one-way. Reciprocal transfers form an exchange under an Agreement.

**Runtime consequence.** Actions that move bins are not the same actions that change the accountable party.

### E-03. GS1 owning party versus possessing party versus location

**Kind.** domain-evidence  
**Source.** S-GS1-CBV section 7.4.3, S-GS1-GL  
**Decision.** supported as a CBV distinction

Source and destination types on an EPCIS event are three different identifiers.

`owning_party` denotes the party who owns, or is intended to own, the objects at that endpoint of the business transfer.

`possessing_party` denotes the party who has, or is intended to have, physical possession at that endpoint.

`location` denotes the physical location of that endpoint. When used at the originating endpoint it should be consistent with the Read Point.

Read Point is where the event took place. Business Location is where the object is assumed to reside until a later event.

**Runtime consequence.** Party-as-owner, party-as-custodian, and place are three slots. Collapsing them into Warehouse recreates the consignment and in-transit bugs.

### E-04. Odoo consignment. On-hand with a foreign owner

**Kind.** domain-evidence  
**Source.** S-ODO-CON  
**Decision.** supported as Odoo behavior

Consignment is "store and sell products in the company’s warehouse, without having to buy those items up-front."

Receipts are manual. There is no purchase order. Receive From and Assign Owner must be the same vendor.

The consignee can sell the goods to a different customer. Product moves look like other moves. Origin is `Partner Location/Vendors`. The Inventory Report shows an Owner column.

"Since the consignee does not actually own consignment stock, these products are not reflected in the Stock Valuation report, and have no impact on the consignee’s inventory valuation."

**Source-system artifact.** Owner is a field on the receipt and the quant, not a transfer-of-rights event.

### E-05. ERPNext models foreign custody as a warehouse, not as owner

**Kind.** source-system artifact  
**Source.** S-ERN-WH, S-ERN-SEP, S-ERN-SET, S-ERN-PR  
**Decision.** supported as ERPNext behavior. rejected as a domain primitive

Warehouse is "storage locations." The documented tree is Warehouse, Room, Row, Shelf, Bin. Warehouse Type examples include Supplier Warehouses and WIP Warehouses.

Send to Subcontractor "transfers stock from the companies warehouse to the sub-contractors warehouse."

Stock Settings can present an inter-warehouse transfer as a Delivery Note or Purchase Receipt so taxes can be applied.

Purchase Receipt has Accepted Warehouse and Rejected Warehouse. Both are locations. Neither is an owner.

**Interpretation.** ERPNext often encodes custody and quality hold as nodes in the same location tree. Ownership is usually the company of the warehouse.

**Counterexample needed.** A first-party ERPNext page that stores a vendor owner on ordinary on-hand stock the way Odoo Assign Owner does. Not found this session.

## Location

### E-06. Location is a hierarchy inside a warehouse, and also a type bag

**Kind.** domain-evidence and source-system artifact  
**Source.** S-ERN-WH, S-ODO-LOC, S-MOQ-PRD, S-VF-RES  
**Decision.** supported that a nested place exists. undetermined that Location Type is a domain kind

ERPNext. A warehouse can be a shelf. Stock balance is per Item and Warehouse.

Odoo. A location is "a specific space within a warehouse." Parent Location builds `WH/Stock/Zone A/Refrigerator 1`. Location Type is Vendor, Virtual, Internal, Customer, Inventory Loss, Production, or Transit. Removal Strategy is FIFO, LIFO, Closest Location, Least Packages, or FEFO. Inventory Frequency schedules cycle counts.

Moqui. Facility is a warehouse or store. `FacilityLocation` is the bin. An Asset can instead sit in a `Container`, in which case facility fields are null and the container carries the place.

ValueFlows. Location is "a complex ontology of its own." A warehousing location is often warehouse, room, aisle, row, tier.

**Source-system artifact.** Odoo Location Type mixes counterparty, process, transit, and loss into one enum. That is application convenience.

### E-07. Read point is not business location

**Kind.** domain-evidence  
**Source.** S-GS1-CBV, S-GS1-GL  
**Decision.** supported

Read Point. The location where the event took place. Example. A reader at dock door 3.

Business Location. The location where the subject is assumed to be after the event, until a later event. Example. After a sales-floor transition read, the product sits on the sales floor.

**Runtime consequence.** Scanning at a door does not by itself prove the bin. A projection that copies read point into current location will lie.

## Quantities. On-hand, reserved, projected

### E-08. ERPNext projected quantity is a planning formula, not a stock fact

**Kind.** domain-evidence  
**Source.** S-ERN-PQ  
**Decision.** supported as ERPNext behavior

Formula on the page.

Projected Qty = Actual Qty + Planned Qty + Requested Qty + Ordered Qty − Reserved Qty − Reserved Qty for Production − Reserved Qty for Subcontracting − Reserved Qty for Production Plan

Actual Qty is "the actual physical stock you have."

Reserved Qty increases when a Sales Order is submitted and decreases when a Delivery Note or Sales Invoice against that order is submitted.

Reserved Qty for Production increases on Work Order submit and decreases when material moves to WIP.

Reserved Qty for Subcontracting increases on subcontracting Purchase Order submit and decreases when material moves to the supplier warehouse.

Reserved Qty for Production Plan increases on Production Plan submit and decreases when a Work Order against that plan reserves the material.

**Interpretation.** ERPNext keeps several purpose-tagged reservations. They are not one reserved integer.

**Cross-link.** Sibling `research/domain/o2c/` L-004.

### E-09. ERPNext v15 stock reservation is a document, not a bin flag

**Kind.** domain-evidence  
**Source.** S-ERN-RSV  
**Decision.** supported as ERPNext v15 behavior

"Stock reservation, also known as inventory reservation, refers to the practice of setting aside a specific quantity of stock or inventory for a particular purpose or customer."

It is optional. Enable it in Stock Settings. Reserve from a Sales Order or a Pick List. Auto-reserve on Purchase Receipt when a sales order drove the purchase.

Unreserve cancels the Stock Reservation Entry. Cancel is the documented release.

**Source-system artifact.** Reservation is a cancellable DocType. That is not proof that OS needs a DocType. It is proof that reservation has identity, purpose, warehouse, and quantity.

### E-10. Odoo reservation is timed on the operation type and lands on quants

**Kind.** domain-evidence  
**Source.** S-ODO-RSV, S-ODO-ATC  
**Decision.** supported as Odoo behavior

Three methods on an operations type. At Confirmation. Manually. Before scheduled date.

At Confirmation reserves when the sales order is confirmed and stock is already available. If stock is short, reserved quantity is zero and the availability icon is red.

Forecasted quantity on the Forecasted Report is On Hand + Incoming − Outgoing.

Unreserve on one order line can free quantity for another order.

Receipt operations do not use reservation methods.

**Runtime consequence.** Reservation policy is per outbound operation, not a global property of Item.

**Source-system artifact.** The official docs describe reservation through delivery orders and move lines. Community write-ups and a historical Odoo PR say `stock.move.line` updates `stock.quant.reserved_quantity`. That implementation shape is not copied here.

### E-11. Moqui splits on-hand, ATP, reservation, and issuance

**Kind.** domain-evidence  
**Source.** S-MOQ-PRD, S-MOQ-APP  
**Decision.** supported as a Mantle distinction

Non-serialized Asset. `quantityOnHandTotal` is physical quantity. `availableToPromiseTotal` is what can be reserved or promised.

Both totals are derived from `quantityOnHandDiff` and `availableToPromiseDiff` on `AssetDetail`.

A reservation is `AssetReservation` created when an item is promised. It holds `quantity` and `quantityNotAvailable` when the promise exceeds on-hand.

When the physical item is fulfilled, `AssetIssuance` is created and the reservation is deleted.

ProductStore chooses reservation order. FIFO or LIFO by received date or expiration date.

**Runtime consequence.** Promise and issue are two facts. Deleting the reservation on issue is a source choice. The claim still existed.

### E-12. ValueFlows has no reserved quantity on the resource

**Kind.** divergence  
**Source.** S-VF-RES, S-VF-ACT, S-VF-SPEC  
**Decision.** supported as a ValueFlows omission. undetermined for OS

ValueFlows resources carry `accountingQuantity` and `onhandQuantity`. Reservation is not a resource quantity. A future claim is a Commitment. `use` makes equipment unavailable during a process without consuming it.

**Interpretation.** Exclusive claim on a slice may be a commitment or a relator, not a third stock balance. ERPNext, Odoo, and Moqui still materialize reserved qty because concurrent promising fails without it.

**Cross-link.** `docs/open-questions.md` Q12 on Reservation as a relationship-entity.

## Movement, adjustment, transfer

### E-13. ERPNext stock ledger is the movement history

**Kind.** domain-evidence  
**Source.** S-ERN-SLE, S-ERN-SE, S-ERN-SEP  
**Decision.** supported as ERPNext behavior

"A Stock Ledger Report is a detailed record that keeps track of stock movements for a company." It shows quantity and value issued, received, or transferred, with item and warehouse.

Ledger rows are generated from Sales Invoice or Purchase Invoice with Update Stock, Delivery Note, Purchase Receipt, Stock Entry, and Stock Reconciliation.

Stock Entry purposes. Material Issue. Material Receipt. Material Transfer. Material Transfer for Manufacture. Material Consumption for Manufacture. Manufacture. Repack. Send to Subcontractor.

Add to Transit uses a warehouse of type Transit, then a second entry ends transit.

After submit, a stock entry is updated by cancelling and amending.

**Source-system artifact.** Purpose is an enum on one DocType. The domain split is issue, receipt, transfer, consume, produce, repack, subcontract custody.

### E-14. ValueFlows raise and lower are last-resort quantity events

**Kind.** domain-evidence  
**Source.** S-VF-ACT  
**Decision.** supported as a ValueFlows distinction

`raise` adjusts a quantity up at cutover or when a count shows the system is low. `lower` adjusts down at cutover or when a count shows the system is high.

"When it is known how a resource was obtained, it is preferable to use the real action."

All economic information on a resource must be initially put there by an Economic Event. Economic information could be recalculated by iterating events. The page warns that this can have performance issues.

**Cross-link.** `research/foundation/state/` CL-3 on `origin/cursor/issue-12-foundation-cfd8`.

### E-15. Odoo adjustment applies a counted quantity and writes a move

**Kind.** domain-evidence  
**Source.** S-ODO-ADJ  
**Decision.** supported as Odoo behavior

Physical Inventory lists On Hand, Counted, and Difference. Applying the adjustment "simultaneously creates a stock move record in the Moves History report."

Set to 0 on a product already reserved for sales orders "will set the forecasted quantity to negative. The product will be marked as unavailable for current delivery orders."

Between count and apply, product moves can occur. Odoo asks for confirmation before apply.

Revert adds a new Moves History line with `[reverted]` in Reference. The original line stays.

Relocate moves products between internal locations. It is not a change of company. Administrator rights are required.

**Runtime consequence.** Count is an observation. Apply is an action that posts a movement. Those are not one fact.

### E-16. Moqui physical inventory is a variance detail, not a rewrite of history

**Kind.** domain-evidence  
**Source.** S-MOQ-PRD  
**Decision.** supported as Mantle behavior

`PhysicalInventory` tracks a count. Variances are `AssetDetail` rows with `physicalInventoryId` and `varianceReasonEnumId`.

Receipts and issuances also write `AssetDetail` and trigger GL transactions that add or deduct inventory value.

**Interpretation.** The count does not erase prior receipts. It adds a dated variance.

## Lot, serial, identity

### E-17. Serial is one unit. Batch is a group with quantity

**Kind.** domain-evidence  
**Source.** S-ERN-SN, S-ERN-BAT, S-ODO-LOT, S-VF-RES, S-MOQ-PRD  
**Decision.** supported

ERPNext. A serialized item keeps a Serial No per quantity. Only status Available can be delivered. Creating a Serial No directly does not set Warehouse. Inventory changes only through a stock transaction. From v15, negative stock is forbidden for serial and batch items even if Allow Negative Stock is on.

ERPNext Batch. A unique tag for a group. Expiry is compared to the posting date of the transaction. Batches can be moved or split. Split creates a new Batch and divides quantity.

Odoo. Lots "typically represent a specific batch." Serial is the other tracking mode. Validate on a receipt without a lot number errors. Creating a lot number "reserves it for a product but does not assign it." Existing lots cannot change Product or On Hand Quantity because they are linked to stock moves.

ValueFlows. Serialized resources use `trackingIdentifier`. Lot or batch is a separate record. Stock resources are identified by a combination of properties such as specification and location. Consuming 10 of 100 decrements the resource. The 10 are not a new EconomicResource.

Moqui. Serialized inventory is one physical item with `serialNumber`. Non-serialized `hasQuantity=Y` shares `receivedDate`, `lotId`, `facilityId`, `locationSeqId`, and `ownerPartyId`.

**Cross-link.** `research/domain/product/` L-04 and L-06.

## Negative stock, backdating, freeze

### E-18. Negative stock is a policy switch, then withdrawn for identity-bearing items

**Kind.** domain-evidence  
**Source.** S-ERN-SET, S-ERN-SN, S-ERN-BAT  
**Decision.** supported as ERPNext behavior. rejected as a universal law that negative stock is allowed

Allow Negative Stock exists for late weekend entry. It can be global or per item.

From v15 it is removed for serial and batch items. Official text. "users won't be able to make negative stock transactions for serial /batch items even though Allow Negative Stock has enabled in the Stock Settings."

**Interpretation.** Negative stock is a bookkeeping convenience for fungible qty when documents arrive out of order. It is incoherent for a serial that must be Available to deliver.

**Counterexample.** A regulated serial flow that posts a delivery before the receipt and still claims the same serial is in two places. That would reject any law that forbids negative serials only as UX.

### E-19. Backdated stock forces future ledger and GL recomputation

**Kind.** domain-evidence  
**Source.** S-ERN-ACC, S-ERN-PR, S-ERN-SE, S-ERN-SET  
**Decision.** supported as ERPNext behavior

"In case of new back-dated stock transactions or cancellation/amendment of an existing transaction, all the future Stock Ledger entries and GL Entries will be recalculated for all items of that transaction." Landed Cost Voucher after a submitted Purchase Receipt does the same.

Purchase Receipt documents an immutable ledger from v13 that changes cancellation and backdated posting rules.

Stock Entry has Edit Posting Date and Time.

Stock Frozen Upto and Freeze Stocks Older Than [Days] block postings. A role can edit frozen stock.

**Cross-link.** `research/foundation/temporal/` L1 and L4. Scenario S-007 in `scenarios/README.md`.

**Runtime consequence.** Valid time of a movement can precede knowledge time. Projections after that valid time must be recomputed or explicitly stale.

## Reconciliation, quarantine, consignment, valuation, transformation

### E-20. Reconciliation sets quantity and value as of a posting time

**Kind.** domain-evidence  
**Source.** S-ERN-REC  
**Decision.** supported as ERPNext behavior

Purposes. Opening Stock. Stock Reconciliation.

The user sets Item, Warehouse, Quantity, and Valuation Rate as of an editable posting date and time. Difference Account defaults to Stock Adjustment, or Temporary Opening for opening stock.

v15 Serial and Batch Bundle can Reconcile All or Reconcile Selected. Reconcile All can consume unlisted batches automatically.

**Interpretation.** Reconciliation is a dated event that states the resulting balance. It is not a silent UPDATE of the bin.

### E-21. Rejected and scrap are locations plus quantities, not a missing GS1 quarantine enum

**Kind.** domain-evidence  
**Source.** S-ERN-PR, S-GS1-CBV  
**Decision.** supported as a split. undetermined as the OS hold model

ERPNext Purchase Receipt. Received, Accepted, and Rejected quantities. Rejected Warehouse "for the rejected Items which were either defective or not up to the quality mark." A stock ledger entry is created for accepted qty and for each rejection.

GS1 CBV 6.2.1. A user who needs a disposition "quarantined" may not mint `urn:epcglobal:cbv:disp:quarantined`. Standard dispositions include `recalled`, `damaged`, `available`, `non_conformant`, `in_transit`. Persistent disposition is for non-transient state.

**Interpretation.** Hold is either a location, a disposition, or both. It is not a third quantity named quarantineQty unless a source forces that.

### E-22. Valuation is a layer beside quantity

**Kind.** domain-evidence  
**Source.** S-ERN-SET, S-ERN-PI, S-ERN-ACC, S-ERN-SE, S-ODO-VAL, S-MOQ-PRD  
**Decision.** supported that valuation is not quantity. undetermined which costing methods OS must native-support

ERPNext default valuation method is FIFO. Alternatives are LIFO and moving average. After the Item is saved, Valuation Method cannot be changed. Incoming additional costs on a Stock Entry are distributed onto receiving items and become Valuation Rate. Perpetual inventory posts GL for every stock transaction. Periodic inventory posts manually at period end. Serialized items use actual cost in the perpetual example.

Odoo default is periodic, Standard Price, manual valuation. Automatic Accounting creates a stock valuation layer (SVL) and a journal entry per valuation update. Costing methods. Standard Price, Average Cost, FIFO. Switching method is warned as high impact. Consigned stock is excluded from Stock Valuation.

Moqui. `ProductAverageCost` is dated, optional per Facility and Organization, for COGS that needs average-cost history. `CostComponent` breaks down manufactured cost. Asset has `acquireCost`.

**Runtime consequence.** A quantity event may create, consume, or revalue a cost layer. Cost method is policy on a category or item, not a kernel primitive.

### E-23. Transformation consumes inputs and produces outputs. Packing does not

**Kind.** domain-evidence  
**Source.** S-ERN-SE, S-ERN-SEP, S-VF-ACT, S-GS1-GL, S-GS1-CBV  
**Decision.** supported

ERPNext Manufacture deducts raw materials from the source warehouse and adds the production item to the target. Repack turns bulk into smaller packs. Process Loss reduces finished-good qty and folds its cost into the remaining FG. Scrap is a by-product with valuation into a scrap warehouse.

ValueFlows. `consume` removes quantity. `produce` creates or increments. `accept` and `modify` keep the same identified resource through repair or test. `combine` and `separate` pack and unpack. `pickup` and `dropoff` are transport ends of the same resource.

GS1. `TransformationEvent` is irreversible. "any of the input objects may have contributed to all of the output objects." Aggregation can later be separated. Transformation cannot.

**Cross-link.** `research/standards/` L-004 and L-005. Scenario S-008.

## Adversarial traces already documented by sources

### E-24. Concurrent reservation is a documented fight over the same slice

**Kind.** counterexample  
**Source.** S-ODO-ATC, S-MOQ-PRD, S-ERN-RSV  
**Decision.** supported as a real failure mode

Odoo. Two confirmed orders can leave one with reserved zero. Unreserve on one line feeds the other.

Moqui. "competition for specific inventory items is common." `AssetReservation` exists for that reason.

ERPNext. Reservation entries name warehouse and quantity against a sales order item.

**Runtime consequence.** Available must be claimed under isolation or the second commit reads a stale on-hand.

### E-25. UOM conversion is editable because conversion factors lie

**Kind.** domain-evidence  
**Source.** S-ERN-SET, S-ERN-PR  
**Decision.** supported as ERPNext behavior

Stock Settings. Allow to Edit Stock UOM Qty. "If you're using multi-uom and your stock uom is a whole number, then you might face the issue that the Stock UOM should be non-decimal." The documented fix. The user sets Stock Quantity. The system calculates the conversion factor.

Purchase Receipt. Update UOM Conversion Factor when the purchase UOM differs from Stock UOM.

**Cross-link.** `research/domain/product/` L-05. Unit of measure is not identity.

**Counterexample.** A corrected conversion that changes historical valuation without a compensating event. ERPNext backdated recomputation (E-19) is the current source answer, not a silent rewrite.

### E-26. Duplicate or corrected movements are cancel-and-amend or revert-plus-new

**Kind.** domain-evidence  
**Source.** S-ERN-SE, S-ODO-ADJ  
**Decision.** supported as source behavior. hypothesis as the OS law

ERPNext. Submitted stock entry is updated by cancelling and amending.

Odoo. Revert inventory adjustment keeps the original move and adds a `[reverted]` line.

**Interpretation.** Correction is a new fact. Whether cancel is deletion plus replacement or a compensating event is still open. See `docs/open-questions.md` Q5 and Q6.

## Label index

| ID | Kind | Decision |
| --- | --- | --- |
| E-01 | domain-evidence | supported |
| E-02 | domain-evidence | supported |
| E-03 | domain-evidence | supported |
| E-04 | domain-evidence | supported |
| E-05 | source-system artifact | supported as behavior, rejected as primitive |
| E-06 | mixed | nested place supported, type bag undetermined |
| E-07 | domain-evidence | supported |
| E-08 | domain-evidence | supported |
| E-09 | domain-evidence | supported |
| E-10 | domain-evidence | supported |
| E-11 | domain-evidence | supported |
| E-12 | divergence | VF omission supported, OS undetermined |
| E-13 | domain-evidence | supported |
| E-14 | domain-evidence | supported |
| E-15 | domain-evidence | supported |
| E-16 | domain-evidence | supported |
| E-17 | domain-evidence | supported |
| E-18 | domain-evidence | supported as behavior, rejected as universal allow |
| E-19 | domain-evidence | supported |
| E-20 | domain-evidence | supported |
| E-21 | domain-evidence | split supported, hold model undetermined |
| E-22 | domain-evidence | valuation≠qty supported, methods undetermined |
| E-23 | domain-evidence | supported |
| E-24 | counterexample | supported |
| E-25 | domain-evidence | supported |
| E-26 | domain-evidence | source supported, OS law hypothesis |
