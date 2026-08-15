# ERPNext corpus (issue 32)

**Status.** Wave A archaeology, partial.  
**Decision.** none. This directory is evidence, not a foundation proposal.  
**License posture.** ERPNext and HRMS are GPL-3.0. Frappe Framework is MIT. Notes record concepts, behavior, tests, and public paths only. No implementation was copied.

Query this folder. Do not treat DocType names as OS types.

## How to read

Start here, then open one catalog. Each card tags kind and decision state.

| Kind | Meaning |
| --- | --- |
| domain-evidence | A real-world distinction the source was forced to encode |
| source-system artifact | A Frappe/ERPNext mechanism that may not be domain truth |
| candidate law | Smallest semantic claim that would explain the evidence |
| counterexample | A case that attacks a candidate law |
| runtime consequence | What a runtime would have to enforce if the claim survives |

Decision state is `hypothesis`, `supported`, `rejected`, or `undetermined`. Never silently accepted.

## Files

- [`corpus.md`](corpus.md) owns sources, SHAs, method, Wave A contract fields, and licensing.
- [`atlas.md`](atlas.md) maps Selling, Buying, Stock, Manufacturing, Accounts, Assets, Projects, CRM, Quality, and HR.
- [`invariants.md`](invariants.md) is the invariant catalog.
- [`edge-cases.md`](edge-cases.md) is the edge-case catalog (tests, historical fixes, cancellation).
- [`cross-validation.md`](cross-validation.md) is the prioritized list of concepts that need Odoo, Moqui, REA/ValueFlows, ISA-95, EPCIS, or other independent sources.

## Special-focus index

| Topic | Start |
| --- | --- |
| Submit / cancel / amend / discard / close | atlas `A-LIFECYCLE`, invariants `INV-DOC-01` to `INV-DOC-04`, edge `EC-CANCEL-01` |
| Immutable stock and accounting ledgers | atlas `A-LEDGER`, invariants `INV-LEDGER-*`, edge `EC-LEDGER-*` |
| BOM / Work Order / Job Card | atlas `A-MFG`, invariants `INV-MFG-*`, edge `EC-MFG-*` |
| Reservation | atlas `A-RESERVE`, invariants `INV-RES-*`, edge `EC-RES-*` |
| Lots / serials | atlas `A-IDENTITY`, invariants `INV-ID-*`, edge `EC-ID-*` |
| Partial flows | atlas `A-PARTIAL`, invariants `INV-PARTIAL-*`, edge `EC-PARTIAL-*` |

## What this corpus does not do

It does not propose ERPNext as the OS foundation.  
It does not translate DocTypes into ontology types.  
It does not answer `docs/open-questions.md`. Those stay undetermined unless a card cites independent evidence.

## Related OS docs

- Issue [32](https://github.com/EnzoTironi/OS/issues/32)
- `docs/thesis.md` (mature ERPs are evidence)
- `docs/constitution.md` §2, §3, §8, §16
- `docs/research-program.md` manufacturing and inventory questions
- `docs/open-questions.md` §4–§8, §12–§14
- `scenarios/README.md` S-002, S-007, S-008, S-009, S-010
- `rfcs/0001-metamodel-hypothesis.md` remains `hypothesis`. This corpus does not edit it.
