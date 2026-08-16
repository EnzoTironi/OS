# Candidate laws

Each law is the smallest claim this scan can state. None is accepted. A later unit should try the counterexamples in `scenarios.md`.

## LAW-001. Some commercial promises are satisfied by progress, not by a completion Event

- Kind: candidate law
- Decision state: hypothesis
- Evidence: EV-001
- Falsify if: every IFRS 15 over-time contract can be represented as a sequence of ordinary Events plus valid-time intervals without a progress measure, and the unmeasurable-progress fallback still has a home
- Runtime consequence: if this survives, projections must accept a remeasured progress fraction as first-class input, not only posted movements. No schema is proposed

IFRS 15 requires a single progress method per over-time obligation and remeasurement each period. That is stronger than "the subscription is active this month."

## LAW-002. An occurrence can create economic liability before any party reports it

- Kind: candidate law
- Decision state: hypothesis
- Evidence: EV-003
- Falsify if: IBNR can be modeled as a later Event with backdated valid time, and the probability-weighted measurement can live entirely in a Function, with no change to Fact or Event
- Runtime consequence: if this survives, "unknown" is a normal domain state for past service, not only an integration timeout. Wave B storage advice waits

IFRS 17's liability for incurred claims is fulfilment cash flows related to past service. Past service is not the same as "a Claim object exists."

## LAW-003. A measurement, a standing assertion, and a purpose-limited permission are different statement kinds

- Kind: candidate law
- Decision state: hypothesis
- Evidence: EV-004
- Falsify if: Observation, Condition including `differential` and `refuted`, and Consent purpose rules can all be expressed as Fact plus Policy without collapsing diagnosis into a lab row or consent into an ACL
- Runtime consequence: if this survives, authority may depend on statement kind and purpose, not only on principal and object type

FHIR's own boundary text is the evidence that the collapse is a known failure mode.

## LAW-004. Boolean deny is not the same operator as obligation or prohibition

- Kind: candidate law
- Decision state: hypothesis
- Evidence: EV-005
- Falsify if: LegalRuleML Obligation and Prohibition, including Violation, and ODRL Duty, can be compiled to Policy and Constraint and Action without leftover meaning, including constitutive institutional facts
- Runtime consequence: if this survives, a failed Action and a Violation of an unperformed duty are different records. Enforcement may need a duty clock, not only a deny at invoke time

ODRL Duty looks closer to Action than LegalRuleML Obligation does. The law may split.

## LAW-005. Reconstructable history and required unavailability can both be true of one statement

- Kind: candidate law
- Decision state: hypothesis
- Evidence: EV-006
- Falsify if: every GDPR Article 17 erasure and every ISO 15489 disposition can be handled as an ordinary compensating Action that leaves a fully reconstructable chain, or if explainability can be scoped so that personal data are never part of the causal chain the thesis requires
- Runtime consequence: if this survives, deletion, tombstone, legal hold, and audit reconstruction cannot be one retention flag. Wave B must not pick an append-only store as if the domain always wants that

Article 17(3) already shows the clash is inside the law, not only between privacy and ERP audit.

## LAW-006. A time-bounded right can be the resource even when the identified thing is not owned

- Kind: candidate law
- Decision state: hypothesis
- Evidence: EV-002, EV-011
- Falsify if: right-of-use and LADM RRR are ordinary Relators with attributes, and treating them as Resources adds no enforcement that Relator plus Constraint lacks
- Runtime consequence: if this survives, inventory-like projections may need to run over rights and over things, with different conservation laws

IFRS 16 subleases of right-of-use assets are the cheap test. LADM overlapping RRRs are the harder test.

## LAW-007. Catalog identity, facing service, and realizing resource can diverge

- Kind: candidate law
- Decision state: hypothesis
- Evidence: EV-007
- Falsify if: #15 can treat these as roles or interfaces on one specification without losing activation, substitution, or supplier-realized intangibles
- Runtime consequence: undetermined. Do not design a three-layer schema here

This law is required pressure on #15, not a new primitive claim.

## LAW-008. As-designed, as-built, and as-maintained structures can be about one product and still disagree

- Kind: candidate law
- Decision state: hypothesis
- Evidence: EV-008
- Falsify if: bitemporal valid time on one structure, plus revision, explains the PLCS support-phase gap
- Runtime consequence: undetermined

This is identity plus time, not a new PLM primitive, until #15 and #9 fail the test.

## LAW-009. Some primary quantities are interval measurements on a network

- Kind: candidate law
- Decision state: hypothesis
- Evidence: EV-009
- Falsify if: CIM measurements are ordinary Facts with a quantity, a node, and an interval, and conservation is an ordinary Constraint
- Runtime consequence: if this survives, #62 and #18 need interval and network types. If it fails, CIM is interchange only, which is already #38's caution

## LAW-010. Some long-running work cannot name its next Action until the file changes

- Kind: candidate law
- Decision state: hypothesis
- Evidence: EV-010
- Falsify if: CMMN discretionary planning is composition of Actions plus a query over a CaseFile object, with no extra process primitive
- Runtime consequence: undetermined. Durable execution stays Wave B

RFC-0001 already suspects Workflow is composition. CMMN is the adversarial case for that suspicion, not an automatic new primitive.

## LAW-011. The current backlog's industry list is not the same as its semantic coverage

- Kind: candidate law
- Decision state: supported for the negative claim. The positive ranking stays hypothesis
- Evidence: EV-013, SRC-OS-BACKLOG
- Falsify if: a later audit shows ranks 1-6 already solved on sibling branches

"We have projects, assets, CRM, payments, and GRC" does not imply we have over-time obligations, IBNR, differential diagnosis, deontic violation, required erasure, or right-of-use.

## Rejected as laws from this scan

### REJ-001. Every named industry needs a domain issue

- Kind: candidate law
- Decision state: rejected
- Evidence: EV-013, CAND-012

Issue 73 asked for child issues only when they add new semantic pressure. Filing construction, field service, retail, WMS, and public sector as modules would repeat the ERP bias the issue is meant to correct.

### REJ-002. Standards should define OS primitives

- Kind: candidate law
- Decision state: rejected
- Evidence: SRC-OS-38, research constitution §2, and the source-artifact notes on every EV card

IFRS, FHIR, SID, CIM, CMMN, IFC, and LADM are evidence. Several are interchange or recognition models. Mapping their classes into RFC-0001 would freeze the wrong artifact.
