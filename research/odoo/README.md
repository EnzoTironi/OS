# Odoo Community corpus (issue 33)

**Status.** Wave A archaeology, partial.  
**Decision.** none. This directory is evidence, not a foundation proposal.  
**License posture.** Odoo Community is LGPL-3.0. Notes record concepts, behavior, tests, and public paths only. No implementation was copied.

> **Adversarial review warning:** the Odoo archaeology is pinned to Community `18.0`, but the original ERPNext disagreement report used ERPNext `version-15`, while issue #32 independently pinned ERPNext `develop`. Therefore the direct cross-product disagreements are **preliminary/cross-generation** until revalidated against an aligned ERPNext pin. Read [`comparison-scope.md`](comparison-scope.md) before consuming `disagreement-erpnext.md` in synthesis.

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
- [`comparison-scope.md`](comparison-scope.md) records the pin mismatch discovered in adversarial review and the rules for using the comparison.
- [`disagreement-erpnext.md`](disagreement-erpnext.md) is the original first ERPNext/Odoo disagreement report; its cross-product verdicts are preliminary until aligned-pin revalidation.

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

Within the pinned Odoo Community 18.0 source, operational work is encoded as mutable records with named actions and per-model state machines. Inventory current quantity lives on `stock.quant`; movement history lives on `stock.move` and `stock.move.line`; accounting invoices and miscellaneous journals share `account.move`. Those are **Odoo observations**, not OS laws.

## Key concepts observed in Odoo

- **Partner.** One `res.partner` record can participate in customer/supplier/etc. contexts.
- **Quant.** On-hand quantity at a location/lot/package/owner grain.
- **Move.** An intended or completed quantity change between locations.
- **Move line.** Reservation/execution slice touching quant identity.
- **Valuation layer.** Cost-layer representation related to completed stock movement.
- **Manufacturing order.** Odoo's production authorization/plan record.
- **Work order.** Odoo's operation-execution record at a work center.

These names remain source-system terms. The domain distinctions must be cross-validated independently.

## Gotchas

- Quotation/order, RFQ/purchase order, lead/opportunity, and invoice/journal are collapsed in various Odoo models. Model collapse is product architecture, not proof that the corresponding real-world acts have one identity.
- Some `state` values are computed while others are written through named actions.
- Quality control models were not present in the inspected Community 18.0 addon path. That is a scoped absence, not evidence about Enterprise or later releases.
- Cross-version differences in `disagreement-erpnext.md` must not be counted as stable ERPNext/Odoo divergence without revalidation.

## What this corpus does not do

It does not propose Odoo as the OS foundation.  
It does not translate models into ontology types.  
It does not answer `docs/open-questions.md`.  
It does not edit `rfcs/0001-metamodel-hypothesis.md`.  
It does not claim that an Odoo 18 vs ERPNext v15 difference is a current architectural divergence.

## Related OS docs

- Issue [33](https://github.com/EnzoTironi/OS/issues/33)
- `docs/thesis.md`
- `docs/constitution.md`
- `docs/research-program.md`
- `docs/open-questions.md`
- `docs/swarm-research-backlog.md`
- `rfcs/0001-metamodel-hypothesis.md`
