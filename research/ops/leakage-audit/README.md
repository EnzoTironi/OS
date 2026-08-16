# Domain-to-engine leakage audit

**Issue.** [83](https://github.com/EnzoTironi/OS/issues/83)  
**Kind.** explanation index  
**Fetched.** 2026-08-16  
**Decision.** mixed. Never `accepted`.  
**Contract.** `docs/swarm-result-contract.md` is absent on `origin/main` at `dc918a50e550d384d1e18a6f24424e6ed4595b9c`. This folder follows the Agent output contract in `docs/swarm-research-backlog.md`.

## Question

How do you tell a legitimate generic facility from domain behavior that leaked into the engine?

How do you catch the opposite failure, a generic duty hidden inside one domain module because a facility is missing?

Issue 83 asks for review heuristics and periodic findings. It does not ask for a runtime. `origin/main` has no engine. This pass audits specs and sibling research. It does not invent an engine audit.

## Verdict

Two failures already have enough independent pressure to review against.

**Leakage.** A generic engine that branches on `PurchaseOrder`, `Brazil`, `Inventory`, `HF`, a fiscal code, an ERP field name, or a copied status word is encoding a company or a source schema. Constitution §12 already forbids `if company == X`. Open question 15 already names `if objectType == "PurchaseOrder"` as a smell. Sibling notes reject CFOP as an engine case, Work Order as a shared type, and inventory movement as the fulfillment law.

**Hiding.** A generic duty that appears in only one domain folder is often a missing facility, not localization. Debit equals credit, posted history that cannot be rewritten, Action is not Event, preview is not commit, and an external call that can finish unknown all show up in more than one domain. If only accounting, only fiscal, or only party implements them, the engine is incomplete and the domain module is doing kernel work.

A specialized *semantic* kernel named Accounting, Inventory, Fiscal, or Brazil remains `rejected` on present sibling evidence. A specialized *physical* evaluator that quotes ontology definitions remains `supported` as a class. Which evaluators OS must ship is `undetermined` and belongs to Wave B.

`docs/open-questions.md` questions 9, 15, and 16 stay open. This folder does not answer them.

## How to query this folder

| File | Kind | Use when |
| --- | --- | --- |
| [heuristics.md](heuristics.md) | how-to | You are reviewing a spec, RFC, or proposed runtime diff |
| [findings-pass-1.md](findings-pass-1.md) | reference | You need a cited finding, law, or counterexample |
| [sources.md](sources.md) | source list | You need a path, SHA, or URL |
| [open-questions.md](open-questions.md) | open question | You need what this pass left `undetermined` |

Sibling notes were read with `git show` only. They are not copied here. Cite them as `origin/cursor/issue-N-*-cfd8:path` at the SHA in `sources.md`.

## What this pass did not do

It did not read a runtime tree. There is none on `origin/main` outside vendored agent skills.

It did not edit `rfcs/0001-metamodel-hypothesis.md`.

It did not write answers into `docs/open-questions.md`.

It did not start Wave B.

It did not expand the token `HF` from issue 83. That expansion is `undetermined`.

## Output contract

1. **Question.** This README.
2. **Sources.** `sources.md`.
3. **Evidence.** `findings-pass-1.md`.
4. **Source artifacts.** Marked in that file.
5. **Convergence.** Same file, after the laws.
6. **Divergence.** Same file, disagreements.
7. **Candidate laws.** Same file.
8. **Counterexamples.** Same file.
9. **Runtime pressure.** Each law. No runtime product pick.
10. **Open questions.** `open-questions.md`.
11. **Decision state.** Each card. Default `hypothesis`. Never `accepted`.

## Licensing

OS is MIT. These notes extract concepts and documented behavior. No copyleft implementation was pasted or translated. ERPNext and Odoo appear only through sibling notes and public documentation already cited there.
