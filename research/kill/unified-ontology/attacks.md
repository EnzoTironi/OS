# Attacks

Each card tries to kill a reading of "one executable ontology." Kind and decision state are required. A surviving attack becomes a candidate law. A failed attack is recorded as `rejected` or `undetermined`.

## A-001 Product is a homonym, not a type

- Kind: counterexample
- Targets: thesis diagram in E-001. One Product object for commerce, manufacturing, and accounting.
- Setup: The same GTIN is sold as an offer, manufactured from a BOM, and valued in a stock account.
- Falsifying result for the unified type: one Product record holds offer price, routing, and valuation class without losing any local invariant.
- Observed result: Product sibling R-01 rejects Item as a single OS type (E-019). Manufacturing splits specification from authorization from execution (E-021). Accounting refuses automatic ledger events from quantity change (E-022).
- Consequence: reject one Product type. Keep a correspondence among offer, specification, and valuation class.
- Decision state: `supported`
- Runtime consequence: An agent tool named `GetProduct` is illegal unless it names a context.

## A-002 Customer is a role. Legal counterparty is a person

- Kind: counterexample
- Targets: one Customer master as organizational identity.
- Setup: Organization B is supplier to A and customer of A (E-027). Later B is also the legal counterparty on a loan.
- Falsifying result: one Customer object remains the identity of B through both trades and the loan, and tax, credit, and payment terms stay coherent.
- Observed result: Party L1 rejects commercial labels as Kinds (E-018). FIBO maps customer, client, and counterparty onto Legal Entity or Party (E-015).
- Consequence: reject Customer as a Kind. Cross-context identity attaches to LegalPerson, not to the role.
- Decision state: `supported`

## A-003 Physical stock and financial inventory disagree on purpose

- Kind: counterexample
- Targets: one Inventory quantity that is both bin count and carrying amount.
- Setup: 100 units sit in a bonded warehouse on consignment. NRV falls. IAS 2 requires a write-down for the owner. The custodian's on-hand does not move.
- Falsifying result: one quantity field answers both the cycle count and the carrying amount after the write-down.
- Observed result: IAS 2 measures lower of cost and NRV (E-016). Inventory L-INV-01 and L-INV-10 split ownership, custody, quantity, and valuation (E-020). Accounting L11 refuses automatic journals from quantity change (E-022).
- Consequence: reject one Inventory fact. Physical and financial contexts may share a correspondence to a lot. They do not share a balance.
- Decision state: `supported`

## A-004 HR identity is not IAM identity

- Kind: counterexample
- Targets: one Person record that is also the login and the employee file.
- Setup: Person P leaves employment. SCIM sets `active` false on the User. P is later rehired on a new employment and needs a new or restored login. P also becomes a customer.
- Falsifying result: one identity key answers employment history, access control, and the later customer relationship without leftover audit holes.
- Observed result: HR L1 and L13 split Person, Employment, Post, and User (E-023). RFC 7643 splits core User from enterprise workforce fields (E-017). Party L6 says a contact person is not the billed party (E-018).
- Consequence: reject one identity. Correspondence among Person, Employment, and Principal is required.
- Decision state: `supported`

## A-005 Evans already killed the global ubiquitous language

- Kind: domain evidence
- Targets: one ubiquitous language for the organization.
- Setup: Two user communities, sales and the plant, use Product in the senses of A-001.
- Falsifying result: Evans would treat that as one bounded context with one language.
- Observed result: Evans says multiple models are inevitable and that expressions have meaning only in context (E-003, E-004). Continuous integration is inside the bound, not across the company.
- Consequence: reject one organizational ubiquitous language. A shared metamodel is a different claim.
- Decision state: `supported`

## A-006 OWL import is a god-model machine

- Kind: counterexample
- Targets: "we will just import the domain ontologies into one OS ontology."
- Setup: Commerce and accounting both import a Product module and add incompatible disjointness or cardinality axioms.
- Falsifying result: OWL import keeps the local axiom sets separate at reasoning time.
- Observed result: Import yields one axiom closure (E-012). Local anonymous individuals are standardized apart, which already admits that identity is not automatically global. Contradictory axioms make the closure inconsistent.
- Consequence: reject import-as-unification. Context modules need a mapping layer that is not axiom union.
- Decision state: `supported` as an attack on OWL-style union. `undetermined` for other composition calculi.

## A-007 Federation composition fails closed. A god-model fails open

- Kind: counterexample
- Targets: silent merge of homonymous fields.
- Setup: Two contexts both expose `Event.timestamp`, one as a civil datetime string, one as epoch integer (E-011).
- Falsifying result: a unified ontology picks one representation and both contexts keep their meaning.
- Observed result: Apollo composition fails. GraphQL federation treats that failure as the integrity mechanism (E-010, E-011).
- Consequence: OS composition of context modules must fail closed on type and invariant conflict. Silent coercion is the god-model behavior.
- Decision state: `supported` as a required property. Not a GraphQL dependency.

## A-008 owl:sameAs is the wrong cross-context identity

- Kind: counterexample
- Targets: one global identifier with substitutive equality.
- Setup: Commerce SKU, GS1 GTIN, manufacturing specification, and GL valuation class are linked with sameAs.
- Falsifying result: substitutive equality preserves offer price, BOM, and account mapping.
- Observed result: sameAs shares all properties across the transitive closure (E-013). Identity services that mix sameAs with similarity lose meaning (E-014). Product sibling already splits those grains (E-019).
- Consequence: reject substitutive global identity. Use dated correspondence with named grain.
- Decision state: `supported`

## A-009 Data mesh rejects the golden dataset

- Kind: domain evidence
- Targets: one certified enterprise ontology as the source of analytical and operational truth.
- Setup: Central governance publishes a golden Product and requires every domain to conform.
- Falsifying result: Dehghani would call that federated computational governance.
- Observed result: She names global canonical representation with minimal support for change as the old model (E-008, E-009).
- Consequence: even if OS is operational rather than analytical, a golden Product repeats the rejected governance.
- Decision state: `supported` as an organizational attack. `hypothesis` as an operational-runtime law.

## A-010 Work Order false cognate inside one vendor family

- Kind: source-system artifact
- Targets: one manufacturing type named from ERP vocabulary.
- Setup: An agent trained on ERPNext Work Order is pointed at Odoo Work Order.
- Falsifying result: the same type and the same actions work.
- Observed result: ERPNext Work Order is authorization. Odoo Work Order is operation execution (E-021). Manufacturing L1 treats those as different facts.
- Consequence: a unified ontology that absorbs vendor words becomes a translation dump. Context modules must name layers, not vendor documents.
- Decision state: `supported`

## A-011 Legal person, site, and brand cannot share one Company

- Kind: counterexample
- Targets: one Company object for tax, warehouse, and marketing name.
- Setup: A Brazilian group has several CNPJs, one shared warehouse building, and one brand on the storefront.
- Falsifying result: one Company identity posts tax, stock, and invoices without intercompany links.
- Observed result: Multi-entity L1, L3, L4 split those cuts (E-024). Party L2 already split legal person, operating unit, and brand (E-018).
- Consequence: reject one organizational identity. Group queries must name the cut.
- Decision state: `supported`

## A-012 Shared Kernel explosion

- Kind: counterexample
- Targets: putting Product, Customer, Inventory, and Employee in the shared kernel so every context can reuse them.
- Setup: Follow Evans Shared Kernel (E-006) but place the four homonyms in the kernel.
- Falsifying result: the kernel stays small and each context keeps local meaning.
- Observed result: Evans says keep the kernel small and consult on every change. A-001 through A-004 show those four terms are not stable across consumers.
- Consequence: the shared kernel, if any, holds metamodel forms and surviving kinds such as LegalPerson and ResourceSpecification-as-correspondence-target. It does not hold role labels.
- Decision state: `supported`

## A-013 Parallel books are a cut, not a bug

- Kind: counterexample
- Targets: one accounting truth for the organization.
- Setup: Statutory book and management book disagree on depreciation. Both are required.
- Falsifying result: one journal is the organizational truth and the other is a report.
- Observed result: Accounting L17 on the sibling branch treats parallel books as a cut, not a proven primitive. Multi-entity L5 treats consolidation as a projection with eliminations (E-024).
- Consequence: contradictory local models can be both required. The unified ontology cannot pick a winner.
- Decision state: `hypothesis` pending a fuller read of the accounting evidence file. The existence of the sibling law is `supported`.

## A-014 Location type that mixes party, process, and loss

- Kind: source-system artifact
- Targets: one Location type reused as Customer, Production, and Inventory Loss.
- Setup: Inventory sibling README warns that Odoo Location Type includes Vendor, Customer, Transit, Production, and Inventory Loss.
- Falsifying result: that enum is a domain law.
- Observed result: the sibling marks it as a source smell and forbids promoting Location Type to an OS primitive.
- Consequence: a unified ontology that copies a convenient enum becomes a god-model of leftover application cuts.
- Decision state: `supported` as an attack on promoting that enum. The Odoo page was not re-fetched here.

## A-015 Pack is not the federation unit

- Kind: candidate law
- Targets: H2 packs as the way to split the ontology (E-025, E-026).
- Setup: ManufacturingPack, BrazilPack, AccountingPack as semantic modules.
- Falsifying result: a business contains those packs as real entities.
- Observed result: RFC-0001 already excludes Pack. Constitution rule 6 separates packages from domain meaning. Evans modules are a tactical building block, not a bounded context.
- Consequence: context ontologies are semantic bounds. Distribution packs, if any, are toolchain. Do not collapse them.
- Decision state: `supported` as a rejection of Pack-as-ontology. The positive encoding of context modules is `hypothesis`.

## A-016 Two semantic authorities return if the ontology is a facade

- Kind: counterexample
- Targets: H1 revival. Ontology as a semantic layer over an ERP that still owns Product and Order.
- Setup: OS ontology types mirror ERPNext DocTypes and delegate mutation.
- Falsifying result: Product is defined once.
- Observed result: Hypothesis history already says H1 risks defining Product, Order, Action, permissions, and lifecycle twice (E-025). A federated OS that still treats an ERP as a second authority repeats H1.
- Consequence: federation inside OS is not the same as ontology-plus-ERP. Cross-system mappings to an external ERP are anticorruption layers, not the internal context map.
- Decision state: `supported` as a distinction. Integration architecture remains `hypothesis` for brownfield companies.
