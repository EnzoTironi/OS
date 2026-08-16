# Evidence

Cards below are observations, not OS types. Each card states kind and decision state, then the five distinctions the contract requires.

## E-001 Specification is a document of requirements

- Kind: domain evidence
- Decision state: supported
- Domain evidence: ISO 9000:2015 3.8.7 defines specification as a document stating requirements. Examples include a quality plan, a drawing, a procedure, a product specification, and a test specification. A specification can also record results of design, and in that case it can be used as a record.
- Source-system artifact: ERPNext Quality Inspection Template stores parameters and acceptance criteria and is fetched into a Quality Inspection. Odoo Quality Control Point stores when to check, how often, and which check type. ISA-95 `ISA95TestSpecificationType` is an abstract specification with a Version. GS1 CBV `testprd` is a test procedure document.
- Candidate law: See L-001 in `candidate-laws.md`.
- Counterexample: A specification that is only a live formula on the inspection row, with no durable document identity, would weaken this card. ERPNext can type a formula on the inspection itself. That is a source convenience, not proof that the specification lacks identity.
- Runtime consequence: Historical inspections must be able to name which specification revision they used. See S-002.

## E-002 Characteristic is a distinguishing feature, not a reading

- Kind: domain evidence
- Decision state: supported
- Domain evidence: ISO 9000:2015 3.10.1 defines characteristic as a distinguishing feature. It may be inherent or assigned, qualitative or quantitative. A quality characteristic (3.10.2) is an inherent characteristic of an object related to a requirement. Price is assigned, so it is not a quality characteristic of the object.
- Source-system artifact: ERPNext inspection parameter names a characteristic and then holds min, max, or an acceptance value. Odoo Measure check names a norm and a tolerance. Neither source stores "characteristic" as a first-class type separate from the check row.
- Candidate law: See L-002.
- Counterexample: If a source treated the measured number as the characteristic itself, the distinction would collapse. No first-party source fetched today does that.
- Runtime consequence: Comparing a reading to a limit is a function over a characteristic plus a requirement, not a mutation of the characteristic.

## E-003 Measurement is an operation that yields a value with dispersion

- Kind: domain evidence
- Decision state: supported
- Domain evidence: ISO 9000:2015 3.11.5 defines measurement process as a set of operations to determine the value of a quantity. JCGM 100:2008 defines uncertainty as a parameter associated with the result of a measurement that characterizes the dispersion of values that could reasonably be attributed to the measurand. Clause 3.3.1 says the uncertainty of a result reflects lack of exact knowledge of the value.
- Source-system artifact: ERPNext numeric readings are bare numbers against min and max. Odoo Measure is a number against norm and tolerance, with an optional Device. Neither records expanded uncertainty or a coverage factor. ISA-95 test result has Result, unit, Date, and Expiration, and no uncertainty field in the public OPC mapping.
- Candidate law: See L-010. Whether OS must store uncertainty on every quality measurement stays undetermined.
- Counterexample: A go or no-go gauge that only yields Pass or Fail is still a determination. ISO 9000 inspection (3.11.7) allows a degree of conformity, not only a quantity.
- Runtime consequence: A reading that sits inside a tolerance while its uncertainty interval crosses the limit is a real conflict. See S-005.

## E-004 Inspection determines conformity. It is not release

- Kind: domain evidence
- Decision state: supported
- Domain evidence: ISO 9000:2015 3.11.7 defines inspection as determination of conformity to specified requirements. The result can show conformity, nonconformity, or a degree of conformity. If it shows conformity, it can be used for verification (3.8.12). Release (3.12.7) is permission to proceed to the next stage or the next process. ISO 9001:2015 8.6 requires planned arrangements, then documented evidence of conformity and traceability to the person authorizing release. Release may proceed before planned arrangements finish only if a relevant authority approves, and the customer when applicable.
- Source-system artifact: ERPNext computes row Accepted or Rejected on save, then the user sets the header Status and submits. Stock receipt or delivery submit is gated on the existence of a Quality Inspection when the item requires one. Odoo Pass or Fail completes a check. Failure location and Quality Alert are separate. 21 CFR 211.165(a) requires laboratory determination of conformance to final specifications prior to release, with a radiopharmaceutical exception.
- Candidate law: See L-003 and L-008.
- Counterexample: 21 CFR 211.165(a) allows release of short-lived radiopharmaceuticals before sterility or pyrogen testing completes, provided testing finishes as soon as possible. That is authorized incomplete planned arrangements, not a collapse of inspection into release.
- Runtime consequence: An accepted inspection fact is not a release fact. An agent that ships on Pass alone is wrong unless policy says the same principal may do both.

## E-005 Nonconformity is not disposition

- Kind: domain evidence
- Decision state: supported
- Domain evidence: ISO 9000:2015 3.6.9 defines nonconformity as non-fulfilment of a requirement. ISO 9001:2015 8.7.1 requires identification and control to prevent unintended use or delivery. Allowed dealings are correction, segregation or containment or return or suspension, informing the customer, and authorization for acceptance under concession. 8.7.2 requires records of the nonconformity, actions taken, concessions, and the authority that decided. Correction (3.12.3) eliminates a detected nonconformity. Rework (3.12.8) makes the product conform. Repair (3.12.9) makes it acceptable for intended use and may still need a concession.
- Source-system artifact: Odoo Quality Alert is a team notification with corrective and preventive tabs. It is not a stock disposition. Odoo failure location is a custody move. ERPNext Quality Action is CAPA against a review or feedback, not a lot disposition. GS1 CBV separates business step `inspecting` from dispositions `conformant`, `non_conformant`, `recalled`, and `holding`.
- Candidate law: See L-004 and L-005.
- Counterexample: A system that sets item status to Rejected and treats that as both judgment and scrap would hide 8.7's required choice among dealings. ERPNext header Status Accepted or Rejected is close to that collapse at the document level.
- Runtime consequence: Scrap and rework execution belong to issue #19. Quarantine custody belongs to issue #18. Quality owns the judgment and the authorized dealing, not the stock ledger.

## E-006 Concession is after the fact. Deviation permit is before realization

- Kind: domain evidence
- Decision state: supported
- Domain evidence: ISO 9000:2015 3.12.5 defines concession as permission to use or release a product or service that does not conform to specified requirements. It is generally limited to nonconforming characteristics within specified limits, a limited quantity or time, and a specific use. Deviation permit (3.12.6) is permission to depart from originally specified requirements prior to realization, also generally limited in quantity, time, and use.
- Source-system artifact: ERPNext Manual Inspection lets a user accept a row whose reading is outside min and max. The docs call this tolerance, not concession. Odoo has no first-party concession document in the pages fetched. ISO 9001 8.7 lists obtaining authorization for acceptance under concession as one dealing.
- Candidate law: See L-005 and L-018. Whether the ERPNext manual accept is a concession Action or a Policy remains undetermined. See Q-002.
- Counterexample: If every out-of-range accept were only a wider specification, concession would be unnecessary. ISO keeps both terms.
- Runtime consequence: A concession must leave the nonconformity visible. Silent overwrite of row status erases 8.7.2 evidence.

## E-007 Sampling infers lot quality. It does not prove every unit

- Kind: domain evidence
- Decision state: supported
- Domain evidence: ISO 2859-1:2026 defines AQL-indexed lot-by-lot attribute sampling. Acceptance of a lot is determined from an estimate of percent nonconforming, or nonconformities per 100 items, based on a random sample. Switching rules move among normal, tightened, reduced, and skip-lot inspection. 21 CFR 211.165(c) and (d) require written sampling plans and statistical acceptance and rejection levels.
- Source-system artifact: ERPNext has a sample size on the Quality Inspection. It does not document AQL switching. Odoo Control per Quantity plus Partial Test percent, or Randomly N percent of the time, is a trigger frequency, not an AQL table. GS1 CBV `sampling` is a destructive business step. Sampled serialized instances must then see an end-of-life event. `inspecting` leaves objects viable.
- Candidate law: See L-006 and L-007.
- Counterexample: 100 percent inspection still exists. ISO 2859 is for series of lots, not a claim that every quality decision is statistical.
- Runtime consequence: Accepting a lot from a sample creates a lot-level judgment. It does not create a unit-level conformant fact for untested units. Partial lot accept is a split of quantity under one lot identity or a split of identity. See S-001.

## E-008 Inspection plan is not the inspection

- Kind: domain evidence
- Decision state: supported
- Domain evidence: ISO 9000:2015 3.8.9 defines quality plan as a specification of the procedures and associated resources to be applied when and by whom to a specific object. ISO 9001:2015 8.6 requires planned arrangements at appropriate stages.
- Source-system artifact: Odoo QCP is the plan. It creates Quality Check instances on operations. ERPNext template plus item Inspection Required Incoming or Outgoing is a thinner plan. ISA-95 test specification with Version is the plan-like object. GS1 `testprd` is the procedure document. `testres` is the result document.
- Candidate law: See L-001 and L-011.
- Counterexample: Odoo on-demand QCP and ERPNext ad-hoc Quality Inspection show that a check can exist without a standing plan. The plan and the instance remain different even when the plan is missing.
- Runtime consequence: Changing the plan after production must not rewrite completed checks. See S-002.

## E-009 Calibration is context of a measurement, not the measurement

- Kind: domain evidence
- Decision state: supported as a requirement. Native modeling in ERPs is undetermined
- Domain evidence: ISO 9001:2015 7.1.5.2 requires measuring equipment to be calibrated or verified at specified intervals or before use against traceable standards, identified so status is known, and safeguarded. Documented information is retained as evidence of fitness for purpose. JCGM 100:2008 4.3.3 treats a calibration certificate as a source of an input estimate and its quoted uncertainty.
- Source-system artifact: Odoo Measure has an optional Device. The fetched pages do not say the check fails if the device is out of calibration. ERPNext Quality Inspection has Inspected By and Verified By, and no device or calibration fields in the public doc.
- Candidate law: See L-012.
- Counterexample: A visual Pass-Fail with no instrument still needs competence, not a calibration certificate.
- Runtime consequence: A measurement fact should be able to cite the instrument identity and the calibration status known at measurement time. Expired calibration does not automatically void the reading. It changes provenance and authority. See S-016.

## E-010 Certificate is a document about characteristics, not the inspection

- Kind: domain evidence
- Decision state: supported
- Domain evidence: GS1 CBV business transaction type `cert` is a document confirming certain characteristics of an object, person, or organization, typically issued by a third party. `testprd` is a test procedure. `testres` is a document that includes the outcome of executing a test procedure. EPCIS 2.0 adds `certificationInfo` on the event and a `certificationList` with agency, dates, identification, and standard. ISO 9001 8.6 documented information on release can include a certificate of conformity. That is evidence used in release, not the release itself.
- Source-system artifact: ERPNext public Quality Inspection page does not define a certificate DocType. Reseller pages mention certificates. Those pages are not first-party evidence.
- Candidate law: See L-017.
- Counterexample: A signed Quality Inspection printout used as a CoC is a surface. It does not make the inspection document identical to the certificate concept.
- Runtime consequence: A certificate can outlive the inspection UI. It must cite the inspection or test result, the specification revision, and the authorizer.

## E-011 Quality event provenance is first-class in standards, thin in ERPs

- Kind: domain evidence
- Decision state: supported for the requirement. Completeness of ERP provenance is rejected as sufficient
- Domain evidence: ISO 9001:2015 8.6 requires evidence of conformity and traceability to the person authorizing release. 8.7.2 requires the authority deciding the nonconformity action. ISA-95 test result Date may differ from the timestamp of when the value was recorded. GS1 EPCIS events are append-only. Correction is a later event. Constitution §11 says provenance is part of meaning when decisions depend on it.
- Source-system artifact: ERPNext records Inspected By and Verified By. Odoo records Team, Responsible, and Date Assigned on alerts. Neither fetched page models valid time versus knowledge time for a reading.
- Candidate law: See L-013.
- Counterexample: A sensor reading with only a store timestamp cannot answer "when was the test done" versus "when did we record it." ISA-95 calls that difference out.
- Runtime consequence: Override, retest, and late correction each need a new fact with actor, activity, and evidence. They must not mutate the first reading away.

## E-012 Two quality loops exist in ERPNext and must not be merged

- Kind: source-system artifact
- Decision state: supported as an ERPNext split. Universality is undetermined
- Domain evidence: ISO 9001 separates 8.7 control of nonconforming outputs from 10.2 corrective action that eliminates causes.
- Source-system artifact: ERPNext Quality Inspection lives under Stock and gates receipts, deliveries, stock entries, and job cards. Quality Goal, Procedure, Review, and Action live under Quality and implement a management-system loop. Quality Action is Corrective or Preventive against a Review or Feedback. The fetched Quality Action page does not link to Quality Inspection.
- Candidate law: Product nonconformity and QMS corrective action are related and not identical. See L-014.
- Counterexample: Odoo Quality Alert mixes notification, root cause, and CAPA tabs on one form. That is a source collapse, not proof the ISO split is false.
- Runtime consequence: A failed lot inspection must not be modeled as "open a CAPA" only. Containment and disposition can be required before anyone writes a preventive action.

## E-013 ISA-95 Part 1 quality attributes

- Kind: domain evidence
- Decision state: undetermined
- Domain evidence: Public OPC UA mapping distinguishes Test Specification from Test Result and gives Version, Result, unit, Date, Expiration. That is a companion model, not Part 1.
- Source-system artifact: ISA-95, also published as IEC 62264 Part 1, was not readable this session.
- Candidate law: None until Part 1 is read.
- Counterexample: None.
- Runtime consequence: Do not invent Part 1 properties into OS. Mark matrix cells undetermined.

## E-014 GS1 inspecting versus sampling is a viability split

- Kind: domain evidence
- Decision state: supported inside CBV. Not the same as ISO 2859 sampling
- Domain evidence: CBV 2.0 `inspecting` reviews objects for physical or documentation defects. Inspected objects remain viable. `sampling` examines portions for quality testing or customs. Sampled objects are no longer viable. For a serialized instance, the next step shall be an end-of-life event. CBV also says a user who needs "quarantined" must not mint `urn:epcglobal:cbv:disp:quarantined`. Location type 428 is a quality-control hold area.
- Source-system artifact: ERPNext sample size does not destroy the sample in stock. Odoo failure location moves failed quantity. Those are source artifacts, not CBV compliance.
- Candidate law: See L-007. CBV sampling is not ISO 2859 lot sampling. Using one word for both is a naming collision.
- Counterexample: A retained sample that stays in a retain store is viable as evidence and not viable for sale. CBV's "no longer viable in the supply chain" fits. A non-destructive sample pulled and returned does not fit CBV `sampling`.
- Runtime consequence: Genealogy work on issues #20 and #38 should keep CBV `sampling` as a destruction or end-of-life step. Quality's statistical sample plan is a different concept.

## E-015 Shop Floor auto-pass is a counterexample to "inspection always records a measurement"

- Kind: counterexample
- Decision state: supported as Odoo behavior
- Domain evidence: ISO 9000 inspection is a determination of conformity. Objective evidence (3.8.3) can be observation, measurement, or test.
- Source-system artifact: Odoo 19 Quality checks page and Pass-Fail page say clicking the checkbox on the work-order step marks the check Passed without a pop-up.
- Candidate law: A recorded Pass without a stored reading is still an inspection judgment. It is weak evidence.
- Counterexample: This card is the counterexample.
- Runtime consequence: Policy may forbid auto-pass for regulated characteristics. The metamodel must still allow a judgment that cites instruction-followed rather than a number.
