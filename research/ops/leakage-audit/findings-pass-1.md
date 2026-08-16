# Findings pass 1. Specs and sibling research

- Artifact ID: `issue-0083-leakage-audit-pass-1`
- Issue: <https://github.com/EnzoTironi/OS/issues/83>
- Parent: <https://github.com/EnzoTironi/OS/issues/2>
- Research angle: first leakage and hiding pass from `origin/main` specs plus sibling Wave A notes
- Decision states present: `hypothesis`, `supported`, `rejected`, `undetermined`

This file is reference. It does not tell you how to review. That is [heuristics.md](heuristics.md).

No runtime engine exists on `origin/main` at `dc918a50e550d384d1e18a6f24424e6ed4595b9c`. A claim that the engine is clean is `rejected` as a move. The engine is absent.

## 1. Question

Can OS keep a generic engine if reviewers can already see domain-named branches and hidden generic duties in the specs and in sibling research, before any runtime is written?

## 2. Source scope

Examined:

- `origin/main` docs, RFC-0001, scenarios, and research README at `dc918a50e550d384d1e18a6f24424e6ed4595b9c`
- Issue 83 body. No comments.
- Sibling notes listed in [sources.md](sources.md), via `git show` only

Not examined:

- A runtime tree. None on `origin/main` outside vendored skills
- Copyleft product source trees
- Live Palantir, CONFAZ, or IFRS pages. Those claims are cited through sibling evidence cards
- Sibling domains 16 through 29 except where a kill-test or ops note already quotes them

## 3. Evidence

### E-001 Thesis already states the engine rule

- Grade: `design-claim`
- Claim supported: the working thesis wants a generic engine and domain behavior in the model
- Citation: `docs/thesis.md@dc918a50e550d384d1e18a6f24424e6ed4595b9c#L159`
- Observation: "The engine should remain generic. Domain-specific behavior should be represented in the model rather than hard-coded into the engine."
- Limits: a thesis sentence is not enforcement. The same page draws commerce, inventory, manufacturing, accounting, logistics, fiscal, CRM, and HR under one box at `#L142-L157`.

### E-002 Constitution forbids company branches

- Grade: `design-claim`
- Claim supported: organization-specific logic does not belong in the generic engine
- Citation: `docs/constitution.md@dc918a50e550d384d1e18a6f24424e6ed4595b9c#L114-L124`
- Observation: rule 12 names `if company == X` as the forbidden shape. Rule 6 at `#L63-L77` already splits packages, caches, and generated code from ontology concepts.
- Limits: the rule does not yet name fiscal codes or ERP field names. Issue 83 extends the smell list.

### E-003 Open question 15 names the type-dispatch smell

- Grade: `design-claim`
- Claim supported: `if objectType == "PurchaseOrder"` inside the generic engine is already recorded as a smell
- Citation: `docs/open-questions.md@dc918a50e550d384d1e18a6f24424e6ed4595b9c#L274-L294`
- Observation: the exact engine-versus-ontology cut is still an open question. The smell is not.
- Limits: this folder must not answer question 15. The smell is usable as a review heuristic.

### E-004 RFC-0001 dropped semantic kernels and asked for engine-stable extensions

- Grade: `design-claim`
- Claim supported: Pack, Compiler, and Deterministic Kernel are not current primitive candidates. Target 12 asks whether domain extensions can land without changing the generic engine.
- Citation: `rfcs/0001-metamodel-hypothesis.md@dc918a50e550d384d1e18a6f24424e6ed4595b9c#L275-L318`
- Observation: H2's AccountingKernel path is already weakened in `docs/hypothesis-history.md` at `#L61-L90`.
- Limits: an exclusion from a hypothesis RFC is not a proved law.

### E-005 H2 is the leakage pattern the project already walked into

- Grade: `design-claim`
- Claim supported: named kernels for accounting, inventory, manufacturing, and fiscal sat under the ontology and were dropped because they became a second business model
- Citation: `docs/hypothesis-history.md@dc918a50e550d384d1e18a6f24424e6ed4595b9c#L50-L90`
- Observation: the useful residue was determinism inside the model, not a kernel layer.
- Limits: history of this repo, not independent domain proof.

### E-006 Sibling 58 rejects semantic kernels and keeps physical evaluators

- Grade: `inference`
- Claim supported: business meaning stays in ontology Functions, Constraints, Actions, and Facts. A physical evaluator may run those statements and may not invent accounts or tax codes.
- Citation: `origin/cursor/issue-58-kill-cfd8:research/kill/specialized-kernels/candidate-laws.md` at `b825a15f3f9c8e2471dbb4a2bb641af595ef0cef`, laws L-K-01, L-K-02, L-K-03, L-K-09, rejected R-K-01 and R-K-03
- Observation: the sibling verdict rejects a specialized semantic kernel and supports a specialized physical evaluator as a class. Palantir Language versus Engine is recorded there as E-005, citing https://palantir.com/docs/foundry/architecture-center/ontology-system/ retrieved 2026-08-16.
- Limits: this pass did not re-fetch Palantir. Wave B product picks stay `undetermined`.

### E-007 Sibling 30 keeps Brazil codes out of the engine

- Grade: `inference`
- Claim supported: CFOP, CST, CSOSN, CRT, CEST, NCM or TIPI, model numbers, and access-key format are Brazil encodings of generic facts
- Citation: `origin/cursor/issue-30-domain-cfd8:research/domain/fiscal/candidate-laws.md` at `f29429685adc04f4e8b3787618ad2edce77f549b`, CL-010, CL-003, CL-005
- Observation: CL-003 says the authorized signed XML is the fiscal document, not DANFE and not an ERP invoice number. CL-005 says authorization is an external authority event that can finish unknown.
- Limits: this pass did not re-fetch CONFAZ or Planalto. Type cut for commercial invoice versus fiscal document stays `undetermined` on that sibling as OQ-001.

### E-008 Sibling 55 rejects homonym types as one engine case

- Grade: `inference`
- Claim supported: a shared English word is not a shared type. Work Order, Product, Customer, and Inventory quantity are false cognates across contexts.
- Citation: `origin/cursor/issue-55-kill-cfd8:research/kill/unified-ontology/candidate-laws.md` at `5f4233579cf3057783775126afa64c39ed631353`, L-001, L-002. Attack A-010 in `attacks.md` on the same SHA
- Observation: ERPNext Work Order is authorization. Odoo Work Order is operation execution. One engine `switch` on that word leaks a vendor schema.
- Limits: the sibling keeps a shared metamodel as `hypothesis`. This folder does not settle open question 1.

### E-009 Sibling 79 rejects ERP leftovers as kernel laws

- Grade: `inference`
- Claim supported: inventory movement is not the fulfillment primitive. A one-shot sales order is not the commercial primitive. Consume-and-produce is not the only process. Leftover demand is not only unshipped quantity.
- Citation: `origin/cursor/issue-79-ops-cfd8:research/ops/cross-industry/candidate-laws.md` at `e6c8593c72a097695a1b3e0836356916e98ebd3b`, L-01, L-04, L-05, L-10, and the rejected-laws table
- Observation: the sibling already writes "No `if objectType == "SalesOrder"` and no `if objectType == "WorkOrder"` in a generic engine."
- Limits: encoding of remainders and rights bundles stays `hypothesis` there.

### E-010 Sibling 72 treats a copied NF-e as a second document

- Grade: `inference`
- Claim supported: OS must not mint or own a second identity for a document whose legal existence is issued elsewhere
- Citation: `origin/cursor/issue-72-kill-cfd8:research/kill/semantic-duplication/candidate-laws.md` at `190e4b9ac4aa97422df91a8579ab0e6b33539d34`, L-005, L-008
- Observation: writeback without two-phase commit can finish unknown. A stored editable copy of an authorized NF-e is leakage of legal identity into the engine's object store.
- Limits: bank postings and marketplace order ids are `hypothesis` on that sibling.

### E-011 Sibling 8 splits bind loci from boolean bodies

- Grade: `inference`
- Claim supported: read, preview, commit, effect, and projection are different moments. A boolean Function plus fail-closed is not enough. Preview does not authorize commit.
- Citation: `origin/cursor/issue-8-foundation-cfd8:research/foundation/logic/enforcement-loci.md` and `candidate-laws.md` at `d064a310579ac8bc78d744e089c7eb5076dfd585`, L1, L2, L4
- Observation: if those loci exist only as Frappe `validate` on one DocType, a generic facility is hiding in a source artifact.
- Limits: open question 9 is not answered. The sibling says so.

### E-012 Sibling 32 records Frappe status and ledger rules as source artifacts

- Grade: `inference`
- Claim supported: `docstatus`, submit, cancel, amend, and close are Frappe encodings of posted-history laws
- Citation: `origin/cursor/issue-32-corpus-cfd8:research/erpnext/invariants.md` at `d91c62dd9ee94a0639c2eba3b789b10c3d6c5715`, INV-DOC-01 through INV-DOC-03, INV-LEDGER-01 through INV-LEDGER-04
- Observation: posted documents do not return to draft. Close is not cancel. Ledger rows are not independently cancellable. Commitment documents do not post stock or GL. Those distinctions are domain evidence. The integer `docstatus` is a source artifact.
- Limits: this pass did not open the ERPNext tree. Licensing stays conceptual.

### E-013 Sibling 3 keeps role names out of the identity key

- Grade: `inference`
- Claim supported: Supplier, Customer, and Employee do not supply identity
- Citation: `origin/cursor/issue-3-foundation-cfd8:research/identity-kinds-roles/candidate-laws.md` at `8b9ce1ee5e5a09e556f5442de826e6062c55abfa`, L1, L4
- Observation: an engine that keys an organization on a Supplier code, or that puts `Supplier` in the Interface slot, leaks a commercial label into identity.
- Limits: whether Relator is a native sort stays `undetermined` there.

### E-014 Sibling 61 rejects reuse of an ERP as the semantic core

- Grade: `inference`
- Claim supported: adopting ERPNext, Frappe, Moqui, or an ontology product as the place where Product and Order get their meaning creates a second authority
- Citation: `origin/cursor/issue-61-kill-cfd8:research/kill/build-vs-reuse/README.md` at `d22e3a24b62483ce5274019db0aa9d3aba268d18`
- Observation: reuse of a physical mechanism behind a replaceable boundary is the surviving class. That matches E-006.
- Limits: open question 21 stays open.

### E-015 Origin main has no engine to audit

- Grade: `test`
- Claim supported: this pass cannot be a runtime leakage audit
- Citation: `origin/main` at `dc918a50e550d384d1e18a6f24424e6ed4595b9c`. Command: `git ls-tree -r --name-only origin/main` filtered away from `pstack/`, `cursor-team-kit/`, and `.cursor/`. Remaining paths are docs, RFC, scenarios, research README, LICENSE, SOURCES.md, and plugin marketplace metadata.
- Observation: the durable product of issue 83 on this SHA is heuristics plus spec findings.
- Limits: later passes must rerun the tree listing.

### E-016 Issue 83 lists HF without a definition on origin/main

- Grade: `design-claim`
- Claim supported: reviewers must treat `HF` as an undefined company or product token
- Citation: <https://github.com/EnzoTironi/OS/issues/83> created 2026-08-15. Search of `origin/main` docs and RFC for `\bHF\b` returned no expansion.
- Observation: inventing a meaning would be an invented answer.
- Limits: a later note may define the token. Until then the class is `undetermined` and the review rule is the same as constitution §12.

## 4. Domain evidence

Independent domains already share a small set of duties that do not name a company.

Posted history is not rewritten in place. Accounting compensating rows, fiscal registered events, and UFO-B "events do not change" agree. That is a world distinction.

An attempted intervention is not an observed occurrence. Commerce, care, insurance, and public cases agree in sibling 79.

A commercial or workforce label is not the enduring party. Party, HR, and cross-industry notes agree.

A legal document issued by an authorizer is not an ERP row. Brazilian NF-e is the sharp case. Marketplace and bank identities are the same shape and still `hypothesis`.

Those distinctions are why hiding is possible. If the engine lacks the duty, one domain module will grow a private kernel.

## 5. Source-system artifacts

Do not promote these tokens into engine cases.

- Frappe `docstatus`, `is_submittable`, `update_after_submit`, `ignore_linked_doctypes`
- ERPNext Customer and Supplier DocTypes kept separate for module behavior
- Odoo `Location Type` values Vendor, Customer, Transit, Production, Inventory Loss
- Odoo Work Order as operation execution
- DANFE, chave de acesso format, CFOP `5102`, eSocial `S-1200`, SPED file names
- Palantir Language, Engine, Toolchain, Scenario, Funnel
- TigerBeetle Transfer
- Dual-write, CVI, `doInsert`
- `ManufacturingPack`, `BrazilPack`, `AccountingKernel`
- `HF` until defined

A sibling that uses those words as observations is not leaking. An engine `switch` on them is.

## 6. Concepts

### C-001 Leakage

- Source term: issue 83 "domain-to-engine leakage"
- Domain distinction: business-specific behavior encoded in generic runtime control flow
- Evidence: E-001, E-002, E-003, E-007, E-008, E-009
- Source-specific form: `if objectType == "PurchaseOrder"`
- Alternative interpretations: a temporary compiler specialization that still quotes a definition. That is C-003 if the tests pass.
- Decision state: `supported` as a review class

### C-002 Hiding

- Source term: issue 83 "hiding required generic enforcement inside one domain module"
- Domain distinction: a duty required in more than one domain, implemented in only one module because the engine cannot say it
- Evidence: E-006, E-011, E-012, E-013
- Source-specific form: Frappe `validate` on one DocType, or an AccountingKernel that owns debit-equals-credit
- Alternative interpretations: genuine jurisdictional uniqueness. Brazil CFOP tables fail this alternative because purpose plus jurisdiction is the generic fact.
- Decision state: `supported` as a review class

### C-003 Evaluator

- Source term: sibling 58 "physical evaluator"
- Domain distinction: a replaceable job that executes a visible definition and invents no meaning
- Evidence: E-006, E-014
- Source-specific form: Palantir Engine, a ledger store, a signer, a solver
- Alternative interpretations: H2 Deterministic Kernel. Rejected by E-004 and E-005.
- Decision state: `supported` as a class. Which evaluators to ship is `undetermined`

### C-004 Facility

- Source term: issue 83 "legitimate generic facilities"
- Domain distinction: a duty the engine may know by metamodel form
- Evidence: E-001, E-002, E-011
- Source-specific form: transaction, time, policy, typed relation. This pass also lists Action versus Event, Constraint bind, provenance, revision pin, and unknown Effect because siblings already treat them as cross-domain.
- Alternative interpretations: each of those might still collapse. Open questions 5, 7, 8, and 9 own the collapses.
- Decision state: `hypothesis` for the exact list. `supported` that the class exists

## 7. Invariants

### I-001 Engine dispatch is by form, not by domain name

- Statement: generic runtime control flow may key on Action, Event, Constraint, Policy, or revision. It may not key on a business type name, country, company, fiscal code, or ERP field.
- Scope: any code or spec claimed as engine or metamodel
- Evidence: E-002, E-003, E-007, E-009
- Failure case: a Brazil-only posting path that other jurisdictions cannot express
- Falsifier: a domain name that is the only safe way to enforce a duty that composition cannot state
- Decision state: `supported` as a review invariant. Not an RFC edit

### I-002 A posted individual is not updated in place

- Statement: correction of a posted fact, event, or authorized document adds a compensating or superseding record
- Scope: posted ledgers, authorized fiscal documents, observed events
- Evidence: E-007, E-012, sibling 3 L8
- Failure case: silent rewrite of authorized XML or GL rows
- Falsifier: a first-party legal procedure that replaces the same protocol in place and keeps audit
- Decision state: `supported` as domain evidence. Engine encoding `undetermined`

### I-003 Preview bind does not satisfy commit bind

- Statement: an approval or dry-run must rebind on the world that will persist
- Scope: any Action with a delay between proposal and commit
- Evidence: E-011, `scenarios/README.md` S-003 at `dc918a50e550d384d1e18a6f24424e6ed4595b9c`
- Failure case: stale approval posts after intervening receipts
- Falsifier: a domain where the approved parameter hash is sufficient and re-read is illegal
- Decision state: `supported` as a scenario demand. Primitive word `undetermined`

## 8. Candidate laws

### L-001 Domain-named branch in the generic engine is leakage

- Statement: a control-flow branch on a business type, country, company token, fiscal code, ERP field, or copied status word inside the generic engine is domain leakage
- Evidence: E-002, E-003, E-007, E-008, E-009, E-016
- Independent convergence: constitution §12, open question 15 smell, sibling 30 CL-010, sibling 79 runtime pressure, sibling 55 A-010
- Known limits: test fixtures and ontology files may use those names
- Counterexamples: X-001, X-002
- Decision state: `supported`

### L-002 Semantic specialization is not physical specialization

- Statement: domain definitions may be specialized. Runtime evaluators may be specialized. A named semantic kernel is a second business authority and is rejected
- Evidence: E-004, E-005, E-006, E-014
- Independent convergence: sibling 58 L-K-01 and L-K-02, Palantir Language versus Engine as recorded there, constitution §6
- Known limits: which evaluators OS ships is Wave B
- Counterexamples: X-003
- Decision state: `supported`

### L-003 A generic duty in only one domain module is hiding

- Statement: if a second independent domain needs the same refusal, time cut, unknown outcome, or identity rule, and only one module implements it, the engine is missing a facility
- Evidence: E-006, E-009, E-011, E-012, E-013
- Independent convergence: debit equals credit in 58 and 32, Action versus Event in thesis and 79, unknown Effect in 30 and 72, role versus kind in 3 and 79
- Known limits: a duty that never leaves one jurisdiction may stay in that ontology. CFOP tables are the example. CFOP dispatch in the engine is still L-001.
- Counterexamples: X-004
- Decision state: `supported` as a detection law. Which missing facility to add stays `undetermined`

### L-004 Source tokens are not engine cases

- Statement: document names, fiscal codes, and ERP fields stay source artifacts until independent sources converge on the distinction, never on the token
- Evidence: E-007, E-008, E-012
- Independent convergence: research README quality bar, constitution §2, sibling 55 Work Order split
- Known limits: a distinction can be promoted while the token stays rejected. Posted-versus-draft is promotable. `docstatus` is not.
- Counterexamples: X-002
- Decision state: `supported`

### L-005 Homonym collapse is leakage without an if-statement

- Statement: one engine type or one status field that absorbs Product, Work Order, Inventory quantity, or delivery date across contexts leaks even if no `if` appears
- Evidence: E-008, E-009, open question 3 caution on `delivery_date`
- Independent convergence: sibling 55 L-001, sibling 72 L-006
- Known limits: a word that survives every consumer with the same grain may be shared. LegalPerson is a candidate on sibling 55. Product is not.
- Counterexamples: X-005
- Decision state: `supported`

### L-006 Absence of runtime is not a clean audit

- Statement: heuristics and spec findings are the valid Wave A product. A report that the engine has no leakage because no engine exists is false
- Evidence: E-015
- Independent convergence: issue 83 acceptance, constitution §18 falsifiability
- Known limits: later passes must audit code when it exists
- Counterexamples: none needed
- Decision state: `supported`

## 9. Counterexamples

### X-001 Fixture that names PurchaseOrder

- Targets: L-001
- Setup: a test constructs a `PurchaseOrder` to invoke a generic `Commit` Action
- Falsifying result: the heuristic flags the fixture as engine leakage
- Observed result: not run. The heuristic in `heuristics.md` excludes fixtures
- Consequence: narrow L-001 to engine or metamodel control flow
- Decision state: `hypothesis`

### X-002 Brazil ontology file that stores CFOP

- Targets: L-001, L-004
- Setup: a domain definition contains dated CFOP tables the model can print
- Falsifying result: the heuristic demands those tables leave the repo
- Observed result: sibling 30 treats the tables as domain extensions and forbids only engine primitives
- Consequence: keep L-001 pointed at engine dispatch
- Decision state: `supported`

### X-003 Ledger store that refuses imbalance

- Targets: L-002
- Setup: a store aborts a posting whose debits do not equal credits and does not know `JournalEntry`
- Falsifying result: issue 58 would call that a semantic kernel
- Observed result: sibling 58 L-K-03 calls the Constraint the law and the store an evaluator
- Consequence: do not flag the store. Flag a store that invents a suspense account the model did not name
- Decision state: `supported`

### X-004 Second domain needs the same refusal

- Targets: L-003
- Setup: fiscal books and intercompany ledgers need refuse-closed balance. Only an accounting module implements it
- Falsifying result: reviewers call the accounting module a successful localization
- Observed result: sibling 58 and 32 already treat the Constraint as cross-domain. Sibling 31 is cited by 55 for intercompany as two legal events
- Consequence: file hiding, not a Brazil or accounting exception
- Decision state: `supported` as a test. Intercompany evidence was read only through sibling 55

### X-005 Shared LegalPerson

- Targets: L-005
- Setup: two contexts use LegalPerson with the same identity grain
- Falsifying result: L-005 forbids any shared type name
- Observed result: sibling 55 already carves this as a possible shared kind
- Consequence: L-005 applies to homonyms, not to surviving kinds
- Decision state: `hypothesis` for LegalPerson. `supported` for Product, Work Order, and delivery_date

## 10. Disagreements

### D-001 One ontology box versus context modules

- Claim A: `docs/thesis.md@dc918a50e550d384d1e18a6f24424e6ed4595b9c#L142-L157` draws many domains under one executable ontology
- Claim B: `origin/cursor/issue-55-kill-cfd8` L-001 rejects one type per shared word and treats one organizational ubiquitous language as dead
- Conflict: interpretation of "one executable ontology"
- Evidence for A: E-001
- Evidence for B: E-008
- Possible explanation: shared metamodel plus context ontologies still fits the thesis sentence at `#L159` and fails the diagram if the diagram is read as one Product type
- Resolution test: synthesis on open question 1. Not this folder
- Status: `open`
- Resolution: unresolved. No RFC edit

### D-002 Function collapse versus bind

- Claim A: RFC-0001 and open question 9 float Constraint and Policy as Functions plus enforcement
- Claim B: sibling 8 L1 says a boolean body is not a logic form
- Conflict: interpretation of how many logic forms the engine must know
- Evidence for A: `docs/open-questions.md` question 9
- Evidence for B: E-011
- Possible explanation: one expression IR plus visible binds
- Resolution test: belongs to issue 8 and open question 9
- Status: `open`
- Resolution: unresolved. Reviewers must not collapse Policy into Function in a leakage comment

## 11. Runtime consequences

### R-001 Dispatch by metamodel form

- If claim survives: L-001, I-001
- Required property: engine code can be searched for domain tokens and the hits are fixtures, comments, or ontology data
- Evidence: E-003, E-009
- Non-requirement: a particular language, database, or workflow product
- Decision state: `hypothesis` until a runtime tree exists

### R-002 Evaluators quote definitions

- If claim survives: L-002, C-003
- Required property: every evaluator result names the Function, Constraint, or Action revision. No sealed tax or account table
- Evidence: E-006
- Non-requirement: TigerBeetle, PVA, or a named solver
- Decision state: `supported` as a test. Product pick `undetermined`

### R-003 Findings feed the metamodel

- If claim survives: L-003, L-006
- Required property: a hiding finding names the missing facility as pressure on RFC-0001 without editing the RFC
- Evidence: issue 83 body, E-004
- Non-requirement: a cleanup-only ticket
- Decision state: `supported`

### R-004 Wave B waits for this cut

- If claim survives: L-002
- Required property: runtime recommendations start from evaluator tests, not from AccountingKernel or BrazilPack
- Evidence: E-006, E-014
- Non-requirement: a freeze on all implementation experiments
- Decision state: `hypothesis`

## 12. Dependent research

Consumed, cite-only:

- `origin/cursor/issue-58-kill-cfd8` specialized kernels
- `origin/cursor/issue-55-kill-cfd8` unified ontology
- `origin/cursor/issue-30-domain-cfd8` fiscal
- `origin/cursor/issue-79-ops-cfd8` cross-industry
- `origin/cursor/issue-72-kill-cfd8` semantic duplication
- `origin/cursor/issue-8-foundation-cfd8` logic binds
- `origin/cursor/issue-32-corpus-cfd8` ERPNext invariants
- `origin/cursor/issue-3-foundation-cfd8` identity
- `origin/cursor/issue-61-kill-cfd8` build versus reuse

Related, not consumed as premises:

- issue 5 temporal, issue 7 Action versus Event versus Effect, issue 9 revision, issue 14 party, issue 15 product, issue 36 operational runtimes, issue 69 licensing

This note does not copy those trees.

## 13. Open questions

See [open-questions.md](open-questions.md). Numbered questions in `docs/open-questions.md` stay `undetermined` here.

## 14. Licensing

Concepts and behavior only. No implementation reuse. ERPNext and Odoo were not cloned. Sibling folders were read with `git show` only.
