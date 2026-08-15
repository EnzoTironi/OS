# Formal ontology synthesis for RFC-0001

- Artifact ID: `issue-0037-formal-ontology-synthesis`
- Issue: https://github.com/EnzoTironi/OS/issues/37
- Parent: https://github.com/EnzoTironi/OS/issues/2
- Research angle: Which UFO, REA/ValueFlows, PROV-O, and FIBO distinctions pressure the OS metamodel, which stay domain vocabulary, and which become enforceable.
- Decision states present: `hypothesis`, `supported`, `rejected`, `undetermined`
- Contract used: Agent output contract in `docs/swarm-research-backlog.md` at `dc918a5`. `docs/swarm-result-contract.md` is not in this worktree. PR 84 is still open. Record IDs follow that draft so a later index can ingest this note.

`docs/swarm-result-contract.md` was not present. This note still separates domain evidence, source-system artifacts, candidate laws, counterexamples, and runtime consequences.

## Question

Which distinctions from UFO/OntoUML, REA/ValueFlows, W3C PROV-O, and FIBO are universal enough to change RFC-0001, which belong in ordinary domain ontology, which must be enforced rather than described, and where those traditions conflict with each other or with Palantir/ERP practice?

A distinction influences the metamodel only if hiding it forces duplicate identity, silent mutation of history, or an unenforceable invariant. Naming a useful class is not enough.

## Source scope

Examined, accessed 2026-08-15 unless a dated recommendation is named:

- Guizzardi, Fonseca, Benevides, Almeida, Porello, Sales. *Endurant Types in Ontology-Driven Conceptual Modeling: Towards OntoUML 2.0*. ER 2018. https://nemo.inf.ufes.br/wp-content/papercite-data/pdf/endurant_types_in_ontology_driven_conceptual_modeling__towards_ontouml_2_0_2018.pdf
- Guizzardi, Benevides, Fonseca, Porello, Almeida, Sales. *UFO: Unified Foundational Ontology*. Applied Ontology, 2021. DOI 10.3233/AO-210256. Text taken from the authors' ResearchGate upload. The typeset journal PDF was not retrieved.
- ValueFlows ontology 0.17. https://www.valueflo.ws/specification/all_vf.html and https://w3id.org/valueflows/ont/vf
- ValueFlows flows and diagram explanations. https://www.valueflo.ws/concepts/flows/ and https://www.valueflo.ws/specification/model-text/
- McCarthy, W. E. *The REA Accounting Model*. The Accounting Review 57(3), July 1982, 554-578. Abstract via https://doi.org/10.2308/tar-4487748. The 1982 PDF timed out. Commitments as a later REA extension are cited from Geerts and McCarthy 2003, not from the 1982 paper.
- W3C. *PROV-O: The PROV Ontology*. Recommendation 30 April 2013. http://www.w3.org/TR/2013/REC-prov-o-20130430/
- W3C. *PROV-DM: The PROV Data Model*. Recommendation 30 April 2013. http://www.w3.org/TR/2013/REC-prov-dm-20130430/
- W3C. *Constraints of the PROV Data Model*. Recommendation 30 April 2013. http://www.w3.org/TR/2013/REC-prov-constraints-20130430/
- OMG. *FIBO Business Entities 1.1*. formal/18-01-01. https://www.omg.org/spec/EDMC-FIBO/BE/1.1/PDF
- OMG. *FIBO Foundations 1.0*. https://www.omg.org/spec/EDMC-FIBO/FND/1.0/PDF
- EDM Council. FIBO Contracts ontology. https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Contracts/
- In-repo design claims at `dc918a5`: `rfcs/0001-metamodel-hypothesis.md`, `docs/thesis.md`, `docs/open-questions.md`, `scenarios/README.md`, `research/reference-landscape.md`

Not examined:

- Guizzardi 2005 thesis in full
- UFO-B event mereology papers beyond the 2021 summary
- UFO-C social/intentional theory in full
- hREA implementation
- FIBO loans, securities, and derivatives modules
- Palantir public product docs beyond the in-repo reference note
- ERPNext or Odoo schemas. Those belong to issues 32 and 33.

## Cross-ontology mapping

| Distinction | UFO/OntoUML | REA / ValueFlows | PROV-O / PROV-DM | FIBO | Palantir / ERP practice | OS bucket | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Enduring thing vs occurrence | Endurant vs perdurant. Perdurants do not change. | EconomicResource vs EconomicEvent. Events are past. | Entity vs Activity. Entity has fixed aspects. | Independent party vs occurrence/breach | Object Type vs Action, often with mutable status | metamodel-pressure | `supported` for the split. `rejected` for adopting any one vocabulary as the primitive names. |
| Identity-bearing category | Kind. Rigid. Unique principle of identity. | ResourceSpecification vs inventoried EconomicResource | No kind theory. Entity/Activity/Agent overlap is allowed except some disjointness. | LegalPerson, LegalEntity as kinds of party | Customer, Supplier as object types | metamodel-pressure | `supported` that unique identity kinds exist. `undetermined` whether Kind is a new primitive. |
| Contingent classification | Role (relational) vs Phase (intrinsic) | Agent stays Agent. Customer-like facts sit on flows and relationships. | `prov:Role` qualifies a relation, not a type of the agent. | PartyInRole, ContractParty | Customer DocType / Object Type | metamodel-pressure | `supported` that role is not a kind. |
| Relationship with lifecycle | Relator. Existentially dependent on its bearers. | Agreement, Commitment, Claim | Qualified influence (Generation, Association, Delegation) | Agreement, Contract, PartnershipAgreement | Object-backed link or a document header | metamodel-pressure | `hypothesis` that relator-nature is a type meta-property, not a 13th primitive. |
| Attempt vs observation | UFO-C intention/commitment vs UFO-B event | Intent, Commitment, Claim vs EconomicEvent | Activity can be planned (`prov:Plan`) but is still an activity | Commitment vs occurrence such as BreachOfContract | Action that writes the same record it "happened" on | metamodel-pressure | `supported` that attempt is not occurrence. `rejected` that Intent/Commitment/Claim are metamodel primitives. |
| Particularized quality | Quality. An individual that maps into a quality space and can change. | Measure on a flow or resource. Not a particular. | Entity attributes are fixed aspects. | Currency amounts and terms as data | Property on an Object Type | domain-vocabulary for units. metamodel-pressure for "property as individual" | `hypothesis` |
| Legal capacity | Not a UFO primitive. Legal Entity is a non-sortal example. | Agent, including EcologicalAgent | Agent as responsibility, including SoftwareAgent | LegalPerson = liability capacity in a jurisdiction | Party master data | domain-vocabulary | `supported` |
| Agreement vs contract document | Relator vs its founding event or document | Agreement can hold commitments or unplanned events | Plan associated with an activity | Agreement and Contract are kept distinct. ContractDocument is evidence. | Sales Order as the agreement | domain-vocabulary | `supported` that document ≠ bargain. |
| Derivation / lineage | Event participation and relator foundation | Event `corrects` event. Process input/output. | `wasDerivedFrom`, `hadPrimarySource`, specialization/alternate | Contract `supersedes` | Lineage as product feature | interchange plus enforcement | `supported` that derivation is not an audit log. |
| Delegation | UFO-C social agents | provider/receiver, primary accountable | `actedOnBehalfOf` | Signatory as PartyInRole | User vs service account | metamodel-pressure for as vs on-behalf-of | `hypothesis` |
| Recipe / BOM / process spec | Not foundational | Recipe, ProcessSpecification | `prov:Plan` | Contractual terms, not recipes | BOM, Routing, Work Order | domain-vocabulary | `supported` |
| Finance products | Relator/mode examples | Media of exchange as resources | n/a | Loans, instruments, transferable contracts | ERP accounting modules | domain-vocabulary | `supported` |

## Evidence

### E-001 `UFO splits endurants from perdurants`

- Grade: `official-doc`
- Claim supported: Occurrences are not the same ontological category as things that persist and change.
- Citation: Guizzardi et al., *UFO: Unified Foundational Ontology*, Applied Ontology 2021, DOI 10.3233/AO-210256, UFO-A vs UFO-B summary. Access 2026-08-15 via ResearchGate author upload.
- Observation: UFO-A is an ontology of endurants. UFO-B is an ontology of perdurants. Endurants exist in time with all their parts and can change while keeping identity. Perdurants "only exist in the past" and "cannot be the subject of change." Apparent change in a perdurant is either variation across temporal parts or change in an underlying endurant.
- Limits: Summary paper, not the UFO-B mereology papers. "Only exist in the past" is a UFO commitment, not a ValueFlows one.

### E-002 `Kind supplies a unique identity principle`

- Grade: `official-doc`
- Claim supported: Every individual instantiates exactly one kind. That kind is rigid.
- Citation: Guizzardi et al., *Towards OntoUML 2.0*, 2018, section 3 axioms a9 and a10, theorems t9 and t10. https://nemo.inf.ufes.br/wp-content/papercite-data/pdf/endurant_types_in_ontology_driven_conceptual_modeling__towards_ontouml_2_0_2018.pdf
- Observation: "every individual necessarily instantiates a kind" and "everything necessarily instantiates at most one kind." Kinds are rigid. Distinct kinds are disjoint.
- Limits: Formal theory of endurant types. It does not say a runtime must store a `kind` column.

### E-003 `Role is relational. Phase is intrinsic.`

- Grade: `official-doc`
- Claim supported: Contingent classification splits into relational roles and intrinsic phases.
- Citation: Same 2018 paper, section 2. Student/Husband vs Child. Employee as a role in the scope of an employment relator.
- Observation: Phases use contingent intrinsic conditions. Roles use relational conditions via material relations or relators. Both are anti-rigid. A person can leave Student without ceasing to be a Person.
- Limits: Examples are pedagogical. Employment-as-relator is the authors' analysis, not a statute.

### E-004 `Relators are dependent individuals, not decorated edges`

- Grade: `official-doc`
- Claim supported: Some relationships are individuals with identity, parts, and phases.
- Citation: 2018 paper, section 2. Relators "connect entities" and are "existentially dependent on at least two distinct entities." Marriage is composed of mutual commitments and claims. UFO 2021 lists marriages, enrollments, employments, contracts, presidential mandates.
- Observation: Giovanni's Employment can be of kind Employment, in a Tenured phase, and play a Legal Grounds role for a visa. Users of OntoUML already treated relators as full endurants.
- Limits: Conceptual modeling evidence. No OS runtime was tested.

### E-005 `Kind/role/phase apply to relators, modes, and qualities`

- Grade: `official-doc`
- Claim supported: Modal meta-types are not only for people and organizations.
- Citation: 2018 paper, abstract and section 4. Stereotypes `relatorKind`, `modeKind`, `qualityKind`.
- Observation: OntoUML 1 restricted `kind`/`role`/`phase` to substantials. Independent modelers "systematically subverted" the language to put phases and roles on employments, marriages, and qualities. OntoUML 2.0 made that legal.
- Limits: Evidence is modeling practice, not ERP production failures.

### E-006 `OntoUML enforces taxonomic laws at edit time`

- Grade: `official-doc`
- Claim supported: Some UFO distinctions are already treated as checkable constraints, not comments.
- Citation: 2018 paper, Table 1 and section 4. Visual Paradigm plugin that logs violations.
- Observation: Every endurant class gets exactly one stereotype from a closed set. A sortal that is not a kind specializes exactly one kind. A kind cannot specialize another kind. A rigid type cannot specialize an anti-rigid type. A non-sortal cannot specialize a sortal.
- Limits: Constraints are for taxonomies of endurant types. Relational dependence of roles is listed as future work.

### E-007 `ValueFlows Intent is a one-sided potential flow`

- Grade: `official-doc`
- Claim supported: A desired or offered flow is not yet a two-party promise.
- Citation: ValueFlows ontology 0.17, class `vf:Intent`, https://w3id.org/valueflows/ont/vf#Intent, accessed 2026-08-15. Also https://www.valueflo.ws/concepts/flows/
- Observation: "A desired or proposed or planned or estimated economic flow, usually with only one agent associated, which could become a commitment and/or economic event." Offers and requests are Intents. Planned work with no committed agent can be an Intent.
- Limits: VF 0.17. The flows page admits a gray area during planning.

### E-008 `ValueFlows Commitment is a promised flow`

- Grade: `official-doc`
- Claim supported: A scheduled or promised flow is a different record from an intent and from an event.
- Citation: `vf:Commitment`, https://w3id.org/valueflows/ont/vf#Commitment. Flows page, "Commitments" section.
- Observation: "A planned economic flow that has been scheduled or promised by one agent to another agent." Events fulfill commitments. Commitments can satisfy intents.
- Limits: The same page says a plan may use Commitment before both agents are known. Firmness of plan, not presence of both signatures, is the authors' criterion.

### E-009 `ValueFlows EconomicEvent is past, observed, and corrected by another event`

- Grade: `official-doc`
- Claim supported: Observed economic flow is not a future plan and is not edited in place.
- Citation: `vf:EconomicEvent`. Flows page, "Economic Event" and "Correcting Events." Diagram explanations, Observation section.
- Observation: Events "describe past flows, something observed, never some potential future event." They fulfill commitments, satisfy intents, or settle claims. "Economic events are immutable in accounting practice." A later event with `corrects` adjusts or reverses the first, and may use a negative quantity.
- Limits: VF says this is accounting practice. It does not prove every operational log must be immutable.

### E-010 `Inventoried resources change only through events`

- Grade: `official-doc`
- Claim supported: Stock, location, and accountability are not independent writable fields.
- Citation: Diagram explanations, Resource and Observation sections. https://www.valueflo.ws/specification/model-text/
- Observation: "An actual EconomicResource is created only by EconomicEvents. It is also updated only by EconomicEvents for all its accounting related properties." An event may change quantity, location, primary accountable, stage, state, or containment.
- Limits: Applies when the resource is inventoried. A flow may reference only a ResourceSpecification.

### E-011 `ValueFlows Agreement is a reciprocal bundle, not a legal form`

- Grade: `official-doc`
- Claim supported: Agreement is a container for reciprocal commitments or, after the fact, reciprocal events.
- Citation: `vf:Agreement`. Diagram explanations, Planning section.
- Observation: "A set of reciprocal commitments among economic agents, or a set of reciprocal economic events." It is "purposefully abstract" so it can cover exchanges or income distributions. Point of sale can put events in an Agreement with no prior plan.
- Limits: Not a jurisdiction-specific contract theory.

### E-012 `ValueFlows Agent includes ecological agents`

- Grade: `official-doc`
- Claim supported: VF Agent is economic or ecological agency, not legal personhood.
- Citation: `vf:Agent` and `vf:EcologicalAgent`. Diagram explanations, Agent section.
- Observation: Agent is "an identifiable entity that can commit to and/or perform economic and/or ecological activity under its own power or authority." Subclasses are Person, Organization, EcologicalAgent.
- Limits: Broad on purpose. Conflicts with FIBO LegalPerson if treated as the same type.

### E-013 `Intent and Commitment have an admitted gray area`

- Grade: `official-doc`
- Claim supported: VF itself does not treat the Intent/Commitment cut as sharp in all planning.
- Citation: https://www.valueflo.ws/concepts/flows/ , "Possible gray area between Intent and Commitment."
- Observation: During operational planning, Commitments may be used before an agent is assigned if no published Intent is needed. "The criterion can be thought of as firmness of plan, not commitments of agents."
- Limits: This weakens any claim that Intent and Commitment are two metamodel primitives with a crisp boundary.

### E-014 `REA 1982 is resources, events, and agents`

- Grade: `official-doc`
- Claim supported: The original REA core is three sets plus relationships, aimed at a shared data environment rather than a double-entry silo.
- Citation: McCarthy, *The Accounting Review* 57(3), July 1982, 554-578. Abstract at https://doi.org/10.2308/tar-4487748
- Observation: The abstract says the structure "consist[s] of sets representing economic resources, economic events, and economic agents plus relationships among those sets," and reconciles those representations with conventional double-entry objects.
- Limits: Full 1982 PDF was not retrieved this session. Commitments, claims, and agreements are later REA/ValueFlows extensions, not shown in this abstract.

### E-015 `PROV starting point is Entity, Activity, Agent`

- Grade: `official-doc`
- Claim supported: Provenance interchange uses three classes that do not match UFO natures one-to-one.
- Citation: W3C PROV-O, Recommendation 30 April 2013, section 3.1. http://www.w3.org/TR/2013/REC-prov-o-20130430/
- Observation: Entity is "a physical, digital, conceptual, or other kind of thing with some fixed aspects." Activity "occurs over a period of time and acts upon or with entities." Agent "bears some form of responsibility for an activity taking place, for the existence of an entity, or for another agent's activity."
- Limits: PROV is for provenance interchange. It is not an enterprise metamodel.

### E-016 `PROV derivation and delegation are first-class relations`

- Grade: `official-doc`
- Claim supported: Lineage and acting-on-behalf-of are named relations, not log fields.
- Citation: PROV-O section 3.1. `prov:wasDerivedFrom`, `prov:wasGeneratedBy`, `prov:used`, `prov:wasAssociatedWith`, `prov:wasAttributedTo`, `prov:actedOnBehalfOf`.
- Observation: Derivation is "a transformation of one entity into another" and can be stated without naming the activity. Delegation says one agent acted on behalf of another, and both bear responsibility.
- Limits: Binary form is unqualified. Qualified forms add time, role, and plan.

### E-017 `PROV entities are snapshots of changing things`

- Grade: `official-doc`
- Claim supported: PROV Entity is a fixed-aspect projection, not an endurant that changes.
- Citation: PROV-DM section 1. http://www.w3.org/TR/2013/REC-prov-dm-20130430/ . PROV-CONSTRAINTS section 2. http://www.w3.org/TR/2013/REC-prov-constraints-20130430/
- Observation: PROV-DM says if the thing "is subject to change, then it is challenging to express its provenance precisely." PROV-CONSTRAINTS says "the attributes of entities have special meaning because they are considered to be fixed aspects of underlying, changing things." Instantaneous events (generation, use, invalidation, start, end) are implicit, not first-class.
- Limits: `alternateOf` and `specializationOf` exist to relate several entities about one thing. That is a workaround, not a kind theory.

### E-018 `PROV validity is checkable`

- Grade: `official-doc`
- Claim supported: Provenance can be invalid, not merely incomplete.
- Citation: PROV-CONSTRAINTS abstract and section 6. Uniqueness, event ordering, impossibility, and type constraints. Entity and activity identifiers must not overlap.
- Observation: A valid instance is "a consistent history of objects and their interactions that is safe to use for the purpose of logical reasoning." Implementations may normalize and then check.
- Limits: Constraints are for PROV instances, not for OS actions or inventory.

### E-019 `FIBO LegalPerson is liability capacity`

- Grade: `official-doc`
- Claim supported: Legal personhood is jurisdiction-relative capacity to bear rights and duties, not "any agent."
- Citation: OMG FIBO Business Entities 1.1, section 9.2.1. https://www.omg.org/spec/EDMC-FIBO/BE/1.1/PDF
- Observation: "A legal person as defined here is any natural person or organization which is capable of accruing liability on its own part." A legal person "is an agent that has liability capacity and is recognized as a legal person in some jurisdiction." LegalEntity is a legal person organized in exactly one jurisdiction and "cannot be a natural person."
- Limits: Finance-industry ontology. Ecological agents are out of scope.

### E-020 `FIBO PartyInRole is a relative concept`

- Grade: `official-doc`
- Claim supported: The party to a deal is not the independent person or firm.
- Citation: FIBO Foundations 1.0, Parties module. Table entries for PartyInRole, IndependentParty, hasPartyInRole. https://www.omg.org/spec/EDMC-FIBO/FND/1.0/PDF
- Observation: PartyInRole is "a relative concept that ties an independent party to a specific role they are standing in." IndependentParty is "anything which is capable of performing any business party role." hasPartyInRole "identifies a party acting in a specific role as related to the particular agreement, contract, policy, regulation, or other business relationship."
- Limits: FND 1.0 text. Later FIBO releases reorganize modules. The distinction is stable in the Contracts ontology as well.

### E-021 `FIBO keeps Agreement and Contract distinct`

- Grade: `official-doc`
- Claim supported: The bargain and the instrument that formalizes it are different types.
- Citation: FIBO Foundations 1.0, section 10.9.1. "The concepts of agreement and contract are intended to be kept distinct in the FIBO ontologies, that is neither is intended to be regarded as a sub type of the other."
- Observation: Agreement is "a negotiated and usually legally enforceable understanding between two or more legally competent parties." Commitment is "a legal construct which represents the undertaking on the part of some party to act or refrain from acting in some manner." Unilateral and mutual commitments are subtypes.
- Limits: Natural-language definitions cite business dictionaries. OWL restrictions are the formal part.

### E-022 `FIBO ContractParty is a PartyInRole. ContractDocument is evidence.`

- Grade: `official-doc`
- Claim supported: A contract party is a role. A contract document is not the contract.
- Citation: FIBO Contracts ontology, classes `Contract`, `ContractParty`, `ContractDocument`. https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Contracts/ accessed 2026-08-15.
- Observation: Contract has super-class Agreement, at least two contract parties, and optional effective date. ContractParty has super-class party-in-role. ContractDocument has super-class legal document. BreachOfContract is an occurrence kind that applies to a contract and refers to a contractual commitment.
- Limits: Viewer page, not a pinned OWL commit. IRIs are the stable names.

### E-023 `FIBO Signatory is delegated capacity`

- Grade: `official-doc`
- Claim supported: Signing authority is a role on a legal person, not a new kind of person.
- Citation: FIBO BE 1.1, Legal Persons. Signatory parent class PartyInRole. hasSignatory parent property hasPartyInRole.
- Observation: Signatory is "some agent who has the capacity to sign contracts on the part of some legal person."
- Limits: Does not model software-agent delegation.

### E-024 `Palantir-style models treat Customer-like types as objects and some links as objects`

- Grade: `design-claim`
- Claim supported: Operational ontology products start from Object Type, Link, Action, not from kind/role/relator.
- Citation: `research/reference-landscape.md@dc918a5`, Palantir and Open Foundry sections.
- Observation: The note lists Object Types, Properties, Link Types, Interfaces, Actions, Functions. It notes "object-backed links when a relationship itself carries meaningful data/lifecycle." ERPNext is treated as a corpus of documents such as Sales Order vs Delivery vs Invoice.
- Limits: Secondary in-repo note. Not Palantir source documentation.

### E-025 `RFC-0001 already suspects relators and Action != Event`

- Grade: `design-claim`
- Claim supported: The hypothesis under attack already contains the main cuts this corpus supports.
- Citation: `rfcs/0001-metamodel-hypothesis.md@dc918a5`, Relationship / Link, Event, Provenance, falsification targets 2 and 10.
- Observation: The RFC says a relationship with attributes, lifecycle, authority, or actions "may be better represented by a relational entity/relator." It states `Action != Event`. It names PROV-O as a reference and refuses to adopt its vocabulary. It asks whether Relator is a native category.
- Limits: Design claim. Not domain evidence. This note must not treat the RFC as confirmation of itself.

### E-026 `Seed scenarios already encode role and relator failures`

- Grade: `design-claim`
- Claim supported: S-005 and S-006 are the cheapest falsifiers for "Customer is a kind" and "employment is a link."
- Citation: `scenarios/README.md@dc918a5`, S-005 and S-006.
- Observation: S-005 asks whether an organization that is both supplier and customer is two objects or one organization with two roles. S-006 asks whether Promote, Suspend, and Terminate can target a `worksFor` link.
- Limits: Seed questions, not executed tests.

## Domain evidence

These are real-world distinctions the sources are trying to protect.

A person remains the same person while becoming a student, employee, or customer. That is kind versus role. An organization that buys and sells with the same counterparty is still one organization. Treating Supplier and Customer as kinds manufactures duplicate identity.

Employment, marriage, insurance, and partnership persist, change phase, and get acted on. A typed edge with a few attributes does not survive promotion, suspension, or use as legal grounds.

A request, a promise, and a delivery are different facts about the world. Collapsing them into `delivery_date` or into one mutable order row is how S-001 becomes unanswerable.

Stock quantity, location, and accountability change because something happened. A user editing `on_hand` is not the same fact as a receipt.

Legal capacity is not economic agency. A river can be a ValueFlows agent. It is not a FIBO legal person. A software agent can bear PROV responsibility. It cannot accrue FIBO liability unless some jurisdiction says so.

A handshake, a written instrument, and a PDF in a DMS are not one thing. FIBO splits agreement, contract, and contract document. ERP practice often uses the document as the agreement.

## Source-system artifacts

Do not import these as OS primitives.

- OntoUML stereotypes and the Visual Paradigm plugin. Modeling-language machinery.
- ValueFlows class names, Action verb table, Recipe graph, Proposal/ProposalList, EcologicalAgent, AgreementBundle.
- PROV OWL encoding, qualified-influence pattern, bundles, collections, `prov:value`.
- FIBO module IRIs, LEI/ISO 17442 `ContractuallyCapableEntity`, transferable/novateable contract taxonomy, securities.
- Palantir Object Type / Link Type / Action product nouns.
- ERP Sales Order, Delivery Note, Purchase Invoice as DocTypes.
- McCarthy's 1982 E-R diagram notation and double-entry reconciliation examples.

ValueFlows `Process` that is the same object in plan and observation is a VF modeling choice. UFO would not call that object a perdurant.

PROV `Entity` with fixed attributes is a provenance encoding choice. Using it as `ObjectType` would freeze every property change into a new entity.

## Concepts

### C-001 `Kind`

- Source term: UFO/OntoUML kind, substantialKind, relatorKind
- Domain distinction: The category that says what an individual is and what changes it can survive
- Evidence: `E-002`, `E-005`
- Source-specific form: OntoUML stereotype on a class
- Alternative interpretations: A root ObjectType plus an identity rule. A closed enum of natures.
- Decision state: `supported` as a distinction. `undetermined` as an RFC primitive.

### C-002 `Role`

- Source term: UFO role / roleMixin. FIBO PartyInRole. PROV Role on a qualified relation.
- Domain distinction: Contingent classification that exists because of a relationship
- Evidence: `E-003`, `E-020`, `E-022`, `E-026`
- Source-specific form: OntoUML anti-rigid sortal. FIBO class that "is played by" an independent party. PROV attribute of a usage or association.
- Alternative interpretations: RFC Interface. A link type. A boolean flag on a party.
- Decision state: `supported` that role ≠ kind. `rejected` that PROV Role is the same construct.

### C-003 `Phase`

- Source term: UFO phase / phaseMixin
- Domain distinction: Contingent classification from an intrinsic condition, such as age, tenure, or quality-inspection state
- Evidence: `E-003`, `E-005`
- Source-specific form: OntoUML anti-rigid sortal with intrinsic conditions
- Alternative interpretations: A derived status property. A state machine on one type.
- Decision state: `hypothesis`. Needed in models. May be expressible as constraints over qualities without a native category.

### C-004 `Relator`

- Source term: UFO relator. VF Agreement/Commitment. FIBO Agreement/Contract. Palantir object-backed link.
- Domain distinction: A relationship that is itself an individual with identity, parts, and lifecycle
- Evidence: `E-004`, `E-005`, `E-011`, `E-021`, `E-024`, `E-025`
- Source-specific form: Existentially dependent endurant in UFO. Reciprocal flow bundle in VF. Legal understanding in FIBO.
- Alternative interpretations: Ordinary ObjectType with two mandatory links. Qualified PROV influence.
- Decision state: `hypothesis` that the engine must know relational nature or equivalent constraints. `rejected` that OS must adopt the word Relator.

### C-005 `Economic flow stages`

- Source term: VF Intent, Commitment, EconomicEvent, Claim. Later REA. RFC Action vs Event.
- Domain distinction: Desire, promise, observation, and receiver-initiated claim are different facts
- Evidence: `E-007`, `E-008`, `E-009`, `E-013`, `E-014`, `E-025`
- Source-specific form: Four VF classes sharing Action, provider/receiver, and resource
- Alternative interpretations: One Flow type with a modality attribute. Action plus Event plus a domain Commitment type.
- Decision state: `supported` as domain structure. `rejected` as four metamodel primitives.

### C-006 `Provenance entity`

- Source term: prov:Entity
- Domain distinction: A thing considered under fixed aspects for the sake of a derivation graph
- Evidence: `E-015`, `E-017`
- Source-specific form: OWL class with generation and invalidation times
- Alternative interpretations: OS Fact. A snapshot. A version row.
- Decision state: `supported` for interchange. `rejected` as ObjectType.

### C-007 `Legal person`

- Source term: FIBO LegalPerson / LegalEntity
- Domain distinction: Capacity to bear liability in a jurisdiction
- Evidence: `E-019`, `E-023`
- Source-specific form: FIBO BE class hierarchy, LEI-oriented ContractuallyCapableEntity
- Alternative interpretations: Organization kind plus a jurisdiction-relative quality. VF Organization.
- Decision state: `supported` as domain vocabulary.

### C-008 `Particularized quality`

- Source term: UFO quality / qualityKind
- Domain distinction: A property-as-individual that can change while remaining that quality
- Evidence: `E-001`, `E-005`
- Source-specific form: Moment mapped to a quality space
- Alternative interpretations: RFC Property. VF Measure. A bitemporal fact.
- Decision state: `undetermined`

## Invariants

### I-001 `Unique kind`

- Statement: An individual has exactly one identity-bearing kind. Contingent types do not replace it.
- Scope: Endurants in a UFO-compliant taxonomy. Candidate for OS identity rules.
- Evidence: `E-002`, `E-006`
- Failure case: The same organization is stored as two master records, Customer and Supplier.
- Falsifier: A production domain where one individual legally has two identity principles at once.
- Decision state: `supported` as a modeling law. `hypothesis` as a runtime check.

### I-002 `Rigid types do not specialize anti-rigid types`

- Statement: A kind or other rigid type cannot be a subtype of a role or phase.
- Scope: OntoUML taxonomic constraints.
- Evidence: `E-006`
- Failure case: `Person` specializes `Customer`. Every person must then be a customer, or Personhood becomes contingent.
- Falsifier: A coherent model that needs this specialization and still preserves identity.
- Decision state: `supported` for UFO-style taxonomies.

### I-003 `Observed economic facts are not rewritten`

- Statement: An observed flow is corrected by a later flow, not by mutating the original.
- Scope: ValueFlows inventoried resources and accounting practice.
- Evidence: `E-009`, `E-010`
- Failure case: On-hand quantity is edited. History can no longer explain the balance.
- Falsifier: A regulated domain that requires in-place correction of the original event and still has explainable stock.
- Decision state: `hypothesis` for OS. `supported` inside VF.

### I-004 `PROV entity and activity identifiers do not overlap`

- Statement: The same identifier is not both an entity and an activity in a valid PROV instance.
- Scope: PROV-CONSTRAINTS type constraints.
- Evidence: `E-018`
- Failure case: A Work Order IRI used as both the plan object and the execution activity, then reasoned over as PROV.
- Falsifier: A PROV profile that allows the overlap and remains valid under the 2013 recommendation.
- Decision state: `supported` for PROV interchange. `undetermined` for OS types.

### I-005 `A contract party is not the independent party`

- Statement: Participation in a contract is a role of an independent party.
- Scope: FIBO Foundations and Contracts.
- Evidence: `E-020`, `E-022`
- Failure case: Deleting a closed contract deletes the organization, or the organization cannot be a party to two contracts.
- Falsifier: A legal system that treats the party-in-role as a separate legal person.
- Decision state: `supported`

## Candidate laws

### L-001 `Identity kinds are not roles`

- Statement: The metamodel must stop a role or interface from being used as the identity kind of an individual.
- Evidence: `E-002`, `E-003`, `E-020`, `E-026`
- Independent convergence: UFO role vs kind. FIBO IndependentParty vs PartyInRole. Scenario S-005. ValueFlows keeps Agent stable and puts commercial facts on flows.
- Known limits: PROV Role is a different construct. Some ERPs still ship Customer as a master kind and survive by merging records.
- Counterexamples: `X-001`
- Decision state: `supported`

### L-002 `Lifecycle-bearing relationships are individuals`

- Statement: If a relationship is the target of actions, phases, or authority, it is an individual, not only a link.
- Evidence: `E-004`, `E-005`, `E-011`, `E-021`, `E-024`, `E-025`
- Independent convergence: UFO relator. VF Agreement/Commitment. FIBO Agreement/Contract. Palantir object-backed links. RFC-0001's own employment example.
- Known limits: Many associations really are links. Cardinality-only edges should stay edges.
- Counterexamples: `X-002`
- Decision state: `supported` as a modeling law. `hypothesis` that this requires a native Relator primitive.

### L-003 `Attempted intervention is not observed occurrence`

- Statement: A decision or promise does not, by itself, create the economic or real-world event it aims at.
- Evidence: `E-001`, `E-007`, `E-008`, `E-009`, `E-015`, `E-025`
- Independent convergence: UFO endurant/perdurant and UFO-C vs UFO-B. VF Intent/Commitment vs Event. RFC Action != Event. Thesis "requested is not happened."
- Known limits: VF lets an event satisfy an intent with no commitment. Point of sale skips the promise layer.
- Counterexamples: `X-003`
- Decision state: `supported`

### L-004 `Economic stage types are domain ontology, not kernel primitives`

- Statement: Intent, Commitment, Claim, Agreement, Recipe, and ProcessSpecification should be defined in an economic ontology if the metamodel can express modality, reciprocity, and observation.
- Evidence: `E-007`, `E-008`, `E-011`, `E-013`, `E-014`
- Independent convergence: REA core is only resources, events, agents. VF adds stages as vocabulary. FIBO adds legal commitment without VF class names.
- Known limits: If the metamodel cannot express "promised but not observed," domain types will be reimplemented as hidden status fields.
- Counterexamples: `X-004`
- Decision state: `hypothesis`

### L-005 `PROV is an interchange and constraint theory, not the object model`

- Statement: OS should be able to emit and validate PROV-shaped derivation and delegation. It should not use `prov:Entity` as ObjectType.
- Evidence: `E-015`, `E-016`, `E-017`, `E-018`
- Independent convergence: RFC-0001 already refuses PROV vocabulary as OS vocabulary. UFO endurants contradict fixed-aspect entities.
- Known limits: Some snapshot stores are close to PROV Entity and may be fine as a physical encoding of facts.
- Counterexamples: `X-005`
- Decision state: `supported`

### L-006 `Legal personhood is domain vocabulary`

- Statement: Liability capacity, jurisdiction, LEI, and corporate forms do not belong in the semantic kernel.
- Evidence: `E-012`, `E-019`, `E-023`
- Independent convergence: FIBO itself puts these in BE/FND, not in a foundational ontology like UFO. VF Agent is broader and incompatible if unified.
- Known limits: Multi-entity and fiscal research may need jurisdiction as a generic dimension.
- Counterexamples: `X-006`
- Decision state: `supported`

### L-007 `Agreement is not the document and not automatically the UFO relator`

- Statement: Bargain, instrument, evidence document, and reciprocal event bundle are four notions. Sources pick different pairs.
- Evidence: `E-011`, `E-021`, `E-022`
- Independent convergence: FIBO agreement ≠ contract ≠ document. VF agreement = reciprocal flows. UFO contract as relator.
- Known limits: Everyday speech uses one word. ERP documents collapse all four.
- Counterexamples: `X-007`
- Decision state: `supported` as a warning. `undetermined` which pair OS needs first.

## Counterexamples

### X-001 `Supplier is also customer`

- Targets: `L-001`, `C-002`
- Setup: Scenario S-005. Organization B sells ore to A and buys machines from A.
- Falsifying result: The only coherent model is two identity kinds, Supplier and Customer, for one firm.
- Observed result: not run. UFO and FIBO both predict one independent party and two roles.
- Consequence: leave `L-001` supported. A source that requires two master identities is a source artifact.
- Decision state: `hypothesis`

### X-002 `Employment with phases and actions`

- Targets: `L-002`, `C-004`
- Setup: Scenario S-006. Hire, promote, suspend, terminate. Compensation changes. The employment is later used as visa grounds.
- Falsifying result: A link with attributes handles all actions without an individual.
- Observed result: not run. OntoUML 2.0's own example is the employment relator with a Tenured phase and a Legal Grounds role (`E-004`).
- Consequence: narrow `L-002` if a link type with identity is just an object plus two links. That is RFC-0001's alternative.
- Decision state: `hypothesis`

### X-003 `Timeout after possible shipment`

- Targets: `L-003`
- Setup: Scenario S-004. ShipOrder is invoked. The carrier API times out.
- Falsifying result: Treating the action as the event still leaves `unknown` representable and retry-safe.
- Observed result: not run. VF forbids future-dated EconomicEvents. UFO forbids changing a perdurant.
- Consequence: leave `L-003` supported until a counterexample is actually run.
- Decision state: `hypothesis`

### X-004 `Point of sale with no commitment`

- Targets: `L-004`
- Setup: VF point of sale. Reciprocal EconomicEvents sit in an Agreement. No Intent or Commitment rows.
- Falsifying result: The stage types are mandatory metamodel primitives, so this case cannot be represented.
- Observed result: VF documents this as allowed (`E-011`).
- Consequence: narrow `L-004` toward "expressibility of stages," not "always instantiate all four."
- Decision state: `supported` as a limiter on primitive-izing VF classes

### X-005 `Person as a PROV entity`

- Targets: `L-005`, `C-006`
- Setup: Person P is a child, then an adult. Map P to one `prov:Entity`.
- Falsifying result: One PROV entity can carry changing age-phase attributes and remain valid.
- Observed result: not run. PROV-CONSTRAINTS says entity attributes are fixed aspects (`E-017`). The intended encoding is a new entity plus `specializationOf`/`alternateOf`.
- Consequence: leave `L-005` supported.
- Decision state: `hypothesis`

### X-006 `Ecological agent with a purchase order`

- Targets: `L-006`, `C-007`
- Setup: A watershed is a VF EcologicalAgent that "receives" restoration work. A finance clerk needs a legal counterparty.
- Falsifying result: One Agent primitive covers both ecological agency and liability.
- Observed result: not run. FIBO LegalPerson requires jurisdiction and liability (`E-019`). VF Agent does not (`E-012`).
- Consequence: leave `L-006` supported. Unifying the two agent notions is a mistake.
- Decision state: `hypothesis`

### X-007 `Verbal agreement, written contract, scanned PDF`

- Targets: `L-007`
- Setup: Two firms agree on a call. Counsel later drafts a contract. A scan is stored.
- Falsifying result: One Agreement type with a `document_url` property answers legal and operational questions.
- Observed result: not run. FIBO splits the three (`E-021`, `E-022`). VF would record commitments or events and would not care about the scan.
- Consequence: leave `L-007` as a warning to domain models. Do not add three kernel primitives.
- Decision state: `hypothesis`

### X-008 `Interface-as-role across kinds`

- Targets: `C-002`, RFC-0001 Interface question
- Setup: Customer applies to Person and Organization, which have different identity kinds.
- Falsifying result: A structural Interface cannot represent this without becoming a role mixin, including roles of relators (`E-005`).
- Observed result: not run. UFO calls this a roleMixin. RFC-0001 already lists Customer as a possible Interface.
- Consequence: Interface may be enough for shared properties. It is not automatically enough for anti-rigid, relational, cross-kind roles, or roles of employments.
- Decision state: `undetermined`

## Disagreements

### D-001 `What is an Agent`

- Claim A: `issue-0037-formal-ontology-synthesis#C-007` (FIBO LegalPerson)
- Claim B: `issue-0037-formal-ontology-synthesis#E-012` (VF Agent) and `E-015` (PROV Agent)
- Conflict: Different scope. Liability vs economic/ecological agency vs provenance responsibility.
- Evidence for A: `E-019`, `E-023`
- Evidence for B: `E-012`, `E-015`
- Possible explanation: Three problems that share a word.
- Resolution test: Take one software agent, one informal collective, and one chartered company through S-005, a signed contract, and a PROV attribution. If one type survives, the disagreement was verbal.
- Status: `open`
- Resolution: unresolved

### D-002 `Can the thing that changes be the provenance entity`

- Claim A: `C-001` / UFO endurant that changes
- Claim B: `C-006` / PROV entity with fixed aspects
- Conflict: Interpretation of "object."
- Evidence for A: `E-001`, `E-002`
- Evidence for B: `E-017`
- Possible explanation: PROV reifies snapshots. UFO reifies the changing individual. Both can be stored if Facts are snapshots and Objects are endurants.
- Resolution test: Model S-007 backdated stock with both encodings and compare explainability.
- Status: `open`
- Resolution: unresolved

### D-003 `Is a planned process an event`

- Claim A: `E-001` UFO perdurants exist only in the past
- Claim B: ValueFlows Process is the same object in plan and observation (`E-010` context, model-text Planning section)
- Conflict: Different observation. VF Process is not a UFO event.
- Evidence for A: `E-001`
- Evidence for B: https://www.valueflo.ws/specification/model-text/ Planning / Process
- Possible explanation: VF Process is an endurant work-order-like individual that later has event parts.
- Resolution test: Issue 14 manufacturing questions. Is a Work Order a commitment, an authorization, a process instance, or a bundle.
- Status: `open`
- Resolution: unresolved

### D-004 `PROV Role vs UFO Role`

- Claim A: `C-002` UFO role as an anti-rigid type of an endurant
- Claim B: PROV-O `prov:Role` on a qualified generation, usage, or association (`E-016`)
- Conflict: Terminology. PROV Role does not classify the agent for its lifetime. It classifies participation in one relation.
- Evidence for A: `E-003`
- Evidence for B: PROV-O section 2, qualified terms, `prov:hadRole`
- Possible explanation: PROV Role is closer to a qualified association attribute. UFO Role is a type.
- Resolution test: None needed for naming. Do not map the two in an import without a documented transform.
- Status: `open`
- Resolution: unresolved

### D-005 `Where commercial documents live`

- Claim A: ERP/Palantir practice treats Sales Order as an object type (`E-024`)
- Claim B: VF and REA treat documents as surfaces over commitments and events (`E-011`, `E-014`)
- Conflict: Different operational history. ERP documents have legal and workflow identity that VF's abstract Agreement may not carry.
- Evidence for A: `E-024`, RFC falsification target 1
- Evidence for B: `E-011`, `E-014`
- Possible explanation: Some documents are evidence. Some are the agreement. Some are both. FIBO's three-way split (`L-007`) is the less wrong default.
- Resolution test: Issues 16 and 17, order-to-cash and procure-to-pay, plus Brazilian fiscal documents.
- Status: `open`
- Resolution: unresolved

## Runtime consequences

### R-001 `Taxonomic checks at definition time`

- If claim survives: `I-001`, `I-002`, `L-001`
- Required property: Ontology edits can be rejected when a role is used as a kind, when two kinds are assigned, or when a rigid type specializes an anti-rigid type.
- Evidence: `E-006`
- Non-requirement: OntoUML, UML profiles, OWL reasoners, or a particular compiler.
- Decision state: `hypothesis`

### R-002 `Event immutability and compensating records`

- If claim survives: `I-003`, `L-003`
- Required property: Observed occurrences are append-only at the semantic level. Corrections are new records with an explicit relation to the corrected record.
- Evidence: `E-009`, `E-010`
- Non-requirement: Event sourcing, a particular log store, or VF Action verbs.
- Decision state: `hypothesis`

### R-003 `Resource balances as projections`

- If claim survives: `E-010`, `L-003`
- Required property: Accounting quantity, on-hand, location, and primary accountable can be explained from events. Direct writes are either forbidden or recorded as adjustment events.
- Evidence: `E-010`
- Non-requirement: A single stock ledger table.
- Decision state: `hypothesis`

### R-004 `PROV export and validity`

- If claim survives: `L-005`, `I-004`
- Required property: Derivation and delegation used in authority decisions can be exported as PROV and checked against uniqueness, ordering, and disjointness constraints.
- Evidence: `E-016`, `E-018`
- Non-requirement: RDF, OWL-RL, or storing OS objects as `prov:Entity`.
- Decision state: `hypothesis`

### R-005 `Relator identity and actions`

- If claim survives: `L-002`
- Required property: Promote, Suspend, Terminate, and similar verbs can name the relationship individual. Historical periods remain queryable after the relationship ends.
- Evidence: `E-004`, `E-026`
- Non-requirement: A graph edge store or a native Relator opcode.
- Decision state: `hypothesis`

## RFC-0001 proposals

These are attacks on the hypothesis. They are not RFC edits. Independent sources have not converged on a new primitive list.

1. Keep `Action != Event`. UFO, ValueFlows, and PROV all refuse to treat a decision as an occurrence. Decision state `supported` for the cut. Do not rename Event to `prov:Activity` or `vf:EconomicEvent`.
2. Do not add Kind, Role, Phase, Relator, Intent, Commitment, Claim, Agreement, LegalPerson, or Entity as new rows in the candidate primitive list without a failed composition test. The missing capability is type meta-properties and enforcement, not more nouns. Decision state `hypothesis`.
3. Give ObjectType an identity-principle and rigidity hook, or an equivalent constraint language, so Customer cannot be a root kind. Test with S-005. Decision state `hypothesis`.
4. Treat Interface as insufficient for UFO roles until X-008 is run. Shared properties are not anti-rigid relational classification, and they do not cover roles of relators. Decision state `undetermined`.
5. Keep the RFC test that a lifecycle-bearing relationship may be an object with constrained links. UFO relators can be that object if existential dependence and unique kind are enforced. Native Relator stays off the primitive list until composition fails. Decision state `hypothesis`.
6. Put Intent, Commitment, Claim, Recipe, and ProcessSpecification in a domain pack or ordinary ontology once the metamodel can say "desired," "promised," "claimed," and "observed" without overwriting one field. Decision state `hypothesis`.
7. Map PROV for interchange. Adopt derivation and delegation as provenance relations that policy may read. Do not adopt Entity as ObjectType. Decision state `supported`.
8. Keep FIBO LegalPerson, Contract, and ContractDocument out of the kernel. Use them as a party/agreement reference ontology. Decision state `supported`.
9. Quality-as-individual vs Property-as-datatype remains open. Do not answer open question 2 from this corpus alone. Decision state `undetermined`.

## Dependent research

Consumes:

- `rfcs/0001-metamodel-hypothesis.md@dc918a5`
- `research/reference-landscape.md@dc918a5`
- `scenarios/README.md@dc918a5` S-001, S-004, S-005, S-006, S-007, S-011

Related issues, not waited on:

- #3 identity, kinds, roles, relators
- #7 provenance
- #8 Action/Event/Effect
- #12 principals and delegation
- #13 economic reality
- #32 ERPNext, #33 Odoo, #35 Palantir
- #38 GS1/ISA-95
- #74 swarm result contract, still open as PR 84

Family notes:

- [`../ontouml-ufo/issue-0037-endurant-types.md`](../ontouml-ufo/issue-0037-endurant-types.md)
- [`../valueflows-rea/issue-0037-economic-cycle.md`](../valueflows-rea/issue-0037-economic-cycle.md)
- [`../provenance/issue-0037-prov-o.md`](../provenance/issue-0037-prov-o.md)
- [`../fibo/issue-0037-legal-parties.md`](../fibo/issue-0037-legal-parties.md)

## Open questions

Marked `undetermined`. These do not answer `docs/open-questions.md`.

- Is Relator a native category, or an ObjectType with enforced existential dependence? Open question 12. This corpus supplies pressure, not a decision.
- Are roles and phases native categories or patterns? Open question 2.
- Which PROV-O concepts should be reused semantically versus mapped? Open question 8.
- Which REA/VF types are universal for OS? Open question 13. This note says "not the VF class list" and stops.
- Are ERP documents independent legal individuals? Open question 13, second bullet. See `D-005`.
- Do particularized qualities belong beside Property? No open-question number. Left open.

## Licensing

Concepts and published definitions only. No implementation was copied. UFO/OntoUML papers, W3C PROV, OMG FIBO, and ValueFlows are specifications and papers. ValueFlows and FIBO OWL were not imported. OS remains MIT. No reuse review is requested.

## Decision state

The investigation is `supported` on four cuts:

- identity kind versus role
- attempt versus occurrence
- lifecycle-bearing relationship versus bare link
- PROV/FIBO/VF vocabularies as references, not kernel nouns

The investigation is `rejected` on treating Intent, Commitment, Claim, LegalPerson, or `prov:Entity` as new RFC primitives.

The investigation is `hypothesis` on how to encode kind/role/relator without new primitives, and on event immutability as an OS runtime law.

The investigation is `undetermined` on qualities, Interface-as-role, Work Order / VF Process, and whether some commercial documents are themselves individuals.
