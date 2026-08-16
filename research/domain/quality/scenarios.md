# Scenarios

Adversarial cards for issue #25. Happy-path inspect-and-ship is not included.

Each card has kind and decision state. Most cards are `counterexample` attempts against a candidate law, or `domain evidence` stories that a later suite should encode. None is an executable test yet.

Related seed cards in `scenarios/README.md` are S-008 lot recall and S-009 rework and scrap. This folder does not rewrite those files.

## S-001 Partial lot acceptance

- Kind: counterexample
- Decision state: hypothesis
- Story: Receipt of lot L, quantity 100. Sample or check fails on 12 units. Eighty-eight are usable.
- Questions: Does L stay one lot with two quality states? Does accept create L-OK and L-NG identities? Is the lot-level AQL decision allowed to accept all 100 after 12 known defects?
- Domain evidence: Odoo Failure locations let Quantity Failed move while the rest go to normal storage. ISO 2859 treats the lot as the statistical unit. ISO 9001 8.7 says take action based on the nature of the nonconformity.
- Source-system artifact: ERPNext one Quality Inspection status for the document. No first-party partial-accept field in S-ERP-QI.
- Candidate law: L-004, L-006. Partial accept is a split of state tokens, not a single Accepted flag.
- Runtime consequence: Inventory #18 must be able to hold 12 and release 88. Genealogy #20 must say whether customers of L received only L-OK.
- Falsifier: A source that forbids splitting quality state inside one lot identity and still handles this receipt.

## S-002 Specification changed after production

- Kind: counterexample
- Decision state: hypothesis
- Story: Lot L was produced and inspected under spec v1, diameter 10.00 ± 0.10. After release, engineering publishes spec v2, diameter 10.00 ± 0.05. Historical readings of 10.08 were conformant under v1 and would fail v2.
- Questions: Are v1 inspections still true? Must L be re-opened? Is v2 a deviation from the realized product, or is the product now nonconforming?
- Domain evidence: ISO 9001 8.5.6 control of changes. ISA-95 test specification Version. ISO 9000 specification can be a record of design results.
- Source-system artifact: ERPNext template is fetched onto the inspection. The public page does not say whether later template edits rewrite submitted inspections.
- Candidate law: L-011, L-018. Re-evaluation under v2 is a new judgment, not an edit of the v1 result.
- Runtime consequence: Pin spec revision on the result. A new Action may start re-inspection. It must not mutate the v1 facts.
- Falsifier: A regulated source that requires silent restatement of old CoAs under the new spec.

## S-003 Failed inspection with override

- Kind: counterexample
- Decision state: undetermined for Action vs Policy
- Story: Reading 0.160 against max 0.153. The inspector accepts the row because it is "not very far." ERPNext Manual Inspection documents this exact case.
- Questions: Is the row now conformant, or nonconforming with concession? Who is the authorizer? What limits of quantity, time, and use were granted?
- Domain evidence: ISO 9000 concession 3.12.5. ISO 9001 8.7.2. 21 CFR 211.165(f) would reject the drug product.
- Source-system artifact: ERPNext Manual Inspection leaves user-set status untouched on save. Odoo has no equivalent first-party concession form in the pages fetched.
- Candidate law: L-005, L-019. The reading and the failed automatic judgment stay. The override is a new authorization.
- Runtime consequence: Do not implement override as `status = Accepted`. Whether the authorization is an Action or a Policy stays undetermined.
- Falsifier: Independent first-party sources that agree override is only a policy flag with no recorded concession.

## S-004 Retest after fail

- Kind: counterexample
- Decision state: hypothesis
- Story: First assay of lot L is out of specification. A second aliquot is tested and passes. Someone wants to release on the second result and drop the first.
- Questions: Is the first result still a fact? What investigation is required before the second test is allowed to count? Does averaging the two results become a hidden function?
- Domain evidence: ISO 9001 8.7 requires re-verification after correction, not after repeating the same test for a better number. 21 CFR 211.165(f) rejects failing product. 21 CFR 211.192 timed out this session, so OOS investigation rules stay undetermined.
- Source-system artifact: ERPNext can create another Quality Inspection against the same reference document. The public page does not define OOS rules.
- Candidate law: L-013. Retest adds a measurement. Release policy decides which judgments are authoritative.
- Runtime consequence: Two measurements, two provenances. A Function may compute a reported value. It must cite both inputs.
- Falsifier: A first-party GMP source, once 211.192 is read, that allows discarding the first result without a recorded invalidation reason.

## S-005 Measurement uncertainty crosses the limit

- Kind: counterexample
- Decision state: hypothesis
- Story: Spec max is 10.00. Measured value is 9.98. Expanded uncertainty is 0.04 at k=2. The interval is 9.94 to 10.02.
- Questions: Is the lot conformant, nonconforming, or pending? Does simple min or max comparison remain legal? Who decides the decision rule, ILAC or customer?
- Domain evidence: JCGM 100:2008. ISO 9001 7.1.5. ERPNext and Odoo compare the bare number to a range.
- Source-system artifact: No uncertainty field in S-ERP-QI, S-ODOO-QCP Measure, or public ISA-95 result type.
- Candidate law: L-010. Bare Pass is a policy choice that ignores dispersion.
- Runtime consequence: Judgment can remain `judgment_pending` until a decision rule is applied. That rule is a Function with a version.
- Falsifier: A metrology standard that says guard-banding is optional and simple comparison is always enough. That would keep L-010 as hypothesis.

## S-006 Product recall from input genealogy

- Kind: domain evidence
- Decision state: supported as a required question. Ownership of the graph is #20 and #38
- Story: Input lot M is found contaminated. Finished lots F1 and F2 consumed M. F1 was split across customers C1 and C2. Some F2 is still in the plant.
- Questions: Which outputs contain M? Which customers received affected quantity? Is recall a quality Action, a logistics disposition, or both? Seed scenario S-008 asks the same.
- Domain evidence: ISO 9001 8.7 applies after delivery. ISO 9000 traceability 3.6.13 includes origin, processing history, and distribution. GS1 `recalled` persists across later shipping and receiving.
- Source-system artifact: ERPNext quality intro mentions batch tracking. No recall DocType in the pages fetched.
- Candidate law: L-015. Quality starts the judgment that the product is unfit. Disposition `recalled` rides on later events. The transformation graph is not a quality document.
- Runtime consequence: Do not store recall only as a note on the Quality Inspection. Cite genealogy. Do not rewrite #20 or #38 here.
- Falsifier: A source that performs recall with no lot graph, only a product-level bulletin, and treats that as sufficient for mixed lots.

## S-007 Incoming inspection blocks receipt

- Kind: domain evidence
- Decision state: supported as ERPNext behavior
- Story: Item has Inspection Required Incoming. User tries to submit a Purchase Receipt before a Quality Inspection exists.
- Domain evidence: ISO 9001 8.6 planned arrangements at appropriate stages.
- Source-system artifact: S-ERP-QI. Submission of the stock document is allowed only after a Quality Inspection is done against it.
- Candidate law: L-003. The gate is a policy on the receipt Action, not proof that receipt and inspection are one Action.
- Runtime consequence: Unknown or draft inspection is not a pass.
- Falsifier: A site that records receipt into a hold location first, then inspects. That is compatible if receipt into hold is not release. See #18.

## S-008 Outgoing inspection blocks delivery

- Kind: domain evidence
- Decision state: supported as ERPNext behavior
- Story: Inspection Required Outgoing. Delivery Note cannot submit without a Quality Inspection.
- Domain evidence: ISO 9001 8.6 release to the customer.
- Source-system artifact: S-ERP-QI.
- Candidate law: L-003, L-008.
- Runtime consequence: Delivery is a logistics Action that requires a release fact. Quality does not become the shipment.
- Falsifier: Drop-ship or customer-test-after-delivery under 8.6 exception, with recorded authority.

## S-009 In-process inspection on a job card

- Kind: domain evidence
- Decision state: supported as a placement question
- Story: A Quality Inspection is created from a Job Card for the production item during manufacture.
- Domain evidence: ISO 9001 8.6 arrangements at appropriate stages, not only at the end.
- Source-system artifact: S-ERP-QI inspection type In Process, reference Job Card. Odoo QCP on a Work Order Operation.
- Candidate law: In-process judgment can hold WIP without being finished-goods release. WIP hold is #18 and #19.
- Runtime consequence: Do not reuse the finished-goods release Action for an in-process check.
- Falsifier: A source that has only one quality event type for all stages and still explains different downstream rights.

## S-010 Deviation permit before the lot exists

- Kind: domain evidence
- Decision state: supported as an ISO distinction
- Story: Customer agrees, before the run, that diameter may be 10.00 ± 0.20 for the next 500 pieces only. Production then meets that permit and misses the catalog spec.
- Domain evidence: ISO 9000 3.12.6 deviation permit is prior to realization.
- Source-system artifact: Not seen in ERPNext or Odoo pages fetched.
- Candidate law: L-018. This is not a concession and not a silent spec edit.
- Runtime consequence: The permit is an authorization with limits. Inspections pin the permit plus the catalog spec.
- Falsifier: A source that only ever edits the item spec and never records a time-bounded permit.

## S-011 Radiopharmaceutical release before sterility

- Kind: counterexample
- Decision state: supported as a real exception
- Story: Short-lived radiopharmaceutical batch is released to the clinic. Sterility test is still running. The test later fails.
- Domain evidence: 21 CFR 211.165(a) explicit exception. ISO 9001 8.6 authority and customer exception.
- Source-system artifact: None in ERPNext or Odoo docs fetched.
- Candidate law: L-016. Open planned arrangements remain facts after release.
- Runtime consequence: State pair `released` plus `inspection_due`. Later fail starts recall S-006.
- Falsifier: None needed. The clause exists.

## S-012 Shop Floor checkbox auto-pass

- Kind: counterexample
- Decision state: supported as Odoo behavior
- Story: Operator ticks the step checkbox. The quality check is Passed. No pop-up, no measurement, no picture.
- Domain evidence: ISO 9000 objective evidence can be observation. Strength of evidence is low.
- Source-system artifact: S-ODOO-CHK and Pass-Fail page.
- Candidate law: L-003 still holds. A weak Pass is still not release. L-013 wants the method of determination recorded.
- Runtime consequence: Provenance must say `checkbox_auto_pass`. Policy may forbid it for regulated characteristics.
- Falsifier: Odoo documentation that the checkbox is only UI sugar and still stores the same worksheet. The fetched page says the opposite.

## S-013 Template edited after inspections were submitted

- Kind: counterexample
- Decision state: undetermined for ERPNext internals
- Story: Quality Inspection Template changes max from 0.20 to 0.15. Old submitted inspections used 0.20.
- Domain evidence: L-011. ISO 9001 8.5.6.
- Source-system artifact: S-ERP-QI "fetched." Copy versus live link was not read from code, by licensing design.
- Candidate law: Submitted results must keep the fetched criteria as a record.
- Runtime consequence: If the source live-links, that is a source defect relative to L-011, not a reason to copy the defect.
- Falsifier: First-party ERPNext behavior, described without pasting code, that submitted readings keep copied min and max.

## S-014 Formula rejects the row. Header is accepted

- Kind: counterexample
- Decision state: supported as ERPNext documented shape
- Story: Formula `(reading_1 + reading_2) < 10` fails. User sets the Quality Inspection Status to Accepted and submits.
- Domain evidence: S-ERP-QI and S-ERP-PR. Row status is automatic. Entire document status is a user decision.
- Source-system artifact: Two statuses on one document.
- Candidate law: L-003 and L-005. Header Accepted is a release-like judgment over the inspection, not a rewrite of the row.
- Runtime consequence: Keep both statuses. Do not fold them into one boolean.
- Falsifier: A later ERPNext change that forces header Rejected when any row is Rejected, with no override path.

## S-015 Quantity failed to a failure location

- Kind: domain evidence
- Decision state: supported as Odoo 17+ behavior
- Story: Receipt of 50. Check fails. User enters Quantity Failed 8 and picks location QC-HOLD. Validate sends 8 to QC-HOLD and 42 to stock.
- Domain evidence: S-ODOO-FL. ISO 9001 8.7 segregation.
- Source-system artifact: Failure Locations appear only when Control per is Quantity. Consumable products can move but quantity at the location is not tracked.
- Candidate law: L-004. This is containment, owned as custody by #18, triggered by a quality fail.
- Runtime consequence: Do not invent a quality location type in the quality folder. Cite #18.
- Falsifier: Odoo treating failure location as scrap. The fetched page says current stock remains visible there.

## S-016 Calibration expired at measurement time

- Kind: counterexample
- Decision state: hypothesis
- Story: Micrometer M's calibration expired on 1 August. Diameter of lot L was recorded on 3 August as 10.01, inside spec. On 10 August the lab notices the sticker.
- Questions: Is the reading void, suspect, or still a reading with weak provenance? Does L return to `judgment_pending`?
- Domain evidence: ISO 9001 7.1.5.2. JCGM 100 4.3.3.
- Source-system artifact: Odoo optional Device. No expiry gate in the fetched pages.
- Candidate law: L-012, L-013. Add an instrument fact. Do not delete the 10.01 reading.
- Runtime consequence: Authority of the product judgment changes. The number stays.
- Falsifier: A standard that says an expired-device reading is not a measurement at all.

## S-017 Certificate of analysis versus test result versus release

- Kind: domain evidence
- Decision state: supported
- Story: Supplier sends a PDF CoA. Incoming inspection is waived. Warehouse releases the lot to production.
- Domain evidence: GS1 `cert` vs `testres`. ISO 9001 8.6 evidence can be a certificate. 8.6 still needs an authorizer inside the organization.
- Source-system artifact: Not modeled in S-ERP-QI.
- Candidate law: L-017, L-008. The PDF is evidence. Someone still authorizes release.
- Runtime consequence: Ingest the certificate as a document with provenance. Do not treat file arrival as release.
- Falsifier: A legal regime where the supplier CoA is the only required release record and no internal authorizer exists.

## S-018 Inspecting then shipping a recalled object

- Kind: domain evidence
- Decision state: supported
- Story: Inspection discovers the object is subject to recall. Later events are shipping and receiving back to the manufacturer.
- Domain evidence: GS1 implementation guideline. Business step `inspecting` with disposition `recalled`, then `shipping` and `receiving` still with `recalled`.
- Source-system artifact: None in ERPNext or Odoo pages.
- Candidate law: L-015. Step and disposition stay independent.
- Runtime consequence: Logistics events on #20 must accept a persistent quality disposition. Quality does not own the ship Action.
- Falsifier: CBV guidance that shipping resets disposition to `in_progress`.

## S-019 Rework then re-verify

- Kind: domain evidence
- Decision state: supported
- Story: Ten units fail. Six are reworked. Four become scrap. Seed S-009.
- Domain evidence: ISO 9000 rework 3.12.8. ISO 9001 8.7 re-verify after correction. 21 CFR 211.165(f).
- Source-system artifact: Not in ERPNext Quality Inspection pages. Manufacturing execution is #19.
- Candidate law: L-009, L-004. Quality re-judges. Manufacturing performs the rework process and scrap qty.
- Runtime consequence: Completed quantity on the original production commitment is a #19 question. Quality only answers which units became conformant.
- Falsifier: A source that counts reworked units as original-pass without a second judgment.

## S-020 Repair that does not restore conformity

- Kind: domain evidence
- Decision state: supported
- Story: A housing is welded to stop a leak. It is fit for use and still outside the drawing. A concession is issued for this serial.
- Domain evidence: ISO 9000 3.12.9 repair. Note 1 says a concession may still be required.
- Source-system artifact: Not in ERPNext or Odoo pages fetched.
- Candidate law: L-009, L-005. Repair is not rework.
- Runtime consequence: Do not reuse the rework Action. The serial can be `released_under_concession` while still nonconforming to the drawing.
- Falsifier: A source that uses "rework" for both and still tracks drawing conformity separately. That would be naming slop, not a merged concept.

## S-021 Two contradictory measurements

- Kind: counterexample
- Decision state: hypothesis
- Story: Lab A records 9.92. Lab B records 10.11. Spec is 10.00 ± 0.10. Same lot, same characteristic, same day.
- Domain evidence: Constitution §9. Open question 3 in `docs/open-questions.md` is not answered here. ISO 9000 objective evidence can disagree.
- Source-system artifact: ERPNext one readings table per inspection document.
- Candidate law: L-013. Both readings remain. Authority is policy.
- Runtime consequence: Do not invent a winner in this folder. Record both with provenance. Mark the lot `judgment_pending`.
- Falsifier: A foundation result that contradictory facts are impossible after correct modeling. Cite that artifact if it appears. Until then this stays a quality scenario.

## S-022 Skip-lot after a good history

- Kind: domain evidence
- Decision state: hypothesis
- Story: Supplier S has 20 accepted lots under normal inspection. The scheme switches to skip-lot. Lot 21 is received and put into stock without a physical check.
- Domain evidence: ISO 2859-1:2026 switching and skip-lot. Exact tables paywalled, so the numeric trigger stays undetermined.
- Source-system artifact: Odoo Periodically or Randomly is not skip-lot switching. ERPNext has no switching rules in S-ERP-QI.
- Candidate law: L-008, L-016. Skip-lot is an authorized omission of an instance, not absence of a plan.
- Runtime consequence: The plan remains. The instance is "not drawn" with a recorded reason.
- Falsifier: ISO 2859 tables, once purchased, that make skip-lot a different kind of acceptance than lot inspection.

## S-023 Tightened inspection after deterioration

- Kind: domain evidence
- Decision state: hypothesis
- Story: Two lots in five are rejected. The scheme switches to tightened inspection. Sample size or accept number changes.
- Domain evidence: ISO 2859-1:2026 consumer protection by tightened inspection or discontinuation.
- Source-system artifact: Not in ERPNext or Odoo pages.
- Candidate law: L-011. The plan version or tightness is part of the pinned plan.
- Runtime consequence: Do not hard-code sample size on the item forever.
- Falsifier: Paywalled tables that show tightness as a property of the supplier relationship rather than the plan. Still a plan pin.

## S-024 Customer-authorized early release

- Kind: domain evidence
- Decision state: supported
- Story: Customer will perform final test after delivery. The plant ships with open in-house tests, with written customer approval.
- Domain evidence: ISO 9001 8.6 "unless otherwise approved by a relevant authority and, as applicable, by the customer."
- Source-system artifact: Not a first-class field in the ERP pages fetched.
- Candidate law: L-016, L-008.
- Runtime consequence: Store the customer approval as evidence on the release, not as a missing inspection.
- Falsifier: A contract that forbids this 8.6 path. That is a tighter policy, not a false law.

## S-025 User vocabulary "quarantined" versus CBV

- Kind: source-system artifact
- Decision state: supported
- Story: A team wants disposition URI `urn:epcglobal:cbv:disp:quarantined`.
- Domain evidence: CBV 2.0 forbids using the epcglobal prefix for a user term. Example says use a user URI instead. Location type 428 is a quality-control hold area. Disposition `holding` exists.
- Source-system artifact: CBV limitation-of-use example.
- Candidate law: Quarantine as custody is #18. Do not mint a fake CBV code from the quality folder.
- Runtime consequence: Map plant "quarantine" to hold custody plus a quality judgment. Cite #18 and #38.
- Falsifier: A later CBV that adds official `quarantined`.

## S-026 Mixed lot after split accept and reject

- Kind: counterexample
- Decision state: hypothesis
- Story: After S-001, someone ships "lot L" to a customer without saying L-OK. The customer later sees a unit from the failed 12 that was mis-picked.
- Domain evidence: ISO 9001 8.5.2 identification and traceability. GS1 mismatch dispositions exist for instance, class, and quantity.
- Source-system artifact: Odoo failure location reduces the chance of mix if operators obey it.
- Candidate law: L-006 plus identification. If identity did not split, pick-face controls must still separate state tokens.
- Runtime consequence: Either new lot identity or a mandatory hold attribute on every pick. Identity choice is #20.
- Falsifier: A warehouse that keeps one lot id, no sub-status, and still prevents this pick. Unlikely without a hidden attribute.

## S-027 Test result expiration

- Kind: domain evidence
- Decision state: supported as ISA-95 public mapping
- Story: A qualification test result on a person or a tool expires on 1 September. On 2 September the same person releases a lot.
- Domain evidence: ISA-95 Test Result Expiration. ISO 9001 7.1.5.2 status identification. QualificationTestSpecification in the OPC mapping.
- Source-system artifact: Not in ERPNext Quality Inspection.
- Candidate law: L-012 extended from devices to any expired test result that was used as capability evidence.
- Runtime consequence: Release authorization should be able to cite a still-valid qualification. Expired qualification does not delete the lot.
- Falsifier: Part 1, if ever read, saying Expiration is only for material shelf life. Until then the public mapping stands.

## S-028 Persistent disposition versus transient hold

- Kind: domain evidence
- Decision state: hypothesis
- Story: Lot is contained for a missing document, then the document arrives, then the lot is released. Contrast with a lot recalled for safety.
- Domain evidence: CBV 2.0 persistent disposition is a non-transient business state changed only by explicit cancel. `holding` vs `recalled`.
- Source-system artifact: Odoo failure location is reversible by a later inventory move.
- Candidate law: L-015. Not every containment is persistent. Safety recall is. Missing-paper hold may not be.
- Runtime consequence: Do not use one `blocked` bit for both. #18 should see the difference as hold reason. Quality supplies the reason.
- Falsifier: A source that treats all holds as persistent dispositions.

## S-029 Quality alert without a failed check

- Kind: source-system artifact
- Decision state: supported as Odoo behavior
- Story: An operator creates a Quality Alert from Shop Floor without failing a check. A dent was seen on a unit that had no QCP.
- Domain evidence: ISO 9001 8.7 applies to nonconforming outputs whenever detected.
- Source-system artifact: S-ODOO-AL. Alert can be created from the Quality app with no check. The Quality Alert button on an MO appears only if a check was requested.
- Candidate law: L-014. An alert is a notification. A nonconformance record still needs identification of the output.
- Runtime consequence: Allow a nonconformance to start from observation, not only from a planned check.
- Falsifier: A QMS that forbids NCR without a planned inspection record.

## S-030 CAPA opened instead of containment

- Kind: counterexample
- Decision state: hypothesis
- Story: Lot fails. Someone opens a Quality Action or Quality Alert and leaves the lot in unrestricted stock.
- Domain evidence: ISO 9001 8.7.1 prevent unintended use. 10.2 is cause elimination.
- Source-system artifact: ERPNext Quality Action does not move stock. Odoo Alert does not move stock unless someone also uses failure location.
- Candidate law: L-014, L-004.
- Runtime consequence: Opening CAPA must not be accepted as the containment Action.
- Falsifier: A source that legally treats CAPA open as equivalent to segregation. Not seen.

## S-031 On-demand check versus planned QCP

- Kind: domain evidence
- Decision state: supported
- Story: No QCP fires. A supervisor creates one manual Quality Check on a picking.
- Domain evidence: ISO 9001 8.6 planned arrangements are the default. Extra determination is still inspection (ISO 9000 3.11.7).
- Source-system artifact: Odoo On-Demand frequency and manual Quality Check form. ERPNext ad-hoc Quality Inspection.
- Candidate law: L-008 still needs an authorizer if this check is used for release. L-011 allows a missing standing plan.
- Runtime consequence: Manual checks are first-class instances. They are not schema-less comments.
- Falsifier: A source that says only planned QCP instances count as inspections.

## S-032 Register production check versus quality measurement

- Kind: source-system artifact
- Decision state: supported as an Odoo collapse
- Story: QCP type Register Production asks the operator to confirm quantity produced. Type Register Consumed Materials confirms consumption.
- Domain evidence: Those are manufacturing execution facts. They are not determination of conformity.
- Source-system artifact: S-ODOO-QCP lists them as quality check types and stores them in the Quality app because work-order steps are stored as QCPs.
- Candidate law: Not every QCP is a quality inspection. Issue #19 owns quantity produced and consumed.
- Runtime consequence: Do not promote Odoo check type into a quality primitive.
- Falsifier: ISA-95 calling production registration a test specification. Not seen in the public mapping.

## S-033 Mean of readings used as the acceptance function

- Kind: domain evidence
- Decision state: supported as ERPNext capability
- Story: Template formula `mean < 15` over non-empty numeric readings. Individual reading_1 is 16. Mean is 14. Row is Accepted.
- Domain evidence: S-ERP-QI formula examples. ISO 2859 is about attributes. Variable sampling is a different ISO family, unread this session.
- Source-system artifact: Acceptance Criteria Formula.
- Candidate law: L-002. The function is part of the specification, not a hidden spreadsheet.
- Runtime consequence: The Function version must be pinned. A later change of the formula is S-002.
- Falsifier: A metrology rule that forbids mean-based accept without uncertainty. That would constrain the Function, not deny it.

## S-034 Post-delivery nonconformity found by the customer

- Kind: domain evidence
- Decision state: supported
- Story: Customer finds rust after delivery. The lot was released last month on a passing incoming check.
- Domain evidence: ISO 9001 8.7.1 applies to nonconforming products detected after delivery. 8.7 dealings include informing the customer.
- Source-system artifact: ERPNext Quality Action can start from Customer Feedback. That is CAPA-shaped, not a recall graph.
- Candidate law: L-015, L-014. Need both a product action on remaining stock and a customer communication. Recall if safety applies, S-006.
- Runtime consequence: Prior release stays in history. New nonconformance is a new fact.
- Falsifier: A source that cancels the original release document to "fix" history.

## S-035 Spec versus measurement asked as one identity

- Kind: counterexample
- Decision state: undetermined
- Story: A modeler wants one object "Diameter" that is sometimes the required 10.00 ± 0.10 and sometimes the measured 10.02.
- Domain evidence: L-001 and L-002 say the meanings differ. RFC-0001 Property vs Fact is open. Standing order 24 forbids closing the identity fork here.
- Source-system artifact: ERPNext stores min, max, and reading on one row. That is a form layout, not an ontological proof of one identity.
- Candidate law: L-020.
- Runtime consequence: Synthesis agents must not treat this card as a schema vote.
- Falsifier: Independent foundation plus domain sources that agree on one identity with roles. Not gathered today.
