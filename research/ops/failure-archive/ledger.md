# Ledger of archived rejections

**Kind:** reference  
**Issue:** <https://github.com/EnzoTironi/OS/issues/81>  
**Decision state:** each row is `rejected` in the named scope  
**Rule:** do not add a row unless a cited source already used the word `rejected` for that claim, or `docs/hypothesis-history.md` already recorded the historical status that issue 81 named as a seed.

Scope values.

- `universal` means the source rejected the claim for OS as such.
- `context-specific` means the source rejected one reading and left another live.

Revival is copied from the source when the source named one. Otherwise it is the source's own falsifier, not a new theory.

## Historical seeds from `docs/hypothesis-history.md`

| id | exact hypothesis | scope | revival | cited from | card |
| --- | --- | --- | --- | --- | --- |
| FA-H0 | Replace a traditional ERP with a more modern ERP as the top-level product | universal as product framing | New evidence that agents and ontology are only integrations around an ERP, and that this framing still yields the best operational system | H0 status. Thesis "probably not" | [historical](cards/FA-historical-seeds.md#fa-h0-erp-replacement) |
| FA-H1 | Operational ontology above a separate ERP transaction authority as the ideal greenfield architecture | context-specific. Dead as greenfield ideal. Live as brownfield integration | A greenfield company where Product, Order, Action, permission, and lifecycle can be defined once in the ERP and once in the ontology without drift | H1 status. Issue 55 A-016. Issue 61 L-003 | [historical](cards/FA-historical-seeds.md#fa-h1-erp-plus-ontology-layering) |
| FA-H2-PACK | Domain Packs such as ManufacturingPack are semantic units of the business | universal as ontology primitive | Evidence that a business contains a pack as a real-world entity, not as a distribution bound | H2 weakening. RFC-0001 Pack exclusion. Issue 55 R-004 | [historical](cards/FA-historical-seeds.md#fa-h2-semantic-packs) |
| FA-H2-COMPILER | A visible Compiler is a business or ontology primitive | universal as ontology primitive | Evidence that compilation itself carries domain meaning that interpretation, generation, or materialization cannot express | H2 weakening. RFC-0001 Compiler exclusion. Open question 17 stays open | [historical](cards/FA-historical-seeds.md#fa-h2-visible-compiler) |
| FA-H2-KERNEL | Accounting, inventory, manufacturing, or fiscal need a Deterministic Kernel below the ontology | universal as semantic kernel. Physical evaluator remains live | A domain whose invariants cannot be stated as Functions, Constraints, Actions, and Facts inside the ontology without a second business model | H2 weakening. Thesis determinism section. Issue 58 R-K-01 | [historical](cards/FA-historical-seeds.md#fa-h2-separate-deterministic-kernels) |
| FA-H3 | Modernize Frappe or ERPNext into the Business OS and treat it as the greenfield foundation | universal as foundation. Corpus use remains live | A later independent note that Frappe's schema, storage, and lifecycle already enforce the surviving thesis laws under a license OS can use | H3 status. Issue 61 R-001. Issue 68 vendor or fork claim | [historical](cards/FA-historical-seeds.md#fa-h3-frappe-as-foundation) |

## Sibling Wave A claims already marked `rejected`

| id | exact hypothesis | scope | revival | cited from | card |
| --- | --- | --- | --- | --- | --- |
| FA-55-VOCAB | One enterprise vocabulary. One Product type, one Customer type, one Inventory quantity | universal as organizational language | A later pass where commerce, manufacturing, and accounting share identity grain and invariants for those words | issue 55 R-001 | [sibling](cards/FA-sibling-rejections.md#fa-55-vocab) |
| FA-55-SAMEAS | `owl:sameAs` as substitutive cross-context identity | universal as OS identity | A mapping calculus where substitutive equality across independently minted identifiers does not produce false entailments | issue 55 R-002 | [sibling](cards/FA-sibling-rejections.md#fa-55-sameas) |
| FA-55-OWL-IMPORT | OWL import closure as the federation mechanism | universal as federation | A composition rule where incompatible local axioms do not form one executable union | issue 55 R-003 | [sibling](cards/FA-sibling-rejections.md#fa-55-owl-import) |
| FA-55-GOLDEN | Golden-dataset governance as the OS truth model | universal as truth model | Evidence that a global canonical representation with minimal support for change preserves local meaning | issue 55 R-005 | [sibling](cards/FA-sibling-rejections.md#fa-55-golden) |
| FA-55-THESIS-DEAD | The entire executable-ontology thesis is dead | universal as overreach | Issue 55 already says a shared Action, Event, Fact, Constraint vocabulary was not killed. Do not revive the overreach | issue 55 R-006 | [sibling](cards/FA-sibling-rejections.md#fa-55-thesis-dead) |
| FA-56-M1 | Type plus Link plus Function plus Action is a sufficient kernel | universal as sufficient kernel | A later pass where Event nature, unknown Effect, and Bind obligation are expressible without extra sorts and without lost enforcement | issue 56 R-P-01 | [sibling](cards/FA-sibling-rejections.md#fa-56-m1) |
| FA-56-M2 | Typed Facts plus rules is the kernel | universal as sufficient kernel | Six independent operational systems whose write API is an elementary fact and whose invariants stay simpler than document writes | issue 56 R-P-02. Issue 59 K1 | [sibling](cards/FA-sibling-rejections.md#fa-56-m2) |
| FA-56-M3 | UFO natures plus Action plus Policy is the kernel | universal as sufficient kernel | Evidence that native Kind, Role, and Relator sorts are required for enforcement, not only as patterns | issue 56 R-P-03 | [sibling](cards/FA-sibling-rejections.md#fa-56-m3) |
| FA-56-ACTION-EQ-EVENT | Action equals Event | universal | A mature domain where attempt and occurrence share one identity without audit or compensation failure | issue 56 R-P-04. Issue 7 L-005 is `supported` for the split | [sibling](cards/FA-sibling-rejections.md#fa-56-action-eq-event) |
| FA-56-POLICY-EQ-FN | Policy equals Function plus fail-closed | universal as a collapse | Evidence that obligation, locus, error algebra, and combination are recovered from a boolean Function | issue 56 R-P-05. Issue 8 R0 cited there | [sibling](cards/FA-sibling-rejections.md#fa-56-policy-eq-fn) |
| FA-56-EVENT-EQ-TYPE | Event equals Type implementing an Event interface, as sufficient enforcement | context-specific. Storage as a typed object remains possible | An engine that treats occurrence as a mutable Type plus a tag and still enforces append-only correction | issue 56 R-P-06 | [sibling](cards/FA-sibling-rejections.md#fa-56-event-eq-type) |
| FA-56-RELATOR-NATIVE | Relator is required as an engine category | context-specific. Pattern remains `supported` | Evidence that Employment, supply hold, or reservation cannot be an ordinary identifiable object plus constrained links | issue 56 R-P-07 | [sibling](cards/FA-sibling-rejections.md#fa-56-relator-native) |
| FA-56-INTERFACE-ROLE | Interface carries Role | universal as Role carrier. Interface as kernel sort stays `undetermined` | Evidence that Role validity, exclusivity, and entry or exit are expressible as Interface membership | issue 56 R-P-08 | [sibling](cards/FA-sibling-rejections.md#fa-56-interface-role) |
| FA-56-FACT-SOLE | Fact is the only information atom | universal as sole atom. Kernel sort stays `undetermined` | See FA-56-M2 revival | issue 56 R-P-09. Issue 59 K1 | [sibling](cards/FA-sibling-rejections.md#fa-56-fact-sole) |
| FA-56-TEN-IRREDUCIBLE | The RFC-0001 ten-form list is irreducible | universal as "all ten are base sorts" | New enforcement that Property, Constraint, and Policy cannot be jobs of Type, Eval, and Bind | issue 56 R-P-10 | [sibling](cards/FA-sibling-rejections.md#fa-56-ten-irreducible) |
| FA-57-EVERY-PERSIST | Every persist is a named business Action such as ShipOrder | universal as the wide reading. Narrower L-AM-01 remains `supported` | A posted invoice whose totals change through a generic PATCH that auditors treat as correct would attack the narrow law, not revive the wide one | issue 57 L-AM-02 | [sibling](cards/FA-sibling-rejections.md#fa-57-every-persist) |
| FA-10-WORKFLOW | Workflow is a kernel semantic form | universal as kernel. Durable execution remains infrastructure | A domain cycle where two systems independently need a token graph that cannot be reconstructed from commitments, events, and action invocations | issue 10 L-001. Issue 57 L-AM-14 | [sibling](cards/FA-sibling-rejections.md#fa-10-workflow) |
| FA-58-SEMANTIC-KERNEL | Accounting, inventory, MRP, or fiscal require a semantic kernel primitive | universal as semantic kernel | Same revival as FA-H2-KERNEL | issue 58 R-K-01 | [sibling](cards/FA-sibling-rejections.md#fa-58-semantic-kernel) |
| FA-58-FIFO-ENGINE | FIFO, LIFO, or average belong in the generic engine | universal as engine primitive | Evidence that the engine must name those methods to enforce stock truth | issue 58 R-K-02 | [sibling](cards/FA-sibling-rejections.md#fa-58-fifo-engine) |
| FA-58-FISCAL-CODES | CFOP, CST, chave de acesso, or eSocial event codes are engine primitives | universal as engine primitive | Evidence that those codes are generic engine meaning rather than Brazil-domain definitions | issue 58 R-K-03 | [sibling](cards/FA-sibling-rejections.md#fa-58-fiscal-codes) |
| FA-58-SOLVER-AUTHORITY | A solver may be the semantic authority for supply | universal as a law. Positive alternative L-K-08 stays `hypothesis` | A solver whose output is operational truth without an OS Action or Constraint | issue 58 R-K-04 | [sibling](cards/FA-sibling-rejections.md#fa-58-solver-authority) |
| FA-58-NAIVE-INTERPRETER | One naive interpreter is proved sufficient for production posting, replay, search, and filing | universal as a proved sufficiency | The source says this was never a thesis law. Physical-for cards already kill it. Do not treat the kill as a new architecture | issue 58 R-K-05 | [sibling](cards/FA-sibling-rejections.md#fa-58-naive-interpreter) |
| FA-59-FACT-WRITE | Fact is the fundamental write unit | universal as kernel default. Interchange claim stays `hypothesis` | Six independent operational systems whose write API is an elementary fact | issue 59 K1 | [sibling](cards/FA-sibling-rejections.md#fa-59-fact-write) |
| FA-59-UBIQUITOUS-BI | Every stored property or type must carry both temporal axes | universal as metamodel default. Optional as a type capability | A real enterprise domain with published reports, late data, and later corrections that never needs the `valid then` versus `known then` split would attack K5, not automatically restore ubiquitous rectangles | issue 59 K6 | [sibling](cards/FA-sibling-rejections.md#fa-59-ubiquitous-bi) |
| FA-60-HYP-A | Correct typing eliminates every disagreement, so authority is unnecessary | universal as a complete kill of authority | IRR rows after typing already remain. A later catalog that reduces IRR-01 through IRR-04 and IRR-06 would reopen it | issue 60 rejected readings | [sibling](cards/FA-sibling-rejections.md#fa-60-hyp-a) |
| FA-60-HYP-B | A standing canonical-truth layer picks the winner and drops losers | universal as a standing layer | Evidence that winner-merge preserves audit and competing observations | issue 60 rejected readings | [sibling](cards/FA-sibling-rejections.md#fa-60-hyp-b) |
| FA-60-H1-WINNER | Inherit H1 winner tables as domain law | universal as domain law. Integration pattern remains possible | Same as FA-H1 revival for brownfield only | issue 60 rejected readings | [sibling](cards/FA-sibling-rejections.md#fa-60-h1-winner) |
| FA-60-CONFIDENCE | Confidence equals authority | universal | Evidence that a high-confidence chat extract outranks a signed invoice | issue 60 rejected readings | [sibling](cards/FA-sibling-rejections.md#fa-60-confidence) |
| FA-61-BUILD-INFERIOR | Building the semantic core from zero is inferior to reuse | universal for the semantic core | A later independent corpus that already implements Action versus Event versus unknown Effect, bitemporal explanation, fail-closed policy, and posted-history laws under a license OS can use | issue 61 folder verdict. L-006 counterexample X-006 | [sibling](cards/FA-sibling-rejections.md#fa-61-build-inferior) |
| FA-61-PRODUCT-CORE | ERPNext, Frappe, Moqui, Open Foundry, ObjectStack, Ontologiq, or Temporal is the place where Product, Order, Action, Event, and Policy get their meaning | universal as greenfield core | Same as X-006 | issue 61 folder verdict and R-001 through R-004 | [sibling](cards/FA-sibling-rejections.md#fa-61-product-core) |
| FA-61-OPENFGA-CORE | OpenFGA relationship tuples are the OS relationship model | universal as core. Projection stays `hypothesis` | Evidence that OpenFGA tuples can be the ontology relationship without a second admin writer | issue 61 R-005 | [sibling](cards/FA-sibling-rejections.md#fa-61-openfga-core) |
| FA-61-XTDB-FACT | XTDB row bitemporality is the RFC-0001 Fact primitive | universal as primitive identity. Storage class stays `undetermined` | Evidence that one store's row shape is the Fact sort | issue 61 R-006 | [sibling](cards/FA-sibling-rejections.md#fa-61-xtdb-fact) |
| FA-61-MIN-CODE | Minimizing new code is a valid ranking key for build versus reuse | universal as ranking key | A change to constitution rule 5 and the thesis AGI section | issue 61 R-007 | [sibling](cards/FA-sibling-rejections.md#fa-61-min-code) |
| FA-68-EXISTING | An existing platform already satisfies the OS thesis cleanly enough to replace a new core | universal as replace-OS | A platform that enforces competing observations, four date natures, hashed re-read approval, unknown after send, and temporal history without fighting official guidance | issue 68 folder verdict | [sibling](cards/FA-sibling-rejections.md#fa-68-existing) |
| FA-68-VENDOR | OS should vendor or fork an inspected runtime as the MIT core | universal for this pass | A license-clean runtime that already enforces the required properties | issue 68 folder verdict | [sibling](cards/FA-sibling-rejections.md#fa-68-vendor) |
| FA-72-SOR-WHILE-WRITERS | One executable ontology is the system of record for Product, Sales Order, inventory, cash, and fiscal documents while those external writers remain | universal as that reading | Exclusive write and legal capacity for those grains, with bypass treated as a defect | issue 72 folder verdict. L-009 | [sibling](cards/FA-sibling-rejections.md#fa-72-sor-while-writers) |
| FA-72-BLANKET | Blanket materialization of source rows into ontology objects | universal as a default | Evidence that copying Product, Customer, and Sales Order while sources still write removes more models than it adds | issue 72 L-011 and folder verdict | [sibling](cards/FA-sibling-rejections.md#fa-72-blanket) |

## Counts

```text
git grep -c '^| FA-' research/ops/failure-archive/ledger.md
```

Historical seed rows: 6. Sibling rows: 37. Total archived claims: 43.

Regenerate the count after any ledger edit. Do not invent a forty-fourth rejection to make a round number.
