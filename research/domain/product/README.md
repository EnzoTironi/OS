# Product identity

**Issue.** [#15](https://github.com/EnzoTironi/OS/issues/15)  
**Track.** domain  
**Fetched.** 2026-08-16  
**Decision.** mixed. See [candidate-laws.md](candidate-laws.md) and [open-questions.md](open-questions.md).  
**Contract.** Wave A output contract in `docs/swarm-research-backlog.md`. `docs/swarm-result-contract.md` is not on `origin/main`.

## Question

ERPs often put specification, sellable SKU, physical instance, lot, serial, package, unit of measure, owner, and location into one `Item` or `Product` record. Which of those meanings are independent domain distinctions, and which are source-system accidents?

## Overview

Independent sources split **kind**, **specification**, **sellable SKU**, and **instance**. They then split instance again into **serialized individual**, **lot or batch**, and **homogeneous quantity**. Ownership, custody, and location sit beside identity. They are not the same fact as "what this is."

ERPNext and Odoo still sell and stock from one catalog master. They grow extra records when interchangeability fails. ValueFlows, Moqui, GS1, and ISA-95 start with the split. That is the useful pressure on RFC-0001 identity, not a schema to copy.

This folder is evidence. It is not a target schema.

## Key concepts

**Kind or class.** A grouping used to find or plan, not to stock. ISA-95 `MaterialClass`. ValueFlows resource classification. ERPNext Item Group.

**Specification.** The lowest useful description of a kind of thing, including a service or digital good that will never be inventoried. ValueFlows `ResourceSpecification`. Moqui `Product`. ISA-95 `MaterialDefinition`.

**Sellable SKU or variant.** A specification that can be priced, ordered, and invoiced. GS1 GTIN. Odoo `product.product`. ERPNext Item Variant. A template is not this.

**Instance.** An observable resource that events can increment, decrement, move, or transfer. ValueFlows `EconomicResource`. Moqui `Asset`. ISA-95 `MaterialLot`. ERPNext Serial No or Batch. Odoo `stock.lot`.

**Lot or batch.** Shared identity for many substitutable units from one production or receipt. GS1 LGTIN. Quantity lives on the lot, not as a second individual.

**Serial.** Unique identity for one unit. GS1 SGTIN. Quantity is one.

**Handling unit.** A container instance that can hold mixed contents. GS1 SSCC. Odoo package. Moqui `Container`.

**Packaging type.** A fixed quantity of one SKU, itself often a trade item. Odoo packaging. A case-of-12 GTIN.

## How the split works

A flow can name a specification before any instance exists. ValueFlows commitments use `resourceConformsTo`. ERPNext Work Orders can create inactive serials before the manufacture stock entry. Odoo can reserve a lot number before the receipt assigns it.

Once stock exists, quantity is not a second product. It is a property of an event or of a stock slice. ValueFlows is explicit. Consuming 10 of 100 widgets decrements the resource. The 10 are not a new `EconomicResource`.

Ownership and custody change without minting a new GTIN or serial. ValueFlows still treats a rights transfer of non-serialized stock as a different resource slice keyed by owner. That is the main live disagreement. See [hierarchy.md](hierarchy.md) and law L-06.

## Where things live

| File | Mode |
| --- | --- |
| [sources.md](sources.md) | Pages and sibling notes fetched or read this session |
| [evidence.md](evidence.md) | Labeled blocks |
| [matrix.md](matrix.md) | Convergence and divergence |
| [hierarchy.md](hierarchy.md) | Candidate identity layers. Hypothesis, not a schema |
| [examples.md](examples.md) | Bulk, serial machine, configurable, service, raw, packaging, digital |
| [candidate-laws.md](candidate-laws.md) | Smallest claims and falsifiers |
| [open-questions.md](open-questions.md) | What this pass leaves `undetermined` |

Sibling notes on other branches, read only:

- `research/erpnext/atlas.md` A-IDENTITY on `origin/cursor/issue-32-corpus-cfd8`
- `research/odoo/atlas.md` A-IDENTITY on `origin/cursor/issue-33-corpus-cfd8`
- `research/moqui/domain-atlas.md` Product and asset on `origin/cursor/issue-34-corpus-cfd8`
- `research/valueflows-rea/issue-0037-economic-cycle.md` on `origin/cursor/issue-37-corpus-cfd8`

`research/domain/party/` and `research/foundation/values/` were not on `origin/main` or the sibling branches listed above.

## Gotchas

ERPNext `Item` and Odoo `product.template` collapse several layers on purpose. Do not treat those table names as OS types.

Odoo stores lot and serial in one `stock.lot` model. That is a source artifact. The docs still force quantity one on serial manufacture.

Odoo can model a "box of 6" as a unit of measure or as packaging. Those are different identities. Packaging type is a trade-item shape. A unit of measure is a conversion.

ValueFlows lets stage and state join the logical identifier of one resource. It also allows a new specification per stage. Both are documented. Neither is decided for OS.

Do not write answers into `docs/open-questions.md`. Cite this folder or leave the question `undetermined`.
