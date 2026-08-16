# Mantle domain atlas

Reference lookup for issue 34. Claims and citations live in `research/notes/issue-0034-moqui-mantle-archaeology.md`. Record IDs below point at that note.

Decision state for the atlas as a whole is `hypothesis` outside the cited Mantle docs.

## Map

```text
Party + RoleType
    -> Agreement, CommunicationEvent, ContactMech
Facility + ContactMech
Product (description)
    -> Asset (instance) -> AssetDetail (quantity change)
    -> AssetReservation, AssetIssuance, AssetReceipt
OrderHeader
    -> OrderPart (customerPartyId, vendorPartyId, ship slice)
        -> OrderItem (shared ItemType)
            -> OrderItemBilling -> InvoiceItem
            -> OrderItemWorkEffort -> WorkEffort
Shipment
    -> ShipmentItem -> ShipmentItemSource -> OrderItem, ReturnItem, InvoiceItem
    -> ShipmentPackage, ShipmentRouteSegment
Invoice (fromPartyId -> toPartyId)
    -> InvoiceItem
    -> PaymentApplication <- Payment
AcctgTrans
    -> points at invoice, payment, issuance, receipt, shipment, work effort
WorkEffort
    -> picklist, task, project, manufacturing route, shipment calendar
```

## Party

Domain distinction. A person or organization that can play many roles. C-003, C-004. E-013.

Source artifacts. `Party`, `Person`, `Organization`, `PartyRole`, `RoleType`, `PartyRelationship`, `PartyIdentification`, `PartyClassificationAppl`.

Entities observed in `entity/PartyEntities.xml` at UDM `f53aba96a14fc97c6b42918300ee880fa0eb03a1` include Agreement, CommunicationEvent, ContactMech, PostalAddress, TelecomNumber, TimePeriod.

Candidate law. L-002. Kind and role are different.

Gotcha. PartyRole is optional. Other records point at Party and RoleType, not at PartyRole.

## Contact mechanism

Domain distinction. A means of contact with history. E-014. I-002.

Source artifacts. Immutable `ContactMech`. `PartyContactMech` and `Facility` contact rows carry from and thru dates. Order, invoice, return, shipment, and work-effort contact joins do not.

Runtime consequence. R-004. Replace the current pointer. Do not edit the historical record.

## Product and asset

Domain distinction. Product describes what can be sold or made. Asset is an instance or a homogeneous batch. AssetDetail is a quantity change. C-005. L-003. E-015.

Source artifacts. Product definition entities in `entity/ProductDefinitionEntities.xml`. Asset entities in `entity/ProductAssetEntities.xml`, including `Asset`, `AssetDetail`, `AssetReservation`, `AssetIssuance`, `AssetReceipt`, `Lot`, `PhysicalInventory`.

How instances are tracked, from the Product docs.

- Physical goods use Asset.
- Asset-use and facility-use products use Asset or Facility plus WorkEffort for schedule.
- Services use WorkEffort, and often Request or Requirement.

Gotcha. Asset also means equipment and fixed assets. That may be more than inventory law.

## Order

Domain distinction. A commercial commitment that can be split by customer, vendor, ship-to, and date. C-006. E-016.

Source artifacts. `OrderHeader`, `OrderPart`, `OrderItem`, `OrderItemBilling`, `OrderPartParty`, `ReturnHeader`, `ReturnItem`. File `entity/OrderEntities.xml`.

Status. Cart, vendor proposal, and placed order share OrderHeader. E-017. D-002.

Item status. Inferred from quantities, not stored on OrderItem.

Shared item types. OrderItem, InvoiceItem, and ReturnItem use the same type catalog. E-018.

USL verbs. `propose#Order`, `place#Order`, `approve#Order`, `complete#Order`, `cancel#Order`, `reject#Order`. E-022.

## Shipment

Domain distinction. A directed goods movement that can draw from many order lines and produce many invoice lines. C-007. E-019.

Source artifacts. `Shipment`, `ShipmentItem`, `ShipmentItemSource`, `ShipmentPackage`, `ShipmentRouteSegment`. File `entity/ShipmentEntities.xml`.

Dates. Estimated ready, ship, arrival, and latest cancel on Shipment. Actual start and arrival on the route segment. Optional WorkEffort for calendar. L-006.

Packed. Documented billing trigger. I-005. Hypothesis until SECA conditions are read.

USL verbs. `pack#Shipment`, `ship#Shipment`, `deliver#Shipment`, `receive#EntireShipment`, `cancel#Shipment`. E-022.

## Invoice and payment

Domain distinction. Invoice is a claim. Payment is a settlement. Application is a many-to-many relator. C-008, C-009. E-020. I-006.

Source artifacts. `Invoice`, `InvoiceItem`, `Payment`, `PaymentApplication`, `BillingAccount`, `FinancialAccount`, `PaymentMethod`, `SettlementTerm`. Files `entity/AccountingAccountEntities.xml` and `entity/AccountingLedgerEntities.xml`.

Direction. fromPartyId to toPartyId. Docs say purchase versus sales is direction, not type. I-004 remains hypothesis because USL still names `create#SalesShipmentInvoices` and `create#PurchaseShipmentInvoices`.

Posting. Outgoing invoice at Finalized. Incoming invoice at Approved. Payment at Delivered. AcctgTrans keeps the trigger id. E-021.

## Inventory composition

Place an order. SECA on `update#OrderHeader` calls `reserve#AssetsForOrder`. E-009.

Pack a shipment. Docs say Packed creates invoices. SECA on `update#Shipment` calls `create#SalesShipmentInvoices`. E-009, E-019.

Receive. `receive#Asset` and `receive#EntireShipment`. AssetDetail on-create updates Asset totals. E-010.

Ledger. Issuance, receipt, invoice, payment, and work effort can each produce AcctgTrans. E-021.

## Work effort

Domain distinction. Work that can be planned, assigned, timed, and billed. C-011.

Used as picklist, task, project, manufacturing route, and shipment calendar event. Official Work Effort and Shipment pages.

Decision state. `hypothesis` that one work type is enough.

## Framework versus domain

Framework. Entity, Service, Screen, Transaction, Artifact Execution, SECA, EECA. E-027.

Domain. Party, role, product, asset, order, shipment, invoice, payment, work, agreement.

The verb-plus-noun Service name is a framework habit that happens to preserve domain verbs when authors choose `place` instead of `update`.
