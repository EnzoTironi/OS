# Lifecycles

**Kind:** domain evidence with source artifacts named  
**Decision:** the phase lists are `supported` as source behavior. Mapping them onto OS primitives is `undetermined`.

These are not state machines to implement. They show which facts change, and which facts must remain.

## Financial capitalization

**Sources.** EN-ASSET, EN-CAP, OD-ACC.

Typical phases seen.

1. Acquired or constructed. Purchase receipt, bill, or capitalization of stock, services, and consumed assets.
2. Available for use. ERPNext Available-for-Use Date starts depreciation. Odoo first depreciation date and optional prorata.
3. Depreciating. Posted periodic entries. ERPNext per Finance Book. Odoo depreciation board.
4. Value adjusted. Odoo Modify Depreciation. ERPNext value adjustment is referenced from Asset docs and was not fetched in full.
5. Disposed. Sold or scrapped. Removed from the balance sheet. Odoo requires a posted customer invoice before linking a sale.

**Invariant candidates.** Book value after disposal is not an operating location. A fully depreciated thing can still run. A running thing can have zero book value.

**Source artifact.** ERPNext puts Fully Depreciated on the same status list as Out of Order.

## Role occupancy and serial assignment

**Sources.** ISA-EQ, ISA-PA, SAP-TO, MX-ROT, EN-MOVE.

```text
role or functional location
        ^
        |  dated assignment / usage time / movement
        v
serial physical thing
        ^
        |  optional stock position
        v
storeroom or warehouse   (#18)
```

Phases for the serial thing.

1. Specified as a class or item. Maximo rotating item. ERPNext Item with Is Fixed Asset.
2. Instantiated with vendor identity. Serial, FixedAssetId.
3. In store, in transit, or installed.
4. Assigned to a role or custodian for an interval.
5. Unassigned, repaired, or scrapped.
6. Possibly reassigned to another role.

**History rule from ISA-95.** Assignment variables historize. Prior physical assets of a role remain queryable. Prior roles of a physical asset remain queryable.

**ERPNext projection.** Current Location and Custodian update on submit of Asset Movement. Older movements stay as documents. The product does not name a separate role object.

## Operating condition

**Sources.** EN-ASSET, EN-REPAIR, OD-REQ.

Observed operating marks.

- Available, implied by submitted and not out of order
- In Maintenance
- Out of Order
- Blocked work center during an Odoo request
- Scrapped after failed repair
- Sold

**Open.** Is condition a stored status or a function of open repairs, open requests, and meter limits? Constitution question 6 applies. Decision `undetermined`.

**Partial evidence.** ERPNext docs say a pending repair can place the asset out of order, and completion restores state only if no other active repair remains. That is closer to a projection than to an independent enum. The list view still shows a status field.

## Maintenance plan

**Sources.** EN-MAINT, EN-LOG, SAP-TO task lists and maintenance plans.

```text
standing plan
  task, type, periodicity, assignee, certificate required
        |
        v
occurrence   Planned -> Completed
             Planned -> Overdue -> Completed
             Planned -> Cancelled
        |
        v
next due date from periodicity and last completion
```

**ERPNext warning.** Changing the plan does not erase an overdue occurrence. The occurrence still needs a result.

**Odoo.** One request document moves across New Request, In Progress, Repaired, or Scrap. Recurrence generation was not in the official pages fetched. Treat Odoo as request-centric, not plan-centric, until corpus #33 says otherwise.

## Failure and repair

**Sources.** EN-REPAIR, EN-REPAIR-JSON, OD-REQ, ISO-14224-PRE.

```text
observation
  when noticed   knowledge time
  when failed    valid time     (Odoo Latest Failure collapses these)
  manner         failure mode
  how found      detection method
        |
        v
diagnosis   optional, later
  mechanism, cause, failed part
        |
        v
work
  Pending / In Progress
  Completed with actions, parts, invoices
  Cancelled
  Scrap
        |
        v
value decision   expense or capitalize, maybe extend life
```

ERPNext Repair Status is Pending, Completed, Cancelled. Downtime is derived from failure and completion timestamps.

ISO 14224 asks for equipment data, failure data, and maintenance data as separate collections. That is stronger than either ERP form.

## Production interference

**Sources.** OD-REQ, SAP-TO production work center on the technical object.

```text
maintenance request For Work Center
        |
        +--> optional Block Workcenter
        |
        v
no new work orders or other maintenance at that center
        |
        v
already released manufacturing work   #19 #24, undetermined
```

Whether an in-flight manufacturing order is suspended, delayed, or allowed to finish is not specified on the Odoo page. See S-006.

## Composite construction

**Sources.** EN-CAP, EN-ASSET Asset Type.

```text
stock + services + consumed assets
        |
        v
Asset Capitalization
        |
        v
target Asset   new or eligible composite
        |
        v
source assets updated or consumed
depreciation follows available-for-use on the target
```

This is a value-and-identity event. It is not the same as installing a rotating spare into a role. See E-019.

## What must remain after later events

| Later event | Must still be answerable |
| --- | --- |
| Relocation | Where it was, who moved it, when the move was known |
| Serial swap | Which device occupied the role then. Which work was about the role versus the device |
| Completed repair | Failure date, actions, parts, expense versus capital |
| Overdue PM | That the occurrence existed and was not done |
| Disposal | Book history and last operating place |
| Capability test | Prior test results, not only the latest pass |
| Backdated failure | What planners believed before the late report |
