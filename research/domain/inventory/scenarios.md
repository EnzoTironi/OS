# Scenarios

**Kind.** counterexample cards  
**Fetched.** 2026-08-16  
**Decision.** none. These cards attack the candidate laws. They are not executable tests yet.

Each card names the facts a later agent must keep independent. Happy paths are omitted unless they set up an adversarial turn.

Seed cards S-002, S-007, and S-008 in `scenarios/README.md` already touch reservation, backdating, and lot recall. This file adds inventory-specific cards.

## Question

Which operational stories force ownership, custody, location, reservation, movement, identity, and valuation to stay separate?

## Adversarial cases from issue 18

### S-INV-01. Concurrent reservation

Two sales orders confirm at the same second for the last 10 units.

Questions. Does the second reservation read stale on-hand? Is exclusivity per quantity or per item? Can the loser remain a commitment with Q-NOT-ATP?

Attacks. L-INV-04, L-INV-15. Evidence E-24.

### S-INV-02. Backdated receipt

On August 12 a valid supplier document proves 20 units arrived on August 8. The system already issued 15 on August 10 from a book balance of 10.

Questions. What was known on August 10? What is now believed to have been true on August 10? Which valuations recompute? See seed S-007.

Attacks. L-INV-08. Evidence E-19. Temporal L1.

### S-INV-03. Lot recall

A finished lot contains a defective input lot. Outputs split across customers. Some units are still in transit.

Questions. Can the walk name every possible output? Is quantity separate from lot identity? See seed S-008.

Attacks. L-INV-06, L-INV-11. Evidence E-23. Standards L-005.

### S-INV-04. Consigned stock

Vendor V owns 50 units in warehouse W. The consignee sells 12 to customer C.

Questions. Whose Q-OWNED falls? Whose Q-ONHAND falls? Whose valuation report changes? Is there a purchase order?

Attacks. L-INV-01, L-INV-10. Evidence E-01, E-04.

### S-INV-05. In-transit stock, FOB source

Goods leave the supplier dock. Title has already passed. The truck is not the receiver's warehouse.

Questions. Who has Q-OWNED? Who has Q-ONHAND? Is transit a location, a process, or a disposition?

Attacks. L-INV-01, L-INV-13. Evidence E-01, E-03.

### S-INV-06. Damaged stock

A count finds 4 crushed cases in an otherwise good bin.

Questions. Is damage a location move, a disposition, a specification change, or a lower event? Does valuation drop before scrap is produced?

Attacks. L-INV-12, L-INV-09. Evidence E-21.

### S-INV-07. Duplicate movement

The same receipt is posted twice from two integrations.

Questions. What identity makes the second post a duplicate? Is correction cancel-and-amend or a compensating event?

Attacks. L-INV-05, L-INV-16. Evidence E-26.

### S-INV-08. Corrected unit-of-measure conversion

A purchase of 10 boxes was booked as 10 units. Each box is 12 units. Someone fixes the factor a week later.

Questions. Does historical Q-ONHAND change at the original valid time? Does V-RATE recompute? Is the fix a new event?

Attacks. L-INV-14, L-INV-08. Evidence E-25, E-19.

## Ownership, custody, location

### S-INV-09. Loan of a serialized tool

A calibrated tool is loaned to a contractor for a week. Title stays with the owner.

Questions. Does the serial change? Does Q-OWNED change? Does current location change?

Attacks. L-INV-01, L-INV-02, L-INV-06.

### S-INV-10. Subcontract send

Raw material moves to a supplier warehouse for conversion.

Questions. Is this transferCustody, a location change, or consumption? When does Q-OWNED leave?

Attacks. L-INV-01, L-INV-13. Evidence E-05, E-13.

### S-INV-11. Dropship

Supplier ships to the customer. The seller never has Q-ONHAND.

Questions. Did the seller ever have custody? Which events are inventory events?

Attacks. L-INV-01. Odoo dropship page was found this session and not fully mined. Mark extra evidence undetermined.

### S-INV-12. Inter-warehouse transfer presented as a delivery note

Statutory tax applies to the transfer. ERPNext uses a Delivery Note with a target warehouse.

Questions. Is the tax a commercial document or an inventory law? Does the semantic movement remain one transfer?

Attacks. L-INV-02. Evidence E-05. Source artifact.

### S-INV-13. Container move

A tote of mixed lots rolls from dock to aisle. The tote id is what people scan.

Questions. Do child lots move by containment or by each getting a move? Moqui Container versus Asset location.

Attacks. L-INV-02. Standards L-004 aggregation.

### S-INV-14. Read at the dock door

A reader fires at door 3. The pallet is later put away to bin Aisle-4.

Questions. Is current location the door or the bin? Can both times be queried?

Attacks. L-INV-02. Evidence E-07.

## Reservation and availability

### S-INV-15. Reserve then count to zero

A sales order holds 8 units. A cycle count applies 0 at that bin.

Questions. Does forecasted go negative? Does the reservation survive? Odoo documents this.

Attacks. L-INV-04, L-INV-09. Evidence E-15.

### S-INV-16. Auto-reserve on later receipt

A sales order has no stock. A purchase receipt arrives. ERPNext can auto-reserve for that order.

Questions. Does the receipt create Q-ONHAND and Q-RSV in one action or two facts?

Attacks. L-INV-04, L-INV-05. Evidence E-09.

### S-INV-17. Pick-list reservation versus order reservation

The same 5 units are reserved on the sales order and again on the pick list.

Questions. Is that one claim or two? Can they over-claim the slice?

Attacks. L-INV-04, L-INV-15. Evidence E-09.

### S-INV-18. Incoming receipt is not reserved

Odoo does not put reservation methods on receipt operations.

Questions. Can two receipts race to the same bin capacity? Is capacity a different claim than stock reservation?

Attacks. L-INV-15. Evidence E-10. undetermined.

### S-INV-19. Promise beyond on-hand

Moqui stores `quantityNotAvailable` on a reservation.

Questions. Is that a valid commitment or a rejected action? Does ATP go negative?

Attacks. L-INV-04. Evidence E-11.

## Movement, transformation, identity

### S-INV-20. Two-step transit

ERPNext Add to Transit, then End Transit.

Questions. Where is Q-ONHAND between the two submits? Can a third warehouse steal the in-transit qty?

Attacks. L-INV-13, L-INV-05. Evidence E-13.

### S-INV-21. Manufacture consume and produce

A work order consumes lot L1 and produces lot L2.

Questions. Is L1 gone? Can recall still walk L1 to L2? Is process loss stock?

Attacks. L-INV-11. Evidence E-23.

### S-INV-22. Repack

A case-of-12 becomes 12 eaches. The case GTIN and the each GTIN differ.

Questions. Is this transformation or combine or a UOM change? Product L-05.

Attacks. L-INV-11, L-INV-14. Evidence E-13, E-23.

### S-INV-23. Accept and modify, not consume

A serialized machine is repaired and keeps its serial.

Questions. Did identity survive? Did stage change? ValueFlows accept or modify.

Attacks. L-INV-06, L-INV-11. Evidence E-23.

### S-INV-24. Split batch

A batch of 100 is split into 40 and 60 with a new batch id on the 40.

Questions. Does recall of the parent still find both? Is split a movement or an identity event?

Attacks. L-INV-06. Evidence E-17.

### S-INV-25. Serial created without a warehouse

ERPNext. A Serial No created directly cannot set Warehouse.

Questions. Does the serial exist as identity before it exists as stock? Product L-01.

Attacks. L-INV-06. Evidence E-17.

### S-INV-26. Deliver a serial that is not Available

ERPNext. Only Available serials can be delivered.

Questions. Is status a stored decision or a projection of the last movement?

Attacks. L-INV-05. State CL-4.

## Reconciliation, time, valuation

### S-INV-27. Stocktake during an open pick

Counters count a bin while a picker has goods on a cart not yet issued.

Questions. Does the apply event steal reserved qty? Should in-progress picks be a custody location?

Attacks. L-INV-09, L-INV-04.

### S-INV-28. Opening stock

Cutover posts opening qty and rate as of a time.

Questions. Is this raise, or a fake receipt? ValueFlows prefers a real action when known.

Attacks. L-INV-09. Evidence E-14, E-20.

### S-INV-29. Frozen period

A user tries to backdate into a frozen stock period without the override role.

Questions. Is freeze a policy on the action or a property of time?

Attacks. L-INV-08. Evidence E-19.

### S-INV-30. Landed cost after receipt

Customs duty arrives two weeks after the purchase receipt.

Questions. Do already-issued layers revalue? ERPNext says future SLE and GL recompute.

Attacks. L-INV-10, L-INV-08. Evidence E-19, E-22.

### S-INV-31. Costing method change with stock on hand

Odoo warns that changing costing method is high impact. Existing standard-cost units keep their value.

Questions. Is the method a property of the specification, the slice, or the event stream?

Attacks. L-INV-10. Evidence E-22.

### S-INV-32. Quality reject on receipt

10 received, 7 accepted, 3 rejected to a rejected warehouse. Quality Inspection is mandatory.

Questions. Are there two movements? Does the purchase order pending qty use accepted only?

Attacks. L-INV-12. Evidence E-21, E-20 path on PR.

### S-INV-33. Over-delivery allowance

Order 100. Limit 10 percent. Supplier sends 120.

Questions. Is 10 extra a valid movement? Is 20 extra a rejected action?

Attacks. L-INV-05. Evidence E-25 adjacent, S-ERN-SET Limit Percent.

## Interchange and correction

### S-INV-34. Duplicate EPCIS ObjectEvent

The same pallet observe event arrives twice with different record times.

Questions. Does business location change twice? What identity is the event id?

Attacks. L-INV-16. Standards L-001.

### S-INV-35. Late error declaration

A transformation event is later declared erroneous. Outputs already shipped.

Questions. Does recall unwind? Is the declaration a new fact?

Attacks. L-INV-11, L-INV-16. Standards L-001.

### S-INV-36. Negative serial attempt

Allow Negative Stock is on. A user delivers a serial that was never received.

Questions. ERPNext v15 must refuse. What OS law is that?

Attacks. L-INV-07. Evidence E-18.

## Coverage map

Issue 18 asked for concurrent reservation, backdated receipt, lot recall, consigned stock, in-transit stock, damaged stock, duplicate movement, and corrected UOM. Those are S-INV-01 through S-INV-08. The rest fill transformation, hold, valuation, and freeze.

Thirty-six cards. Seed S-007 and S-008 remain the shared suite entries.
