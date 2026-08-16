# Open questions

**Kind:** reference  
**Decision:** every item is `undetermined` unless a cited card already settled it.

Do not treat this file as answers to `docs/open-questions.md`. That document stays untouched. When a foundation question is touched, the note says so and stays `undetermined`.

## Q-001 Are financial asset, role equipment, and serial device one identity?

**Decision:** `undetermined`  
**Cite:** L-001, E-001, E-002, E-003, matrix row "Financial capitalization ≠ operational equipment"

Independent sources agree the concerns come apart. They disagree on packaging. ERPNext uses one Asset. Odoo uses two apps. ISA-95, SAP, and Maximo use role or location plus serial. Standing order. This fork stays undetermined unless later first-party sources converge on one packaging.

Touches `docs/open-questions.md` items 2 and 12. No answer invented.

## Q-002 Is assignment a relator with identity?

**Decision:** `undetermined`  
**Cite:** L-002, E-003, S-030

ISA-95 assignment has start, stop, and required history. ERPNext uses submitted movement documents. SAP speaks of usage times. Whether OS needs a first-class relator, an object-backed link, or dated facts is a foundation question. See RFC-0001 Relationship / Link. Do not edit the RFC from this folder.

## Q-003 Are plan, occurrence, and execution separate kinds?

**Decision:** `undetermined`  
**Cite:** L-003, E-009, S-020

The distinction plan ≠ happened is `supported`. Identity packaging is not. ERPNext uses plan plus log plus repair. Odoo uses one request. Standing order. Plan-versus-execution identity stays undetermined.

Touches `docs/open-questions.md` items 4, 5, and 14.

## Q-004 Is operating condition stored or derived?

**Decision:** `undetermined`  
**Cite:** E-012, lifecycle "Operating condition", S-025

ERPNext docs describe Out of Order as a consequence of pending repairs, and also show it on a status list. Odoo uses request stages plus Block Workcenter. Constitution question 6 asks whether status is a stored decision or a function of facts. This domain does not settle it.

## Q-005 Must mode, mechanism, and cause be core facts?

**Decision:** `hypothesis` leaning yes for reliability, `undetermined` for the semantic core  
**Cite:** L-004, E-010, S-011

ISO 14224 splits them. ERPNext and Odoo do not force the split. Full ISO catalogs were not readable. Do not add three primitives because a standard has three words. Do not keep one text field because two ERPs did.

## Q-006 Where do meters live?

**Decision:** `undetermined`  
**Cite:** E-014, S-027, S-028

SAP and Maximo attach measuring points to technical objects and to locations. ERPNext Asset pages and Odoo 18 Maintenance pages do not. The domain need for condition-based work is `supported` (L-007). The home of the measurement, asset versus location versus sensor, is open. Quality calibration method is #25.

## Q-007 How does a maintenance block meet an in-flight manufacturing order?

**Decision:** `undetermined`  
**Cite:** E-013, S-005, S-006, L-010

Odoo documents prevention of new scheduling. It does not document an already released work order. #19 and #24 own the production side. This folder only records the dependency.

## Q-008 What is downtime as a semantic object?

**Decision:** `undetermined`  
**Cite:** EN-REPAIR-JSON read-only downtime, S-003, S-004

It may be a derived interval from failure and completion timestamps. It may be a claimed interval per work record. Overlapping work makes a single interval on the asset ambiguous.

## Q-009 How should warranty and insurance claims be modeled?

**Decision:** `undetermined`  
**Cite:** E-015, S-013, S-031

Fetched pages store dates and policy fields. They do not model claim, denial, or payership as actions. Do not invent a claim type here.

## Q-010 Does a failed capability test change availability, capability, or neither until someone acts?

**Decision:** `undetermined`  
**Cite:** E-017, L-008, S-032

ISA-95 has test specifications and historized results. Conversion into a planning fact is not specified in the companion pages fetched.

## Q-011 Are grouped-quantity assets lawful?

**Decision:** `hypothesis` that they are a source convenience  
**Cite:** S-023, EN-ASSET

ERPNext allows quantity and warns that individual records are clearer when history forks. That is not yet a rejected kind. It is a smell.

## Q-012 ISA-95 Part 1 attribute tables

**Decision:** `undetermined`  
**Cite:** sources.md IEC-P1

The IEC preview did not return the PDF this session. Do not fill Equipment, Physical Asset, or Maintenance object attributes from secondary blogs.

## Q-013 Moqui, Mantle, ValueFlows, and Palantir views of maintainable things

**Decision:** `undetermined`

Not fetched in this timebox. Corpus issues #34, #35, and #37 may supply them. Do not guess.

## Q-014 Does RFC-0001 need a new primitive for this domain?

**Decision:** `undetermined`. Default no until synthesis.

Nothing in this folder independently converges on a missing primitive. The pressure is on identity of role versus serial, on dated assignment, on plan versus completion, and on observation versus diagnosis. Those are already listed as open in RFC-0001 and `docs/open-questions.md`. Do not edit either file.

## Questions that are not open

These were decided enough to stop re-asking them as if they were unknown.

| Claim | Decision | Cite |
| --- | --- | --- |
| Location is not warehouse | `supported` | E-006, R-003 |
| Plan is not completion | `supported` | L-003 |
| Observation is not action | `supported` | L-004 |
| Availability is not book value | `supported` | L-005 |
| Latest failure is not request creation time | `rejected` as a domain law | R-001 |
| Predictive is not a third type beside PM and CM | `rejected` as a kind | R-002 |
| Calendar PM covers condition-based work | `rejected` | L-007 |
