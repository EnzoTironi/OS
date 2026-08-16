# Evidence

Reference cards. Each card is one observation. Interpretation lives on attack, law, and scenario cards.

## E-001 Thesis draws one ontology over many domains

- Kind: source-system artifact
- Grade: design-claim
- Claim supported: The current thesis presents one executable ontology as the parent of commerce, inventory, manufacturing, accounting, logistics, fiscal, CRM, and HR.
- Citation: `docs/thesis.md` @ `dc918a50e550d384d1e18a6f24424e6ed4595b9c`, section "What OS may become"
- Observation: The diagram places those domains under one `Executable Ontology` box. Surfaces hang off the same box.
- Limits: The file also says the list of primitives is not a commitment and that modules may have no semantic meaning.
- Decision state: `supported` as a claim about the thesis text.

## E-002 Open question 1 already names the kill

- Kind: domain evidence
- Grade: design-claim
- Claim supported: The project already asks whether important enterprise behavior becomes unnaturally complex when forced into one executable ontology.
- Citation: `docs/open-questions.md` @ `dc918a50e550d384d1e18a6f24424e6ed4595b9c`, question 1
- Observation: The falsification question is exactly the issue 55 brief.
- Limits: The question is open. This folder must not close it by editing that file.
- Decision state: `supported` as a recorded uncertainty.

## E-003 Evans. Multiple models are inevitable

- Kind: domain evidence
- Grade: official-doc
- Claim supported: A large project hosts more than one model. Combining code based on distinct models makes software buggy, unreliable, and hard to understand.
- Citation: Evans, *DDD Reference*, 2015, Bounded Context, SRC-DDD
- Observation: "Multiple models are in play on any large project." "Multiple models are inevitable, yet when code based on distinct models is combined, software becomes buggy, unreliable, and difficult to understand." "Model expressions, like any other phrase, only have meaning in context."
- Limits: Evans writes about software projects, not about a greenfield ontology engine. The pattern still constrains any system that claims one ubiquitous language for an organization.
- Decision state: `supported`

## E-004 Evans. Define the context. Do not enlarge the language

- Kind: domain evidence
- Grade: official-doc
- Claim supported: The prescribed response to multiple models is an explicit boundary, not a global merge.
- Citation: Evans, *DDD Reference*, 2015, Bounded Context, SRC-DDD
- Observation: "Explicitly define the context within which a model applies." Boundaries are team, application use, code base, and database schema. Continuous integration keeps terms consistent *inside* the bound.
- Limits: Evans also warns that ever-smaller contexts lose integration. Shared Kernel exists as a limited share, kept small.
- Decision state: `supported`

## E-005 Evans. Context map requires explicit translation

- Kind: domain evidence
- Grade: official-doc
- Claim supported: Contact between models needs named translation, sharing, isolation, and influence. It is not implicit identity.
- Citation: Evans, *DDD Reference*, 2015, Context Map, SRC-DDD
- Observation: "Describe the points of contact between the models, outlining explicit translation for any communication, highlighting any sharing, isolation mechanisms, and levels of influence."
- Limits: The patterns (Shared Kernel, Conformist, Anticorruption Layer, Published Language, Separate Ways) are design relationships, not a runtime protocol.
- Decision state: `supported`

## E-006 Evans. Shared Kernel must stay small

- Kind: domain evidence
- Grade: official-doc
- Claim supported: Sharing a subset of the model is intimate and must be bounded. Unconsulted change is forbidden.
- Citation: Evans, *DDD Reference*, 2015, Shared Kernel, SRC-DDD
- Observation: "Designate with an explicit boundary some subset of the domain model that the teams agree to share. Keep this kernel small."
- Limits: Evans does not quantify small. A metamodel of ten primitives may still be a kernel. A Product type used by eight domains is not.
- Decision state: `supported`

## E-007 Evans 2019. Tidy canonical maps are suspicious

- Kind: domain evidence
- Grade: design-claim
- Claim supported: Evans treats a description of a large system that looks tidy as suspicious. Bounded contexts and subdomains often misalign after reorganization.
- Citation: SRC-DDD-INFOQ, 2019-06-26
- Observation: A bank reorganized from cash-account and credit-card subdomains to business-account and personal-account subdomains. The old bounded contexts stayed. Two teams then shared contexts and risked a big ball of mud.
- Limits: Second-hand conference report. The parent book remains the primary locator.
- Decision state: `supported` for the suspicion. `hypothesis` for the bank anecdote as a general law.

## E-008 Data mesh. Global canonical representation is the old governance

- Kind: domain evidence
- Grade: official-doc
- Claim supported: Central governance that establishes a global canonical representation of data with minimal support for change is the model data mesh rejects.
- Citation: Dehghani, 2020, SRC-MESH, federated computational governance section
- Observation: "traditional data governance attempts to achieve that through centralization of decision making, and establishing global canonical representation of data with minimal support for change. Data mesh's federated computational governance, in contrast, embraces change and multiple interpretive contexts."
- Limits: Data mesh is about analytical data products, not operational mutation. The organizational claim still attacks a single enterprise vocabulary.
- Decision state: `supported` inside analytical scope. `hypothesis` as a direct OS operational law.

## E-009 Data mesh. Domain ownership plus federated governance

- Kind: domain evidence
- Grade: official-doc
- Claim supported: Scale is addressed by domain-oriented ownership, data as a product, a self-serve platform, and federated computational governance.
- Citation: Dehghani, 2020, SRC-MESH, opening and four principles
- Observation: The four principles are stated as required for any data-mesh implementation. Golden-dataset certification as a central function is called no longer relevant.
- Limits: Same analytical-scope limit as E-008.
- Decision state: `supported`

## E-010 GraphQL federation. Independent schemas, composed later

- Kind: source-system artifact
- Grade: official-doc
- Claim supported: A production pattern for a unified API is composition of independent subgraph schemas, not one authored schema.
- Citation: GraphQL Foundation learn page, SRC-GQL
- Observation: Subgraphs own schema and resolvers. A gateway composes them. The page says federation aligns with DDD by keeping domain boundaries while exposing integration points.
- Limits: GraphQL is a query surface. Composition success does not prove the subgraphs share one ontology.
- Decision state: `supported` as a surface pattern.

## E-011 Apollo. Incompatible shared fields fail composition

- Kind: source-system artifact
- Grade: official-doc
- Claim supported: Two subgraphs that share a type field with incompatible value types do not produce a supergraph.
- Citation: Apollo GraphOS composition docs, SRC-APOLLO
- Observation: Subgraph A has `Event.timestamp: String!`. Subgraph B has `Event.timestamp: Int!`. "Composition doesn't know which type to use, so it fails." The docs call this a helpful compiler-like error.
- Limits: `@shareable` is an Apollo directive. Other composition algorithms may differ. The Composite Schema Working Group spec was not fetched as a finished REC.
- Decision state: `supported` for Apollo Federation composition.

## E-012 OWL 2. Import is modular. Axiom closure is one set

- Kind: source-system artifact
- Grade: official-doc
- Claim supported: OWL 2 modularization still yields one axiom closure. Anonymous individuals from different ontologies are standardized apart, which shows local identity is not automatically global.
- Citation: W3C OWL 2 Syntax REC 2012-12-11, §3.4, SRC-OWL
- Observation: "An OWL 2 ontology can import other ontologies in order to gain access to their entities, expressions, and axioms, thus providing the basic facility for ontology modularization." "The axiom closure of an ontology O is the smallest set that contains all the axioms from each ontology O' in the import closure of O with all anonymous individuals standardized apart."
- Limits: OWL is a description-logic language, not an operational ERP. The closure behavior is still the god-model mechanism.
- Decision state: `supported`

## E-013 owl:sameAs is substitutive and is widely misused

- Kind: domain evidence
- Grade: official-doc
- Claim supported: Official sameAs semantics share all properties across the transitive closure. Published Linked Data often uses sameAs for weaker relations, which produces incorrect entailments.
- Citation: Halpin et al., ISWC 2010, SRC-SAMEAS
- Observation: "the entire transitive closure of all individuals that are connected by sameAs share all the same properties, if the official (substitutive) definition is respected." The paper's title claim is that many published links are not that relation.
- Limits: 2010 corpus. Later identity observatories exist. The formal semantics have not changed.
- Decision state: `supported`

## E-014 Identity observatories mix identity with similarity

- Kind: domain evidence
- Grade: official-doc
- Claim supported: Services that close sameAs together with `skos:exactMatch` or `umbel:isLike` lose a readable identity semantics.
- Citation: Raad et al. survey, SRC-SAMEAS2
- Observation: The survey reports that some identity observatories close identity and similarity predicates together and drop the original predicate, so a consumer cannot tell same from similar.
- Limits: Survey of Linked Data practice, not of ERP masters.
- Decision state: `supported` for Linked Data. `hypothesis` as an OS warning.

## E-015 FIBO is modular and maps customer words to party

- Kind: domain evidence
- Grade: official-doc
- Claim supported: A large enterprise ontology used in finance is published as modular domains. It treats counterparty, client, and customer as words that map to Legal Entity or Party rather than as one operational type.
- Citation: EDM Council FIBO page, SRC-FIBO. OMG FIBO BE 1.1, SRC-FIBO-BE
- Observation: The EDM Council page says those three words "might mean different things across systems" and that systems map to a shared concept such as Legal Entity or Party. BE 1.1 is a modular specification with Legal Entities, Functional Entities, Ownership and Control, and other modules.
- Limits: FIBO is a finance reference ontology, not an executable operations engine.
- Decision state: `supported`

## E-016 IAS 2 inventory is a carrying amount, not a bin count

- Kind: domain evidence
- Grade: official-doc
- Claim supported: Financial inventory is measured at the lower of cost and net realisable value. That measurement can move without a warehouse movement.
- Citation: IFRS IAS 2 overview, SRC-IAS2
- Observation: "Inventories are measured at the lower of cost and net realisable value." Write-downs to NRV are recognized as expense when they occur.
- Limits: IAS 2 does not define warehouse bins. Physical quantity remains a different fact.
- Decision state: `supported`

## E-017 SCIM splits core User from enterprise workforce fields

- Kind: source-system artifact
- Grade: official-doc
- Claim supported: The IETF identity-provisioning schema separates login identity from workforce attributes.
- Citation: RFC 7643 §4.3, SRC-SCIM
- Observation: Core User carries `userName`, `name`, `emails`, `active`. The enterprise extension `urn:ietf:params:scim:schemas:extension:enterprise:2.0:User` adds `employeeNumber`, `costCenter`, `organization`, `division`, `department`, and `manager`.
- Limits: SCIM provisions accounts. It is not an HR system of record. `active:false` deactivates access. It does not terminate employment.
- Decision state: `supported`

## E-018 Party sibling. Customer is not a Kind

- Kind: domain evidence
- Grade: inference
- Claim supported: Independent party research already rejects Customer, Supplier, Carrier, and similar labels as identity-bearing kinds.
- Citation: `research/domain/party/candidate-laws.md` L1 @ `c64346995f62c6ac3d768c4c010f6b8bcb718fb8` (SRC-S14)
- Observation: "Customer, Supplier, Carrier, Competitor, Affiliate, BillTo, ShipTo, Payer, and Payee do not supply identity." Decision state there is `supported` for "not a Kind."
- Limits: Sibling inference. This folder does not re-run that corpus.
- Decision state: `supported` as a citation of a sibling law. The world-claim inherits the sibling's state.

## E-019 Product sibling. One Item type is rejected

- Kind: domain evidence
- Grade: inference
- Claim supported: Independent product research rejects Item or Product as a single OS type.
- Citation: `research/domain/product/candidate-laws.md` R-01 @ `80637d0ecadb9e123afc773a10e16c055ceeb2eb` (SRC-S15)
- Observation: "One catalog master is a common application shape. Independent economic and standards models do not treat it as one identity. OS should not start from Item."
- Limits: Sibling inference.
- Decision state: `supported` as a citation of a sibling rejection.

## E-020 Inventory sibling. Ownership, custody, quantity, and valuation split

- Kind: domain evidence
- Grade: inference
- Claim supported: Warehouse on-hand, legal ownership, and valuation layer are different facts.
- Citation: `research/domain/inventory/candidate-laws.md` L-INV-01 and L-INV-10 @ `de2bbe3ff71dcabb9ead699854a1b934496affbc` (SRC-S18)
- Observation: L-INV-01, ownership is not custody. L-INV-10, valuation layers are not quantity layers. Consigned on-hand can exist with zero valuation for the custodian.
- Limits: Sibling inference.
- Decision state: `supported` as a citation.

## E-021 Manufacturing sibling. Work Order is a false cognate

- Kind: source-system artifact
- Grade: inference
- Claim supported: The same English words name different layers in two mature ERPs.
- Citation: `research/domain/manufacturing/README.md` @ `2de0548d5e971bb03283891358cc57283904122b` (SRC-S19)
- Observation: "ERPNext uses 'Work Order' for authorization. Odoo uses 'Work Order' for one operation's execution. Same words. Different layers."
- Limits: Sibling reading of product docs. This folder did not re-fetch those pages.
- Decision state: `supported` as a citation.

## E-022 Accounting sibling. Stock movement is not a journal

- Kind: domain evidence
- Grade: inference
- Claim supported: A quantity event does not by itself post a ledger event.
- Citation: `research/domain/accounting/candidate-laws.md` L11 @ `4df1c8b44d8f21cdf23ebfa32bae247cd25aa9dc` (SRC-S21)
- Observation: L11 title and claim, "Stock quantity change is not automatically a ledger Event."
- Limits: Sibling inference. Couples to E-016.
- Decision state: `supported` as a citation.

## E-023 HR sibling. Employee is not a Kind. Login is a third thing

- Kind: domain evidence
- Grade: inference
- Claim supported: Person, employment, post, and user login are different identities.
- Citation: `research/domain/hr/candidate-laws.md` L1 and L13 @ `8856f901462c69ae706615b7d70e668043f9053b` (SRC-S28)
- Observation: L1 rejects Person-as-Employee-kind. L13, "Holding a Post can publish responsibilities and a reporting line. Being employed can grant 'own record' access and leave eligibility. A User login is a third thing."
- Limits: Sibling inference. Couples to E-017.
- Decision state: `supported` as a citation.

## E-024 Multi-entity sibling. Shared warehouse is not a shared ledger

- Kind: domain evidence
- Grade: inference
- Claim supported: One building can hold goods for several legal persons. Each person's quantity and valuation stay distinct.
- Citation: `research/domain/multi-entity/candidate-laws.md` L1, L3, L4 @ `59a5c79f939518f5cacccced8ace26e93be4a91b` (SRC-S31)
- Observation: L1 splits legal person, operating unit, site, and brand. L3, intercompany trade is two legal events plus a link. L4, a shared physical warehouse is not a shared stock ledger.
- Limits: L4 is `hypothesis` on that branch.
- Decision state: `supported` as a citation of L1 and L3. L4 remains `hypothesis`.

## E-025 Hypothesis history. H1 already feared two authorities

- Kind: source-system artifact
- Grade: design-claim
- Claim supported: An earlier OS hypothesis kept ontology and ERP as two semantic authorities and was weakened because Product, Order, Action, and lifecycle would be defined twice.
- Citation: `docs/hypothesis-history.md` @ `dc918a50e550d384d1e18a6f24424e6ed4595b9c`, H1
- Observation: H1 status, still plausible as integration architecture, no longer assumed as the ideal greenfield architecture. H4 then asked whether one ontology can hold the buried ERP logic.
- Limits: Internal history, not external evidence. Useful as the claim under attack.
- Decision state: `supported` as a claim about project history.

## E-026 RFC-0001 already excludes Pack as a business entity

- Kind: source-system artifact
- Grade: design-claim
- Claim supported: The metamodel hypothesis already says a business does not contain a ManufacturingPack.
- Citation: `rfcs/0001-metamodel-hypothesis.md` @ `dc918a50e550d384d1e18a6f24424e6ed4595b9c`, "Concepts intentionally NOT proposed"
- Observation: Pack may be distribution. It is not a real-world entity. Open question 16 asks whether modules have semantic meaning.
- Limits: The exclusion is a hypothesis, not a finding.
- Decision state: `supported` as a claim about the RFC text.

## E-027 Scenario S-005. One organization, two commercial roles

- Kind: domain evidence
- Grade: design-claim
- Claim supported: The seed suite already refuses Customer and Supplier as two objects for one organization.
- Citation: `scenarios/README.md` @ `dc918a50e550d384d1e18a6f24424e6ed4595b9c`, S-005
- Observation: Organization B sells raw material to A and buys finished goods from A. The questions ask whether B is simultaneously a Supplier object and a Customer object.
- Limits: Seed scenario, not an executed test.
- Decision state: `supported` as a recorded adversarial case.

## E-028 Scenario S-011. Contradictory observations stay first-class

- Kind: domain evidence
- Grade: design-claim
- Claim supported: The seed suite already requires multiple assertions with provenance rather than one winning field.
- Citation: `scenarios/README.md` @ `dc918a50e550d384d1e18a6f24424e6ed4595b9c`, S-011
- Observation: ERP, spreadsheet, and chat disagree on promised delivery. The questions ask whether they are claims about the same property and what makes one assertion operationally authoritative.
- Limits: Seed scenario, not an executed test.
- Decision state: `supported` as a recorded adversarial case.

## Source-system artifacts isolated

These names are observations, not OS types.

- Evans Bounded Context, Shared Kernel, Anticorruption Layer, Published Language
- Dehghani data product and federated computational governance
- GraphQL subgraph, gateway, supergraph
- Apollo `@shareable` and composition failure
- OWL `owl:imports`, import closure, axiom closure
- `owl:sameAs`
- FIBO BE modules and Legal Entity
- IAS 2 net realisable value
- SCIM core User and enterprise extension
- ERPNext Customer, Supplier, Work Order, Company
- Odoo `res.partner`, `hr.employee`, Work Order, `res.company`
- Frappe Employee master
