# Evidence

Cards below are observations from the sources in `sources.md`. They are not OS primitives.

## EV-001. Performance can be a series satisfied over time

- Kind: domain evidence
- Decision state: supported as IFRS 15 text. Implication for OS remains hypothesis
- Source: SRC-IFRS15 paras 22-23, 31-38, 39-44
- Relates to: RFC-0001 Action versus Event. `docs/open-questions.md` Q13

At contract inception the entity identifies each promise to transfer a distinct good or service, or a series of distinct goods or services that are substantially the same and have the same pattern of transfer.

A series has the same pattern of transfer when each item would be a performance obligation satisfied over time, and the same progress method would apply to each item.

An entity then decides, for each performance obligation, whether it satisfies the obligation over time or at a point in time. Over time applies if the customer consumes as the entity performs, if the customer controls the asset as it is created, or if the asset has no alternative use and the entity has an enforceable right to payment for performance to date.

Progress is remeasured at the end of each reporting period. If progress cannot be measured reliably, revenue is limited to recoverable cost.

**Source artifact, not a law.** IFRS 15 is a recognition standard. It is not a runtime ontology. The domain fact is that some commercial promises are continuous or repeating, and control can transfer without a shipment event.

## EV-002. A lease asset is a right, not the underlying thing

- Kind: domain evidence
- Decision state: supported as IFRS 16 text. Implication for OS remains hypothesis
- Source: SRC-IFRS16 paras 9-10, 22-27 and the IFRS 16 overview page
- Relates to: RFC-0001 Type and Relationship. `docs/open-questions.md` Q12, Q13. Issues #15, #18, #26

A contract contains a lease if it conveys the right to control the use of an identified asset for a period of time in exchange for consideration. The period may be stated as amount of use, such as production units.

At commencement the lessee recognises a right-of-use asset and a lease liability. The right-of-use asset is measured at cost. The liability is the present value of unpaid lease payments.

The underlying asset can remain with the lessor. Subleases of right-of-use assets are in scope.

**Source artifact, not a law.** The accounting model is one lessee model with exemptions. The domain fact is that the economic resource can be a time-bounded right over an identified asset that someone else still owns.

## EV-003. Insurance measurement is probability-weighted and includes incurred-but-unreported service

- Kind: domain evidence
- Decision state: supported as IFRS 17 text. Implication for OS remains hypothesis
- Source: SRC-IFRS17 paras 32-37, 40 and the IFRS 17 overview
- Relates to: RFC-0001 Fact and Event. `docs/open-questions.md` Q3, Q5, Q10. Issue #62

On initial recognition a group of insurance contracts is measured as fulfilment cash flows plus a contractual service margin.

Fulfilment cash flows include a probability-weighted mean of the full range of possible outcomes, a time-value and financial-risk adjustment, and a risk adjustment for non-financial risk.

After recognition the carrying amount includes a liability for remaining coverage and a liability for incurred claims. The incurred-claims liability is fulfilment cash flows related to past service. That past service can include claims that have occurred and are not yet reported.

**Source artifact, not a law.** IFRS 17 is a measurement standard for groups of contracts. The domain fact is that an occurrence can be economically present before any claim object exists, and that the "fact" the books need is often a distribution, not a point event.

## EV-004. Clinical records separate measurement, assertion, and consent

- Kind: domain evidence
- Decision state: supported as FHIR R5 text. Implication for OS remains hypothesis
- Source: SRC-FHIR-OBS, SRC-FHIR-COND, SRC-FHIR-CONS
- Relates to: RFC-0001 Action, Fact, Policy. `docs/open-questions.md` Q3, Q4, Q8. Issue #4

Observation is for measurements and simple assertions about a patient, device, or other subject. FHIR tells implementers not to use Observation as the home for a clinical diagnosis.

Condition is the record of a problem, diagnosis, or other concern. It carries `clinicalStatus` (`active`, `recurrence`, `relapse`, `inactive`, `remission`, `resolved`, `unknown`) and `verificationStatus` (`unconfirmed`, `provisional`, `differential`, `confirmed`, `refuted`, `entered-in-error`).

Consent records a grantor's permit or deny for identified actors, purposes, and periods. It is a healthcare consumer policy choice, not a row-level ACL.

**Source artifact, not a law.** FHIR is an interchange resource model. The domain fact is that a measurement, a clinician's standing assertion, and a purpose-limited permission are different kinds of statement, and that "unconfirmed" and "differential" are first-class statuses.

## EV-005. Legal norms use deontic operators and can create institutional facts

- Kind: domain evidence
- Decision state: supported as LegalRuleML and ODRL text. Implication for OS remains hypothesis
- Source: SRC-LRML, SRC-ODRL, SRC-ODRL-VOC
- Relates to: RFC-0001 Policy and Constraint. `docs/open-questions.md` Q8, Q9. Issues #8, #67

LegalRuleML models obligation, permission, prohibition, and right. An Obligation binds a bearer to a state or act. Failure to achieve it is a Violation. A Prohibition binds a bearer to an act that becomes a Violation if performed. Permission is the absence of a contrary obligation or prohibition, or an explicit derogation.

LegalRuleML also splits constitutive norms from prescriptive norms. Constitutive norms define institutional facts. Prescriptive norms state what is obligatory, permitted, or prohibited, and under which conditions.

ODRL 2.2 models a Policy as a non-empty set of Permission, Prohibition, or Duty rules over an Asset. Constraints may be temporal or spatial. A Duty is an action that must be exercised. Permission and Prohibition are disjoint from Duty.

**Source artifact, not a law.** These are rule-markup languages. The domain fact is that "may", "must", and "must not" are not the same operator as "this function returned false", and that some rules create the very types they talk about.

## EV-006. Records must stay authentic, and some records must later be destroyed or erased

- Kind: domain evidence
- Decision state: supported as ISO 15489 sample and GDPR Article 17 text. Implication for OS remains hypothesis
- Source: SRC-ISO15489, SRC-GDPR17, SRC-21CFR11
- Relates to: RFC-0001 Fact, provenance, ontology revision. `docs/open-questions.md` Q6, Q7, Q8. Issues #6, #9, #12

ISO 15489-1:2016 treats records as authoritative evidence of business when they have authenticity, reliability, integrity, and useability. Records are content plus metadata that describes context, content, structure, and management through time. Disposition authorities specify retention and later destruction or transfer.

GDPR Article 17 gives a data subject the right to obtain erasure without undue delay when listed grounds apply, including that the data are no longer necessary for the original purpose, or that consent is withdrawn with no other legal ground. Article 17(3) withholds that right where processing is necessary for freedom of expression, a legal obligation, public-interest tasks, public health, archiving or research under Article 89, or the establishment, exercise, or defence of legal claims.

21 CFR Part 11 states criteria under which FDA trusts electronic records and electronic signatures as equivalent to paper. It is a trust-and-audit rule, not a new recordkeeping duty.

**Source artifact, not a law.** The domain fact is that "keep an explainable history forever" and "this statement must become unrecoverable" are both real requirements, sometimes over the same person.

## EV-007. Sold product, facing service, and realizing resource are different layers

- Kind: domain evidence
- Decision state: supported as TM Forum SID public HTML. Implication for OS remains hypothesis
- Source: SRC-SID
- Relates to: RFC-0001 Type and Interface. Issue #15

SID ProductSpecification is what marketing wants to sell at a functional level. A tangible ProductSpecification is realized as a ResourceSpecification. An intangible ProductSpecification is realized as a CustomerFacingService, or bought from a supplier as another ProductSpecification.

A ProductSpecification may be a collection of other ProductSpecifications. Members of the collection may also be offered alone.

**Source artifact, not a law.** SID is a CSP reference model. The domain fact is that catalog identity, service identity, and network or device identity are not one SKU with roles.

## EV-008. Through-life product support keeps several breakdowns of the same product

- Kind: domain evidence
- Decision state: supported as ISO 10303-239 and OASIS PLCS overviews. Deep EXPRESS model unread. Implication for OS remains hypothesis
- Source: SRC-PLCS
- Relates to: RFC-0001 identity and time. Issues #15, #19, #26

ISO 10303-239 specifies information required to support a product throughout its life. OASIS PLCS describes the gap between the design-time product definition and as-maintained reality as the acute problem of the support phase.

The ISO abstract includes representation of a product through life, specification and planning of activities, authorization of subsequent work, activity history, and product history.

**Source artifact, not a law.** PLCS is a STEP application protocol. The domain fact is that as-designed, as-built, and as-maintained structures can diverge, and that effectivity is not the same problem as a stock lot.

## EV-009. Utility operations model a network plus interval measurements, not a warehouse

- Kind: domain evidence
- Decision state: supported as IEC 61970-301 abstract and EPRI primer. Full CIM unread. Implication for OS remains hypothesis
- Source: SRC-CIM
- Relates to: RFC-0001 Event and Fact. Issues #18, #62, #38

IEC 61970-301 defines an abstract model of the major objects in an electric utility enterprise used in operations. It standardizes classes, attributes, and relationships so independently built network applications can exchange a shared semantic model. SCADA is modeled far enough to support power-system simulation and inter-control-centre communication.

The EPRI primer splits the family. IEC 61970 covers interconnected-grid operation and planning. IEC 61968 covers distribution business functions including metering and outage. IEC 62325 covers market bidding, clearing, and settlement.

**Source artifact, not a law.** CIM is an interoperability model. The domain fact is that the primary quantity is often a time-series measurement on a topological network, with conservation constraints, not a countable on-hand balance.

## EV-010. Some work is a case file plus discretionary planning, not a preset action sequence

- Kind: domain evidence
- Decision state: supported as CMMN 1.1 text. Implication for OS remains hypothesis
- Source: SRC-CMMN
- Relates to: RFC-0001 "Workflow is not a primitive". `docs/open-questions.md` Q4. Issue #10

OMG describes CMMN as centered on living information and relationships. Traditional business processes are centered on activity sequences defined in advance.

Every Case has exactly one CaseFile. The CaseFile holds CaseFileItems of any data structure, including containment hierarchies. Stages can expose a PlanningTable so workers add discretionary tasks at runtime.

**Source artifact, not a law.** CMMN is a notation and metamodel for case products. The domain fact is that some long-running work cannot name its next Action until evidence in the file changes.

## EV-011. Land administration is party, spatial unit, and a bundle of rights

- Kind: domain evidence
- Decision state: supported as ISO 19152 abstract and FIG overview. Full LADM unread. Implication for OS remains hypothesis
- Source: SRC-LADM
- Relates to: RFC-0001 Relator. Issues #3, #14, #31

ISO 19152:2012 defines packages for parties, basic administrative units, rights, responsibilities and restrictions, spatial units, and spatial sources or representations. FIG restates LADM as information on people-to-land relationships. Classes are prefixed `LA_`. `LA_RRR` is right, restriction, or responsibility. `LA_BAUnit` is the basic administration unit.

The 2012 edition is withdrawn and replaced by the 2024 multipart series. The party, RRR, and spatial-unit split remains the published conceptual core.

**Source artifact, not a law.** LADM is a land-administration conceptual model. The domain fact is that ownership is often a temporally bounded RRR over a spatial unit, not a boolean on an Organization.

## EV-012. Construction shares a built-asset model across parties and life cycle

- Kind: domain evidence
- Decision state: supported as IFC and ISO 16739 abstracts. Deep schema unread. Implication for OS remains hypothesis
- Source: SRC-IFC, and EV-001 criterion (b)
- Relates to: Issues #19, #29. IFRS 15.35(b)

ISO 16739-1:2024 is an open schema for information exchanged among construction and facility-management applications. It covers buildings and infrastructure over their life cycle. IFC 4.3.2.0 is the matching buildingSMART publication.

IFRS 15.35(b) already treats customer-controlled work in progress as over-time satisfaction. Construction therefore stresses both progressive control transfer and a shared spatial product model.

**Source artifact, not a law.** IFC is interchange. Most construction process pressure already sits on #29 plus EV-001. The new piece is the shared as-designed built-asset identity, not another project module.

## EV-013. Existing backlog already owns the ERP-shaped versions of several named industries

- Kind: domain evidence
- Decision state: supported as issue titles on EnzoTironi/OS, 2026-08-16
- Source: SRC-OS-BACKLOG and the open issue list

Field service collapses into #26 and #27 unless a later unit finds a distinct SLA-clock or disconnected-van law.

Retail POS collapses into #16 and #23 unless anonymous high-volume tender becomes a mutation-model counterexample for #57.

Warehouse automation collapses into #18, #20, and runtime issues unless robot tasking needs a control-loop primitive.

Scheduling and resource booking collapse into #24 unless overbooking of perishable slots is shown to be a different commitment kind.

Public-sector "cases" collapse into EV-010 plus EV-005 plus EV-006 unless eligibility determination needs its own child.

Asset finance collapses into #22, #37, and EV-002 unless beneficial ownership of a pool needs its own child.

Those industries stay on the map as coverage notes. They are not automatic new issues.
