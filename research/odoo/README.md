# Odoo Community corpus (issue 33)

**Status.** Wave A archaeology, partial.  
**Decision.** none. This directory is evidence, not a foundation proposal.  
**License posture.** Odoo Community is LGPL-3.0. Notes record concepts, behavior, tests, and public paths only. No implementation was copied.

Query this folder. Do not treat model names as OS types.

## How to read

Start here, then open one catalog. Each card tags kind and decision state.

| Kind | Meaning |
| --- | --- |
| domain-evidence | A real-world distinction the source was forced to encode |
| source-system artifact | An Odoo or ORM mechanism that may not be domain truth |
| candidate law | Smallest semantic claim that would explain the evidence |
| counterexample | A case that attacks a candidate law |
| runtime consequence | What a runtime would have to enforce if the claim survives |

Decision state is `hypothesis`, `supported`, `rejected`, or `undetermined`. Never silently accepted.

## Files

- [`corpus.md`](corpus.md) owns sources, SHAs, method, Wave A contract fields, and licensing.
- [`atlas.md`](atlas.md) maps party, sales, purchase, inventory, MRP, accounting, CRM, project, HR, maintenance, and the Community quality gap.
- [`invariants.md`](invariants.md) is the invariant catalog.
- [`edge-cases.md`](edge-cases.md) is the edge-case catalog from constraints, tests, and historical fixes.
- [`disagreement-erpnext.md`](disagreement-erpnext.md) is the first ERPNext and Odoo disagreement report.

## Special-focus index

| Topic | Start |
| --- | --- |
| Per-model state versus reset-to-draft | atlas `A-LIFECYCLE`, invariants `INV-ACC-05`, edge `EC-ACC-01`, disagreement `D-01` |
| Quant, move, move line, reservation | atlas `A-STOCK`, `A-RESERVE`, invariants `INV-STOCK-*`, edge `EC-RES-01` |
| Unified journal and invoice | atlas `A-ACC`, invariants `INV-ACC-*`, disagreement `D-03` |
| Stock valuation layer | atlas `A-VALUATION`, disagreement `D-02`, `D-12` |
| Manufacturing order versus work order | atlas `A-MFG`, invariants `INV-MFG-*`, disagreement `D-07` |
| Lots and serials | atlas `A-IDENTITY`, invariants `INV-ID-*`, edge `EC-ID-*` |
| Partner as customer and supplier | atlas `A-PARTY`, disagreement `D-05` |

## Overview

Odoo Community 18.0 encodes operational work as mutable records with named actions and per-model state machines. Inventory current quantity lives on `stock.quant`. Movement history lives on `stock.move` and `stock.move.line`. Accounting invoices and miscellaneous journals share `account.move`. A posted accounting move can often return to draft. A done stock move cannot. That split is the sharpest local finding.

## Key concepts

- **Partner.** One `res.partner` record can be a customer, a supplier, an employee address, or a company.
- **Quant.** On-hand quantity at a location, lot, package, and owner.
- **Move.** An intended or completed quantity change between two locations.
- **Move line.** The reservation and execution slice that actually touches a quant.
- **Valuation layer.** A cost layer created from a done stock move. It may post an `account.move`.
- **Manufacturing order.** Authorization and plan to produce. Its `state` is computed.
- **Work order.** Execution of one operation at a work center. Its `state` is also computed.

## How it works

A confirmed sales order creates stock moves, usually grouped into a picking. Assignment reserves quantity on quants through move lines. Validation of the picking marks moves done and updates quants. If perpetual valuation is on, a stock valuation layer is written and may post a journal entry. Billing creates another `account.move` with `move_type` set to a customer invoice. Payment reconciliation is a later `account.partial.reconcile`, not a field on the order.

A confirmed manufacturing order creates component moves and finished-good moves. Work orders start and finish against that order. Closing the manufacturing order posts the stock moves. Partial output can split a backorder manufacturing order.

## Where things live

Pinned paths are under `https://github.com/odoo/odoo/blob/18.0/` at SHA `bca6e5d13118fc2dff99d7b81bd49860e743132a`. See [`corpus.md`](corpus.md).

## Gotchas

- Quotation and sales order are one model. RFQ and purchase order are one model. Lead and opportunity are one model. Invoice and journal entry are one model. Those collapses are product architecture, not proof that the real-world acts are the same.
- Manufacturing order `state` and work order `state` are computed stored fields. Sales order `state` and account move `state` are written by actions.
- Quality control models were not present in Community 18.0 addons. That gap is recorded, not filled from Enterprise.

## What this corpus does not do

It does not propose Odoo as the OS foundation.  
It does not translate models into ontology types.  
It does not answer `docs/open-questions.md`. Those stay undetermined unless a card cites independent evidence.  
It does not edit `rfcs/0001-metamodel-hypothesis.md`.

## Related OS docs

- Issue [33](https://github.com/EnzoTironi/OS/issues/33)
- `docs/thesis.md` (mature ERPs are evidence)
- `docs/constitution.md` sections 2, 3, 8, 16
- `docs/research-program.md` inventory and manufacturing questions
- `docs/open-questions.md` sections 4 to 8 and 12 to 14
- `docs/swarm-research-backlog.md` Agent output contract. `docs/swarm-result-contract.md` was not on `origin/main` at research time.
- `rfcs/0001-metamodel-hypothesis.md` remains `hypothesis`.
