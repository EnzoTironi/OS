# Scenarios

These are counterexamples for the laws in `candidate-laws.md`. They extend `scenarios/README.md`. They are not executable tests.

Existing S-001 through S-012 already cover requested versus actual, partial fulfillment, stale approval, external timeout, dual roles, employment relators, backdated stock, lot recall, rework, cancellation, contradictory observations, and ontology revision. The cards below add pressure those families do not apply.

## S-073-01. Monthly SaaS that is also a series obligation

- Kind: counterexample
- Decision state: hypothesis
- Attacks: LAW-001
- Sources: SRC-IFRS15 paras 22-23, 35(a)

A customer buys access for 12 months. Each month is substantially the same. The customer consumes as the vendor performs.

In month 4 the vendor changes the progress method from time elapsed to active seats.

Questions:

- Is this one performance obligation, twelve, or a subscription object plus Events?
- Does changing the progress method mutate history or create a new measure from a knowledge-time point?
- If month 3 was invoiced on time elapsed, can the system explain that invoice after the method change?

If the model needs a billing-plan document that is not a Commitment or Event, LAW-001 is still open and a specialized kernel smell appears.

## S-073-02. Construction on the customer's land

- Kind: counterexample
- Decision state: hypothesis
- Attacks: LAW-001
- Sources: SRC-IFRS15 para 35(b). SRC-IFC

A contractor builds a wing on land the customer already controls. Work in place cannot be redirected to another buyer. After 40 percent completion, a change order alters the remaining distinct goods.

Questions:

- When did the customer obtain control of the 40 percent?
- Is work-in-place inventory, a progress Fact, or a built-asset identity in an IFC-like structure?
- Does the change order modify the original obligation or create a new one for the remaining work?

#29 can own coordination. This scenario still belongs to the over-time child because control transferred without shipment.

## S-073-03. Storm overnight, claims next quarter

- Kind: counterexample
- Decision state: hypothesis
- Attacks: LAW-002
- Sources: SRC-IFRS17 paras 33, 40

A hurricane makes landfall on 3 September. By 30 September the insurer has 200 notices of loss and an actuarial estimate that 80 more have occurred and are unreported. In November, 95 late notices arrive. Ten of the original 200 are withdrawn as unfounded.

Questions:

- What Event exists on 4 September for the unreported 80?
- Is the 30 September liability a Fact, a Function output, or both?
- When a withdrawn notice dies, what happens to the incurred-claims liability that already included it in a probability-weighted mean?
- Can an auditor see what the books believed on 30 September after November information arrives?

If the only representation is "create Claim objects when notified," LAW-002 is not absorbed by #7's unknown Effect.

## S-073-04. Differential diagnosis that is later refuted

- Kind: counterexample
- Decision state: hypothesis
- Attacks: LAW-003
- Sources: SRC-FHIR-OBS, SRC-FHIR-COND

A patient presents with headache. An Observation records the symptom. Clinician A records Condition meningitis as `differential` and `active`. Clinician B records Condition migraine as `provisional`. A lumbar puncture Observation later supports neither. Meningitis is set to `refuted`. Migraine becomes `confirmed`.

Questions:

- Did any Action create the diagnosis, or is the Condition an assertion about the patient?
- Does refuting meningitis delete a Fact or supersede it?
- Can both Conditions remain queryable as what was believed during the encounter?
- If an agent may act only on `confirmed` Conditions, where does that rule live?

If Condition collapses into Observation, FHIR's own boundary has been ignored.

## S-073-05. Consent for treatment, deny for research

- Kind: counterexample
- Decision state: hypothesis
- Attacks: LAW-003, LAW-004
- Sources: SRC-FHIR-CONS, SRC-ODRL, SRC-GDPR17

The same principal may read the same Observation for treatment and must not read it for research. The data subject later withdraws research consent. A legal claim then needs the same Observation.

Questions:

- Is this one Policy with a purpose parameter, or a Consent object with its own lifecycle?
- After withdrawal, does Article 17 require erasure of research copies while Article 17(3) keeps the legal-claim copy?
- Can one Action `ReadObservation` have two outcomes for one principal at one time?

If purpose is a string on Policy, show that constitutive "this is a research copy" is still expressible.

## S-073-06. Duty to file, violation by inaction

- Kind: counterexample
- Decision state: hypothesis
- Attacks: LAW-004
- Sources: SRC-LRML

A regulation obliges a bearer to file a safety report within 72 hours of a qualifying Event. The bearer does nothing. No denied Action occurred. On hour 73 the bearer is in Violation. A repair obligation to file late and to notify a regulator then becomes active.

Questions:

- What Action failed? None was invoked.
- Is the Violation an Event, a Fact, or a deontic effect?
- Can Policy-as-boolean-at-invoke-time detect this?
- Does the repair obligation require a new form, or is it another Action the system must now permit and also require?

If #8 can express this with Constraint plus a scheduler, record that as a collapse. Do not assume it.

## S-073-07. Erase the person, keep the invoice

- Kind: counterexample
- Decision state: hypothesis
- Attacks: LAW-005
- Sources: SRC-GDPR17, SRC-ISO15489

A consumer asks for erasure. The organization still has an unpaid invoice and a tax record that law requires it to keep. Marketing profiles must go. The invoice must remain authentic under ISO 15489. Years later an auditor asks why a payment was allocated to that invoice.

Questions:

- Which statements are personal data, and which are business records?
- What does erasure do to identity on the invoice? Blank, hash, separate legal entity, or refusal?
- Can the causal chain of the payment still be explained?
- If a legal hold lands the next day, does disposition freeze?

If the model answers "we never delete," it fails Article 17. If it answers "we delete the party," it may fail authenticity and tax law.

## S-073-08. Sublease of a right-of-use

- Kind: counterexample
- Decision state: hypothesis
- Attacks: LAW-006
- Sources: SRC-IFRS16 paras 3, 9, 22

Company A leases a floor from Landlord L. A recognises a right-of-use asset. A then subleases two rooms to Company B. L still owns the building. B never has a contract with L.

Questions:

- How many resources exist? Building, floor, right-of-use, sublease right?
- Does B's right point at the rooms, at A's right-of-use, or at both?
- If L sells the building, which identities survive?
- Is custody of the rooms enough, or does the right remain a distinct object?

If Relator-with-dates absorbs this, reject LAW-006 as a primitive claim and keep it as a modeling pattern.

## S-073-09. Sold broadband, facing service, ports on a card

- Kind: counterexample
- Decision state: hypothesis
- Attacks: LAW-007
- Sources: SRC-SID

Marketing sells "100 Mbps home broadband." Activation creates a CustomerFacingService. The service is realized on a port of a specific card in a street cabinet. The card is swapped. The sold product and the facing service stay. The resource identity changes.

Questions:

- Are product, service, and resource one object with roles?
- Which identity does a fault Event attach to?
- Which identity does a customer cancellation attach to?

If #15 already has this split, the scenario becomes a #15 acceptance test, not a new issue.

## S-073-10. As-designed wing, as-maintained substitute

- Kind: counterexample
- Decision state: hypothesis
- Attacks: LAW-008
- Sources: SRC-PLCS

An aircraft wing is designed with part P1 effective from serial 100. During maintenance, serial 250 receives authorized substitute P2. The as-designed structure still says P1. The as-maintained structure says P2. A service bulletin later applies only to as-designed P1 still in service.

Questions:

- How many products is the wing?
- Is effectivity valid time, a configuration relator, or a third form?
- Can the bulletin query "designed as P1 and still carrying P1"?

If bitemporality plus revision answers this, drop the PLM child forever.

## S-073-11. Nominated versus metered megawatt-hours

- Kind: counterexample
- Decision state: hypothesis
- Attacks: LAW-009
- Sources: SRC-CIM

A generator nominates 80 MWh for an hour. The meter later reads 74 MWh. Settlement charges the imbalance. The network model says the energy also flowed across a constrained line.

Questions:

- Are nomination and meter read two Events, two Facts, or interval measurements?
- What is conserved, and over which topology?
- Is the imbalance a stock adjustment?

If this is just #18 with a unit of MWh and an interval, LAW-009 collapses into #62.

## S-073-12. Case file grows a discretionary task

- Kind: counterexample
- Decision state: hypothesis
- Attacks: LAW-010
- Sources: SRC-CMMN

A benefits case opens with an application document in the CaseFile. A worker adds a discretionary home visit after reading a third-party letter that arrived on day 12. No preset graph contained "home visit."

Questions:

- What Action was available on day 1?
- Is adding the visit an Action on the Case, a change to a plan object, or a new process primitive?
- Does the CaseFile have identity independent of any Action sequence?

If #10 models this as "any Action whose precondition is a query over the file," LAW-010 fails in the way RFC-0001 hoped.

## Runtime consequences that are not designs

- Kind: runtime consequence
- Decision state: undetermined

If LAW-001 or LAW-002 survives, period-end remeasurement and probability-weighted projections are semantic, not report-only.

If LAW-005 survives, append-only storage cannot be chosen as if it were domain-neutral.

If LAW-004 survives, invoke-time authorization is an incomplete enforcement point.

Wave B must wait for those laws to be attacked. This folder does not pick engines.
