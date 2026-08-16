# Historical seeds

**Kind:** explanation of already-recorded rejections  
**Issue:** <https://github.com/EnzoTironi/OS/issues/81>  
**Primary source:** `docs/hypothesis-history.md` on `origin/main` at `dc918a50e550d384d1e18a6f24424e6ed4595b9c`  
**Rule:** these six claims are the issue 81 seed list. Later sibling notes are cited only when they already mark the same reading `rejected`.

H4 and H5 are not in this file. They are not rejected.

## FA-H0 ERP replacement

### Exact hypothesis

Replace a traditional ERP with a more modern ERP as the product.

```text
Protheus -> ERPNext
```

Agents and ontology sit around that ERP as integrations.

### Decision state

`rejected` as the top-level product framing.

### Rejection scope

Universal for what OS is. ERPNext remains an important source of domain evidence.

### Strongest original support

ERPNext appeared to cover a large portion of commercial, inventory, purchasing, accounting, and manufacturing behavior. It looked more extensible and API-friendly than the incumbent. The practical move was a platform swap.

### Breaking evidence

The framing treated ERP as the fundamental product. That hid the question in `docs/thesis.md`. If enterprise software were designed today with agents and abundant generation capacity, would we still build an ERP as modules and forms around mutable records? The working answer is probably not.

Mature ERPs still encode years of operational edge cases. That asset survived. The product framing did not.

### Issue and artifact references

- `docs/hypothesis-history.md` H0
- `docs/thesis.md` opening question
- Issue 81 seed list
- Issue 61 R-001 and issue 68 folder verdict reject taking ERPNext as the greenfield core. Those are later confirmations, not the original break

### Revival conditions

Revive only if later evidence shows that agents and ontology remain integrations around an ERP, and that this still yields the best operational system. A successful ERPNext deployment does not revive H0. Corpus value was never the rejected part.

### Kind split

- **domain evidence.** Production ERPs encode BOM versus execution, stock movements, submit versus reverse, and partial fulfillment.
- **source-system artifact.** DocTypes, Frappe metadata, and module menus.
- **candidate law.** The primary artifact is not "a better ERP."
- **counterexample.** Treating ontology as an add-on repeats the H0 product mistake.
- **runtime consequence.** Do not start Wave C from an ERP module tree.

### Open questions left untouched

Open question 1 stays `undetermined`. H0's death does not pick the surviving primary artifact.

## FA-H1 ERP plus ontology layering

### Exact hypothesis

Keep a traditional transaction system as one semantic authority and put an operational ontology above it.

```text
sources
   -> operational ontology
   -> governed actions
   -> ERP transactions
```

Product, Order, Action, permission, and lifecycle can live in both layers.

### Decision state

`rejected` as the assumed ideal greenfield architecture. `hypothesis` as an integration architecture for companies that already have an ERP.

### Rejection scope

Context-specific.

### Strongest original support

`Objects + Links + Actions + Policy` is a recognizable software category. Palantir-inspired designs, Open Foundry, Ontologiq, ObjectStack, and similar projects separate semantic or agentic operation from transaction systems. For a company that already runs an ERP, that split looks like the only shippable path.

### Breaking evidence

The architecture assumes two semantic authorities. Hypothesis history says that risks defining Product, Order, Action, permissions, and lifecycle twice.

Issue 55 A-016, read with `git show` at `5f4233579cf3057783775126afa64c39ed631353`, marks a federated OS that still treats an ERP as a second authority as a repeat of H1. Integration architecture remains `hypothesis` for brownfield companies.

Issue 61 L-003, at `d22e3a24b62483ce5274019db0aa9d3aba268d18`, says a second source of business meaning is a failed reuse. Issue 60 rejects inheriting H1 winner tables as domain law.

### Issue and artifact references

- `docs/hypothesis-history.md` H1
- `research/reference-landscape.md` on nearby ontology-plus-transaction designs
- Issue 55 A-016 and R-005
- Issue 60 rejected reading "Inherit H1 winner tables"
- Issue 61 L-003
- Issue 72 folder verdict for the SoR-while-writers reading

### Revival conditions

Revive as greenfield ideal only if Product, Order, Action, permission, and lifecycle can be defined once in the ERP and once in the ontology without drift. Revive as brownfield integration when a named anticorruption map owns the contact, and the ERP remains a foreign system of record. That second revival is the live hypothesis, not a silent acceptance of H1 as OS architecture.

### Kind split

- **domain evidence.** Companies keep ERPs. Dual-write and Business Partner sync offices exist because two writers drift.
- **source-system artifact.** Palantir Funnel, Microsoft dual-write, SAP Customer or Vendor Integration.
- **candidate law.** Two semantic authorities for the same grain is a failed greenfield design.
- **counterexample.** Ontology types that mirror DocTypes and delegate mutation.
- **runtime consequence.** Adapters sit at the boundary. Internal types do not mention Frappe.

### Open questions left untouched

Open question 21 stays `undetermined`. H1's greenfield death does not pick a runtime.

## FA-H2 semantic Packs

### Exact hypothesis

Domain Packs are part of the business model. A company contains a ManufacturingPack, an AccountingPack, a BrazilPack, or similar semantic modules.

### Decision state

`rejected` as a semantic primitive.

### Rejection scope

Universal for ontology meaning. Distribution or namespace packs may still exist as toolchain.

### Strongest original support

Enterprise domains need composability. Country and company concepts must not contaminate a generic runtime. Packs looked like the way to ship manufacturing, accounting, and Brazil without a god-model.

### Breaking evidence

A business does not contain a ManufacturingPack as a real-world entity. Hypothesis history says package or module boundaries may be distribution mechanics. Constitution rule 6 lists packages and modules among things that may be useful without being ontology concepts. RFC-0001 lists Pack among concepts intentionally not proposed as semantic primitives.

Issue 55 R-004 and A-015, at `5f4233579cf3057783775126afa64c39ed631353`, mark Pack-as-ontology `rejected`. Context ontologies are semantic bounds. Distribution packs, if any, are toolchain.

### Issue and artifact references

- `docs/hypothesis-history.md` H2
- `docs/constitution.md` rule 6
- `docs/open-questions.md` question 16
- `rfcs/0001-metamodel-hypothesis.md` Pack exclusion
- Issue 55 R-004 and A-015

### Revival conditions

Revive as a primitive only if later evidence shows a business contains a pack as a real-world entity. Namespaces and versioned modules can still exist without that revival. Open question 16 stays `undetermined` as architecture.

### Kind split

- **domain evidence.** Manufacturing, accounting, and Brazilian fiscal are real domains. They are not packs.
- **source-system artifact.** Module graphs, app stores, and language packages.
- **candidate law.** Pack is not the federation unit and not an ontology type.
- **counterexample.** A model in which ManufacturingPack appears as an entity beside Work Order.
- **runtime consequence.** Do not put `if pack == Brazil` in the generic engine. That is constitution rule 12 in pack clothing.

### Open questions left untouched

Question 16. Packaging may be necessary. It is not yet ontology.

## FA-H2 visible Compiler

### Exact hypothesis

A Compiler is a visible business or ontology concept. Business definitions go through it into kernels and surfaces.

### Decision state

`rejected` as a semantic primitive.

### Rejection scope

Universal for domain meaning. Interpretation, ahead-of-time compilation, generation, and materialization remain legal toolchain techniques.

### Strongest original support

Humans, APIs, and agents should share one business definition. A compiler that emits UI, API, and MCP from that definition looked like the way to keep surfaces from becoming authorities.

### Breaking evidence

Hypothesis history says Compiler may be an implementation detail. The engine may interpret, generate, cache, materialize, or compile different parts. Constitution rule 6 lists compiler phases among mechanics that are not ontology concepts. RFC-0001 lists Compiler among concepts intentionally not proposed as semantic primitives. Thesis "What is explicitly not decided" includes whether a compiler exists as a visible concept.

### Issue and artifact references

- `docs/hypothesis-history.md` H2
- `docs/thesis.md` explicit non-decisions
- `docs/constitution.md` rule 6
- `docs/open-questions.md` question 17
- `rfcs/0001-metamodel-hypothesis.md` Compiler exclusion

No sibling Wave A note in the fetched set marked a new Compiler rejection beyond those documents. The archive does not invent one.

### Revival conditions

Revive as a primitive only if compilation itself carries domain meaning that interpretation, generation, or materialization cannot express. A later choice to generate SDKs or SQL does not revive Compiler as ontology.

### Kind split

- **domain evidence.** Shared Actions across surfaces. That need survived.
- **source-system artifact.** Compiler phases, generated code, SDK bounds.
- **candidate law.** Visibility of a compiler is not business meaning.
- **counterexample.** A domain invariant that can be stated only as a compiler pass.
- **runtime consequence.** Wave B may compile. It must not add Compiler to the metamodel because it compiled.

### Open questions left untouched

Question 17. Maybe there is a compiler. That may stay a toolchain detail.

## FA-H2 separate deterministic kernels

### Exact hypothesis

Accounting, inventory, manufacturing, and fiscal sit in Deterministic Kernels below the ontology. The ontology is for objects, links, actions, and policies. The kernels protect hard invariants from agent reasoning.

### Decision state

`rejected` as a semantic kernel. `supported` later, by issue 58, as a specialized physical evaluator that executes ontology-defined Functions and Constraints.

### Rejection scope

Context-specific. The second business model is dead. A physical evaluator is live.

### Strongest original support

An AI model must not improvise accounting equality, stock valuation, or BOM explosion. Putting those in a named kernel looked like the only way to keep them deterministic. The H2 diagram placed those kernels under a compiler.

### Breaking evidence

An AccountingKernel below the ontology creates a second business model. Thesis section "Determinism belongs inside the business model" keeps the requirement and drops the layer. Determinism is a property of logic and enforcement. RFC-0001 lists Deterministic Kernel among concepts intentionally not proposed as semantic primitives.

Issue 58 folder verdict, at `b825a15f3f9c8e2471dbb4a2bb641af595ef0cef`, marks a specialized semantic kernel as a second business authority `rejected` on present evidence. R-K-01 through R-K-04 record the same kill for accounting, inventory, MRP, fiscal codes, and solver authority. Whether OS must ship physical evaluators as first-class engine modules stays `undetermined`.

### Issue and artifact references

- `docs/hypothesis-history.md` H2
- `docs/thesis.md` determinism section
- `rfcs/0001-metamodel-hypothesis.md` Deterministic Kernel exclusion
- Issue 58 README, R-K-01 through R-K-04, and `boundary.md`

### Revival conditions

Revive a semantic kernel only if a domain's invariants cannot be stated as Functions, Constraints, Actions, and Facts inside the ontology without a second business model. A slow interpreter does not revive the kernel. That is a physical problem. Issue 58 already rejected "one naive interpreter is proved sufficient" as a law, and also rejected minting a semantic primitive to fix that slowness.

### Kind split

- **domain evidence.** Debit equals credit. Stock quantity is not automatically a ledger event. FIFO layers move when an earlier posting arrives.
- **source-system artifact.** Named valuation engines, MRP solvers, fiscal posting modules.
- **candidate law.** Deterministic logic lives in the ontology. A kernel that owns accounts or tax codes is a second authority.
- **counterexample.** A specialized inventory-accounting kernel that always posts quantity and valuation together, erasing a supported split.
- **runtime consequence.** Wave B may host a layer walker or signer after a written mapping. Failure of the issue 58 boundary tests is a semantic kernel and stays rejected.

### Open questions left untouched

Question 9. Function, Constraint, and Policy may still collapse or stay distinct. Issue 58 R-K-06 refuses to close that question.

## FA-H3 Frappe as foundation

### Exact hypothesis

Make Frappe or ERPNext the core of the Business OS. Add first-class links, actions, agent identities, action policies, provenance, temporal semantics, and agent tooling on top of DocTypes, generated UI, and ERPNext behavior.

### Decision state

`rejected` as an assumed greenfield foundation. ERPNext is promoted to a primary research corpus.

### Rejection scope

Universal as foundation. Corpus use is the surviving status.

### Strongest original support

Frappe already provides metadata-driven DocTypes, APIs, permissions, and UI generation. ERPNext already contains rich enterprise behavior. If ERPNext were written today, UI would likely be one surface and business verbs would likely beat generic CRUD. Starting there looked cheaper than a new core.

### Breaking evidence

Choosing Frappe as foundation inherits its schema, storage assumptions, lifecycle semantics, and application-era abstractions before those things survive evidence. Constitution rule 5 says code cost is not the primary optimization target. Hypothesis history H3 records the rejection. H5 keeps the corpus.

Issue 61 R-001, at `d22e3a24b62483ce5274019db0aa9d3aba268d18`, marks ERPNext or Frappe as the greenfield semantic core `rejected`. Issue 68 marks vendor or fork of inspected runtimes as the MIT core `rejected` for this pass. ERPNext is GPL. That is a licensing bound from issue 69, not a new semantic kill.

### Issue and artifact references

- `docs/hypothesis-history.md` H3 and H5
- `docs/constitution.md` rules 5 and 16
- `docs/thesis.md` "Mature ERPs are evidence, not foundations by default"
- Issue 61 R-001
- Issue 68 vendor or fork claim
- Issue 69 license register, cited only for the GPL fact

### Revival conditions

Revive as foundation only if a later independent note shows that Frappe's schema, storage, and lifecycle already enforce the surviving thesis laws under a license OS can use. Rich coverage and a familiar desk UI do not meet that bar.

### Kind split

- **domain evidence.** ERPNext distinctions such as Work Order versus Job Card remain research inputs.
- **source-system artifact.** DocType, Controller, `submit`, `cancel`, desk forms.
- **candidate law.** Mine the corpus. Do not inherit the application as the metamodel.
- **counterexample.** Mapping each DocType to an ontology type, which constitution rule 2 already forbids as an assumption.
- **runtime consequence.** Wave B adapters may speak to Frappe. Internal types must not.

### Open questions left untouched

Question 21 stays `undetermined`. Rejecting Frappe as foundation is not a decision to build every physical engine from scratch.
