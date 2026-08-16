# Scenarios

Adversarial cards. Happy paths are omitted unless they set up a later break. Each card states Kind, Decision (what the scenario does to a law), and the law it attacks.

Required issue cases are L-S-001 through L-S-006. Count at end of file.

## L-S-001 Multi-leg delivery

- **Kind:** counterexample
- **Decision:** supported as a required case. Attacks L-C-010 (one object) and supports L-C-003.
- **Setup:** Seller in Campinas tenders a pallet to Carrier A for the first leg to a São Paulo hub. Carrier B takes the second leg to the customer in Porto Alegre. One SSCC. Two AWBs.
- **Questions:** Is there one shipment or two? Where does custody sit at the hub? Which tracking code answers "where is it?" Does warehouse-exit fire once or twice?
- **Source pressure:** Moqui allows many `ShipmentRouteSegment` records and tracking per package-leg (S-MOQ-SH). GS1 can emit `shipping` then `transporting` then `accepting` (S-GS1-CBV). ERPNext Shipment page shows one AWB field. Odoo picking shows one `carrier_tracking_ref`.
- **If a model has one carrier field on one delivery row, this case needs an escape hatch.**
- **Runtime consequence:** observations must name a leg. Inventory #18 decides hub stock.

## L-S-002 Failed delivery

- **Kind:** counterexample
- **Decision:** supported. Attacks any law that treats warehouse validate as POD (L-C-005).
- **Setup:** Driver arrives. Customer is closed. Carrier records exception. Goods return to the depot the same night.
- **Questions:** Did delivery occur? Is fulfillment still complete? Who has custody at 21:00? Is this a new reverse movement or a failed attempt on the same leg?
- **Source pressure:** CBV `accepting` did not happen. Disposition may stay `in_transit` or become something the 2.0 page does not name for "attempted." ERPNext Delivery Note is already submitted. Odoo delivery is already Done.
- **Undetermined:** first-party exception-code lists were not fetched.
- **Follow-on:** L-S-005 if the depot returns to sender, L-S-021 if the carrier reattempts.

## L-S-003 Split package

- **Kind:** counterexample
- **Decision:** supported. Supports L-C-002 and L-C-009.
- **Setup:** Sales order 20 chairs. Four boxes of 5. One Delivery Note or one picking. Four packing slips or four Odoo packages. Box 3 is delayed at the origin dock.
- **Questions:** What identity does box 3 have? Can boxes 1, 2, and 4 be tendered? Does fulfillment become 15 or stay 0 until all boxes move?
- **Source pressure:** ERPNext packing from a draft note, quantities cannot exceed the note (S-ERP-PS). Odoo one label per package (S-ODO-LBL). Moqui package-leg tracking (S-MOQ-SH). GS1 SSCC per logistic unit (S-GS1-SSCC).
- **If fulfillment is a flag on the shipment header, box 3 cannot be late independently.**

## L-S-004 Damaged goods

- **Kind:** counterexample
- **Decision:** supported. Attacks a single "received" flag (L-C-004, L-C-008).
- **Setup:** Pallet arrives. Receiver signs for 10 cases, notes 2 crushed. CBV `accepting` example notates over, short, or damaged at delivery and typically releases freight payment (S-GS1-CBV).
- **Questions:** Was the carrier contract completed? Was inventory received as 10, 8, or 10 with a quality hold? Does title or risk already sit with the buyer under CIF or CIP?
- **Source pressure:** CBV disposition `damaged`. CBV `inspecting` keeps objects viable. ERPNext Quality Inspection can block Delivery Note submit on the outbound side (S-ERP-DN), which is the wrong clock for inbound damage.
- **Leave to quality and #18:** hold versus scrap. Logistics must still record the accept-with-exception.

## L-S-005 Return-to-sender

- **Kind:** counterexample
- **Decision:** supported. Supports L-C-006. Not a cancel of L-S-002's outbound warehouse event.
- **Setup:** After L-S-002, the carrier cannot reattempt. Goods move from depot to the original ship-from. A new tracking code is issued.
- **Questions:** Is this a Sales Return, a purchase of transport, or a second route segment on the same shipment? Does Lane A fulfillment reverse when the seller regains custody, or only when a return document is posted?
- **Source pressure:** Moqui Sales Return type versus an extra route segment (S-MOQ-SH). ERPNext return Delivery Note from the original note (S-ERP-SR). Odoo reverse transfer (S-ODO-RET).
- **Undetermined:** whether RTS is typed as return or as a failed-leg continuation.

## L-S-006 Carrier handoff

- **Kind:** counterexample
- **Decision:** supported. Supports L-C-003. Related to L-S-001, focused on the custody instant.
- **Setup:** At the hub, Carrier A unloads. Carrier B loads the same SSCC six hours later. No seller staff present.
- **Questions:** Which event is `accepting` for A, `loading` for B, or both? Does ownership move? Does the seller's ERP learn this, or only the carriers' EPCIS?
- **Source pressure:** CBV `unloading` then `loading`. ValueFlows `transferCustody` from A to B with rights unchanged (S-VF-TR).
- **If OS only models seller-visible documents, this handoff is invisible and still real.**

## L-S-007 Partial shipment then plan change

- **Kind:** counterexample
- **Decision:** supported. Supports L-C-001. Extends scenarios/README S-002 into logistics.
- **Setup:** Order 10. First movement 4. Customer asks to accelerate the rest. Second movement 6 uses a different carrier.
- **Questions:** One commitment, two movements, two carriers. Which object is "the shipment"?
- **Source pressure:** ERPNext two Delivery Notes (S-ERP-DN). Odoo backorder (S-ODO-BAT).

## L-S-008 Proof of pickup after label

- **Kind:** counterexample
- **Decision:** supported. Supports L-C-005.
- **Setup:** Integration returns a label and tracking number at 09:00. Driver scans pickup at 16:40. Between those times the pallet sits on the shipper dock.
- **Questions:** At 12:00 is the state Packed, Tendered, or InTransit? May a second user void the label?
- **Source pressure:** Odoo tracking number on validate (S-ODO-LBL). Moqui Confirmed versus actualStartDate (S-MOQ-SH). CBV `shipping` sometimes fires when the trailer is sealed and "ready for pickup," before the truck leaves (S-GS1-CBV).

## L-S-009 One line split across packages, one package fails

- **Kind:** counterexample
- **Decision:** supported. Supports L-C-002.
- **Setup:** Line item 10 serials. 6 in PACK-A, 4 in PACK-B. PACK-B is lost after tender.
- **Questions:** Which serials are fulfilled? Which remain on the commitment? Does void_shipping name the SSCC or the serials?
- **Source pressure:** CBV `void_shipping` can name three of ten items (S-GS1-CBV). Serial identity is #18.

## L-S-010 Over-delivery

- **Kind:** counterexample
- **Decision:** hypothesis. Attacks a hard cap "shipped ≤ ordered" with no exception fact.
- **Setup:** Order 10. Warehouse ships 12. Customer keeps 12 or returns 2.
- **Questions:** Is 2 an error, a new sale, or a return of unsolicited goods?
- **Source pressure:** ERPNext Close is for short-close, not over (S-ERP-DN). CBV `accepting` notates over. First-party over-delivery workflow pages were thin this session. **Decision stays hypothesis.**

## L-S-011 Invoice without warehouse document

- **Kind:** counterexample
- **Decision:** supported. Attacks L-C-010 and L-C-011.
- **Setup:** ERPNext Selling Setting skips Delivery Note. Sales Invoice updates stock itself or does not, depending on Update Stock.
- **Questions:** If there is no Delivery Note, is there a shipment? Can a later Shipment document still attach an AWB?
- **Source pressure:** S-ERP-DN "Skipping Delivery Note." S-ERP-SH Shipment can be created independently.

## L-S-012 Warehouse document without invoice

- **Kind:** counterexample
- **Decision:** supported. Supports L-C-004.
- **Setup:** Delivery Note or picking validated. Invoice later. Customer already has the goods.
- **Questions:** Who has title at the night between them? Who has custody?
- **Source pressure:** ERPNext status To Bill (S-ERP-DN). Odoo return-before-invoice path (S-ODO-RET).

## L-S-013 Free freight above threshold, carrier still invoices

- **Kind:** counterexample
- **Decision:** supported. Supports L-C-007.
- **Setup:** Shipping Rule or Delivery Method waives the customer charge above 100. Carrier bill is 37.
- **Questions:** Where does 37 live? Is it landed cost (#18, #17) or a logistics incurred-cost fact?
- **Source pressure:** S-ERP-RULE, S-ODO-DM, S-MOQ-SH actualTransportCost.

## L-S-014 Return reopens fulfillment

- **Kind:** counterexample
- **Decision:** supported. Supports L-C-001 and L-C-006.
- **Setup:** Order completed. Customer returns 3 of 10. ERPNext says a return can make a completed delivery partially outstanding again (S-ERP-PF).
- **Questions:** Does a Closed order reopen? Must a human re-open before a replacement movement?
- **Source pressure:** S-ERP-PF, S-ODO-RET Delivered quantity falls.

## L-S-015 EXW pickup, seller never hires a carrier

- **Kind:** counterexample
- **Decision:** supported. Supports L-C-004. Risk clock from Incoterms.
- **Setup:** EXW. Buyer’s truck collects at seller dock. Seller records a warehouse exit. No AWB.
- **Questions:** Is there a Shipment? A Delivery Trip? Only a Delivery Note?
- **Source pressure:** Incoterms allocate obligations (S-ICC-INCO). ERPNext Shipment is optional. CBV `consigning` versus `shipping`.

## L-S-016 DPU versus DAP at the same address

- **Kind:** counterexample
- **Decision:** supported. Supports L-C-004.
- **Setup:** Same street address. DAP seller does not unload. DPU seller unloads (S-ICC-INCO).
- **Questions:** When is delivery complete? Is unload a logistics event or only a contract clause?
- **Source pressure:** CBV `unloading` exists. ERPNext and Odoo pages fetched do not distinguish DAP from DPU beyond an Incoterm field on ERPNext Shipment.

## L-S-017 Dropship, seller never holds the goods

- **Kind:** counterexample
- **Decision:** hypothesis for logistics. Inventory object left to #18.
- **Setup:** Odoo dropship source vendor, destination customer (S-ODO-DS). Moqui Drop Shipment type (S-MOQ-SH).
- **Logistics-only cut:** ship-from party ≠ seller facility. Custody never enters seller warehouse.
- **Do not model vendor stock here.**

## L-S-018 Void after false shipping event

- **Kind:** counterexample
- **Decision:** supported. Supports L-C-005 and L-C-006.
- **Setup:** ASN and EPCIS `shipping` published. Three of ten items were never loaded. Sender emits `void_shipping` for those three (S-GS1-CBV).
- **Questions:** Does the receiver's expected inbound decrease? Are the seven still `in_transit`?
- **Runtime consequence:** late correction. Bitemporal questions sit in `docs/open-questions.md` §7.

## L-S-019 Cross-dock, no reserve storage

- **Kind:** counterexample
- **Decision:** undetermined. See L-E-013.
- **Setup:** Inbound receiving dock to outbound trailer the same day. No putaway.
- **Questions:** Is this two movements, one movement, or a route that skips a location?
- **Do not invent a CrossDock type from this card.**

## L-S-020 Timeout after create shipment

- **Kind:** counterexample
- **Decision:** supported. Supports L-C-005. Mirrors scenarios/README S-004.
- **Setup:** Odoo integration level Get Rate and Create Shipment. Request leaves OS. Connection times out. Carrier may have a label.
- **Questions:** Is retry safe? Which event, if any, exists? What evidence is required before Void?
- **Source pressure:** Moqui gateway fields on package-leg (S-MOQ-SH). Constitution §9.

## L-S-021 Failed delivery then reattempt

- **Kind:** counterexample
- **Decision:** hypothesis
- **Setup:** L-S-002 then a second attempt next morning, same SSCC, new scan events.
- **Questions:** Same leg with two accept attempts, or a new leg? Does fulfillment flicker?
- **Undetermined:** no first-party reattempt object was fetched.

## L-S-022 Short-close remaining quantity

- **Kind:** counterexample
- **Decision:** supported. Supports L-C-001.
- **Setup:** Ordered 20, delivered 15, customer stops. ERPNext Closed manages short-close (S-ERP-DN).
- **Questions:** Is Closed a policy decision on the commitment, or a logistics status?
- **Leave commercial close to #16.** Logistics must stop creating movements.

## L-S-023 Return after consumption

- **Kind:** counterexample
- **Decision:** undetermined at the logistics boundary
- **Setup:** Customer consumed 4 of 10, returns 6, or claims a return of 10.
- **Questions:** Does logistics accept 6 and refuse 4, or accept 10 and let quality scrap 4?
- **Source pressure:** CBV `inspecting` on returned products (S-GS1-CBV). Consumption is manufacturing or inventory, not this folder.
- **Record and leave the consumed quantity to #18.**

## L-S-024 Quality hold blocks outbound

- **Kind:** counterexample
- **Decision:** supported as an outbound gate, not as a logistics primitive
- **Setup:** ERPNext Item requires Quality Inspection on sales. Delivery Note cannot submit without it (S-ERP-DN).
- **Questions:** Is the gate a constraint on PlanMovement, or a separate quality object?
- **Leave the inspection object to quality (#25). Logistics keeps the blocked action.**

## L-S-025 Delivery trip versus carrier segment

- **Kind:** counterexample
- **Decision:** supported. Supports L-C-003.
- **Setup:** Own fleet delivers 8 Delivery Notes in one vehicle afternoon loop (S-ERP-DT). No AWB. Google Maps optimizes stops.
- **Questions:** Is the trip a Shipment with 8 destinations, or 8 shipments on one WorkEffort-like route? If one stop fails, do the others remain delivered?
- **Odoo batch picking is a picker grouping, not this trip (S-ODO-BAT).**

## L-S-026 Risk already passed, goods damaged in transit

- **Kind:** counterexample
- **Decision:** supported. Supports L-C-004 and L-C-007.
- **Setup:** CIF. Risk passed at port. Container crushed at sea. Buyer owns the loss. Seller still has a carrier claim path.
- **Questions:** Does the seller's shipment become Delivered, Failed, or stay InTransit? Who records `damaged`?
- **Source pressure:** S-ICC-INCO CIF insurance default Institute Cargo Clauses (C). CBV `damaged` can come from sensor data.

## L-S-027 Late POD contradicts warehouse Done

- **Kind:** counterexample
- **Decision:** supported. Supports L-C-008.
- **Setup:** Odoo picking Done on Monday. Carrier POD arrives Thursday saying delivered Wednesday, or saying failed.
- **Questions:** Which clock is valid time? When did OS know? Can both claims remain?
- **See `docs/open-questions.md` §3 and §7. Do not invent the answer.**

## L-S-028 Packed quantity above movement

- **Kind:** counterexample
- **Decision:** supported as a forbidden case under L-C-009
- **Setup:** User tries to pack 12 onto a movement of 10.
- **Expected:** ERPNext refuses (S-ERP-PS). A legal over-delivery must be a second fact (L-S-010), not a silent pack overflow.

## L-S-029 Reusable tote versus disposable carton

- **Kind:** counterexample
- **Decision:** hypothesis. Boundary with #18
- **Setup:** Odoo Reusable Box used for cluster pick, then contents dumped into a Disposable Box for the carrier (S-ODO-PKG).
- **Logistics-only cut:** the shippable handling unit is the disposable carton. The tote stays in the warehouse.
- **Leave tote asset and location to #18.**

## L-S-030 Two tracking observations disagree

- **Kind:** counterexample
- **Decision:** supported. Supports L-C-008.
- **Setup:** Carrier API says delivered. Customer photo shows the box at a neighbor. EPCIS `accepting` was never sent.
- **Questions:** Observation, claim, or accepted fact? (`docs/open-questions.md` §3)
- **Do not pick a winner in this folder.**

## L-S-031 Installation after delivery

- **Kind:** counterexample
- **Decision:** hypothesis
- **Setup:** ERPNext Installation Note after Delivery Note (S-ERP-DN related topics).
- **Questions:** Is installation a logistics event, a service fulfillment, or a project task?
- **Undetermined.** Likely projects or services (#29), not a shipment status.

## L-S-032 International label plus commercial invoice

- **Kind:** source-system artifact used as a scenario
- **Decision:** supported that the documents exist, `undetermined` as ontology types
- **Setup:** Moqui `ShipmentPackageRouteSeg` stores `internationalInvoice` and label images (S-MOQ-SH). ERPNext AWB for air cargo (S-ERP-SH).
- **Questions:** Are customs documents logistics evidence or fiscal objects (#28)?
- **Record the need for an evidence attachment on a package-leg. Do not design a customs schema.**

## Count

32 cards. Required issue cases L-S-001 through L-S-006 are present.
