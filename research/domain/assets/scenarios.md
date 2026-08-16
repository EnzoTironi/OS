# Scenarios

Adversarial cards for later synthesis. Happy paths are omitted unless they expose a fork.

Each card names a **kind** and a **decision**. Most cards are **counterexample** against a collapsed model. A few are **domain evidence** restated as a required story.

Required families from issue #26 are marked.

## S-001 Equipment relocation with history

**Kind:** counterexample  
**Decision:** `supported` as a required story  
**Family:** relocation

A packaging head moves from Line A to the service workshop, then to Line B. Finance never changes.

Questions.

- Is the move one event or two?
- Can the system answer where the head was during Tuesday's scrap spike?
- Does Line A keep a hole in its equipment composition?

Attacks. Silent current-location field. L-002.

## S-002 Draft movement versus current place

**Kind:** counterexample  
**Decision:** `supported` by EN-MOVE

A clerk saves an Asset Movement and does not submit it. A dispatcher reads the Asset and sends a technician to the new room. The machine is still in the old room.

Questions.

- Is a draft assignment an operational fact?
- What is current place while the movement is unsubmitted?

Attacks. Treating unsaved intent as happened. Constitution item 8.

## S-003 Overlapping preventive and corrective

**Kind:** counterexample  
**Decision:** `supported` as a required story  
**Family:** overlapping maintenance

Monthly inspection is Planned for Friday. The machine fails Wednesday. A repair starts Wednesday and is still Pending on Friday.

Questions.

- Does Friday's occurrence cancel, wait, or proceed on a down machine?
- Can both records stay true?
- Which one owns downtime?

Attacks. One request document with one stage. L-003, L-005.

## S-004 Two crews booked on one serial

**Kind:** counterexample  
**Decision:** `hypothesis`

Calibration and belt replacement are both due Friday on the same asset. Teams differ. Only one can occupy the machine.

Questions.

- Is exclusivity a property of the serial, the role, or the work center?
- What happens if both complete and both claim the same downtime interval?

Attacks. Unbounded concurrent work with no occupancy fact.

## S-005 Unavailable resource changes the production plan

**Kind:** counterexample  
**Decision:** `supported` that the crossing exists  
**Family:** unavailable resource  
**Cite:** #19, #24

Odoo request For Work Center has Block Workcenter enabled. MRP had already promised 400 units from that center this week.

Questions.

- Is the block a rejected new schedule, a zeroed capacity, or a calendar hold?
- Does the production plan become stale, or does it stay and lie?
- Who may replan?

Attacks. Maintenance as an isolated app. L-010.

## S-006 Block after a manufacturing order is released

**Kind:** counterexample  
**Decision:** `undetermined` in fetched Odoo pages  
**Family:** unavailable resource  
**Cite:** #19

A work order is already in progress when the center is blocked for corrective work.

Questions.

- Does in-flight execution stop, finish, or split?
- Is that an execution fact or a planning fact?

Do not invent the product behavior. Record the gap.

## S-007 Component replacement keeps the role

**Kind:** counterexample  
**Decision:** `supported` as a required story  
**Family:** component replacement

Pump role P-101 always sits on the line. Motor serial M1 fails. Motor serial M2 is installed. Work history for "the line pump" must remain on P-101. Motor history must follow M1 to the shop.

Questions.

- What identity did last month's vibration PM target?
- What identity does the capitalized pump asset refer to?

Attacks. One Asset id for role and serial. L-001, E-003, E-005.

## S-008 Capitalizing a constructed machine

**Kind:** domain evidence  
**Decision:** `supported` as ERPNext behavior  
**Family:** component replacement, adjacent

Stock parts, an old conveyor asset, and vendor installation are capitalized into one composite Asset. The conveyor source is consumed.

Questions.

- Did the conveyor identity end or become a component?
- When does depreciation start?
- Can later replacement of a purchased motor use S-007 without another capitalization?

Attacks. Treating EN-CAP as the only composition model. E-019.

## S-009 Condition-based trigger before the calendar date

**Kind:** counterexample  
**Decision:** `supported` as a required story  
**Family:** condition-based maintenance

A vibration meter on the role crosses a limit on Tuesday. The preventive log is due Friday.

Questions.

- What object is created Tuesday?
- Does Tuesday's work satisfy Friday's occurrence?
- What evidence pins the trigger?

Attacks. Calendar-only plans. L-007, E-014.

## S-010 Historical capability change

**Kind:** counterexample  
**Decision:** `hypothesis`  
**Family:** historical capability

In March the line is tested at 800 units per shift. In June a gearbox change drops proven rate to 500. September MRP is audited. Why did March plans assume 800?

Questions.

- Is capability a current property or a dated test result?
- Does the gearbox swap create a new role or a new fact on the same role?

Attacks. Overwrite nameplate. L-008. Cite #19 and #24 for the plan that consumed the number.

## S-011 Observation versus diagnosis versus cause

**Kind:** counterexample  
**Decision:** `supported`  
**Family:** failure observation versus diagnosis

Operator at 10:00. "Pump loud, leaking."  
Technician at 14:00. "Mechanical seal worn."  
Reliability Friday. "Installation misalignment last month."

Questions.

- Can all three remain?
- Which one is the failure mode for reliability rates?
- If the technician edits the operator text, is that correction or erasure?

Attacks. One description field. L-004.

## S-012 Late-reported failure date

**Kind:** counterexample  
**Decision:** `supported`

The machine stopped Monday. Nobody entered a request until Thursday. Odoo Latest Failure becomes Thursday if it follows request creation. ERPNext lets Failure Date be Monday.

Questions.

- What was believed Tuesday?
- What is now believed about Monday?
- May a preventive request move Latest Failure?

Attacks. E-018. Constitution item 10.

## S-013 Warranty versus capitalization

**Kind:** counterexample  
**Decision:** `hypothesis`

A motor fails inside warranty. The vendor replaces it at no invoice cost. The plant still capitalizes nothing. The serial on the role changes.

Questions.

- Is there a repair with zero cost?
- Does warranty payership change the assignment event?
- If a later invoice arrives, is that a late value fact?

Attacks. "No invoice means no event." E-015, L-006, L-009.

## S-014 Calibration completed without the certificate

**Kind:** counterexample  
**Decision:** `supported` as ERPNext pressure  
**Cite:** #25

The task requires a certificate. The technician marks the log Completed and forgets the file.

Questions.

- Is completion allowed?
- If later attached, what is knowledge time versus completion time?
- Does production care about the certificate or only about the Completed flag?

Attacks. Status as a button with no evidence. E-016.

## S-015 Consumable spares on a repair

**Kind:** counterexample  
**Decision:** `supported`  
**Cite:** #18

Repair consumes five seals from a warehouse. Quantity on hand drops. The pump serial does not change.

Questions.

- Is this an inventory movement caused by maintenance, or a maintenance line that happens to list items?
- What if two of the five are returned unused after completion?

Attacks. L-006.

## S-016 Rotating spare install

**Kind:** counterexample  
**Decision:** `supported`  
**Family:** component replacement  
**Cite:** #18

Motor M2 is a rotating asset in a storeroom. Issue to role P-101 requires item number and asset number. Storeroom balance drops by that instance. M1 returns to the shop and can gain value from overhaul.

Questions.

- Does P-101's location history include M2's serial, or does M2's location become P-101?
- Where does the next PM land?

Attacks. Consumable-only spare model. E-005, L-001.

## S-017 Custody without a location change

**Kind:** counterexample  
**Decision:** `supported` by EN-MOVE Issue versus Transfer

A laptop stays on the same floor. Custody moves from employee A to employee B.

Questions.

- Is custody a location?
- Can both be true at once?
- What does Receipt mean if the floor never changed?

Attacks. One "responsible" field that overwrites place.

## S-018 Rented equipment under maintenance

**Kind:** counterexample  
**Decision:** `supported` by OD-EQ

A leased compressor is maintained by the plant. It must not appear as the plant's depreciable asset. Warranty sits with the lessor.

Questions.

- What identity is the maintenance request for?
- Who is the principal for cost?

Attacks. "Equipment implies fixed asset." L-009.

## S-019 Failed repair to scrap

**Kind:** counterexample  
**Decision:** `supported` as Odoo documented stage

The request moves to Scrap. The equipment cannot be repaired.

Questions.

- Is scrap an operating disposition, a financial write-off, or both?
- Does the role remain, waiting for S-016?
- ERPNext has a separate Scrapped asset status. Do they agree?

Attacks. One terminal status for role, serial, and book.

## S-020 Completion with no standing plan

**Kind:** counterexample  
**Decision:** `supported` by EN-LOG FAQ

A technician records an exceptional inspection. There is no Asset Maintenance row.

Questions.

- Is a manual log lawful?
- If yes, L-003 cannot say execution always instance-ofs a plan.
- If no, exceptional work has no place except Repair.

Attacks. Over-strict plan hierarchy. Keep plan ≠ completion.

## S-021 Overdue occurrence then late completion

**Kind:** counterexample  
**Decision:** `supported` by EN-LOG

The monthly log goes Overdue. Work happens six days late. Next due date must move from the completion date, not from the original due date, or the series drifts. The fetched docs say review periodicity and last completion.

Questions.

- Does late work satisfy the missed occurrence or create a new one?
- What is the identity of the overdue record after completion?

Attacks. Mutating due date without a result.

## S-022 Failure discovered on a manufacturing order

**Kind:** counterexample  
**Decision:** `supported` as Odoo field  
**Cite:** #19

OD-REQ allows a request to name the Manufacturing Order and Work Order where the issue arose.

Questions.

- Is that provenance on the observation, or a link that blocks the MO?
- If the MO later cancels, does the request lose meaning?

Attacks. Optional UI field with no semantics.

## S-023 Grouped quantity assets

**Kind:** counterexample  
**Decision:** `supported` as ERPNext warning

Ten identical chairs are one Asset with quantity 10. Two break. One is issued to an employee.

Questions.

- Can quantity 10 have one custodian and one maintenance log?
- When does the group have to split identity?

Attacks. Quantity on a unique-thing record. EN-ASSET prefers individual records when history must fork.

## S-024 Warehouse mistaken for asset location

**Kind:** counterexample  
**Decision:** `supported`  
**Cite:** #18

A clerk stores a spare motor in Warehouse RM-01 and also sets Asset Location to RM-01.

Questions.

- Does stock qty 1 equal the serial's place?
- After S-016, which record moved?

Attacks. R-003.

## S-025 Sold while a repair is pending

**Kind:** counterexample  
**Decision:** `hypothesis`

EN-REPAIR-JSON hides Sold and Scrapped assets from new repairs. It does not say what happens if sale posts while a repair is Pending.

Questions.

- Can both Sold and Out of Order be true?
- Does sale complete the repair, cancel it, or leave it?
- What does the buyer acquire?

Attacks. L-005. Single status enum.

## S-026 MTBF used as a production promise

**Kind:** counterexample  
**Decision:** `supported` as a misuse of E-020  
**Cite:** #24

Estimated Next Failure is 12 September. Planning treats the center as unavailable from that date.

Questions.

- Is a derived average a commitment?
- What if no failure occurs?
- What if the last request was preventive and still moved Latest Failure?

Attacks. Treating statistics as facts. R-002.

## S-027 Meter on the location, reading after a swap

**Kind:** counterexample  
**Decision:** `hypothesis`  
**Family:** condition-based, component replacement

SAP and Maximo allow meters on locations and on assets. A counter on functional location P-101 keeps hours for the hole. The installed motor has its own hour counter.

Questions.

- After S-016, which counter resets?
- Which counter triggers S-009?

Attacks. One meter list on "the equipment."

## S-028 Backdated meter reading

**Kind:** counterexample  
**Decision:** `hypothesis`

A handwritten round sheet from Monday is entered on Thursday. Tuesday's condition-based request already fired on a later, higher reading.

Questions.

- Valid time versus knowledge time for the measurement
- Was Tuesday's request justified under what was known then?
- Does Monday's reading create a second trigger or retract Tuesday?

Attacks. L-007 plus constitution items 9 and 10.

## S-029 Stale approval after relocation

**Kind:** counterexample  
**Decision:** `hypothesis`

At 10:01 a technician is approved to calibrate asset X at Line A. At 10:06 Asset Movement submits X to the workshop. At 10:07 the technician starts work at Line A.

Questions.

- What exactly was approved, the serial, the role, or the place?
- Must commit re-read assignment?
- See scenarios/README.md S-003 for the general stale-approval pattern.

Attacks. L-002, constitution item 8.

## S-030 Physical-asset assignment history query

**Kind:** domain evidence  
**Decision:** `supported` by ISA-EQ  
**Family:** relocation and component replacement

Auditor asks. List every serial that implemented role "Inline Meter 4" in 2025, and every role serial M-88 served.

Questions.

- Can both directions be answered from assignment history?
- If the product stores only the current ImplementedBy pointer, the query fails.

Attacks. Non-historized foreign key. L-001, L-002.

## S-031 Insurance claim versus operating state

**Kind:** counterexample  
**Decision:** `undetermined`

A fire-damaged machine is Out of Order. An insurance claim is opened using EN-ASSET insurance fields. Accounting wants it written down. Operations wants it repaired.

Questions.

- Is the claim a financial action, a provenance on a loss observation, or both?
- Fetched pages do not model claims.

Do not invent a claim object. Mark the process `undetermined`.

## S-032 Capability test fails, production still scheduled

**Kind:** counterexample  
**Decision:** `hypothesis`  
**Family:** historical capability, unavailable resource  
**Cite:** #19, #24

ISA-95 capability test on the role fails. The production plan for tomorrow still lists that role.

Questions.

- Does a failed test change availability, capability, or only a quality hold?
- Who converts a test result into a planning fact?

Attacks. Tests as dead documents. L-008, L-010.
