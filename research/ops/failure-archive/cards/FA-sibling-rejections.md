# Sibling rejections

**Kind:** explanation of claims sibling Wave A notes already marked `rejected`  
**Issue:** <https://github.com/EnzoTironi/OS/issues/81>  
**Rule:** locators are in [`../sources.md`](../sources.md). This file does not copy those trees. If a sibling left a claim `undetermined`, it is not here.

Issue 7 is cited only where issue 56 already used it as evidence for a rejection. Issue 69 contributed no architecture rejection.

## Issue 55. Unified ontology

Locator: `5f4233579cf3057783775126afa64c39ed631353` `research/kill/unified-ontology/`.

### FA-55-VOCAB

**Exact hypothesis.** One enterprise vocabulary. One type named Product, one Customer, one Inventory quantity.

**Decision state.** `rejected`.

**Scope.** Universal as organizational language. A shared metamodel remains `hypothesis`.

**Original support.** The thesis diagram draws commerce, inventory, manufacturing, accounting, logistics, fiscal, CRM, and HR under one executable ontology. One word looks like one type.

**Breaking evidence.** Issue 55 R-001 cites A-001 through A-003. Commerce Product, manufacturing specification, and accounting valuation class can name the same pallet and refuse one identity grain. Evans says combining distinct models makes software buggy. Sibling domain notes already refuse those collapses.

**Revival.** A later pass where those words share grain and invariants across contexts.

**Kind split.** Domain evidence is the false-cognate split. Source artifact is a global Product table. Candidate law is L-001. Counterexample is an unqualified Product query. Runtime consequence is that type names are qualified by context, or the runtime refuses the homonym.

### FA-55-SAMEAS

**Exact hypothesis.** `owl:sameAs` is substitutive cross-context identity.

**Decision state.** `rejected`.

**Scope.** Universal as OS identity.

**Original support.** Linked Data uses sameAs to say two identifiers name one thing.

**Breaking evidence.** Issue 55 R-002 cites A-008 and S-014. Official sameAs shares all properties across the transitive closure. Halpin, Hayes, and colleagues showed that published Linked Data often uses a weaker relation, which produces incorrect entailments.

**Revival.** A mapping calculus where substitutive equality across independently minted identifiers does not produce false entailments.

**Kind split.** Domain evidence is grain mismatch. Source artifact is OWL sameAs. Candidate law is L-005. Counterexample is S-014. Runtime consequence is no global substitutive equality operator over context objects.

### FA-55-OWL-IMPORT

**Exact hypothesis.** OWL import closure is the federation mechanism.

**Decision state.** `rejected`.

**Scope.** Universal as federation.

**Original support.** OWL 2 modularization looks like composition.

**Breaking evidence.** Issue 55 R-003 cites A-006. Import modularizes documents. The axiom closure is still one set of axioms. Incompatible local models become one inconsistent union, or one silent winner.

**Revival.** A composition rule where incompatible local axioms do not form one executable union. Issue 55 L-006 is `supported` as fail-closed composition. The calculus is `undetermined`.

**Kind split.** Source artifact is `owl:imports`. Candidate law is L-006. Runtime consequence is report the conflicting context ids. Do not coerce.

### FA-55-GOLDEN

**Exact hypothesis.** Golden-dataset governance is the OS truth model.

**Decision state.** `rejected` as the OS truth model.

**Scope.** Universal as truth model. Data-mesh scope in the source is analytical. Operational carry-over stays weaker.

**Original support.** Central governance promises one canonical representation.

**Breaking evidence.** Issue 55 R-005 cites A-009. Data mesh rejects that model. Foundry-style winner-merge drops evidence. Issue 60 later rejects the same standing layer.

**Revival.** Evidence that a global canonical representation with minimal support for change preserves local meaning.

**Kind split.** Source artifact is a golden Customer hub. Candidate law is the issue 55 attack on that governance. Runtime consequence is keep losing claims with provenance.

### FA-55-THESIS-DEAD

**Exact hypothesis.** The entire executable-ontology thesis is dead.

**Decision state.** `rejected` as an overreach.

**Scope.** Universal as a misreading of issue 55.

**Original support.** Kill-test titles invite a total kill.

**Breaking evidence.** Issue 55 R-006. A shared Action, Event, Fact, Constraint vocabulary was not killed. The scope of "one ontology" changed. L-012 records that change as `supported` for the rejected reading and `hypothesis` for the federated metamodel.

**Revival.** Do not revive the overreach. If later evidence kills the shared vocabulary, archive that as a new row with its own locator.

**Kind split.** Candidate law is "do not over-read a scope change as a thesis funeral." Runtime consequence is synthesis still consumes Wave A evidence instead of discarding the thesis.

## Issue 56. Primitive reduction

Locator: `b44575d3d212c67258bee6ed0013e8409c530a5e` `research/kill/primitives/`.

### FA-56-M1

**Exact hypothesis.** Type plus Link plus Function plus Action is enough.

**Decision state.** `rejected`.

**Scope.** Universal as a sufficient kernel.

**Original support.** Palantir-shaped operational ontology. Nearby products look like this quartet.

**Breaking evidence.** Issue 56 R-P-01. Event nature, unknown Effect, and Bind obligation do not survive the quartet without hidden convention.

**Revival.** A later pass where those jobs are expressible without extra sorts and without lost enforcement.

**Kind split.** Source artifact is the Palantir primitive brochure. Candidate law is that M1 is insufficient. Runtime consequence is Wave B must not emit a schema from the quartet.

### FA-56-M2

**Exact hypothesis.** Typed Facts plus rules is the kernel. Objects are projections.

**Decision state.** `rejected`.

**Scope.** Universal as a sufficient kernel.

**Original support.** Elementary-fact analysis and fact stores look clean.

**Breaking evidence.** Issue 56 R-P-02 and issue 59 K1. Independent systems commit objects, documents, actions, events, or datoms. They do not converge on Fact as the write unit. Decomposing a journal or exclusive seat into independently writable facts lets illegal states exist.

**Revival.** Six independent operational systems whose write API is an elementary fact and whose invariants stay simpler than document writes. Not found in those passes.

**Kind split.** Domain evidence is voucher-level reverse. Candidate law is K1 and L-P-10. Runtime consequence is do not make Fact the default persistence of ObjectType.

### FA-56-M3

**Exact hypothesis.** UFO natures plus Action plus Policy is the kernel.

**Decision state.** `rejected`.

**Scope.** Universal as a sufficient kernel.

**Original support.** Formal ontology offers Kind, Role, Relator, and Event-nature as base sorts.

**Breaking evidence.** Issue 56 R-P-03. Native Relator and Role-as-Interface fail the enforcement bar on present evidence. The natures remain useful as analysis.

**Revival.** Evidence that those natures are required as engine categories, not only as patterns.

**Kind split.** Source artifact is a UFO profile used as a storage sort. Candidate law is L-P-07 and L-P-08. Runtime consequence is model Employment as an object plus links until a native sort is forced.

### FA-56-ACTION-EQ-EVENT

**Exact hypothesis.** Action equals Event.

**Decision state.** `rejected`.

**Scope.** Universal.

**Original support.** One "activity" word covers request and occurrence. Some products store both as rows with a type tag.

**Breaking evidence.** Issue 56 R-P-04. Issue 7 L-005 at `08676a1040780eed586288c1a43fa40535e2111d` is `supported` for the split and does not itself use the word `rejected`. ValueFlows, accounting, and inventory correct by appending. An action can produce zero, one, or many occurrences, or only an attempt record.

**Revival.** A mature domain where attempt and occurrence share one identity without audit or compensation failure.

**Kind split.** Domain evidence is Action versus EconomicEvent. Candidate law is L-P-02. Runtime consequence is policy binds the attempt. History binds the occurrence.

Issue 7 left Event encoding `undetermined`. This row does not close that.

### FA-56-POLICY-EQ-FN

**Exact hypothesis.** Policy equals Function plus fail-closed.

**Decision state.** `rejected`.

**Scope.** Universal as a collapse.

**Original support.** Open question 9 writes the tempting simplification.

**Breaking evidence.** Issue 56 R-P-05. Issue 8 R0 is cited there as already rejecting one Computation. Obligation, locus, error algebra, and combination are not a boolean.

**Revival.** Evidence that those jobs are recovered from a boolean Function.

**Kind split.** Candidate law is L-P-05. Runtime consequence is do not pick Cedar or OPA as the metamodel. Bind obligation stays `hypothesis`.

Open question 9 stays `undetermined` as architecture.

### FA-56-EVENT-EQ-TYPE

**Exact hypothesis.** Event equals Type implementing an Event interface, and that is enough enforcement.

**Decision state.** `rejected` as sufficient enforcement.

**Scope.** Context-specific. Storing an occurrence as a typed object remains possible.

**Original support.** RFC-0001 asks whether events are ordinary typed objects implementing Event.

**Breaking evidence.** Issue 56 R-P-06. A tag does not enforce append-only correction.

**Revival.** An engine that treats occurrence as a mutable Type plus a tag and still enforces append-only correction.

**Kind split.** Candidate law is L-P-04. Runtime consequence is the engine must know occurrence is not a mutable current object.

### FA-56-RELATOR-NATIVE

**Exact hypothesis.** Relator is required as an engine category.

**Decision state.** `rejected` on present evidence. Pattern `supported`.

**Scope.** Context-specific.

**Original support.** Employment and supply agreements look like a special relational sort.

**Breaking evidence.** Issue 56 R-P-07. Those cases need a thing to target. They do not yet need a second storage sort.

**Revival.** Evidence that an ordinary identifiable object plus constrained links cannot carry exclusivity, validity, and actions.

**Kind split.** Domain evidence is S-006. Candidate law is L-P-07. Runtime consequence is target Promote and Terminate at the relationship-object.

### FA-56-INTERFACE-ROLE

**Exact hypothesis.** Interface carries Role.

**Decision state.** `rejected` as Role carrier. Interface as kernel sort stays `undetermined`.

**Scope.** Context-specific.

**Original support.** RFC-0001 lists Principal, Actor, and similar as possible interfaces.

**Breaking evidence.** Issue 56 R-P-08. Role validity, exclusivity, and entry or exit are not Interface membership.

**Revival.** Evidence that Interface membership expresses those jobs.

**Kind split.** Domain evidence is Customer as role, not kind. Candidate law is L-P-08. Runtime consequence is do not grant Supplier rights by adding an interface tag to Organization.

### FA-56-FACT-SOLE

**Exact hypothesis.** Fact is the only information atom.

**Decision state.** `rejected`. Kernel sort stays `undetermined`.

**Scope.** Universal as sole atom.

**Original support.** Same attraction as M2.

**Breaking evidence.** Issue 56 R-P-09 and issue 59 K1.

**Revival.** Same as FA-56-M2.

**Kind split.** See FA-56-M2.

### FA-56-TEN-IRREDUCIBLE

**Exact hypothesis.** The RFC-0001 ten-form list is irreducible. All ten are base sorts.

**Decision state.** `rejected`.

**Scope.** Universal as "all ten are base sorts."

**Original support.** The RFC list is the only concrete vocabulary to attack, so it looks like the kernel.

**Breaking evidence.** Issue 56 R-P-10 and the folder verdict. Property, Constraint, and Policy fail as base sorts on present evidence. The leftover six-sort core is `hypothesis`, not accepted, and not an RFC edit.

**Revival.** New enforcement that those forms cannot be jobs of Type, Eval, and Bind.

**Kind split.** Candidate law is constitution rule 1 applied to the RFC list. Runtime consequence is Wave B must not emit a schema from this kill test.

## Issue 57. Action-only mutation

Locator: `a640d008b555b4060421abebd253be71c6fea3e4` `research/kill/action-mutation/`.

### FA-57-EVERY-PERSIST

**Exact hypothesis.** Any write to stored state, including replicas, caches, scans, keystrokes, and index rebuilds, is a named business Action such as ShipOrder.

**Decision state.** `rejected`.

**Scope.** Universal as the wide reading. L-AM-01 remains `supported`. Silent mutation of posted operational truth stays `rejected`.

**Original support.** Constitution §7 and the thesis favor explicit operations over arbitrary field mutation. The wide reading is the slogan form.

**Breaking evidence.** Issue 57 L-AM-02, killed by Palantir Funnel, replica apply, projection refresh, draft patch, and ontology revise. Calling every one of those ShipOrder is how Action-first becomes a slogan.

**Revival.** The source says the wide law is the target. A posted invoice changed by a generic PATCH that auditors treat as correct would attack L-AM-01, not restore L-AM-02.

**Kind split.** Source artifact is Funnel and `REFRESH`. Candidate law is L-AM-02. Runtime consequence is pick a write-class for typed writes. Do not mint a fake business verb per sensor tick.

Open question 4 stays `undetermined` as architecture.

## Issue 10 and issue 57. Workflow as kernel

Locators: `3a84854148f43acc71d8a1df56abb9b1fbb8656f` `research/foundation/process/` and issue 57 L-AM-14.

### FA-10-WORKFLOW

**Exact hypothesis.** Workflow is a kernel semantic form.

**Decision state.** `rejected` as a kernel.

**Scope.** Universal as kernel. Durable execution remains infrastructure.

**Original support.** Long-running enterprise processes look like workflow engines. Temporal, BPMN, and product "workflow" screens are nearby.

**Breaking evidence.** Issue 10 L-001. ValueFlows has no Workflow class. Palantir kinetics are actions and functions. Temporal Workflow is durable function execution. ERPNext sales status is a Function of delivery and billing. Issue 57 L-AM-14 does not reopen it.

**Revival.** A domain cycle where two systems independently need a token graph that cannot be reconstructed from commitments, events, and action invocations, and where removing the graph causes repeated operational failures.

**Kind split.** Domain evidence is ProcessSpecification, Process, Commitment, Event. Source artifact is Temporal Workflow Type. Candidate law is L-001. Runtime consequence is Wave B may adopt a durable engine. That choice must not add Workflow to the ontology.

Process and Commitment as domain objects stay `hypothesis`.

## Issue 58. Specialized kernels

Locator: `b825a15f3f9c8e2471dbb4a2bb641af595ef0cef` `research/kill/specialized-kernels/`.

### FA-58-SEMANTIC-KERNEL

**Exact hypothesis.** Accounting, inventory, MRP, or fiscal require a semantic kernel primitive.

**Decision state.** `rejected`.

**Scope.** Universal as semantic kernel. Confirms FA-H2-KERNEL.

**Original support.** Same as H2.

**Breaking evidence.** Issue 58 R-K-01. E-001, E-005, E-007, A-AGAINST-02.

**Revival.** Same as FA-H2-KERNEL.

**Kind split.** See the historical kernel card.

### FA-58-FIFO-ENGINE

**Exact hypothesis.** FIFO, LIFO, or average belong in the generic engine.

**Decision state.** `rejected`.

**Scope.** Universal as engine primitive.

**Original support.** Stock valuation looks like engine machinery.

**Breaking evidence.** Issue 58 R-K-02 and sibling inventory. Valuation method is domain definition.

**Revival.** Evidence that the engine must name those methods to enforce stock truth.

**Kind split.** Domain evidence is valuation layers. Source artifact is a hardcoded FIFO module. Runtime consequence is no `if valuation == FIFO` in the generic engine.

### FA-58-FISCAL-CODES

**Exact hypothesis.** CFOP, CST, chave de acesso, or eSocial event codes are engine primitives.

**Decision state.** `rejected`.

**Scope.** Universal as engine primitive.

**Original support.** Brazilian fiscal software is full of those codes, so they look foundational.

**Breaking evidence.** Issue 58 R-K-03 and sibling fiscal. Constitution rule 12 forbids company or country branches in the generic engine.

**Revival.** Evidence that those codes are generic engine meaning rather than Brazil-domain definitions.

**Kind split.** Source artifact is a fiscal posting module. Runtime consequence is compose Brazil definitions. Do not mint engine types for them.

### FA-58-SOLVER-AUTHORITY

**Exact hypothesis.** A solver may be the semantic authority for supply.

**Decision state.** `rejected` as a law. L-K-08 remains `hypothesis` as the positive alternative.

**Scope.** Universal as a law.

**Original support.** MRP output looks like the plan the business should obey.

**Breaking evidence.** Issue 58 R-K-04. Authorizing supply is a different speech act from calculating need.

**Revival.** A solver whose output is operational truth without an OS Action or Constraint.

**Kind split.** Domain evidence is plan versus authorization. Runtime consequence is solver output is a proposal until an Action commits it.

### FA-58-NAIVE-INTERPRETER

**Exact hypothesis.** One naive interpreter is proved sufficient for production posting, replay, search, and filing.

**Decision state.** `rejected`. The source says this was never a thesis law.

**Scope.** Universal as a proved sufficiency.

**Original support.** If kernels die, a single interpreter looks like the leftover architecture.

**Breaking evidence.** Issue 58 R-K-05. Physical-for cards show posting, replay, search, and filing stress a naive loop. That does not mint a semantic kernel.

**Revival.** Do not treat this kill as a new architecture. A later measured interpreter that meets the boundary tests would support a physical claim, not revive H2.

**Kind split.** Runtime consequence is Wave B may add evaluators. Failure of `boundary.md` tests is a semantic kernel and stays rejected.

## Issue 59. Fact and bitemporal over-generalization

Locator: `4f7057cbc56abeb9c64e1d133ecb5eff584ed050` `research/kill/fact-bitemporal/`.

### FA-59-FACT-WRITE

**Exact hypothesis.** Fact is the fundamental write unit.

**Decision state.** `rejected` as a universal kernel claim. Weaker interchange claim stays `hypothesis`.

**Scope.** Context-specific.

**Original support.** RFC-0001 Fact shape. Halpin elementary facts. "Current state is a projection" in the thesis.

**Breaking evidence.** Issue 59 K1. Palantir Actions on objects. ERPNext submitted vouchers. ValueFlows EconomicEvents. Young rejects event sourcing everywhere.

**Revival.** Six independent operational systems whose write API is an elementary fact. Not found.

**Kind split.** See FA-56-M2. Open question 2 stays `undetermined`.

### FA-59-UBIQUITOUS-BI

**Exact hypothesis.** Every stored property or type must carry both temporal axes.

**Decision state.** `rejected` as a metamodel default. Optional as a type capability.

**Scope.** Context-specific.

**Original support.** Thesis and open question 7 ask `valid then` and `known then`. SQL:2011 can express both. XTDB puts both on every table.

**Breaking evidence.** Issue 59 K6. SQL:2011 is opt-in per table. SQL Server ships system time only. Datomic ships transaction time only. XTDB says most queries look atemporal. Display names, sort keys, and sensor points do not earn both clocks.

**Revival.** A domain that cannot be modeled unless every property carries both axes. A domain that never needs the two questions would attack K5, which remains `supported`.

**Kind split.** Domain evidence is S-007 for selected types. Source artifact is a default bitemporal row. Candidate law is K6. Runtime consequence is history and dual time are declared. They are not implied by ObjectType.

Open question 7 stays `undetermined` as architecture.

## Issue 60. Authority

Locator: `0a8551c04f25c0feefd8ed616d14e3ff605ed047` `research/kill/authority/`.

### FA-60-HYP-A

**Exact hypothesis.** Correct typing eliminates every disagreement, so an authority mechanism is unnecessary.

**Decision state.** `rejected` as a complete kill of authority.

**Scope.** Universal as a total kill. Most named disagreements are still reducible. That part is `supported`.

**Original support.** Open question 3 cautions that many conflicts are collapsed concepts. S-001 four dates are the teaching case.

**Breaking evidence.** Issue 60 rejected readings. IRR-01 through IRR-04 and IRR-06 remain after typing. Book versus count, two labs on one sample, and a prior-period error still force a decision.

**Revival.** A later catalog that reduces those IRR rows.

**Kind split.** Domain evidence is the IRR catalog. Candidate law is L-001's rejected half. Runtime consequence is do not delete Decision Actions because S-001 was a collapse.

Open question 3 stays `undetermined`.

### FA-60-HYP-B

**Exact hypothesis.** A standing canonical-truth layer picks the winner and drops losers.

**Decision state.** `rejected`.

**Scope.** Universal as a standing layer. A Decision Action remains `hypothesis`.

**Original support.** Foundry user-edits-win and canonical objects.

**Breaking evidence.** Surviving operations append a Decision or adjustment. Winner-merge drops evidence.

**Revival.** Evidence that winner-merge preserves audit and competing observations.

**Kind split.** Source artifact is Foundry merge. Runtime consequence is keep the losing claim.

### FA-60-H1-WINNER

**Exact hypothesis.** Inherit H1 winner tables from hypothesis history as domain law.

**Decision state.** `rejected`.

**Scope.** Universal as domain law. Integration pattern remains possible.

**Original support.** H1's integration reading.

**Breaking evidence.** Issue 60. Winner tables are an integration pattern, not a domain law.

**Revival.** Same as FA-H1 brownfield, with an explicit map. Not as OS truth.

**Kind split.** See FA-H1.

### FA-60-CONFIDENCE

**Exact hypothesis.** Confidence equals authority.

**Decision state.** `rejected`.

**Scope.** Universal.

**Original support.** Provenance lists often include confidence next to source.

**Breaking evidence.** Issue 60 E-012 and E-018. A signed invoice and a chat extract can share a number. GUM treats measurements as estimates plus uncertainty. Release still needs a disposition.

**Revival.** Evidence that a high-confidence chat extract outranks a signed invoice.

**Kind split.** Domain evidence is PROV primary source versus GUM uncertainty. Runtime consequence is policy may read both. It must not treat them as one field.

## Issue 61. Build versus reuse

Locator: `d22e3a24b62483ce5274019db0aa9d3aba268d18` `research/kill/build-vs-reuse/`.

### FA-61-BUILD-INFERIOR

**Exact hypothesis.** Building the semantic core from zero is inferior to reuse.

**Decision state.** `rejected` for the semantic core.

**Scope.** Universal for the semantic core. Mechanism reuse remains `supported` as a class.

**Original support.** Existing platforms already ship objects, actions, and durability.

**Breaking evidence.** Issue 61 folder verdict and L-006. Reuse of a product as the place meaning is defined fails the five-question grid.

**Revival.** X-006. A later independent corpus that already implements Action versus Event versus unknown Effect, bitemporal explanation, fail-closed policy, and posted-history laws under a license OS can use.

**Kind split.** Candidate law is L-006 as a ranking, not a close of question 21. Runtime consequence is Wave C starts from surviving laws, not a product shortlist.

### FA-61-PRODUCT-CORE

**Exact hypothesis.** ERPNext, Frappe, Moqui, Open Foundry, ObjectStack, Ontologiq, or Temporal is the place where Product, Order, Action, Event, and Policy get their meaning.

**Decision state.** `rejected` as greenfield architecture.

**Scope.** Universal as core. Patterns may be stolen. Products are not the core.

**Original support.** Each product covers part of the nearby story.

**Breaking evidence.** Issue 61 R-001 through R-004. H3 and H1 fail again as product picks.

**Revival.** Same as X-006.

**Kind split.** Source artifact is each product schema. Candidate law is L-001. Runtime consequence is adapters at the boundary.

### FA-61-OPENFGA-CORE

**Exact hypothesis.** OpenFGA relationship tuples are the OS relationship model.

**Decision state.** `rejected` as a core. Projection remains `hypothesis`.

**Scope.** Context-specific.

**Original support.** Relationship-based authorization looks like the Link model.

**Breaking evidence.** Issue 61 R-005. Tuples written by a separate admin console fail L-003.

**Revival.** Evidence that OpenFGA tuples can be the ontology relationship without a second admin writer.

**Kind split.** Source artifact is OpenFGA. Runtime consequence is a projection is allowed only after an OS-owned mapping.

### FA-61-XTDB-FACT

**Exact hypothesis.** XTDB row bitemporality is the RFC-0001 Fact primitive.

**Decision state.** `rejected`. Storage class remains `undetermined`.

**Scope.** Context-specific.

**Original support.** XTDB puts both time axes on rows.

**Breaking evidence.** Issue 61 R-006 and issue 59 K6. A store's row shape is not the Fact sort.

**Revival.** Evidence that one store's row is the Fact primitive.

**Kind split.** Source artifact is XTDB. Runtime consequence is do not name XTDB in ontology types.

### FA-61-MIN-CODE

**Exact hypothesis.** Minimizing new code is a valid ranking key for this issue.

**Decision state.** `rejected`.

**Scope.** Universal as ranking key.

**Original support.** The usual reuse instinct.

**Breaking evidence.** Issue 61 R-007, constitution rule 5, thesis AGI section.

**Revival.** A change to those documents.

**Kind split.** Candidate law is L-005's class split. Runtime consequence is do not rank A1 below a product because A1 writes more code.

Question 21 stays open in `docs/open-questions.md`.

## Issue 68. Existing platform

Locator: `10314410ed1fddc252360ac9abff04b1b4c16956` `research/kill/existing-platform/`.

### FA-68-EXISTING

**Exact hypothesis.** An existing platform already satisfies the OS thesis cleanly enough to replace a new core.

**Decision state.** `rejected`.

**Scope.** Universal as replace-OS. Hosting the vertical as an application with unenforced convention is `supported` and is the wrong test.

**Original support.** Palantir already has objects, links, interfaces, actions, functions, and shared action logic. That is most of the nearby story.

**Breaking evidence.** Issue 68 folder verdict. Palantir merges sources, treats the four dates as ordinary properties, binds approval at submit time, lacks `unknown` after send, and treats version-per-time as an anti-pattern. Ontologiq has the approval and lost-I/O protocol and never writes operational truth. No inspected platform has both halves.

**Revival.** A platform that enforces competing observations, four date natures, hashed re-read approval, unknown after send, and temporal history without fighting official guidance.

**Kind split.** Source artifact is each platform's official guidance. Candidate law is L-001 and L-008. Runtime consequence is an extension that fights official guidance is a new core.

### FA-68-VENDOR

**Exact hypothesis.** OS should vendor or fork an inspected runtime as the MIT core.

**Decision state.** `rejected` for this pass.

**Scope.** Universal for this pass.

**Original support.** Apache-2.0 runtimes look copyable.

**Breaking evidence.** Palantir is closed. ERPNext is GPL. Odoo Community is LGPL. OpenBKN and Xpert carry reuse blocks recorded by issue 69. Ontologiq, Open Foundry, and ObjectStack each fail a required property in the engine.

**Revival.** A license-clean runtime that already enforces the required properties.

**Kind split.** Licensing note from issue 69. Semantic failures from the scorecard. Runtime consequence is steal protocols, not trees.

## Issue 72. Semantic duplication

Locator: `190e4b9ac4aa97422df91a8579ab0e6b33539d34` `research/kill/semantic-duplication/`.

### FA-72-SOR-WHILE-WRITERS

**Exact hypothesis.** One executable ontology becomes the organization's system of record for Product, Sales Order, inventory, cash, and fiscal documents, while those external writers remain.

**Decision state.** `rejected`.

**Scope.** Universal as that reading. A refuse-by-default hybrid remains `hypothesis`.

**Original support.** The thesis diagram draws external systems under the ontology as if they were surfaces.

**Breaking evidence.** Issue 72 folder verdict. A mapping is not a deleted model. Microsoft dual-write, SAP Business Partner sync, and Palantir Funnel keep the source model and add a sync office. SEFAZ authorization is not owned by storing a copy of the XML.

**Revival.** Exclusive write and legal capacity for those grains, with bypass treated as a defect. That is L-009, `supported` as the ownership test, not as a claim that OS already has that capacity.

**Kind split.** Domain evidence is NF-e authorization. Source artifact is dual-write. Candidate law is L-002 and L-009. Runtime consequence is a query that treats a virtualized Sales Order as an OS-owned object is incomplete.

Open question 3 stays open.

### FA-72-BLANKET

**Exact hypothesis.** Blanket materialization of source rows into ontology objects reduces semantic duplication.

**Decision state.** `rejected` as a default. `supported` as a kill for blanket materialization.

**Scope.** Universal as a default. Materialize-only-projections remains `supported` as a restriction.

**Original support.** Search and join are easier on a local index.

**Breaking evidence.** Issue 72 L-011. Copying Product, Customer, and Sales Order while sources still write adds a fourth writer and a merge rule. Writeback is not two-phase commit. Bypass is an expected writer.

**Revival.** Evidence that copying those rows while sources still write removes more models than it adds.

**Kind split.** Source artifact is an indexed ontology object over a live ERP. Candidate law is L-004 and L-011. Runtime consequence is materialize only derived projections with named valid time, knowledge time, and a published merge rule that keeps the loser.

Whether a refuse-by-default hybrid's mapping cost outweighs the ontology benefit stays `undetermined`.
