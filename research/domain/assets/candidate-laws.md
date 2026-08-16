# Candidate laws

Each law is a claim that could be wrong. Decision is never `accepted`. Runtime notes are pressure, not a schema.

Related constitution items. Requested is not happened. Time has valid and known dimensions. Current state should be explainable. Model the world, not the source schema.

## L-001 Finance, role, and serial hardware can come apart

**Kind:** candidate law  
**Decision:** `supported` as a distinction. Identity packaging `undetermined`.

**Claim.** One real machine can be, at the same time, a capitalized value, a role in a process, and a serial physical device. Those three questions can have different lifetimes. A rented tool has operations and no local capitalization. A functional location keeps work history while motors rotate through it. A serial motor keeps its own repair history across locations.

**Evidence.** E-002, E-003, E-004, E-005.

**Counterexample that would reject the distinction.** A domain where every maintainable thing is always identical to one capitalization row and never leaves one role. Office laptops in ERPNext look like that. They do not cover plants.

**What stays undetermined.** Whether OS needs three kinds, two kinds plus a relator, or one kind with roles. Do not collapse them because ERPNext used one DocType. Do not split them because Odoo used two apps.

**Runtime consequence.** Queries must say which identity they mean. "Unavailable" on a role is not "scrapped" on a serial. "Sold" on a capitalization is not "uninstalled" from a line.

**Falsify if.** Independent plant systems treat swap, depreciation, and line identity as one field without later repair.

## L-002 Current place and custody are projections of dated assignments

**Kind:** candidate law  
**Decision:** `supported` for place and custody. `hypothesis` that every current operating field works this way.

**Claim.** "Where is it now" and "who holds it now" are the latest valid assignment, not master-data edits without history. Relocation is a new assignment event. The previous interval keeps its end time.

**Evidence.** E-007, E-003 assignment StartTime and StopTime, SAP usage times, EN-MOVE.

**Counterexample.** S-002 silent location edit. If a product can change location without an event and still answer "where was it on Tuesday," the law is incomplete, not false. ERPNext docs refuse the silent edit.

**Runtime consequence.** Actions that relocate must write an interval. Concurrent relocations need a serializable occupancy rule. See S-001 and S-029.

**Falsify if.** A mature system stores only a current location and reconstructs history from unrelated documents with no loss.

## L-003 A maintenance plan is not a completion

**Kind:** candidate law  
**Decision:** `supported` for the distinction. Plan-versus-execution identity `undetermined`.

**Claim.** Intended recurring work, a dated occurrence, and performed work are different facts. Completing or cancelling one occurrence does not rewrite the standing plan. Changing the plan does not erase an overdue occurrence.

**Evidence.** E-008, E-009, E-021. Constitution item 8.

**Source fork.** ERPNext uses three documents. Odoo uses one request with type and stages. Maximo and SAP use job plan or task list, then work order. The law is the fact split, not the document count.

**Counterexample.** S-020 a valid completion with no plan. That kills "every execution instance-ofs a plan." It does not kill "plan ≠ completion." S-003 overlapping PM and CM on one thing. If one status field cannot explain both, the collapsed request is under-specified.

**Runtime consequence.** Surfaces may share one form. The ontology still needs intended time, actual time, and result. Authority to change a plan is not authority to rewrite a completed log.

**Falsify if.** Operations can treat "the monthly plan" as the same object as "Thursday's signed log" without audit failure.

## L-004 Failure observation is not diagnosis and not repair

**Kind:** candidate law  
**Decision:** `supported` for observation versus action. `hypothesis` that mode, mechanism, and cause are required core facts.

**Claim.** Seeing that a pump leaks is an observation. Naming seal wear is a mechanism. Naming misalignment is a cause. Replacing the seal is work. These can arrive at different times, from different principals, with different confidence.

**Evidence.** E-010, ISO-14224-PRE, ISO-14224-SIST detection method. ERPNext Error Description versus Actions performed.

**Rejected lookalike.** E-018 Odoo Latest Failure as request creation time.

**Counterexample.** S-011 operator says "broken," technician later says "bearing," reliability later says "misalignment." If the model has one text field, later corrections overwrite the observation.

**Runtime consequence.** Provenance attaches to each claim. A late diagnosis does not move the original observation's valid time. Policy may start work from observation alone.

**Falsify if.** Reliability practice can compute failure rates from a single free-text "problem" field without mode catalogs and without losing comparability. ISO 14224 exists because that failed.

## L-005 Operating availability is not book value

**Kind:** candidate law  
**Decision:** `supported`.

**Claim.** Out of order, in maintenance, blocked, fully depreciated, and sold are not values of one property. A thing can be fully depreciated and running. A thing can be out of order with remaining book value. Disposal is a financial and custody event. Downtime is an interval of inability to perform a role.

**Evidence.** E-012, E-011, EN-ASSET status list as a negative example of collapse.

**Counterexample.** S-025 sell while a repair is pending. If one status wins, either the buyer or the technician is lying.

**Runtime consequence.** Production (#24) reads availability of a role or work center. Accounting reads capitalization. Mixing them in one enum forces hidden conventions.

**Falsify if.** A single status attribute explains both ledger reports and dispatch without leftover flags.

## L-006 Maintenance work can consume inventory without becoming the spare

**Kind:** candidate law  
**Decision:** `supported` as a boundary. Stock math belongs to #18.

**Claim.** Parts used on a job leave inventory. That event does not turn the spare into the maintained equipment unless the spare is a serialized rotating instance installed into a role. Consumable issue and rotating install are different.

**Evidence.** E-005, E-011, EN-REPAIR stock items, SAP spare product master.

**Counterexample.** S-015 consume five seals. S-016 install motor serial M2 into role PUMP-A. If both are "add a line on the repair," identity of M2 is lost.

**Runtime consequence.** Repair completion may emit an inventory movement. It may also emit an assignment change. Those are two effects of one action, not one concept.

## L-007 Calendar plans do not cover condition-based work

**Kind:** candidate law  
**Decision:** `supported`.

**Claim.** Periodicity generates occurrences from dates. Condition-based work is triggered by a measurement crossing a rule, or by a capability test result. Predictive estimates derived from past corrective intervals are not measurements.

**Evidence.** E-014, E-017, E-020.

**Counterexample.** S-009 vibration exceeds limit on Tuesday, next calendar PM is Friday. If only the calendar occurrence exists, Tuesday has no lawful work object.

**Runtime consequence.** Meters are observations. Rules that create work are functions over those observations. They are not another maintenance type enum next to Preventive.

**Falsify if.** Every real condition-based program can be rewritten as a shorter calendar period without losing the triggering evidence.

## L-008 Capability of a role has history

**Kind:** candidate law  
**Decision:** `hypothesis`.

**Claim.** What a line or device can do can change. The change is a dated fact, often evidenced by a test or by a component swap. Planning must be able to answer what the role could do last March, not only what the current nameplate says.

**Evidence.** E-017, ISA historized test results, S-010.

**Overlap.** #19 owns work-center capability used in routing. This law only says capability facts are temporal. It does not design a work-center type.

**Counterexample.** A plant that overwrites nameplate capacity and never needs last quarter's plan explained. That plant still fails constitution item 14 when an auditor asks why March MRP assumed 800 units per shift.

**Runtime consequence.** Capability used by a historical plan must pin the capability fact or the test result then in force.

**Falsify if.** All capability changes are new equipment identities, never property changes of a continuing role.

## L-009 Third-party ownership does not remove the need to maintain

**Kind:** candidate law  
**Decision:** `supported` as a possibility. How ownership is modeled is `undetermined`.

**Claim.** The principal who must keep a thing running can differ from the principal who capitalizes it. Rental and customer-owned tools are maintainable equipment without being the operator's fixed asset.

**Evidence.** OD-EQ third-party owner. EN-ASSET v13 text allows Asset Owner Company, Supplier, or Customer. ISA vendor versus manufacturer.

**Counterexample.** A rule that maintenance requests may only target capitalized assets. Odoo docs contradict that rule.

**Runtime consequence.** Policy on who pays, warranty, and capitalization cannot be inferred from the existence of a maintenance record.

## L-010 Blocked or failed equipment is an input to production planning

**Kind:** candidate law  
**Decision:** `supported` that the dependency exists. Mechanism `undetermined`.

**Claim.** If a work center or role is the resource a production plan assumed, then maintenance unavailability must be visible to that plan. Hiding it inside a maintenance app creates a second operational truth.

**Evidence.** E-013, OD-REQ Block Workcenter, S-005, S-006.

**Overlap.** #19 execution, #24 planning. This folder only records that asset condition crosses that boundary.

**Falsify if.** Production systems can ignore maintenance state and still never schedule work on a physically blocked center.

## Rejected claims

### R-001 Latest failure equals request creation time

**Kind:** candidate law  
**Decision:** `rejected`.

**Why.** OD-EQ documents this computation. It collapses valid time, knowledge time, and request identity. Preventive requests would look like failures. Late reports would lie about when the machine stopped. See E-018, S-012.

### R-002 Predictive maintenance is a third maintenance type beside preventive and corrective

**Kind:** candidate law  
**Decision:** `rejected` as a kind. The operational need remains.

**Why.** Fetched Odoo pages implement a derived MTBF date. ISO 14224 and SAP treat condition monitoring as a detection method or a measurement stream. The missing concept is measurement plus rule, already covered by L-007.

### R-003 Asset Location may be a Warehouse

**Kind:** candidate law  
**Decision:** `rejected`.

**Why.** EN-LOC FAQ states they are different. Quantity-at-bin and unique-thing-at-place do not share invariants. See E-006.
