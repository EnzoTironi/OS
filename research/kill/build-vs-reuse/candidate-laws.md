# Candidate laws

Smallest claims that still fit the evidence. Each law names a falsifier. Decision state is never `accepted`. These are not RFC-0001 edits.

## L-001. The semantic core must not be a product schema

**Kind.** candidate law  
**Decision.** supported

OS types, actions, events, facts, constraints, and policies are not DocTypes, Moqui entities, Temporal Workflow types, OpenFGA types, XTDB tables, or TigerBeetle ledgers. A product may implement a physical evaluation of those statements. It may not define them.

**Evidence.** E-002, E-003, E-006, E-012, E-014, E-015, E-016, E-017.

**Counterexample.** X-001. If a later Wave A domain note shows a business distinction that can only be stated in one product's schema and cannot be restated in RFC-0001 forms, this law fails.

**Runtime consequence.** Adapters sit at the boundary. Internal types do not mention Frappe, Temporal, or OpenFGA.

## L-002. Reuse is legal only for mechanism that cannot invent business meaning

**Kind.** candidate law  
**Decision.** supported

A reused engine may persist, replay, index, solve, sign, or answer Allow or Deny. It may not mint accounts, tax codes, order statuses, or identity kinds the ontology cannot see. This is issue 58 L-K-01 applied to whole products.

**Evidence.** E-001, E-016, E-017.

**Counterexample.** X-002. A mechanism that must own a chart of accounts, a DocType tree, or a Workflow type to function cannot be reused as a silent worker.

**Runtime consequence.** Wave B may host Temporal, Cedar, XTDB, or a ledger store only after a written mapping from OS concepts to engine calls. The mapping is OS-owned.

## L-003. A second source of business meaning is a failed reuse

**Kind.** candidate law  
**Decision.** supported

If Product, Order, Employment, or posted balance can change in the reused system without an OS Action, Event, or Fact, the reuse has forked meaning. H1 failed this test. OpenFGA tuples that are written by a separate admin console fail this test. ERPNext documents that submit outside OS fail this test.

**Evidence.** E-002, E-004, E-014, E-008.

**Counterexample.** X-003. A read-only projection that cannot accept writes except through OS Actions does not fail this law.

**Runtime consequence.** Dual-write is a defect unless one side is a derived projection with a named Function.

## L-004. Replaceability is part of semantic quality

**Kind.** candidate law  
**Decision.** hypothesis

A reuse that cannot be swapped without rewriting ontology types is a hidden primitive. Clean boundary means OS tests still pass against a fake engine.

**Evidence.** E-011, E-013, E-015, constitution §6.

**Counterexample.** X-004. If every historical Action pins a Temporal Workflow Type name, Temporal is no longer replaceable.

**Runtime consequence.** Pins record OS definition revisions. Engine execution ids are provenance, not types.

## L-005. AGI does not erase production-forced distinctions or verified evaluators

**Kind.** candidate law  
**Decision.** supported for the class split. `undetermined` for any one product.

AGI can rewrite adapters and generate tests. It does not make a late stock movement stop needing valid time versus known time. It does not make skip-on-error into fail-closed. It does not make a young action executor grow ten years of cancel-graph bugs overnight. The hard-to-recreate assets are domain distinctions forced by production, and evaluators with proofs or long operational history. They are not the product skins those assets currently live in.

**Evidence.** E-004, E-009, E-013, E-016, thesis AGI section.

**Counterexample.** X-005. If a later note shows a durability or policy property that cannot be specified independently of one vendor's API, that property is not a reusable class.

**Runtime consequence.** Mine ERPNext and Moqui. Do not vendor them by default. Prefer a mechanism with a small, specified interface over a framework that includes a second ERP.

## L-006. Building the semantic core from first principles is the current quality winner

**Kind.** candidate law  
**Decision.** supported as a ranking, not as a close of question 21

On the evidence in this folder, the highest-quality greenfield architecture owns types, actions, events or facts, constraints, policy meaning, time, and provenance. It treats mature ERPs and ontology runtimes as corpora. It may later reuse durability, policy evaluation, temporal indexing, and ledger enforcement as physical engines. "Compose Open Foundry plus ERPNext" and "Temporal as the business OS" lose on semantic quality.

**Evidence.** E-001, E-002, E-020, alternatives A1 through A8.

**Counterexample.** X-006. A later independent corpus that already implements Action versus Event versus unknown Effect, bitemporal explanation, fail-closed policy, and posted-history laws under a license OS can use would dethrone A1.

**Runtime consequence.** Wave C synthesis should not start from a product shortlist. It should start from surviving laws.

## Rejected claims

**R-001. OS should use ERPNext or Frappe as the greenfield semantic core.**  
Decision. `rejected`. Evidence E-002, E-003, E-004, E-005.

**R-002. OS should use Moqui or Mantle as the greenfield semantic core.**  
Decision. `rejected`. Evidence E-006, E-007. Mantle remains a corpus.

**R-003. OS should use Open Foundry, ObjectStack, or Ontologiq as the greenfield semantic core.**  
Decision. `rejected`. Evidence E-008, E-009, E-010, E-020. Patterns may be stolen. Products are not the core.

**R-004. OS should use Temporal Workflow types as ontology types or as the Action primitive.**  
Decision. `rejected`. Evidence E-011, E-012.

**R-005. OpenFGA relationship tuples should be the OS relationship model.**  
Decision. `rejected` as a core. Projection remains `hypothesis`. Evidence E-014.

**R-006. XTDB row bitemporality is the RFC-0001 Fact primitive.**  
Decision. `rejected`. Evidence E-015. Storage class remains `undetermined`.

**R-007. Minimizing new code is a valid ranking key for this issue.**  
Decision. `rejected`. Evidence E-001.

**R-008. This folder answers `docs/open-questions.md` question 21.**  
Decision. `rejected` as a move. The kill-test claim about the semantic core is decided here. The open question stays undetermined in that document.
