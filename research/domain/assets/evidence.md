# Evidence

Cards below are either **domain evidence** or **source-system artifact**. Interpretation sits in [candidate-laws.md](candidate-laws.md). Scenarios that attack the interpretation sit in [scenarios.md](scenarios.md).

## E-001 One ERPNext Asset carries finance and operations

**Kind:** source-system artifact  
**Decision:** `supported` as ERPNext behavior. `undetermined` as a domain law.

**Question.** Is the valued balance-sheet thing the same object as the maintainable machine?

**Source.** EN-ASSET.

**Observed model.** The Asset record is "the operating history of something the company uses." It links Item, purchase value, location, maintenance plan, depreciation, and disposal. Statuses include Submitted, Partially Depreciated, Fully Depreciated, In Maintenance, Out of Order, Sold, Scrapped, and Capitalized.

**Observed behavior.** Location must change through Asset Movement. Maintenance Required enables plans. Grouped quantity is allowed. Docs prefer one record per unit when custodian, maintenance, or disposal must be individual.

**Interpretation.** ERPNext collapsed financial capitalization and operational equipment into one submitted document.

**Alternative.** The collapse is a product convenience. Odoo splits the same world across Accounting Assets and Maintenance Equipment. See E-002.

**Cross-reference.** OD-ACC, OD-EQ, ISA-EQ, ISA-PA.

## E-002 Odoo splits accounting asset from maintenance equipment

**Kind:** source-system artifact  
**Decision:** `supported` as Odoo behavior.

**Question.** Same as E-001.

**Source.** OD-ACC, OD-EQ, OD-SETUP.

**Observed model.** Accounting Assets are non-current or fixed-asset journal objects with a depreciation board, prorata, modify, and dispose. Maintenance Equipment is a machine or tool used in operations. It has category, technician, work center, serial, warranty date, and computed MTBF.

**Observed behavior.** Official 18.0 accounting pages never mention maintenance requests. Official maintenance pages never mention depreciation boards. Equipment may be owned by the company or by a third party, including rentals.

**Interpretation.** Financial capitalization and maintainable equipment are different questions. A rented forklift can need maintenance without sitting on the operator's balance sheet.

**Counterexample needed.** A jurisdiction or audit rule that forbids operational identity without a capitalization record. None found this session.

## E-003 ISA-95 splits role equipment from serial physical asset

**Kind:** domain evidence  
**Decision:** `supported` for the distinction. `undetermined` for ISA-95 Part 1 attribute lists.

**Question.** When a meter is swapped for service, did the equipment change?

**Source.** ISA-EQ, ISA-PA.

**Observed model.** "A logical device (equipment) usually does not change, but a physical device may change over time." Example in the companion spec. A meter is replaced by an identical meter. The physical device changed. The logical equipment did not. Assignment is a dated structure with Id, AssignmentDescription, StartTime, and EndTime or StopTime. History is required. From history a user can list every physical asset that represented a logical equipment, and every equipment a physical asset served.

PhysicalAsset carries vendor, model, FixedAssetId, and composition of other physical assets. Equipment carries EquipmentLevel, class, capability tests, and MadeUpOfEquipment.

**Interpretation.** Role in the process and serial hardware are different identities. Assignment is a temporal relator, not a mutable foreign key with no history.

**Alternative.** ERPNext Asset Movement history could be enough if the Asset is always the serial thing and the role is a location. That alternative fails when two serials occupy one role over time and work history must stay on the role. See S-007 and S-016.

## E-004 SAP functional location versus equipment

**Kind:** domain evidence  
**Decision:** `supported` as SAP Asset Management teaching.

**Question.** Is the install place the same as the installed object?

**Source.** SAP-TO.

**Observed model.** A functional location is "an area within a system or plant where an object can be installed," built as a hierarchy. Equipment is "individual maintenance objects" installed at functional locations. "The usage times of a piece of equipment at a functional location are documented over the course of time." Measuring points and counters attach to either technical object. Spare parts are product master records.

**Interpretation.** Place-in-plant and serial equipment are distinct. Installation is a dated occupancy. Spare parts are inventory identity, not a second equipment master. Cite #18 for stock.

## E-005 Maximo rotating item, rotating inventory, rotating asset

**Kind:** domain evidence  
**Decision:** `supported` as IBM-documented Maximo behavior.

**Question.** How can a spare be both stock and a serialized maintainable thing?

**Source.** MX-ROT.

**Observed model.** A rotating item is an item with the rotating flag. Balance is made of individual serialized assets. Rotating inventory is that item in a storeroom. Rotating assets are the asset records. Issue requires item number and asset number. Consumable issue expenses value. A rotating asset's value can increase after repair or overhaul. The term rotating names the cycle inventory, use, repair, inventory.

**Interpretation.** Specification, stock position, and serial instance are three questions. Component replacement is often a rotate, not a mutation of one identity. Cite #18 for the stock side.

## E-006 Location is not inventory warehouse

**Kind:** domain evidence  
**Decision:** `supported`.

**Question.** Is the place of a fixed asset the same as a stock bin?

**Source.** EN-LOC. Contrast OD-EQ "Used in location" free text and Work Center link.

**Observed model.** ERPNext. "Is Asset Location the same as Warehouse? In ERPNext, no. Warehouse tracks inventory quantities. Asset Location tracks the physical position of fixed assets." Locations form a tree with parent, group flag, optional area, and coordinates. Do not assign an asset to a broad group when a leaf exists.

**Observed behavior.** A draft Asset Movement does not change the current location. Submit does.

**Interpretation.** Custody of a unique thing and quantity-at-bin are different facts. Collapsing them loses either serial history or stock math.

## E-007 Location and custody change by event, not by silent field edit

**Kind:** domain evidence  
**Decision:** `supported` in ERPNext. `hypothesis` as a general law.

**Question.** Can current location be a mutable field with no history?

**Source.** EN-MOVE, EN-ASSET FAQ "Can I change the location directly?"

**Observed model.** Purposes are Transfer, Issue, Receipt, and Transfer and Issue. Latest submitted movement updates location or custodian. Earlier movements remain. Movement does not post to the ledger.

**Interpretation.** Current place is a projection of assignment events. See L-002.

## E-008 Maintenance plan is not repair

**Kind:** domain evidence  
**Decision:** `supported`.

**Question.** Is planned service the same kind of fact as a failure recovery?

**Source.** EN-MAINT FAQ. "Is preventive maintenance the same as repair? In ERPNext, no. Maintenance is planned work. Asset Repair records a failure, downtime, repair cost, and possible capitalization." EN-LOG. A log is operational and does not post to the ledger. Repair invoices or capitalized costs do.

**Odoo contrast.** OD-REQ uses one Maintenance Request for both Preventive and Corrective. Stages end in Repaired or Scrap even for preventive work. That naming is a source artifact.

**Interpretation.** Intent of work and trigger of work are distinct. Product document shape is not.

## E-009 Plan occurrence has its own result

**Kind:** domain evidence  
**Decision:** `supported` in ERPNext. `undetermined` as a required separate kind.

**Question.** If a monthly inspection is missed, did the plan change or did one occurrence fail?

**Source.** EN-MAINT troubleshooting. "Do not only change the plan because the historical occurrence still needs a result." EN-LOG statuses Planned, Completed, Overdue, Cancelled. Next due date follows periodicity and last completion.

**Odoo contrast.** OD-REQ Request Date cannot be changed. Scheduled Date is the team's plan. Official pages describe stage moves on the same request, not a generated occurrence series. Recurrence is mentioned in third-party guides. Official 18.0 pages fetched here do not specify auto-generation. Recurrence mechanics stay `undetermined` for Odoo.

**Interpretation.** A standing plan and a dated occurrence can diverge. Whether they are two types or one type with instances is open. See L-003.

## E-010 Failure observation is not the repair action

**Kind:** domain evidence  
**Decision:** `supported`.

**Question.** Does recording a breakdown already record what was done?

**Source.** EN-REPAIR, EN-REPAIR-JSON. Required `failure_date`. Optional Error Description. Separate `actions_performed`. `completion_date` required only when status is Completed. `downtime` is read-only. Pending failure can place the asset Out of Order. Completion restores operating state only if no other active repair remains.

**Odoo.** OD-EQ Latest Failure is the creation date of the most recent maintenance request, not an investigated failure instant. That is a source artifact and a likely semantic error for backdated discoveries. See S-012.

**ISO 14224.** Failure mode is the manner of failure. Failure mechanism is the process that leads to failure. Detection method is how the failure was discovered. ERPNext and Odoo forms do not force that split.

**Interpretation.** Observation time, observed manner, diagnosis, and corrective action are different facts. ERPNext splits observation text from action text. It does not split mode from mechanism from cause.

## E-011 Capital repair can change life. Routine work does not

**Kind:** domain evidence  
**Decision:** `supported` as an accounting-operations fork.

**Question.** Does every maintenance cost change asset value?

**Source.** EN-MAINT. Routine maintenance normally does not affect value. EN-REPAIR. Capitalize only when policy says the cost increases future economic benefit. EN-REPAIR-JSON `capitalize_repair_cost` and `increase_in_asset_life` in months. EN-CAP consumes stock, existing assets, and services into a composite target.

**Interpretation.** Expense versus capitalization is a policy decision over the same physical work. The work event is not the value event.

## E-012 Condition is not financial status

**Kind:** domain evidence  
**Decision:** `supported`.

**Question.** Is "fully depreciated" the same as "cannot run"?

**Source.** EN-ASSET statuses mix ledger states and operating states on one list. EN-REPAIR. A pending failure can mark Out of Order. OD-REQ Block Workcenter prevents scheduling at a work center during the request. OD-SETUP MTBF is computed from completed corrective maintenances, not from book value.

**Interpretation.** Operating availability and remaining book value answer different questions. Putting them in one status enum is a source artifact.

## E-013 Work-center unavailability is a production input

**Kind:** domain evidence  
**Decision:** `supported` that the link exists. Enforcement details belong to #19 and #24.

**Question.** Can maintenance hide from the production plan?

**Source.** OD-REQ. If the request is For Work Center, Block Workcenter "prevent[s] work orders or other maintenance from being scheduled at the specified work center while the maintenance request is being processed." A request may cite a Manufacturing Order and Work Order where the issue arose.

**Interpretation.** Resource unavailability is a fact production planning must see. Whether block is a constraint, a calendar entry, or a capacity zeroing is `undetermined`. See S-005.

## E-014 Meters and measuring points are first-class in EAM, not in ERPNext Asset

**Kind:** domain evidence  
**Decision:** `supported` as a coverage gap.

**Question.** Is condition-based work possible without a dated measurement?

**Source.** SAP-TO measuring point categories, counters, measurement documents. MX-DASH meters on assets and locations, compared over a date range, shown beside work orders. EN-MAINT periodicity is calendar only. No meter DocType on the fetched Asset pages.

**Odoo.** Official 18.0 pages compute Expected MTBF as an editable day count. They do not document meter-triggered requests.

**Interpretation.** A measurement is an observation with time, subject, and unit. It is not a status field. Condition-based maintenance needs that observation. Calendar PM does not.

## E-015 Warranty is an interval on the thing, not a work type

**Kind:** domain evidence  
**Decision:** `supported` as a recorded fact. Claim-process semantics `undetermined`.

**Source.** OD-EQ Warranty Expiration Date. EN-ASSET insurance fields for insurer, policy dates, insured value. No fetched page models a warranty claim as a first-class action.

**Interpretation.** Cover interval can constrain who pays. It does not replace a failure or a repair.

## E-016 Calibration is planned work with certificate evidence

**Kind:** domain evidence  
**Decision:** `supported` as a maintenance task kind in ERPNext. Method and quality rule belong to #25.

**Source.** EN-MAINT. Plan "what must be done, how often, and who is responsible." Certificate required flag. FAQ lists calibration as a separate row. EN-TASK-TYPES literals Preventive Maintenance and Calibration. EN-LOG attach certificate when required.

**Interpretation.** Calibration is a purpose of planned work plus an evidence artifact. It is not a separate asset identity.

## E-017 Capability tests attach to role equipment and to physical assets

**Kind:** domain evidence  
**Decision:** `hypothesis` for OS. `supported` as ISA-95 companion structure.

**Source.** ISA-EQ EquipmentCapabilityTestSpecification, historized test results. ISA-PA PhysicalAssetCapabilityTestSpecification. Tests "ensure that the equipment has the necessary capability and capacity."

**Interpretation.** Capability can change, and the change can be evidenced by a test result with history. That is the hook for S-010. Production capability of a work center is #19.

## E-018 Odoo Latest Failure uses request creation time

**Kind:** source-system artifact  
**Decision:** `supported` as Odoo documented computation. `rejected` as a domain definition of failure time.

**Source.** OD-EQ. "Latest Failure: the most recent date on which the equipment failed. This date is based on the creation date of the equipment’s most recent maintenance request."

**Why it matters.** A backdated discovery, a preventive request, or a duplicate request would move "latest failure." Valid time and knowledge time collapse. See constitution item 10 and S-012.

## E-019 Equipment composition is not the same as financial composite

**Kind:** domain evidence  
**Decision:** `hypothesis`.

**Source.** ISA-EQ MadeUpOfEquipment. ISA-PA MadeUpOfPhysicalAsset. EN-CAP Composite Asset and consumed assets. EN-ASSET Asset Type Existing, Composite Asset, or Composite Component.

**Interpretation.** A pump made of motor plus seal is composition. Capitalizing construction cost is a value event. Replacing the motor may keep the pump role and change one physical child. Those are easy to smash into one "parent asset" field.

## E-020 Predictive maintenance in Odoo 18 is MTBF arithmetic

**Kind:** source-system artifact  
**Decision:** `supported` as documented. `rejected` as evidence that predictive maintenance is a distinct kind.

**Source.** OD-SETUP, OD-EQ. Mean Time Between Failure from completed corrective work. Estimated Next Failure equals Latest Failure Date plus MTBF. Mean Time To Repair from completed request duration. Expected MTBF is the only editable forecast field.

**Interpretation.** This is a derived reliability statistic, not a sensor-driven prediction. True predictive or condition-based work needs E-014.

## E-021 Requested work is not completed work

**Kind:** domain evidence  
**Decision:** `supported`. Aligns with constitution item 8 and thesis Action versus Event.

**Source.** EN-LOG Planned versus Completed. EN-REPAIR Pending versus Completed. OD-REQ stages New Request through Repaired or Scrap. OD-REQ-FIELDS `schedule_date` is when the team plans the work.

**Interpretation.** A request or plan can fail, go overdue, or be cancelled. Completion is a later fact. This does not decide whether they share one identity. See L-003.
