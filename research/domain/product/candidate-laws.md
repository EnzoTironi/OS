# Candidate laws

**Kind.** candidate law, with counterexamples and runtime consequences  
**Fetched.** 2026-08-16  
**Decision.** per law. Never `accepted`.

Each law is the smallest claim that explains a row in [matrix.md](matrix.md). A later synthesis agent should try to break these before promoting anything into RFC-0001.

## L-01. Specification is not instance

**Claim.** A description of a kind of resource can exist, be planned against, and be sold as make-to-order or as a service, without an inventoried individual.

**Kind.** candidate law  
**Evidence.** E-01, E-02, E-04, E-20  
**Decision.** `supported`

**Counterexample that would reject it.** A source that cannot create a sales or production commitment without first minting a stock instance, including for services.

**Runtime consequence.** Actions such as Promise, Commit, and Order may take a specification id. Inventory quantity is not a precondition of those actions.

## L-02. A template is not a sellable SKU

**Claim.** A variant family or configurable description cannot be the object of a stock or commercial transaction. The leaf that is priced and fulfilled can.

**Kind.** candidate law  
**Evidence.** E-05, E-06, E-11  
**Decision.** `supported`

**Counterexample.** A system that stocks and invoices the template itself while still claiming variants are the stocked things.

**Runtime consequence.** Identity resolution for an order line must land on a SKU, a saved configuration plus specification, or an explicit instance. It must not land on a template.

## L-03. Saved configuration is not automatically a SKU

**Claim.** A customer-chosen configuration can be recorded on a commitment without creating a catalog leaf.

**Kind.** candidate law  
**Evidence.** E-06, E-07  
**Decision.** `hypothesis`

**Counterexample.** A regulated trade that requires a GTIN for every sold configuration before offer. Then configuration collapses into SKU minting.

**Runtime consequence.** If the claim survives, SKU explosion is a policy, not a metamodel law.

## L-04. Lot identity and serial identity are different grains

**Claim.** A lot identifies a substitutable group and carries quantity. A serial identifies one unit and has quantity one. They are not two labels for one type.

**Kind.** candidate law  
**Evidence.** E-08, E-09, E-10, E-11  
**Decision.** `supported`

**Counterexample.** A lawful model where a serial regularly has quantity greater than one without being reclassified as a lot. Odoo's one table is not this. Its manufacture path still forces quantity one (E-09).

**Runtime consequence.** Reservation, recall, and valuation may attach to either grain. Serial exclusivity is per unit. Lot exclusivity is per reserved quantity, not per lot identity. Sibling ERPNext tests on `origin/cursor/issue-32-corpus-cfd8` show a batch can be shared across sales orders when unreserved qty remains.

## L-05. Unit of measure is not identity. Packaging type is a specification. A handling unit is an instance

**Claim.** Conversion between units does not mint a product. A pack-of-N that is priced or barcoded is a specification or SKU. A specific pallet or tote is an instance of a container.

**Kind.** candidate law  
**Evidence.** E-13, E-14, E-15, E-11  
**Decision.** `supported`

**Counterexample.** A source that must change product identity to convert kilograms to grams, other than the documented Odoo workaround (E-13).

**Runtime consequence.** Quantity on events needs a unit. Identity references do not.

## L-06. Ownership, custody, and location are not the identity of a serialized individual. They key a fungible stock slice

**Claim.** Moving or selling a serial keeps the serial. Moving or selling a quantity of a lot creates or adjusts a slice addressed by specification or lot, location, and owner or custodian.

**Kind.** candidate law  
**Evidence.** E-16, E-17, E-12  
**Decision.** `supported` as a split. `hypothesis` for the exact slice key

**Counterexample.** A serialized flow that mints a new serial on every ownership change. A fungible flow that keeps one resource row across owners and still reports two accounting quantities without extra structure.

**Runtime consequence.** Transfer of rights and transfer of custody are different actions (E-16). Quant-like uniqueness is a projection key, not a product type.

## L-07. A substitute is a different specification

**Claim.** Equivalence and supersession are relations between specifications. They do not merge SKUs.

**Kind.** candidate law  
**Evidence.** E-19  
**Decision.** `supported` for manufacturing alternatives. `undetermined` for commercial supersession catalogs

**Counterexample.** Two GTINs that independent standards treat as the same trade item. Not seen this pass.

**Runtime consequence.** Substitution is an authorized replacement on a BOM, order, or commitment. Traceability still names the specification that was actually consumed.

## L-08. Instance identity can exist before the first stock event

**Claim.** Allocating a serial or lot number is not the same event as receiving or producing quantity.

**Kind.** candidate law  
**Evidence.** E-21, E-01, E-09  
**Decision.** `supported` as operational behavior. `hypothesis` as a required law

**Counterexample.** A plant that forbids preallocation and still handles recall, warranty, and work-order labeling.

**Runtime consequence.** "Unknown location, identity reserved" is a valid state. Sibling ERPNext EC-ID-01.

## L-09. Services and non-stock goods belong on the specification layer

**Claim.** The same specification construct can describe a service, a digital work, and a stocked good. Only some specifications have instance and stock-slice layers.

**Kind.** candidate law  
**Evidence.** E-20, E-01, E-04  
**Decision.** `supported` at specification. `undetermined` whether OS needs a separate Service type

**Counterexample.** A service that cannot be specified without inventory fields, or a stocked good that cannot share any construct with a service without lying.

**Runtime consequence.** Inventory constraints are conditional on a capability of the specification, not on a separate catalog database.

## Rejected this pass

### R-01. Item or Product as a single OS type

**Kind.** candidate law, rejected  
**Evidence.** E-03, E-04, matrix D-01  
**Decision.** `rejected`

One catalog master is a common application shape. Independent economic and standards models do not treat it as one identity. OS should not start from Item.

### R-02. Owner as the identity of a serialized thing

**Kind.** candidate law, rejected  
**Evidence.** E-17, E-11  
**Decision.** `rejected`

GS1 SGTIN and ERPNext Serial No persist across sale. Owner is a pointer or a transfer, not the serial.

## RFC-0001

Do not edit `rfcs/0001-metamodel-hypothesis.md`. These laws are pressure on falsification target 3, inventory identity, and on the Identity cross-cut. They are not a primitive list.
