# How to review for domain-to-engine leakage

**Kind.** how-to  
**Issue.** [83](https://github.com/EnzoTironi/OS/issues/83)  
**Fetched.** 2026-08-16  
**Decision.** `supported` as a review procedure. Individual findings keep their own state.

Use this file when a spec, RFC fragment, research note, or later runtime diff might put business behavior in the generic engine, or hide a generic duty inside one domain module.

A review is done when every named type, country, status word, fiscal code, ERP field, and company token in the change has a class, and every `leakage` or `hiding` has a finding card with a decision state.

Do not treat "it compiles" as a pass. The finding is the proof.

## Classify first

Give each token one class.

**Facility.** A generic duty the engine may know by metamodel form. Transactions, valid time, knowledge time, policy bind, typed relations, identity correspondence, Action versus Event, Function evaluation, Constraint bind, provenance, ontology-revision pinning, and an Effect that can finish unknown. The engine may enforce these without naming a business type.

**Domain.** A company, country, industry, source document, fiscal code, ERP field, or status word. `PurchaseOrder`, `Brazil`, `Inventory` as fulfillment, `HF`, `CFOP`, `docstatus`, `delivery_date`, `Draft`. These belong in ontology definitions or in dated tables the model can print.

**Evaluator.** A physical job that runs a definition it does not own. A ledger store that refuses imbalance, a BOM walker, a signer, a solver, a decimal engine. Allowed only if it quotes the Function, Constraint, or Action revision and has no private accounts, formulas, or tax codes.

**Hiding.** A facility implemented in only one domain module. The module looks localized. The missing piece is engine-wide.

If you cannot pick a class, mark the token `undetermined` and file a finding. Do not guess `HF` into a company name. Issue 83 lists that token. `origin/main` does not define it.

## Run the two questions

1. **Rename test.** Replace the type name with an unknown word. If the engine branch still has a reason to exist, you found a facility. If the branch dies, you found leakage.
2. **Second-domain test.** Name a second domain that needs the same refusal, the same time cut, or the same unknown outcome. If only one module implements it, you found hiding.

Examples.

- `if objectType == "PurchaseOrder" then reserve stock` fails the rename test. Leakage.
- `if Constraint Bind at commit is false then abort` survives a rename. Facility.
- Debit equals credit implemented only inside an accounting pack fails the second-domain test once fiscal books and intercompany ledgers need the same refusal. Hiding.
- A Brazil module that stores CFOP as dated table data survives both tests. Domain definition, not engine.

## Flag these branches

Treat a match as a candidate finding, not as a conviction.

**Type-name dispatch.** `PurchaseOrder`, `SalesOrder`, `WorkOrder`, `JournalEntry`, `Invoice`, `NF-e`, `Employee`. Sibling issue 55 records that ERPNext Work Order is authorization and Odoo Work Order is operation execution. A shared engine case on that word is already wrong.

**Country or legal-system dispatch.** `Brazil`, `SEFAZ`, `SPED`, `eSocial`, a UF code. Sibling issue 30 keeps CFOP, CST, CSOSN, CEST, and NCM in Brazil extensions.

**Industry dispatch that smuggles a fulfillment law.** `if Inventory then fulfilled`. Sibling issue 79 rejects inventory movement as the fulfillment primitive. Subscriptions, coverages, visits, and cases satisfy commitments without a stock move.

**Company or product token.** `if company == X` is constitution §12. Treat `HF` and any unmatched two-letter tenant code the same way until a note defines the token.

**Status-word dispatch.** `Draft`, `Submitted`, `Cancelled`, `docstatus`. Sibling issue 32 records those as Frappe artifacts. Close is not cancel. Amend does not revive. A generic `set status` API is the leak.

**Fiscal-code dispatch.** `if cfop == "5102"`, CST, CSOSN, CRT, chave de acesso. Sibling issue 30 CL-010 and issue 58 R-K-03 reject these as engine cases.

**ERP field-name dispatch.** `delivery_date`, `per_delivered`, `per_billed`, `is_cancelled`. Open question 3 already warns that `requestedDate`, `promisedDate`, `plannedDate`, and `actualDate` must not share one field because a source called them all `delivery_date`.

**Hard-coded workflow.** Three-way match, Anglo-Saxon posting, FIFO, LIFO, or eSocial S-1200 compiled into engine control flow. Sibling issue 58 keeps those as dated Functions or external Effects.

**Pack as ontology.** `ManufacturingPack`, `BrazilPack`, `AccountingKernel`. RFC-0001 already dropped Pack, Compiler, and Deterministic Kernel as semantic primitives. Sibling issue 55 A-015 rejects Pack as the federation unit.

## Flag these hidings

A domain module is hiding a facility when it is the only place that does one of the following.

**Refuse-closed balance.** Accounting today. Intercompany and fiscal books tomorrow. Sibling issue 58 L-K-03 and issue 32 INV-LEDGER-03.

**Append-only posted history.** GL cancel writes compensating rows. NF-e cancel is a new event. Sibling issue 30 CL-006 and issue 32 INV-LEDGER-02. If only one module can refuse in-place edit of a posted fact, the engine lacks that bind.

**Action is not Event.** Commerce today. Care, insurance, energy, and public cases in issue 79 L-01. If only sales implements the cut, hiding.

**Preview is not commit.** Scenario S-003. Sibling issue 8 L4. If only one approval screen rebinds, hiding.

**Unknown Effect.** SEFAZ authorization, marketplace writeback, bank posting. Sibling issue 30 CL-005, issue 72 L-008, constitution §9. If only fiscal can finish unknown, hiding.

**Role is not Kind.** Customer, Supplier, Employee, patient, insured. Sibling issue 3 L1 and issue 79 L-13. If only the party folder enforces it, hiding.

**Remainder is a projection.** Unshipped quantity is one remainder. Remaining period, coverage, entitlement, and case work are others. Sibling issue 79 L-05. A single `qty_left` column on every type is leakage. Computing remainder only for sales orders is hiding.

**Read, preview, commit, effect, and projection are different loci.** Sibling issue 8. If a DocType `validate` hook is the only bind, hiding.

**Correspondence is not substitution.** Cross-context identity. Sibling issue 55 L-001 and A-008. If only fiscal stores a chave de acesso as a second key, hiding.

## Allowed engine knowledge

The engine may know these forms without a domain name.

- Typed objects, links, and object-backed relations.
- Named Actions with preview and commit binds.
- Events or facts that are not the Action that requested them.
- Functions that evaluate. Solvers that search and then wait for an Action.
- Constraints and policies as binds with a locus and an error algebra. Sibling issue 8 L1 and L2. Open question 9 stays open. Do not collapse them in a review comment.
- Valid time and knowledge time as dimensions a fact may carry. Open question 7 stays open. Do not pick a storage engine.
- Provenance that can change authority.
- Ontology, function, and policy revisions pinned on a historical decision.
- Transactions that abort a commit bind.
- Fail-closed composition when two context modules disagree on a type or invariant.

The engine may host an evaluator that passes the tests in sibling `research/kill/specialized-kernels/boundary.md` on `origin/cursor/issue-58-kill-cfd8`. Quote the definition. Carry no private rules. Refuse-closed on the ontology Constraint. Emit Facts or Events. Replay the same pinned inputs. Stay replaceable. Read the same Facts the books use.

Fail any of those tests and the evaluator is a kernel. File leakage.

## Write the finding

Use this shape. One token or one duty per card.

```text
Finding ID
Direction          leakage | hiding
Class              facility | domain | evaluator | undetermined
Kind               domain evidence | source-system artifact | candidate law | counterexample | runtime consequence
Decision           hypothesis | supported | rejected | undetermined
Token or duty
Source artifact    path@SHA or URL
Candidate law
Counterexample
Runtime consequence
Metamodel pressure what would change in RFC-0001 if this survives, without editing the RFC
```

Link the sibling record. Do not copy its prose.

A cleanup ticket that deletes an `if Brazil` without asking whether tax determination is a dated Function is incomplete. Issue 83 wants metamodel evidence.

## What not to flag

- A test fixture that constructs a `PurchaseOrder` to exercise a generic Action path.
- A Brazil ontology file that contains CFOP tables the model can print.
- A comment that names a domain as an example.
- A physical ledger store that does not know `JournalEntry`.
- A research note that uses ERP words as source artifacts and marks them as such.

## Later passes

When a runtime tree exists, run the same questions on that tree. Search for domain tokens in engine directories. Search for facility words that appear in only one domain directory. File a new findings pass. Do not overwrite this one.
