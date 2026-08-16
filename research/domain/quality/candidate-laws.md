# Candidate laws

Smallest claims that explain the evidence. Each law is a hypothesis to attack, not an accepted primitive.

Kinds on a law card are `candidate law`. Counterexamples and runtime notes are attached so a later agent can falsify without rereading the issue.

## L-001 A specification is not a measurement

- Kind: candidate law
- Decision state: supported
- Claim: A specification is a document that states requirements, possibly versioned. A measurement is an operation, or the recorded result of one, that determines a value of a quantity or an observation. They do not share identity.
- Why it exists: ISO 9000 3.8.7 vs 3.11.5. ISA-95 Test Specification vs Test Result. GS1 `testprd` vs `testres`. ERPNext template vs readings. Odoo QCP or norm vs entered measure.
- Counterexample that would reject it: A first-party source in which changing the live specification silently changes the stored historical reading's meaning without a new result identity, and auditors treat that as correct.
- Runtime consequence: Pin specification revision on the inspection. Do not store only "current item spec."
- Identity fork: Whether a specification object and a measurement object could still be one identifiable thing under two roles stays **undetermined**. The claim here is that their meanings differ. It does not decide storage identity. See Q-001.

## L-002 A characteristic is not a requirement and not a reading

- Kind: candidate law
- Decision state: supported
- Claim: A characteristic is a feature of an object. A quality characteristic is that feature related to a requirement. A reading is evidence about the characteristic at a time.
- Why it exists: ISO 9000 3.10.1, 3.10.2, 3.11.5.
- Counterexample: A source that treats "diameter = 10.02" as the characteristic itself, with no remaining feature identity when the next reading arrives.
- Runtime consequence: Limits live on the requirement or specification. Readings live on the measurement. The characteristic is the thing both talk about.

## L-003 Inspection judgment is not release

- Kind: candidate law
- Decision state: supported
- Claim: Determining conformity is not permission to proceed. Release is a later authorization that cites evidence and an authorizer.
- Why it exists: ISO 9000 3.11.7 vs 3.12.7. ISO 9001 8.6. 21 CFR 211.165(a).
- Counterexample: 21 CFR radiopharmaceutical release before sterility completes. That weakens "all planned tests finished" and does not merge judgment with release. The authorizer still exists.
- Runtime consequence: Surfaces that ship on Pass alone need an explicit policy that the same principal's Pass is the release. That policy is not the default law.

## L-004 Nonconformity is not a disposition

- Kind: candidate law
- Decision state: supported
- Claim: Non-fulfilment of a requirement is a fact. What happens to the material is a later authorized dealing.
- Why it exists: ISO 9001 8.7. GS1 inspecting vs `non_conformant` vs later `recalled`, `holding`, or dispose. Odoo Fail vs failure location vs alert.
- Counterexample: ERPNext single header Rejected used as both judgment and stock block. That is a source collapse, not a refutation of ISO 8.7.
- Runtime consequence: Quality records the judgment. Inventory #18 records containment. Manufacturing #19 records scrap or rework.

## L-005 A concession does not erase a nonconformity

- Kind: candidate law
- Decision state: supported
- Claim: Permission to use or release a nonconforming product leaves the nonconformity in the history. It adds an authorization with limits of quantity, time, and use.
- Why it exists: ISO 9000 3.12.5. ISO 9001 8.7.2 items a, c, d.
- Counterexample: ERPNext Manual Inspection that stores only Accepted and drops the out-of-range reading. If production systems treat that as the intended model, the law is still true for ISO and false as an ERPNext invariant.
- Runtime consequence: Override must add a fact. It must not delete the reading or the failed judgment.

## L-006 Lot acceptance from a sample is not unit conformity

- Kind: candidate law
- Decision state: supported
- Claim: An AQL or sample-size decision is a lot-level inference. Untested units do not become individually inspected.
- Why it exists: ISO 2859-1:2026 public description. 21 CFR 211.165(d).
- Counterexample: A regulated process that requires every serial to carry its own test result. That is a different plan, not a failure of the law.
- Runtime consequence: Recall and customer answers must not claim unit-level inspection that did not happen. Genealogy #20 can still trace the lot.

## L-007 GS1 sampling is not ISO 2859 sampling

- Kind: candidate law
- Decision state: supported
- Claim: The word "sampling" names two domain acts. ISO 2859 sampling is statistical selection that leaves the lot sellable pending the lot decision. GS1 CBV `sampling` is a testing act that makes the sampled instance unviable and requires end-of-life for serialized objects.
- Why it exists: S-ISO2859 vs S-GS1-CBV definitions fetched 2026-08-16.
- Counterexample: A later CBV revision that redefines `sampling` as non-destructive. Not seen.
- Runtime consequence: Do not bind one Action name `Sample` to both. The collision is a research finding, not a schema.

## L-008 Release requires evidence and a named authorizer

- Kind: candidate law
- Decision state: supported
- Claim: A release record is incomplete without evidence of conformity to acceptance criteria and identity of the person or role that authorized release.
- Why it exists: ISO 9001 8.6(a)(b). 21 CFR 211.165 quality control unit.
- Counterexample: Skip-lot release under ISO 2859 still has a scheme and an authority that chose skip-lot. It is not anonymous.
- Runtime consequence: Agent-authored release must be the same Action with a Principal. Constitution §15.

## L-009 Correction requires re-verification. Repair may not restore conformity

- Kind: candidate law
- Decision state: supported
- Claim: After correction or rework, conformity is verified again. Repair aims at intended use and can leave a nonconformity that still needs a concession.
- Why it exists: ISO 9001 8.7.1 last sentence. ISO 9000 3.12.8 vs 3.12.9. 21 CFR 211.165(f) reprocessed material must meet specifications before acceptance.
- Counterexample: A cosmetic repair that is released without re-measure and without concession. That would be a process failure, not a simpler model.
- Runtime consequence: `in_rework` cannot jump to `released`. It returns to judgment. Execution of the rework process is #19.

## L-010 A metrological measurement result includes uncertainty

- Kind: candidate law
- Decision state: hypothesis
- Claim: When the determination is a measurement of a quantity, the result is incomplete without a statement of uncertainty, or an explicit statement that uncertainty was not evaluated.
- Why it exists: JCGM 100:2008 definition and 3.3.1. ISO 9001 7.1.5.
- Counterexample: ERPNext, Odoo, and public ISA-95 result type omit uncertainty and still operate factories. That is why the state is hypothesis, not supported as a universal operational law.
- Runtime consequence: If the law survives, Pass or Fail near a limit must be able to stay `judgment_pending` when the uncertainty interval crosses the limit. See S-005.

## L-011 Plan and result are different identities, and the result pins the plan version

- Kind: candidate law
- Decision state: supported
- Claim: An inspection plan, test specification, or QCP can change. A completed result cites the version it executed.
- Why it exists: ISA-95 Test Specification Version. Odoo QCP vs check. GS1 `testprd` vs `testres`. ISO 9001 8.5.6 control of changes.
- Counterexample: ERPNext "fetched" template. If fetch is a copy, it supports the law. If later template edits rewrite submitted inspections, that is a source bug relative to this law.
- Runtime consequence: Changed spec after production does not mutate old results. See S-002.

## L-012 Calibration status is provenance of a measurement, not a second judgment

- Kind: candidate law
- Decision state: hypothesis
- Claim: Instrument identity and calibration validity at measurement time affect the authority of the reading. They are not themselves Pass or Fail of the product.
- Why it exists: ISO 9001 7.1.5.2. JCGM 100 4.3.3. Odoo optional Device.
- Counterexample: A hard gate that refuses to store a reading when the device is overdue. That is a policy on recording, still compatible with the law.
- Runtime consequence: Do not overwrite the product judgment when a later calibration recall appears. Add a fact about the instrument and re-open judgment if policy says so. See S-016.

## L-013 Quality events are append-only for the facts that justified release

- Kind: candidate law
- Decision state: supported
- Claim: A later override, retest, or correction adds events or facts. It does not delete the first reading, the first judgment, or the first release authorization.
- Why it exists: GS1 EPCIS no delete. ISO 9001 8.6 and 8.7.2 retain documented information. Constitution §8 requested is not happened. ISA-95 Date vs record timestamp.
- Counterexample: Draft ERPNext Quality Inspection before submit is mutable. After it has authorized a stock document, mutation would violate the law.
- Runtime consequence: Retest is a new measurement. Override is a new authorization. Both cite the old facts.

## L-014 Product nonconformance control is not CAPA

- Kind: candidate law
- Decision state: supported
- Claim: Containing and dispositioning this output is a different concern from eliminating the cause so it does not recur.
- Why it exists: ISO 9001 8.7 vs 10.2. ERPNext Quality Inspection vs Quality Action. Odoo mixes them on Quality Alert, which is a source artifact.
- Counterexample: A tiny workshop that only writes one "quality issue" record. Convenience does not make the two ISO clauses the same.
- Runtime consequence: An Action `RaiseAlert` is not a substitute for `Contain` or `AuthorizeConcession`.

## L-015 Disposition on the object can persist across later steps

- Kind: candidate law
- Decision state: supported
- Claim: After an exceptional inspection, later shipping or receiving can keep the exceptional disposition. Business step and disposition stay independent.
- Why it exists: GS1 guideline inspecting then shipping while `recalled`. CBV 2.0 persistent disposition.
- Counterexample: A WMS that resets status to in_progress on any move. That loses recall semantics.
- Runtime consequence: Recall is not only a document. It is a durable condition that later logistics events must carry. Genealogy details stay on #20 and #38.

## L-016 Release before planned arrangements finish is an authorized exception, not a missing inspection

- Kind: candidate law
- Decision state: supported
- Claim: ISO 9001 8.6 and 21 CFR 211.165(a) radiopharmaceuticals allow progress with open tests only when a relevant authority, and the customer when applicable, approve. The open arrangement remains a fact.
- Why it exists: Those two clauses.
- Counterexample: Informal "ship it, we will test later" with no authorizer. That is a process breach, not a third kind of release.
- Runtime consequence: State can be `released` and `inspection_due` at once for the open test. The machine in `lifecycle.md` must allow that pair under exception, or split the lot's obligations.

## L-017 A certificate confirms characteristics. It is not the test result and not the release

- Kind: candidate law
- Decision state: supported
- Claim: `cert`, CoC, and CoA are documents that assert characteristics, often by a third party. `testres` records execution of a procedure. Release is permission to proceed.
- Why it exists: GS1 CBV transaction types. ISO 9001 8.6 evidence list.
- Counterexample: A jurisdiction that treats the signed CoA as the legal release. Then the certificate is a surface of the release Action, still not the measurement.
- Runtime consequence: Do not generate a certificate by renaming the inspection record.

## L-018 Deviation permit and concession are timed differently

- Kind: candidate law
- Decision state: supported
- Claim: A deviation permit authorizes departure from specified requirements before realization. A concession authorizes use or release of something that already does not conform.
- Why it exists: ISO 9000 3.12.6 vs 3.12.5.
- Counterexample: ERPNext and Odoo pages fetched today do not implement the pair. Absence in ERPs does not refute ISO.
- Runtime consequence: Changed spec used as a backdated permit after the lot exists is a concession in disguise. See S-002 and S-010.

## L-019 Override is a recorded exception. Its metamodel form is open

- Kind: candidate law
- Decision state: undetermined
- Claim: Failed inspection with use anyway must leave both the failed judgment and the authorization. Whether that authorization is a distinct Action or a Policy on `AuthorizeRelease` is not decided.
- Why it exists: ERPNext Manual Inspection. ISO concession. Standing order 24. Independent first-party sources do not agree on the form.
- Counterexample: None that settles Action vs Policy.
- Runtime consequence: Do not implement a generic field write that flips `status` to Accepted.

## L-020 Specification identity versus measurement identity is open

- Kind: candidate law
- Decision state: undetermined
- Claim: Sources agree the meanings differ. They do not agree whether OS should give them two identities or one identity with two roles.
- Why it exists: Standing order 24. RFC-0001 Type vs Fact is still a hypothesis.
- Counterexample: Needed from foundation issues #3 and #6, not from this folder alone.
- Runtime consequence: Wave B must not pick a table layout from this law.
