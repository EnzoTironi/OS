# Candidate domains

Each card states the candidate, the RFC-0001 assumption it can challenge, the evidence it rests on, and whether a new GitHub issue is warranted. Proposed children are proposals only. This unit does not file them.

## CAND-001. Recurring and over-time performance obligations

- Kind: candidate law
- Decision state: hypothesis
- Evidence: EV-001
- Challenges: Action yields discrete Events. Fulfillment is shipment or a named milestone. `docs/open-questions.md` Q13
- Child issue: propose

SaaS subscriptions, usage-based telecom, retainers, and standing service contracts are the popular examples. IFRS 15 is the harder object. It treats a series of similar transfers as one performance obligation when each item would be satisfied over time and the same progress method applies. It also treats control transfer as something that can happen continuously.

#16 models quote, order, fulfillment, claim, and settlement. #29 models scope, milestone, and billing. Neither title names series obligations or over-time control tests.

Do not make this a billing-engine issue. The semantic question is whether Commitment and Event can represent a promise whose satisfaction is a progress measure, including the case where progress later proves unmeasurable and recognition falls back to recoverable cost.

## CAND-002. Insurance contingent occurrence and IBNR

- Kind: candidate law
- Decision state: hypothesis
- Evidence: EV-003
- Challenges: Event is a known occurrence. Fact is a point value. Unknown is an external-timeout problem. `docs/open-questions.md` Q3, Q5, Q10
- Child issue: propose

A storm can create an incurred-claims liability before any notice of loss exists. IFRS 17 measures that liability as probability-weighted fulfilment cash flows for past service, plus a risk adjustment.

#4 can store contradictory claims. #7 can leave an Effect unknown. Those are not the same as "the event probably happened, we do not know to whom, and the books must still move."

Keep ACORD message models out of the first child. They are operational interchange. The first pressure is the measurement semantics.

## CAND-003. Clinical observation, condition, and consent

- Kind: candidate law
- Decision state: hypothesis
- Evidence: EV-004
- Challenges: Action-first mutation. One accepted operational fact. Policy as who-may-invoke-Action. `docs/open-questions.md` Q3, Q4, Q8
- Child issue: propose

A lab value is an Observation. A working diagnosis is a Condition that may be `differential` or `unconfirmed` while remaining `active`. A later Condition may be `refuted` without deleting the Observation that supported it. Consent can permit one purpose and deny another for the same actor and record.

#27 is CRM and customer service. A clinical encounter is not a support ticket. #67 is GRC. Purpose limitation is closer to ODRL and FHIR Consent than to an approval matrix.

openEHR is a second corpus for the same child, not a second issue. The question is whether Observation, standing assertion, and purpose-limited consent need distinct semantic forms, or whether Fact plus Policy already express them.

## CAND-004. Deontic operators and institutional facts

- Kind: candidate law
- Decision state: hypothesis
- Evidence: EV-005
- Challenges: Policy = Function of principal, action, resource, context to Bool. Constraint = Function to Bool. `docs/open-questions.md` Q9
- Child issue: propose

LegalRuleML's Obligation is not "the action is denied." It is a duty whose non-performance is a Violation. A Prohibition's performance is a Violation. Constitutive rules create institutional facts. They do not merely constrain existing types.

ODRL's Duty is closer to RFC-0001 Action. That closeness is useful. It may let some deontic content collapse. LegalRuleML Violation and constitutive norms may not collapse.

#8 should consume this card. A dedicated child is still warranted because #8's title frames planning and invariants, not obligation or institutional fact. #67 should wait. Putting deontic operators inside GRC will hide them inside control taxonomies.

## CAND-005. Retention, destruction, and erasure versus explainable history

- Kind: candidate law
- Decision state: hypothesis
- Evidence: EV-006
- Challenges: Current state is explainable from durable history. Facts are not deleted. `docs/open-questions.md` Q6, Q7, Q8
- Child issue: propose

ISO 15489 requires authoritative records and also requires disposition. GDPR Article 17 requires erasure in some cases and forbids it in others, including legal claims and some archiving.

The thesis wants reconstructable causal chains. A records program sometimes wants the opposite. The interesting case is one person who is both a data subject and a party to a still-live legal claim.

#9 (ontology revision) and #12 (projections) can store history. They do not decide when history must become unrecoverable, or how an erasure Action leaves an explainable hole.

## CAND-006. Right-of-use and legal rights as resources

- Kind: candidate law
- Decision state: hypothesis
- Evidence: EV-002, EV-011
- Challenges: Resource is a physical object with ownership or custody. `docs/open-questions.md` Q12, Q13
- Child issue: propose, narrowly

IFRS 16 forces a right-of-use asset onto the books while the identified underlying asset may stay with the lessor. LADM treats a right, restriction, or responsibility as a first-class relation over a spatial unit.

#18 already separates ownership from custody. That is still about things. The missing split is thing versus time-bounded right over a thing.

Do not open "leases" as an ERP module. The child should ask whether Type plus Relator can represent a right-of-use without making every contract a Resource, and what happens when the same identified asset is subleased.

## CAND-007. Product, service, resource, and through-life configuration

- Kind: candidate law
- Decision state: hypothesis
- Evidence: EV-007, EV-008
- Challenges: Product identity is SKU, variant, lot, serial. One BOM with valid time
- Child issue: do not file yet

SID's sold ProductSpecification, CustomerFacingService, and ResourceSpecification are three identities. PLCS keeps design-time structure and as-maintained structure from drifting into one false object.

#15's title already includes specification and variant. If #15 treats configuration, effectivity, and service-versus-resource as in scope, a child would be duplicate. If #15 produces a SKU taxonomy, file the child then.

Required pressure for #15, #19, and #26. Also a standards add for #38.

## CAND-008. Continuous-flow networks and interval measurements

- Kind: candidate law
- Decision state: hypothesis
- Evidence: EV-009
- Challenges: Inventory Event is a discrete movement. Quantity is an on-hand projection
- Child issue: do not file yet

A watt-hour interval on a topological node is not a stock move. Imbalance settlement compares nominated and actual flows. Conservation is a network law, not a warehouse law.

#18 and #62 can absorb this if they are told to. #38 should add CIM beside ISA-95. A utilities domain issue would recreate a module.

File a child later only if surviving inventory laws require a countable item and a location bin.

## CAND-009. Adaptive case and discretionary planning

- Kind: candidate law
- Decision state: hypothesis
- Evidence: EV-010
- Challenges: Workflow is orchestration of named Actions. RFC-0001 intentionally omitted Workflow
- Child issue: do not file yet

CMMN's CaseFile is the work. Discretionary tasks appear because the file changed, not because a preset graph reached a node.

#10 already owns process, workflow, commitment, and long-running coordination. Send CMMN there. File a child only if #10 concludes that every long-running process is a state machine of known Actions.

Public-sector casework, insurance claims handling, and clinical pathways should be scenarios on #10, not three domain issues.

## CAND-010. People-to-land RRR

- Kind: candidate law
- Decision state: hypothesis
- Evidence: EV-011
- Challenges: Ownership is a property of a party or a simple link
- Child issue: do not file yet

Send to #3, #14, and #31. Spatial unit identity and overlapping RRRs are the test. A cadastre module is the wrong object.

## CAND-011. Construction progressive work-in-place

- Kind: domain evidence
- Decision state: hypothesis that most pressure is already owned
- Evidence: EV-012, EV-001
- Child issue: do not file

Use #29 for project coordination and retainage. Use CAND-001 for over-time control of customer-owned WIP. Use #15 or CAND-007 for IFC as-designed identity. A construction issue would split the same three questions.

## CAND-012. Industries that look missing and are not

- Kind: domain evidence
- Decision state: supported as backlog coverage, 2026-08-16
- Evidence: EV-013
- Child issue: do not file

Field service, retail POS, warehouse automation, scheduling, public sector as a label, and asset finance as a label do not earn children from this scan.

They remain useful #79 scenarios. They do not add a new primitive question beyond ranks 1-6 and the required-pressure notes.

## Proposed child-issue text, if a coordinator files later

Keep each title as a semantic question, not an industry.

1. `[DOMAIN] Over-time and series performance obligations. Can Commitment and Event represent continuous control transfer and repeating similar transfers without a billing kernel?`
2. `[DOMAIN] Contingent occurrence and incurred-but-unreported service. Is a probability-weighted past event a Fact, an estimate Function, or a missing form?`
3. `[DOMAIN] Observation, standing assertion, and purpose-limited consent. Do clinical (and similar) records need forms that Action-first mutation and boolean Policy cannot express?`
4. `[FOUNDATION] Deontic obligation, prohibition, permission, violation, and constitutive institutional facts. Can Policy and Constraint absorb them?`
5. `[FOUNDATION] Retention, legal hold, required destruction, and erasure versus reconstructable history`
6. `[DOMAIN] Legal rights as resources. Right-of-use and RRR versus the identified underlying asset or spatial unit`

Do not file twins for SID, PLCS, CIM, CMMN, LADM, IFC, or "government."
