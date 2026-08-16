# Candidate identity hierarchy

**Kind.** candidate law, as a stack of layers  
**Fetched.** 2026-08-16  
**Decision.** `hypothesis` for the stack. Individual layers have their own states in [candidate-laws.md](candidate-laws.md).

This is not a target schema. It is a cut that later synthesis can attack. Names below are research labels, not OS types.

## Question

If Item and Product are collapsed, what layers remain after the collapse is undone?

## Layers

```text
Kind or class
    grouping for search, planning, tax, recipes
    ISA-95 MaterialClass, VF classification, Item Group

Specification
    lowest useful description of a kind
    may never be inventoried
    VF ResourceSpecification, Moqui Product, ISA-95 MaterialDefinition

Sellable SKU or variant
    priced, ordered, invoiced leaf
    GS1 GTIN, Odoo product variant, ERPNext Item Variant

Saved configuration          optional, beside SKU
    order-line choice that is not a catalog leaf
    Moqui ProductConfigSaved, Odoo Never or Dynamic attributes

Lot or batch                 optional, on instances
    shared identity for substitutable units
    GS1 LGTIN, ERPNext Batch, VF batch record, ISA-95 MaterialLot

Serial or individual         optional, on instances
    unique unit
    GS1 SGTIN, ERPNext Serial No, VF trackingIdentifier

Handling unit                optional, on instances
    container that can mix contents
    GS1 SSCC, Odoo package, Moqui Container

Stock slice                  projection, not a kind of thing
    quantity of a spec or lot at a location under an owner or custodian
    Odoo quant, Moqui Asset with hasQuantity, VF EconomicResource quantity
```

Relations that are **not** layers:

- unit of measure and conversion
- packaging type, which is a specification or SKU of a pack, not an instance
- ownership, custody, primary accountability
- location, GLN, warehouse, bin
- price, tax, account defaults
- BOM or recipe, which specify how to make, not what the thing is

## Why this order

Kind is broader than specification. ValueFlows allows many classifications and one specification (E-01). ISA-95 puts MaterialClass above MaterialDefinition (E-12).

Specification is broader than SKU. A service, a skill, and a raw material class can be specified without a barcode. GTIN applies when the thing is a trade item (E-11).

SKU is broader than instance. You can sell a variant that is make-to-order and has no stock (E-03, E-04, E-20).

Lot and serial are two grains of instance identity, not two product types (E-08, E-09, E-10, E-11). A resource can have both in some plants. This pass did not fetch a first-party page that requires both at once. Leave that `undetermined`.

Handling unit sits beside the product instance. The pallet is not the soap (E-14, E-11).

Stock slice is how fungible quantity is addressed. It is not a sixth kind of product (E-17).

## What each layer may change without becoming a new thing

| Change | Same specification | Same SKU | Same serial | Same lot | Same stock slice |
| --- | --- | --- | --- | --- | --- |
| Move warehouse | yes | yes | yes | yes | no |
| Transfer custody | yes | yes | yes | yes | maybe. onhand changes |
| Transfer rights, serialized | yes | yes | yes | n/a | n/a. pointer updates |
| Transfer rights, fungible | yes | yes | n/a | yes | no. new slice (E-17) |
| Consume part of a lot | yes | yes | n/a | yes | quantity changes (E-01) |
| Split a batch to a new batch id | yes | yes | n/a | no. ERPNext Split (E-08) | no |
| Substitute a different item | no | no | n/a | n/a | n/a (E-19) |
| New color variant | yes at template | no | n/a | n/a | n/a (E-05, E-06) |
| New specification revision | undetermined | undetermined | undetermined | undetermined | undetermined |

## Falsifiers for the stack

The stack is wrong if a mature independent source needs a layer that cannot be placed, or needs two layers to be the same object to keep invariants.

Known attacks:

1. ValueFlows stage and state on one resource (E-10). That may be a property of the instance, a new specification, or a missing layer.
2. Odoo combo products (E-04). A commercial bundle may be a SKU that contains other SKUs, not a new identity kind.
3. Moqui Asset as equipment (E-02). Fixed asset and inventory instance may share "instance of a specification" and still need different laws.
4. GS1 GMN versus GTIN versus GIAI. Model, trade item, and asset already fit the stack. If a real flow needs a fourth durable identifier between SKU and serial, the stack is short.

## RFC-0001 pressure

RFC-0001 asks whether every operationally meaningful thing needs stable identity, and whether inventory can keep ownership, custody, reservation, lot identity, and movement unconflated.

This pass supports:

- specification identity
- SKU identity when the thing is a trade item
- lot identity
- serial identity
- handling-unit identity
- stock-slice addressability that is not the same as any of the above

It does not promote those labels into RFC-0001 primitives. Independent sources converge on the cuts. They do not converge on one vocabulary.
