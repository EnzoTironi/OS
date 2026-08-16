# Evidence

Cards below are observations. Candidate laws live in [candidate-laws.md](candidate-laws.md). Scenarios that try to break those laws live in [scenarios.md](scenarios.md). Source ids resolve in [sources.md](sources.md).

## Canonical concepts

### L-E-001 Fulfillment is commitment progress
- **Kind:** domain evidence
- **Decision:** supported
- **Question:** Is "fulfillment" a shipment, a delivery, or something else?
- **Sources:** S-ERP-DN, S-ERP-PF, S-ODO-1S, S-MOQ-SH
- **Observed:** ERPNext updates pending quantity on the Sales Order when a Delivery Note is submitted, and `% Delivered` is net of return Delivery Notes. Odoo writes Delivered quantity on the sales order when a delivery order is validated, and a reverse transfer reduces that quantity. Moqui treats Packed as the point the shipment is "generally considered fulfilled for billing purposes."
- **Interpretation:** Fulfillment is progress against a commercial commitment. It is derived from movements and reversals, not a synonym for the movement document.
- **Source artifacts:** Sales Order `% Delivered`, Odoo `Delivered` column, Moqui Packed-to-invoice trigger.
- **Counterexample needed:** a source that stores fulfillment as a first-class object with its own identity independent of both order and shipment.
- **Runtime consequence:** if OS stores one `status=fulfilled` flag on a shipment, it cannot answer partial fulfillment or return-reopened outstanding quantity.

### L-E-002 Delivery Note is a stock-exit document, not a carrier shipment
- **Kind:** domain evidence
- **Decision:** supported
- **Question:** Does "delivery" mean warehouse stock left, or a carrier consignment?
- **Sources:** S-ERP-DN, S-ERP-SH
- **Observed:** ERPNext defines a Delivery Note as the document made when a shipment leaves the warehouse. Submit writes Stock Ledger Entries. A later Shipment document, introduced in v13, "keeps track of real-world Shipments" with AWB, carrier, service, and parcel dimensions, created from a Delivery Note or independently.
- **Interpretation:** The warehouse exit and the carrier consignment are different facts in ERPNext. The English word "shipment" appears in both pages and does not settle identity.
- **Source artifacts:** Delivery Note DocType, Shipment DocType.
- **Cross-reference:** Odoo folds carrier fields onto `stock.picking`. Moqui folds both into one Shipment. See L-E-010.

### L-E-003 Odoo delivery order is a warehouse transfer
- **Kind:** source-system artifact
- **Decision:** supported
- **Question:** What object does Odoo call a delivery?
- **Sources:** S-ODO-1S, S-ODO-3S, S-ODO-LBL
- **Observed:** Confirming a sales order creates a delivery (`WH/OUT`) or a chain of pick, pack, and delivery transfers. Validate on the last transfer moves quantity from `WH/Output` or `WH/Stock` to `Partners/Customers`. Carrier, tracking reference, and labels attach to that transfer.
- **Interpretation:** Odoo's delivery is a stock picking with an outgoing location pair. Carrier data is decoration and integration state on that picking.
- **Runtime consequence:** mapping Odoo delivery 1:1 to a GS1 shipping event loses the pick and pack transfers. Mapping it 1:1 to an ERPNext Shipment loses the stock-ledger meaning.

### L-E-004 Moqui Shipment is typed and always packaged and routed
- **Kind:** source-system artifact
- **Decision:** supported
- **Question:** Can one shipment object cover inbound, outbound, return, drop, and transfer?
- **Sources:** S-MOQ-SH
- **Observed:** Mantle Shipment has `shipmentTypeEnumId` values Sales Shipment, Sales Return, Purchase Shipment, Purchase Return, Drop Shipment, and Transfer. A shipment "always has one or more" `ShipmentPackage` records and "always has one or more" `ShipmentRouteSegment` records. Status runs Input, Scheduled, Picked, Packed, Shipped, Delivered, Cancelled. Packed triggers invoice creation.
- **Interpretation:** Moqui treats shipment as the operational aggregate. Direction and commercial flavor are a type. Physical boxes and transport legs are mandatory children.
- **Domain evidence:** the children (package, leg) look like domain. The single-aggregate choice is a modeling decision, not a proof that ERPNext's split is wrong.

### L-E-005 Handling unit is distinct from shipment and from product
- **Kind:** domain evidence
- **Decision:** supported
- **Question:** Is a package just a printout of shipment lines?
- **Sources:** S-ERP-PS, S-ODO-PKG, S-MOQ-SH, S-GS1-SSCC, S-GS1-CBV
- **Observed:** ERPNext Packing Slip splits a draft Delivery Note into numbered boxes with net and gross weight. Odoo package is "a physical container holding one or more products," with Disposable versus Reusable use, and package types that carry carrier and carrier code. Moqui records quantity per product per package and a box type. GS1 SSCC identifies a logistic unit, "any combination of trade items packaged together for storage and/or transport." CBV `packing` is the bizStep where aggregation into a larger container typically occurs.
- **Invariant implied:** a package has its own identity for the time it is aggregated. Contents can be a proper subset of a shipment.
- **Source artifacts:** Packing Slip, `stock.quant.package`, `ShipmentPackage`, SSCC.
- **Leave to #18:** reusable internal containers as warehouse locations or assets.

### L-E-006 Carrier is a party role plus a service offer
- **Kind:** domain evidence
- **Decision:** supported
- **Question:** Is carrier a kind of organization or a role on a leg?
- **Sources:** S-ERP-DN, S-ERP-SH, S-ODO-DM, S-ODO-LBL, S-MOQ-SH
- **Observed:** ERPNext Delivery Note has a Transporter (a Supplier with transporter enabled) and a Driver. ERPNext Shipment has Service Provider, Carrier, and Carrier Service (Economy, Express). Odoo Delivery Method has Provider, Delivery Product, pricing rules, availability, optional warehouse Routes, and Tracking Link. Moqui `CarrierShipmentMethod` binds `carrierPartyId` to `shipmentMethodEnumId`, `carrierServiceCode`, and SCAC. `ShippingGatewayConfig` lists estimate, rate, label, void, track, and address-validate services.
- **Interpretation:** the enduring party is not "a Carrier object." The logistics fact is which party performs which service on which leg. Party identity belongs to #14.
- **Source artifacts:** `delivery.carrier`, `CarrierShipmentMethod`, Shipment.Carrier.

### L-E-007 Warehouse route is not a carrier leg
- **Kind:** domain evidence
- **Decision:** supported
- **Question:** Are pick, pack, ship the same kind of thing as origin-to-hub-to-destination?
- **Sources:** S-ODO-3S, S-ODO-DM, S-ERP-DT, S-MOQ-SH, S-GS1-CBV
- **Observed:** Odoo three-step delivery creates internal transfers Stock to Packing Zone, Packing Zone to Output, Output to Customers. Odoo can bind a Delivery Method to a warehouse Route (express as one-step, international as three-step). ERPNext Delivery Trip is one vehicle, one driver, many customer stops tagged with submitted Delivery Notes. Moqui `ShipmentRouteSegment` is origin and destination contacts or facilities, carrier, method, estimated and actual start and arrival, and per-package tracking. CBV separates `packing` from `loading`, `departing`, `transporting`, `arriving`, `unloading`, `accepting`.
- **Interpretation:** two different graphs. One is intra-facility handling. The other is inter-party transport. Calling both "route" is a naming collision.
- **Decision on one kind for both:** `undetermined`. See L-Q-003.

### L-E-008 Custody transfer is not ownership or risk transfer
- **Kind:** domain evidence
- **Decision:** supported as a distinction, `undetermined` as a single transfer moment
- **Question:** Does handing a pallet to a driver change title?
- **Sources:** S-VF-TR, S-GS1-CBV, S-ICC-INCO, S-ERP-DN, S-ERP-SR, S-ODO-RET
- **Observed:** ValueFlows splits `transferCustody` from `transfer` of rights, and says pickup and dropoff imply custody only. CBV `shipping` is staging, loading, and departing. CBV `consigning` is similar "but includes a change of possession and/or ownership at the outbound side." CBV `accepting` verifies quantity against a freight bill or bill of lading, "releases freight payment and completes the contractual agreement with the carrier." CBV `receiving` "is added to the receiver's inventory" and is mutually exclusive with `arriving` and `accepting`. Incoterms 2020 allocate cost, risk, and obligations across 11 rules. DAP delivers before unload. DPU delivers after unload. ERPNext and Odoo can move stock without creating a credit or invoice, and can credit without a second stock move.
- **Interpretation:** at least four facts can diverge in time. Physical custody. Inventory recognition. Commercial title or rights. Contractual risk.
- **Standing order:** do not pick one identity for custody and title. See L-Q-001.

### L-E-009 In-transit is a disposition in GS1 and often a missing location in ERPs
- **Kind:** domain evidence
- **Decision:** supported that the state exists, `undetermined` as location versus disposition versus projection
- **Question:** Where is the stock after ship and before accept?
- **Sources:** S-GS1-CBV, S-GS1-GL, S-ODO-1S, S-ODO-3S, S-ERP-DN, S-MOQ-SH
- **Observed:** CBV disposition `in_transit` is "Object being shipped between two trading partners," example "Shipper Z pulled a container/product out of a manufacturer’s yard on to a road." The implementation guideline pairs shipping events with `in_transit`. ERPNext Delivery Note submit updates the warehouse immediately. Odoo one-step validate moves stock to `Partners/Customers` immediately. Odoo three-step holds goods at Output until the last validate. Moqui has Shipped then Delivered, with route-segment actual dates, and does not describe an in-transit facility in the page fetched.
- **Interpretation:** GS1 treats in-transit as business state after a shipping event. The three ERPs often skip an explicit in-transit location and jump warehouse to customer or to a status field.
- **Leave to #18:** whether in-transit stock is on-hand, in-transit inventory, or off-books.

### L-E-010 Shipment versus delivery identity forks
- **Kind:** domain evidence
- **Decision:** undetermined
- **Question:** Are shipment and delivery the same object in different phases, or two objects?
- **Sources:** S-ERP-DN, S-ERP-SH, S-ODO-1S, S-MOQ-SH, S-GS1-CBV
- **Observed:** ERPNext uses two documents. Odoo uses one outgoing picking named delivery. Moqui uses one Shipment whose late statuses are Shipped and Delivered. GS1 uses `shipping` as an outbound process and `accepting` or `receiving` as inbound processes. Delivery is not a CBV bizStep in the 2.0 text searched.
- **Interpretation:** the word "delivery" in ERPs often means "our warehouse exit." In trade speech and Incoterms, delivery is the seller's delivery point under the rule. In carriers, delivery is the last-mile complete event.
- **Do not collapse.** Independent sources do not agree on one identity.

### L-E-011 Proof of pickup or delivery is evidence
- **Kind:** domain evidence
- **Decision:** supported
- **Question:** Is a signed POD the same fact as stock leaving?
- **Sources:** S-GS1-CBV, S-MOQ-SH, S-ERP-DN, S-ODO-LBL
- **Observed:** CBV `accepting` is quantity check against the delivery document and a signature that boxes were taken from the parcel carrier. Moqui stores label images, tracking codes, and carrier-integration statuses Not Started, Confirmed, Accepted, Voided on the route segment. ERPNext records Transport Receipt No and Vehicle No on the Delivery Note. Odoo creates a tracking number when the delivery is validated if the carrier integration level is Get Rate and Create Shipment.
- **Interpretation:** pickup and delivery proofs are observations with a document or signature. They can arrive late, fail, or contradict the warehouse validate. Constitution §8 (requested is not happened) applies.
- **Source artifacts:** AWB, BOL, label image, `carrier_tracking_ref`.

### L-E-012 Partial and split movements are normal
- **Kind:** domain evidence
- **Decision:** supported
- **Question:** Must one order become one shipment and one package?
- **Sources:** S-ERP-DN, S-ERP-PS, S-ERP-PF, S-ODO-PKG, S-ODO-BAT, S-MOQ-SH, S-GS1-CBV
- **Observed:** ERPNext allows several Delivery Notes from one Sales Order and several Packing Slips from one Delivery Note, and refuses packing quantities above the note. Odoo Put in Pack and Detailed Operations put subsets of a transfer into packages. Odoo batch validate with short Done quantity offers Create Backorder. Moqui `ShipmentItemSource.quantityNotHandled` records quantity that should have shipped but did not. CBV `void_shipping` retracts objects from a prior shipping, departing, or consigning event, including "three out of ten items."
- **Invariant implied:** outstanding commitment quantity is not the same number as quantity on one movement.

### L-E-013 Cross-dock this session
- **Kind:** domain evidence
- **Decision:** undetermined
- **Question:** Is cross-dock a distinct logistics object or a route that skips storage?
- **Sources:** S-GS1-CBV, S-ODO-3S
- **Observed:** no first-party ERPNext, Odoo, or Moqui cross-dock page was fetched. CBV `staging_outbound`, `loading`, and `departing` can run without a `storing` step. Odoo three-step still parks goods in Packing Zone and Output.
- **Interpretation:** cross-dock looks like a path that never enters reserve storage. That is a location and reservation question for #18 plus a shipping-event sequence here.
- **Do not invent a CrossDock type.**

### L-E-014 Return is a reverse movement plus an optional commercial reversal
- **Kind:** domain evidence
- **Decision:** supported
- **Question:** Is a return a cancelled shipment?
- **Sources:** S-ERP-SR, S-ERP-PF, S-ODO-RET, S-MOQ-SH, S-GS1-CBV
- **Observed:** ERPNext creates a return Delivery Note with negative quantities from the original note. Stock and Credit Note are independent. A return can make a completed order outstanding again. Odoo Return on a validated delivery creates a reverse transfer. After invoice, a Credit Note is a second action. Moqui has shipment types Sales Return and Purchase Return. Older CBV has disposition `returned` and bizStep `entering_exiting` for customers entering with product to return. CBV 2.0 `inspecting` explicitly covers returned products designated saleable or damaged.
- **Interpretation:** reverse logistics reuses movement and evidence machinery in the opposite direction. It does not erase the outbound events.
- **Return-to-sender** is the same pattern with the original shipper as the new destination. See L-S-005.

### L-E-015 Billed freight, incurred freight, and risk are three facts
- **Kind:** domain evidence
- **Decision:** supported
- **Question:** Is shipping cost one number?
- **Sources:** S-ERP-RULE, S-ERP-SH, S-ODO-DM, S-ODO-LBL, S-MOQ-SH, S-ICC-INCO
- **Observed:** ERPNext Shipping Rule writes a charge into Taxes and Other Charges from net total, quantity, or weight, optionally limited by country. ERPNext Shipment stores Shipment Amount as "total cost incurred." Odoo Delivery Method adds a Delivery Product line on the sales order, while the picking stores `carrier_price` from the integrator. Moqui splits estimated versus actual, and transport versus service versus other, on both the route segment and each package-leg. Incoterms list costs per rule in articles A9 and B9, separate from risk.
- **Interpretation:** customer-billed freight, carrier invoice, and contractual risk transfer can disagree. A single `shipping_cost` field hides that.

### L-E-016 Tracking is a stream of observations
- **Kind:** domain evidence
- **Decision:** supported
- **Question:** Is the tracking number the shipment?
- **Sources:** S-GS1-EPCIS, S-GS1-CBV, S-GS1-GL, S-ERP-SH, S-ODO-LBL, S-MOQ-SH
- **Observed:** EPCIS events carry What, When, Where, Why, and in 2.0 How. A shipping ObjectEvent can name an SSCC, bizStep `shipping`, disposition `in_transit`, and business transactions such as `desadv` or `bol`. ERPNext stores Shipment ID, AWB, and status, manually or via shipping integration. Odoo stores `carrier_tracking_ref` and a URL. Moqui stores `trackingCode` on `ShipmentPackageRouteSeg`, not on the Shipment header alone. One shipment with two legs can have two tracking codes.
- **Interpretation:** a tracking code is an identifier used by a carrier integration to attach later observations. It is not the handling unit and not the commercial shipment.
- **Carrier-specific scan codes** stay `undetermined` (see sources.md).

### L-E-017 Dropship is a location pair, not a new movement kind
- **Kind:** domain evidence
- **Decision:** hypothesis for logistics, inventory object left to #18
- **Question:** Does dropship need a logistics type besides "not in our warehouse"?
- **Sources:** S-ODO-DS, S-MOQ-SH, S-ERP-DN
- **Observed:** Odoo dropship receipt has source `Partners/Vendors` and destination `Partners/Customers`. Validate confirms delivered quantity. Moqui lists Drop Shipment as a shipment type. ERPNext Delivery Note says transporter details are "not the same as drop shipping" and does not define drop shipping on that page.
- **Logistics-only cut:** the ship-from party is not the seller's facility. Custody may never enter the seller's warehouse.
- **Leave to #18:** ownership of the quantity, valuation, and whether the seller ever holds stock.

### L-E-018 Failed or voided outbound is a compensating observation
- **Kind:** domain evidence
- **Decision:** supported
- **Question:** If we recorded shipped and the truck never left, what happens?
- **Sources:** S-GS1-CBV, S-MOQ-SH, S-ERP-DN
- **Observed:** CBV `void_shipping` declares that objects in a prior shipping, departing, or consigning event were not shipped. Examples include cancel after a shipping event and discovery that three of ten items were missing. Moqui route-segment status includes Voided for carrier communication. ERPNext can cancel a Delivery Note, with v13 immutable-ledger rules changing backdated cancellation.
- **Interpretation:** a false outbound fact is not edited in place in the GS1 model. A later event retracts it. ERPNext cancellation is a source-system mechanism that may hide that distinction.
- **Runtime consequence:** unknown external outcome (constitution §9) must remain representable between tender and void or accept.

## Source artifacts (implementation-shaped)

### L-A-001 ERPNext document split
- **Kind:** source-system artifact
- **Decision:** supported as ERPNext's split, not as OS types
- **Sources:** S-ERP-DN, S-ERP-PS, S-ERP-SH, S-ERP-DT
- **Observed:** Delivery Note, Packing Slip (draft-only parent), Shipment, Delivery Trip, Installation Note, Sales Return.
- **Do not import:** DocType names, draft-before-packing workflow, Google Maps trip optimize.

### L-A-002 Odoo picking chain
- **Kind:** source-system artifact
- **Decision:** supported as Odoo's split
- **Sources:** S-ODO-1S, S-ODO-3S, S-ODO-PKG
- **Observed:** operation types Pick, Pack, Delivery. Locations `WH/Stock`, `WH/Packing Zone`, `WH/Output`, `Partners/Customers`. `Put in Pack`. `Move Entire Packages`.
- **Do not import:** warehouse step count as a semantic primitive.

### L-A-003 Moqui mandatory children and Packed billing
- **Kind:** source-system artifact
- **Decision:** supported as Moqui's split
- **Sources:** S-MOQ-SH
- **Observed:** billing fires at Packed, not at Shipped or Delivered. Picklist is a WorkEffort. `ShipmentItemSource` carries order, return, invoice, bin, and pick status.
- **Do not import:** Packed-as-invoice as a universal law. It contradicts ERPNext (stock on Delivery Note submit, bill on invoice) and Odoo (stock on validate, bill on invoice).

### L-A-004 GS1 event types
- **Kind:** source-system artifact
- **Decision:** supported as the standard's types
- **Sources:** S-GS1-EPCIS, S-GS1-CBV
- **Observed:** ObjectEvent, AggregationEvent, TransactionEvent, TransformationEvent, AssociationEvent. Actions ADD, OBSERVE, DELETE on aggregations.
- **Do not import:** EPC URI syntax or EPCIS query protocol as ontology primitives. The What, When, Where, Why dimensions are the domain-relevant cut.
